import { digestBlock, integrityAlgorithm, integrityManifestVersion } from "@flicksend/integrity";

export const streamPackSchemaVersion = 1;
export const streamPackRootSemantics = "RECREATE_SELECTED_ROOT" as const;
export const streamPackMaximumEntries = 100_000;
export const streamPackMaximumPathBytes = 4_096;
export const streamPackMaximumPathComponents = 128;
export const streamPackMaximumManifestBytes = 32 * 1024 * 1024;

export type StreamPackEntryType = "DIRECTORY" | "FILE";
export type StreamPackEntry = {
  entryId: number;
  type: StreamPackEntryType;
  /** Canonical NFC, slash-delimited path including the selected root directory. */
  relativePath: string;
  /** Sequential deterministic ID for FILE entries only. */
  fileId?: number;
  sizeBytes?: number;
};
export type StreamPackManifest = {
  schemaVersion: typeof streamPackSchemaVersion;
  integrityAlgorithm: typeof integrityAlgorithm;
  integrityManifestVersion: typeof integrityManifestVersion;
  rootSemantics: typeof streamPackRootSemantics;
  entries: readonly StreamPackEntry[];
  totalBytes: number;
  blockBytes: number;
  blockCount: number;
};
export type StreamRange = {
  streamOffset: number;
  length: number;
  fileId: number;
  fileOffset: number;
};
export type StreamPackFile = {
  readonly name: string;
  readonly size: number;
  read(offset: number, length: number): Promise<ArrayBuffer>;
};
export type StreamPackDirectory = {
  readonly name: string;
  entries(): AsyncIterable<StreamPackDirectoryEntry>;
};
export type StreamPackDirectoryEntry =
  { type: "DIRECTORY"; directory: StreamPackDirectory } | { type: "FILE"; file: StreamPackFile };
export type EnumerationProgress = {
  filesDiscovered: number;
  directoriesDiscovered: number;
  totalBytesDiscovered: number;
};
export type BuildStreamPackOptions = {
  blockBytes: number;
  signal?: AbortSignal;
  onProgress?: (progress: EnumerationProgress) => void;
};
export type StreamPackSource = {
  readonly manifest: StreamPackManifest;
  readonly layout: StreamPackLayout;
  assertUnchanged(): Promise<void>;
  read(streamOffset: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
};

type IndexedFile = { fileId: number; start: number; end: number; entry: StreamPackEntry };

function fail(code: string): never {
  throw new Error(code);
}
function safe(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
function compareUtf8(left: string, right: string): number {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]! - b[index]!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}
function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
function component(input: string): string {
  const value = input.normalize("NFC");
  if (
    !value ||
    value === "." ||
    value === ".." ||
    /[\\/\0]/.test(value) ||
    /^[a-zA-Z]:$/.test(value) ||
    /[<>:"|?*]/.test(value) ||
    /[. ]$/.test(value)
  )
    fail("FS_STREAMPACK_PATH_INVALID");
  const reserved = value.replace(/[. ]+$/u, "").toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/u.test(reserved))
    fail("FS_STREAMPACK_PATH_INVALID");
  return value;
}

/** Produces a portable destination-safe path. No automatic rename policy exists. */
export function canonicalRelativePath(input: string): string {
  if (
    !input ||
    input.startsWith("/") ||
    input.startsWith("\\") ||
    /^[a-zA-Z]:/.test(input) ||
    input.includes("\0") ||
    input.includes("\\")
  )
    fail("FS_STREAMPACK_PATH_INVALID");
  const parts = input.split("/");
  if (parts.length > streamPackMaximumPathComponents) fail("FS_STREAMPACK_PATH_INVALID");
  const output = parts.map(component).join("/");
  if (bytes(output) > streamPackMaximumPathBytes) fail("FS_STREAMPACK_PATH_INVALID");
  return output;
}

function validateEntries(entries: readonly StreamPackEntry[]): number {
  if (entries.length === 0 || entries.length > streamPackMaximumEntries)
    fail("FS_STREAMPACK_ENTRY_LIMIT");
  const paths = new Set<string>();
  const portable = new Set<string>();
  let fileId = 0;
  let total = 0;
  let roots = 0;
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.entryId !== index || !Number.isSafeInteger(entry.entryId))
      fail("FS_STREAMPACK_MANIFEST_INVALID");
    const path = canonicalRelativePath(entry.relativePath);
    if (path !== entry.relativePath || paths.has(path)) fail("FS_STREAMPACK_PATH_COLLISION");
    const key = path.toLocaleLowerCase("en-US");
    if (portable.has(key)) fail("FS_STREAMPACK_PATH_COLLISION");
    if (previous !== undefined && compareUtf8(previous, path) >= 0)
      fail("FS_STREAMPACK_MANIFEST_INVALID");
    previous = path;
    paths.add(path);
    portable.add(key);
    const parentIndex = path.lastIndexOf("/");
    if (parentIndex < 0) roots += 1;
    else if (!paths.has(path.slice(0, parentIndex))) fail("FS_STREAMPACK_MANIFEST_INVALID");
    if (entry.type === "DIRECTORY") {
      if (entry.fileId !== undefined || entry.sizeBytes !== undefined)
        fail("FS_STREAMPACK_MANIFEST_INVALID");
      continue;
    }
    if (entry.type !== "FILE" || entry.fileId !== fileId || !safe(entry.sizeBytes ?? -1))
      fail("FS_STREAMPACK_MANIFEST_INVALID");
    fileId += 1;
    total += entry.sizeBytes!;
    if (!safe(total)) fail("FS_STREAMPACK_MANIFEST_INVALID");
  }
  if (roots !== 1 || entries[0]!.type !== "DIRECTORY") fail("FS_STREAMPACK_MANIFEST_INVALID");
  return total;
}

export function createStreamPackManifest(input: {
  entries: readonly Omit<StreamPackEntry, "entryId" | "fileId">[];
  blockBytes: number;
}): StreamPackManifest {
  if (!safe(input.blockBytes) || input.blockBytes === 0) fail("FS_STREAMPACK_MANIFEST_INVALID");
  const raw = input.entries.map((entry) => ({
    ...entry,
    relativePath: canonicalRelativePath(entry.relativePath)
  }));
  raw.sort((a, b) => compareUtf8(a.relativePath, b.relativePath));
  let fileId = 0;
  const entries = raw.map((entry, entryId): StreamPackEntry =>
    entry.type === "FILE"
      ? {
          entryId,
          type: "FILE",
          relativePath: entry.relativePath,
          fileId: fileId++,
          sizeBytes: entry.sizeBytes
        }
      : { entryId, type: "DIRECTORY", relativePath: entry.relativePath }
  );
  const totalBytes = validateEntries(entries);
  const blockCount = Math.ceil(totalBytes / input.blockBytes);
  if (!safe(blockCount) || blockCount > 1_000_000) fail("FS_STREAMPACK_MANIFEST_INVALID");
  return {
    schemaVersion: streamPackSchemaVersion,
    integrityAlgorithm,
    integrityManifestVersion,
    rootSemantics: streamPackRootSemantics,
    entries,
    totalBytes,
    blockBytes: input.blockBytes,
    blockCount
  };
}

export function validateStreamPackManifest(input: StreamPackManifest): StreamPackManifest {
  if (
    input.schemaVersion !== streamPackSchemaVersion ||
    input.integrityAlgorithm !== integrityAlgorithm ||
    input.integrityManifestVersion !== integrityManifestVersion ||
    input.rootSemantics !== streamPackRootSemantics ||
    !safe(input.blockBytes) ||
    input.blockBytes === 0 ||
    !safe(input.totalBytes)
  )
    fail("FS_STREAMPACK_MANIFEST_INVALID");
  const total = validateEntries(input.entries);
  if (total !== input.totalBytes || input.blockCount !== Math.ceil(total / input.blockBytes))
    fail("FS_STREAMPACK_MANIFEST_INVALID");
  return input;
}

/** Binary-search based virtual address map; it never scans every file per frame. */
export class StreamPackLayout {
  private readonly files: readonly IndexedFile[];
  constructor(readonly manifest: StreamPackManifest) {
    validateStreamPackManifest(manifest);
    let start = 0;
    this.files = manifest.entries
      .filter(
        (entry): entry is StreamPackEntry & { type: "FILE"; fileId: number; sizeBytes: number } =>
          entry.type === "FILE"
      )
      .flatMap((entry) => {
        const indexed = { fileId: entry.fileId, start, end: start + entry.sizeBytes, entry };
        start = indexed.end;
        // Empty files are manifest entries but occupy no payload address range.
        return indexed.start === indexed.end ? [] : [indexed];
      });
    if (start !== manifest.totalBytes) fail("FS_STREAMPACK_RANGE_INVALID");
  }
  ranges(streamOffset: number, length: number): readonly StreamRange[] {
    if (!safe(streamOffset) || !safe(length) || streamOffset + length > this.manifest.totalBytes)
      fail("FS_STREAMPACK_RANGE_INVALID");
    if (length === 0) return [];
    let low = 0;
    let high = this.files.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const file = this.files[middle]!;
      if (streamOffset < file.start) high = middle - 1;
      else if (streamOffset >= file.end) low = middle + 1;
      else {
        low = middle;
        break;
      }
    }
    const output: StreamRange[] = [];
    let cursor = streamOffset;
    let remaining = length;
    for (let index = low; remaining > 0 && index < this.files.length; index += 1) {
      const file = this.files[index]!;
      if (cursor < file.start || cursor >= file.end) fail("FS_STREAMPACK_RANGE_INVALID");
      const rangeLength = Math.min(remaining, file.end - cursor);
      output.push({
        streamOffset: cursor,
        length: rangeLength,
        fileId: file.fileId,
        fileOffset: cursor - file.start
      });
      cursor += rangeLength;
      remaining -= rangeLength;
    }
    if (remaining !== 0) fail("FS_STREAMPACK_RANGE_INVALID");
    return output;
  }
  blockRanges(blockIndex: number): readonly StreamRange[] {
    if (
      !Number.isSafeInteger(blockIndex) ||
      blockIndex < 0 ||
      blockIndex >= this.manifest.blockCount
    )
      fail("FS_STREAMPACK_RANGE_INVALID");
    const start = blockIndex * this.manifest.blockBytes;
    return this.ranges(start, Math.min(this.manifest.blockBytes, this.manifest.totalBytes - start));
  }
}

function u32(output: number[], value: number): void {
  output.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
}
function u64(output: number[], value: number): void {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, BigInt(value));
  output.push(...new Uint8Array(buffer));
}
function digestBytes(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/u.test(value)) fail("FS_STREAMPACK_MANIFEST_INVALID");
  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1)
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return output;
}

/** Canonical FSPK binary root input binds hierarchy, exact file layout, and block digest order. */
export function encodeStreamPackIntegrityManifest(input: {
  manifest: StreamPackManifest;
  blockDigests: readonly string[];
}): Uint8Array {
  const manifest = validateStreamPackManifest(input.manifest);
  if (input.blockDigests.length !== manifest.blockCount) fail("FS_STREAMPACK_MANIFEST_INVALID");
  const output: number[] = [0x46, 0x53, 0x50, 0x4b, streamPackSchemaVersion, 1, 1]; // FSPK / SHA-256 / selected-root
  u32(output, manifest.entries.length);
  u64(output, manifest.totalBytes);
  u32(output, manifest.blockBytes);
  u32(output, manifest.blockCount);
  for (const entry of manifest.entries) {
    const path = new TextEncoder().encode(entry.relativePath);
    output.push(entry.type === "DIRECTORY" ? 1 : 2);
    u32(output, entry.entryId);
    u32(output, path.byteLength);
    output.push(...path);
    if (entry.type === "FILE") {
      u32(output, entry.fileId!);
      u64(output, entry.sizeBytes!);
    }
  }
  for (const digest of input.blockDigests) output.push(...digestBytes(digest));
  if (output.length > streamPackMaximumManifestBytes) fail("FS_STREAMPACK_MANIFEST_INVALID");
  return Uint8Array.from(output);
}
export function buildStreamPackManifestRoot(input: {
  manifest: StreamPackManifest;
  blockDigests: readonly string[];
}): string {
  return digestBlock(encodeStreamPackIntegrityManifest(input));
}
export function streamPackSourceIdentity(manifest: StreamPackManifest): string {
  return buildStreamPackManifestRoot({
    manifest,
    blockDigests: Array(manifest.blockCount).fill("0".repeat(64))
  });
}

export async function buildStreamPackSource(
  root: StreamPackDirectory,
  options: BuildStreamPackOptions
): Promise<StreamPackSource> {
  const entries: Omit<StreamPackEntry, "entryId" | "fileId">[] = [];
  const files = new Map<string, StreamPackFile>();
  let progress: EnumerationProgress = {
    filesDiscovered: 0,
    directoriesDiscovered: 0,
    totalBytesDiscovered: 0
  };
  const stack: { directory: StreamPackDirectory; path: string }[] = [
    { directory: root, path: canonicalRelativePath(root.name) }
  ];
  while (stack.length) {
    if (options.signal?.aborted) fail("FS_STREAMPACK_ENUMERATION_CANCELLED");
    const item = stack.pop()!;
    entries.push({ type: "DIRECTORY", relativePath: item.path });
    progress = { ...progress, directoriesDiscovered: progress.directoriesDiscovered + 1 };
    options.onProgress?.(progress);
    const children: StreamPackDirectoryEntry[] = [];
    for await (const child of item.directory.entries()) children.push(child);
    children.sort((left, right) =>
      compareUtf8(
        left.type === "FILE" ? left.file.name : left.directory.name,
        right.type === "FILE" ? right.file.name : right.directory.name
      )
    );
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]!;
      if (child.type === "DIRECTORY")
        stack.push({
          directory: child.directory,
          path: item.path + "/" + component(child.directory.name)
        });
      else {
        if (!safe(child.file.size)) fail("FS_STREAMPACK_MANIFEST_INVALID");
        const path = item.path + "/" + component(child.file.name);
        entries.push({ type: "FILE", relativePath: path, sizeBytes: child.file.size });
        files.set(path, child.file);
        progress = {
          ...progress,
          filesDiscovered: progress.filesDiscovered + 1,
          totalBytesDiscovered: progress.totalBytesDiscovered + child.file.size
        };
        options.onProgress?.(progress);
      }
    }
  }
  const manifest = createStreamPackManifest({ entries, blockBytes: options.blockBytes });
  const layout = new StreamPackLayout(manifest);
  const identity = streamPackSourceIdentity(manifest);
  return {
    manifest,
    layout,
    async assertUnchanged() {
      const current = await buildStreamPackSource(root, { blockBytes: options.blockBytes });
      if (streamPackSourceIdentity(current.manifest) !== identity)
        fail("FS_STREAMPACK_SOURCE_CHANGED");
    },
    async read(streamOffset, length) {
      const output = new Uint8Array(length);
      let destinationOffset = 0;
      for (const range of layout.ranges(streamOffset, length)) {
        const entry = manifest.entries.find(
          (item) => item.type === "FILE" && item.fileId === range.fileId
        );
        const file = entry ? files.get(entry.relativePath) : undefined;
        if (!file) fail("FS_STREAMPACK_SOURCE_CHANGED");
        const payload = new Uint8Array(await file.read(range.fileOffset, range.length));
        if (payload.byteLength !== range.length) fail("FS_STREAMPACK_SOURCE_CHANGED");
        output.set(payload, destinationOffset);
        destinationOffset += payload.byteLength;
      }
      return output;
    }
  };
}
