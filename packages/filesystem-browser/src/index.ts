import {
  getVerifiedBlockDigest,
  type RecoveryRecord,
  type RecoveryStore,
  validateRecoveryRecord
} from "@flicksend/resume";
import { createStreamingSha256 } from "@flicksend/integrity";
import {
  buildStreamPackSource,
  StreamPackLayout,
  validateStreamPackManifest,
  type BuildStreamPackOptions,
  type StreamPackDirectory,
  type StreamPackDirectoryEntry,
  type StreamPackManifest
} from "@flicksend/stream-pack";

export interface FileSource {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  /** Stable metadata binding for M4 re-selection; M5 adds cryptographic content identity. */
  readonly sourceIdentity?: string;
  read(offset: number, length: number): Promise<ArrayBuffer>;
}

export interface FileDestination {
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

/** Required by M4 recovery when a missing logical block is not the next sequential write. */
export interface RandomAccessFileDestination extends FileDestination {
  writeAt(offset: number, chunk: Uint8Array<ArrayBuffer>): Promise<void>;
}

export function sourceFromFile(file: File): FileSource {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    sourceIdentity: `${file.name}\u0000${file.size}\u0000${file.type}\u0000${file.lastModified}`,
    read: (offset, length) => file.slice(offset, offset + length).arrayBuffer()
  };
}

/** Adapts File System Access handles without reading payload while the tree is enumerated. */
export function directorySourceFromHandle(handle: FileSystemDirectoryHandle): StreamPackDirectory {
  return {
    name: handle.name,
    async *entries(): AsyncIterable<StreamPackDirectoryEntry> {
      for await (const [, child] of handle.entries()) {
        if (child.kind === "directory")
          yield { type: "DIRECTORY", directory: directorySourceFromHandle(child) };
        else if (child.kind === "file") {
          const snapshot = await child.getFile();
          yield {
            type: "FILE",
            file: {
              name: snapshot.name,
              size: snapshot.size,
              read: async (offset, length) => {
                const current = await child.getFile();
                if (
                  current.size !== snapshot.size ||
                  current.lastModified !== snapshot.lastModified
                )
                  throw new Error("FS_STREAMPACK_SOURCE_CHANGED");
                return current.slice(offset, offset + length).arrayBuffer();
              }
            }
          };
        } else throw new Error("FS_STREAMPACK_UNSUPPORTED_ENTRY");
      }
    }
  };
}

export function streamPackSourceFromDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  options: BuildStreamPackOptions
) {
  return buildStreamPackSource(directorySourceFromHandle(handle), options);
}

/**
 * Adapts a selected multi-file list to the existing bounded StreamPack sender path. File objects
 * remain browser-owned handles; payload is read only by StreamPack's bounded range reads.
 */
export function streamPackSourceFromFiles(
  files: readonly File[],
  rootName: string,
  options: BuildStreamPackOptions
) {
  return buildStreamPackSource(
    {
      name: rootName,
      async *entries(): AsyncIterable<StreamPackDirectoryEntry> {
        for (const file of files)
          yield {
            type: "FILE",
            file: {
              name: file.name,
              size: file.size,
              read: (offset, length) => file.slice(offset, offset + length).arrayBuffer()
            }
          };
      }
    },
    options
  );
}

export type StreamPackDestination = {
  prepare(manifest: StreamPackManifest): Promise<void>;
  writeRange(fileId: number, offset: number, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
  /** Required before a persisted verified checkpoint can be trusted after a reconnect. */
  validateVerifiedRecovery?(manifest: StreamPackManifest, record: RecoveryRecord): Promise<void>;
  readonly openDestinationHandles: number;
  readonly peakOpenDestinationHandles: number;
};

export type StreamPackTreeByte = (fileId: number, offset: number) => number;

type WritableEntry = { stream: FileSystemWritableFileStream; use: number };

/** Validated paths are reconstructed under one root with a bounded LRU writer cache. */
export class BrowserStreamPackDestination implements StreamPackDestination {
  private manifest?: StreamPackManifest;
  private readonly files = new Map<number, string>();
  private readonly writers = new Map<number, WritableEntry>();
  private use = 0;
  private closed = false;
  private peak = 0;

  constructor(
    private readonly selectedDestination: FileSystemDirectoryHandle,
    private readonly maxOpenHandles = 16
  ) {
    if (!Number.isSafeInteger(maxOpenHandles) || maxOpenHandles < 1 || maxOpenHandles > 64)
      throw new Error("FS_STREAMPACK_DESTINATION_INVALID");
  }
  get openDestinationHandles(): number {
    return this.writers.size;
  }
  get peakOpenDestinationHandles(): number {
    return this.peak;
  }

  async prepare(manifest: StreamPackManifest): Promise<void> {
    const validated = validateStreamPackManifest(manifest);
    if (this.closed) throw new Error("FS_STREAMPACK_DESTINATION_INVALID");
    if (this.manifest) {
      if (JSON.stringify(this.manifest) !== JSON.stringify(validated))
        throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
      return;
    }
    this.manifest = validated;
    for (const entry of this.manifest.entries) {
      const parent = await this.parentFor(entry.relativePath);
      const name = entry.relativePath.slice(entry.relativePath.lastIndexOf("/") + 1);
      if (entry.type === "DIRECTORY") await parent.getDirectoryHandle(name, { create: true });
      else {
        this.files.set(entry.fileId!, entry.relativePath);
        if (entry.sizeBytes === 0) await parent.getFileHandle(name, { create: true });
      }
    }
  }

  async writeRange(fileId: number, offset: number, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    if (!this.manifest || this.closed || !Number.isSafeInteger(offset) || offset < 0)
      throw new Error("FS_STREAMPACK_RECONSTRUCTION_FAILED");
    const path = this.files.get(fileId);
    const entry = this.manifest.entries.find(
      (candidate) => candidate.type === "FILE" && candidate.fileId === fileId
    );
    if (!path || !entry || offset + bytes.byteLength > entry.sizeBytes!)
      throw new Error("FS_STREAMPACK_RANGE_INVALID");
    const writer = await this.writer(fileId, path);
    await writer.stream.write({ type: "write", position: offset, data: bytes });
    writer.use = ++this.use;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.writers.values()].map((writer) => writer.stream.close()));
    this.writers.clear();
  }
  async abort(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.writers.values()].map((writer) => writer.stream.abort()));
    this.writers.clear();
  }

  /** Makes completed positional writes observable without finalizing the destination. */
  async settleOpenWriters(): Promise<void> {
    if (this.closed) return;
    await Promise.all([...this.writers.values()].map((writer) => writer.stream.close()));
    this.writers.clear();
  }

  /** Re-hashes each persisted block from the chosen destination before allowing a trusted resume. */
  async validateVerifiedRecovery(
    manifest: StreamPackManifest,
    record: RecoveryRecord
  ): Promise<void> {
    if (record.destinationIdentity === null) throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
    // OPFS file snapshots need closed writers before a recovery re-hash can observe
    // all verified positional writes from the prior transport.
    await this.settleOpenWriters();
    const layout = new StreamPackLayout(manifest);
    for (const [start, end] of record.committedBlockRanges) {
      for (let blockIndex = start; blockIndex < end; blockIndex += 1) {
        const expected = getVerifiedBlockDigest(record, blockIndex);
        if (!expected) throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
        const ranges = layout.blockRanges(blockIndex);
        const hash = createStreamingSha256();
        for (const range of ranges) {
          const path = this.files.get(range.fileId);
          if (!path) throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
          const parent = await this.parentFor(path);
          const handle = await parent.getFileHandle(path.slice(path.lastIndexOf("/") + 1));
          const file = await handle.getFile();
          if (file.size < range.fileOffset + range.length)
            throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
          hash.update(
            new Uint8Array(
              await file.slice(range.fileOffset, range.fileOffset + range.length).arrayBuffer()
            )
          );
        }
        if (hash.digestHex() !== expected) throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
      }
    }
  }

  async hasGeneratedTree(
    manifest: StreamPackManifest,
    expectedByte: StreamPackTreeByte
  ): Promise<boolean> {
    try {
      const validated = validateStreamPackManifest(manifest);
      for (const entry of validated.entries) {
        const parent = await this.parentFor(entry.relativePath);
        const name = entry.relativePath.slice(entry.relativePath.lastIndexOf("/") + 1);
        if (entry.type === "DIRECTORY") {
          await parent.getDirectoryHandle(name);
          continue;
        }
        const file = await (await parent.getFileHandle(name)).getFile();
        if (file.size !== entry.sizeBytes) return false;
        for (let offset = 0; offset < file.size; offset += 64 * 1024) {
          const bytes = new Uint8Array(await file.slice(offset, offset + 64 * 1024).arrayBuffer());
          for (let index = 0; index < bytes.byteLength; index += 1)
            if (bytes[index] !== expectedByte(entry.fileId!, offset + index)) return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  private async writer(fileId: number, path: string): Promise<WritableEntry> {
    const existing = this.writers.get(fileId);
    if (existing) return existing;
    if (this.writers.size >= this.maxOpenHandles) {
      let oldestId: number | undefined;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [id, candidate] of this.writers)
        if (candidate.use < oldestUse) {
          oldestId = id;
          oldestUse = candidate.use;
        }
      if (oldestId === undefined) throw new Error("FS_STREAMPACK_RECONSTRUCTION_FAILED");
      await this.writers.get(oldestId)!.stream.close();
      this.writers.delete(oldestId);
    }
    const parent = await this.parentFor(path);
    const name = path.slice(path.lastIndexOf("/") + 1);
    const handle = await parent.getFileHandle(name, { create: true });
    const entry = {
      stream: await handle.createWritable({ keepExistingData: true }),
      use: ++this.use
    };
    this.writers.set(fileId, entry);
    this.peak = Math.max(this.peak, this.writers.size);
    return entry;
  }
  private async parentFor(path: string): Promise<FileSystemDirectoryHandle> {
    const parts = path.split("/");
    let directory = this.selectedDestination;
    for (let index = 0; index < parts.length - 1; index += 1)
      directory = await directory.getDirectoryHandle(parts[index]!, { create: true });
    return directory;
  }
}

/** Bounded in-memory Engine Lab receiver for CI fixtures only, never a user delivery destination. */
export class SmallStreamPackFixtureDestination implements StreamPackDestination {
  private manifest?: StreamPackManifest;
  private readonly files = new Map<number, Uint8Array<ArrayBuffer>>();
  private closed = false;
  readonly openDestinationHandles = 0;
  readonly peakOpenDestinationHandles = 0;

  async prepare(manifest: StreamPackManifest): Promise<void> {
    const validated = validateStreamPackManifest(manifest);
    if (this.closed) throw new Error("FS_STREAMPACK_DESTINATION_INVALID");
    if (this.manifest) {
      if (JSON.stringify(this.manifest) !== JSON.stringify(validated))
        throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
      return;
    }
    this.manifest = validated;
    for (const entry of validated.entries)
      if (entry.type === "FILE") this.files.set(entry.fileId!, new Uint8Array(entry.sizeBytes!));
  }
  async writeRange(fileId: number, offset: number, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const file = this.files.get(fileId);
    if (this.closed || !file || offset + bytes.byteLength > file.byteLength)
      throw new Error("FS_STREAMPACK_RANGE_INVALID");
    file.set(bytes, offset);
  }
  async close(): Promise<void> {
    this.closed = true;
  }
  async abort(): Promise<void> {
    this.closed = true;
    this.files.clear();
  }
  async validateVerifiedRecovery(
    manifest: StreamPackManifest,
    record: RecoveryRecord
  ): Promise<void> {
    if (
      this.closed ||
      !this.manifest ||
      JSON.stringify(this.manifest) !== JSON.stringify(validateStreamPackManifest(manifest))
    )
      throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
    const layout = new StreamPackLayout(manifest);
    for (const [start, end] of record.committedBlockRanges) {
      for (let blockIndex = start; blockIndex < end; blockIndex += 1) {
        const expected = getVerifiedBlockDigest(record, blockIndex);
        if (!expected) throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
        const hash = createStreamingSha256();
        for (const range of layout.blockRanges(blockIndex)) {
          const file = this.files.get(range.fileId);
          if (!file || file.byteLength < range.fileOffset + range.length)
            throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
          hash.update(file.slice(range.fileOffset, range.fileOffset + range.length));
        }
        if (hash.digestHex() !== expected) throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
      }
    }
  }
  bytes(fileId: number): Uint8Array<ArrayBuffer> | undefined {
    return this.files.get(fileId)?.slice();
  }
  /** Development qualification hook for receiver-side recovery safety tests. */
  mutateFirstByte(): void {
    for (const file of this.files.values()) {
      if (file.byteLength > 0) {
        file[0] = (file[0]! + 1) % 256;
        return;
      }
    }
  }
  hasExactTree(manifest: StreamPackManifest, files: ReadonlyMap<number, Uint8Array>): boolean {
    if (
      !this.manifest ||
      JSON.stringify(this.manifest) !== JSON.stringify(validateStreamPackManifest(manifest))
    )
      return false;
    if (this.files.size !== files.size) return false;
    for (const [fileId, expected] of files) {
      const actual = this.files.get(fileId);
      if (!actual || actual.byteLength !== expected.byteLength) return false;
      for (let index = 0; index < actual.byteLength; index += 1)
        if (actual[index] !== expected[index]) return false;
    }
    return true;
  }
  hasGeneratedTree(manifest: StreamPackManifest, expectedByte: StreamPackTreeByte): boolean {
    if (
      !this.manifest ||
      JSON.stringify(this.manifest) !== JSON.stringify(validateStreamPackManifest(manifest))
    )
      return false;
    for (const entry of manifest.entries) {
      if (entry.type !== "FILE") continue;
      const actual = this.files.get(entry.fileId!);
      if (!actual || actual.byteLength !== entry.sizeBytes) return false;
      for (let offset = 0; offset < actual.byteLength; offset += 1)
        if (actual[offset] !== expectedByte(entry.fileId!, offset)) return false;
    }
    return true;
  }
}

export function destinationFromWritable(
  stream: FileSystemWritableFileStream
): RandomAccessFileDestination {
  return {
    write: (chunk) => stream.write(chunk),
    writeAt: (offset, chunk) => {
      if (!Number.isSafeInteger(offset) || offset < 0)
        return Promise.reject(new Error("Invalid offset."));
      return stream.write({ type: "write", position: offset, data: chunk });
    },
    close: () => stream.close(),
    abort: () => stream.abort()
  };
}

export async function createOpfsBenchmarkDestination(
  name: string
): Promise<RandomAccessFileDestination> {
  const directory = await navigator.storage.getDirectory();
  const file = await directory.getFileHandle(name, { create: true });
  return destinationFromWritable(await file.createWritable());
}

/** Persists recovery metadata only. User payload bytes remain in the chosen destination. */
export async function createOpfsRecoveryStore(): Promise<RecoveryStore> {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle("flicksend-recovery", { create: true });
  const fileName = (transferId: string): string => `${transferId}.json`;

  return {
    async load(transferId: string) {
      try {
        const handle = await directory.getFileHandle(fileName(transferId));
        const value: unknown = JSON.parse(await (await handle.getFile()).text());
        return validateRecoveryRecord(value as RecoveryRecord);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") return null;
        throw error;
      }
    },
    async save(record: RecoveryRecord) {
      const validated = validateRecoveryRecord(record);
      const handle = await directory.getFileHandle(fileName(validated.transferId), {
        create: true
      });
      const writable = await handle.createWritable();
      try {
        await writable.write(JSON.stringify(validated));
        await writable.close();
      } catch (error) {
        await writable.abort();
        throw error;
      }
    },
    async remove(transferId: string) {
      try {
        await directory.removeEntry(fileName(transferId));
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") return;
        throw error;
      }
    }
  };
}

export class SmallFixtureDestination implements RandomAccessFileDestination {
  private readonly bytesByOffset = new Map<number, Uint8Array<ArrayBuffer>>();
  private size = 0;
  private closed = false;

  constructor(private readonly limitBytes = 10 * 1024 * 1024) {}

  async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.writeAt(this.size, chunk);
  }

  async writeAt(offset: number, chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    if (
      this.closed ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset + chunk.byteLength > this.limitBytes
    )
      throw new Error("Fixture destination limit exceeded.");
    this.bytesByOffset.set(offset, chunk.slice());
    this.size = Math.max(this.size, offset + chunk.byteLength);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async abort(): Promise<void> {
    this.bytesByOffset.clear();
    this.size = 0;
    this.closed = true;
  }

  bytes(): Uint8Array<ArrayBuffer> {
    const output = new Uint8Array(this.size);
    for (const [offset, chunk] of this.bytesByOffset) output.set(chunk, offset);
    return output;
  }
}
