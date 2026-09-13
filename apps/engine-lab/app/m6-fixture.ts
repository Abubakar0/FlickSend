import {
  createStreamPackManifest,
  StreamPackLayout,
  type StreamPackEntry,
  type StreamPackSource
} from "@flicksend/stream-pack";
import type { StreamPackTreeByte } from "@flicksend/filesystem-browser";

const fixtureBytes = Uint8Array.from([17, 34, 51, 68, 85, 102, 119, 136]);

/** Small deterministic hierarchy for browser/WebRTC M6 qualification; no user data is involved. */
export function createM6StructuralFixture(): StreamPackSource {
  const manifest = createStreamPackManifest({
    blockBytes: 8 * 1024 * 1024,
    entries: [
      { type: "DIRECTORY", relativePath: "M6-Fixture" },
      { type: "DIRECTORY", relativePath: "M6-Fixture/Empty" },
      { type: "DIRECTORY", relativePath: "M6-Fixture/Nested" },
      { type: "FILE", relativePath: "M6-Fixture/Nested/a.bin", sizeBytes: 3 },
      { type: "FILE", relativePath: "M6-Fixture/b.bin", sizeBytes: 5 },
      { type: "FILE", relativePath: "M6-Fixture/zero.txt", sizeBytes: 0 }
    ]
  });
  return {
    manifest,
    layout: new StreamPackLayout(manifest),
    assertUnchanged: async () => undefined,
    read: async (offset, length) => fixtureBytes.slice(offset, offset + length)
  };
}

export function m6StructuralFixtureTree(): {
  manifest: ReturnType<typeof createM6StructuralFixture>["manifest"];
  files: ReadonlyMap<number, Uint8Array>;
} {
  const source = createM6StructuralFixture();
  return {
    manifest: source.manifest,
    files: new Map([
      [0, fixtureBytes.slice(0, 3)],
      [1, fixtureBytes.slice(3, 8)],
      [2, new Uint8Array()]
    ])
  };
}

/** M9 uses this bounded synthetic tree only to qualify a real selected destination. */
export function m9FilesystemFixtureByte(fileId: number, offset: number): number {
  return (fileId * 67 + offset * 29 + 11) % 251;
}

export function createM9FilesystemFixture(): StreamPackSource {
  const manifest = createStreamPackManifest({
    blockBytes: 8 * 1024 * 1024,
    entries: [
      { type: "DIRECTORY", relativePath: "M9-FS-Qualification" },
      { type: "DIRECTORY", relativePath: "M9-FS-Qualification/Empty" },
      { type: "DIRECTORY", relativePath: "M9-FS-Qualification/Nested" },
      { type: "DIRECTORY", relativePath: "M9-FS-Qualification/Unicode" },
      { type: "FILE", relativePath: "M9-FS-Qualification/zero.bin", sizeBytes: 0 },
      { type: "FILE", relativePath: "M9-FS-Qualification/Nested/tiny.bin", sizeBytes: 64 },
      {
        type: "FILE",
        relativePath: "M9-FS-Qualification/Nested/medium.bin",
        sizeBytes: 512 * 1024
      },
      {
        // The source spelling is deliberately NFD; StreamPack must persist the canonical NFC path.
        type: "FILE",
        relativePath: "M9-FS-Qualification/Unicode/Cafe\u0301.txt",
        sizeBytes: 128
      }
    ]
  });
  const layout = new StreamPackLayout(manifest);
  return {
    manifest,
    layout,
    assertUnchanged: async () => undefined,
    async read(offset, length) {
      const output = new Uint8Array(length);
      for (const range of layout.ranges(offset, length)) {
        const destinationOffset = range.streamOffset - offset;
        for (let index = 0; index < range.length; index += 1)
          output[destinationOffset + index] = m9FilesystemFixtureByte(
            range.fileId,
            range.fileOffset + index
          );
      }
      return output;
    }
  };
}

export function m9FilesystemFixtureTreeByte(): StreamPackTreeByte {
  return m9FilesystemFixtureByte;
}

export const m6TinyManyFileCount = 10_000;
export const m6TinyManyDirectoryCount = 103;
export const m6TinyManyPayloadBytes = 49_598_976;

function tinyManyFileSize(index: number): number {
  return index % 11 === 0 ? 0 : 16 * (1 << (index % 12));
}

export function m6TinyManyByte(fileId: number, offset: number): number {
  return (fileId * 31 + offset * 17 + 19) % 251;
}

export function createM6TinyManyFixture(): StreamPackSource {
  const entries: Omit<StreamPackEntry, "entryId" | "fileId">[] = [
    { type: "DIRECTORY", relativePath: "M6-Tiny-Many" }
  ];
  for (let index = 0; index < m6TinyManyDirectoryCount - 1; index += 1)
    entries.push({
      type: "DIRECTORY",
      relativePath: "M6-Tiny-Many/dir-" + String(index).padStart(3, "0")
    });
  for (let index = 0; index < m6TinyManyFileCount; index += 1)
    entries.push({
      type: "FILE",
      relativePath:
        "M6-Tiny-Many/dir-" +
        String(index % (m6TinyManyDirectoryCount - 1)).padStart(3, "0") +
        "/file-" +
        String(index).padStart(5, "0") +
        ".bin",
      sizeBytes: tinyManyFileSize(index)
    });
  const manifest = createStreamPackManifest({ entries, blockBytes: 8 * 1024 * 1024 });
  const layout = new StreamPackLayout(manifest);
  return {
    manifest,
    layout,
    assertUnchanged: async () => undefined,
    async read(offset, length) {
      const output = new Uint8Array(length);
      for (const range of layout.ranges(offset, length)) {
        const destinationOffset = range.streamOffset - offset;
        for (let index = 0; index < range.length; index += 1)
          output[destinationOffset + index] = m6TinyManyByte(
            range.fileId,
            range.fileOffset + index
          );
      }
      return output;
    }
  };
}

export function m6TinyManyTreeByte(): StreamPackTreeByte {
  return m6TinyManyByte;
}

export const m6MixedPayloadBytes = 17_304_188;
export const m6InterruptionPayloadBytes = 46 * 1024 * 1024 + 526_972;

function createMixedSource(
  largeBytes: number,
  assertUnchanged: () => Promise<void>
): StreamPackSource {
  const entries: Omit<StreamPackEntry, "entryId" | "fileId">[] = [
    { type: "DIRECTORY", relativePath: "M6-Mixed" },
    { type: "DIRECTORY", relativePath: "M6-Mixed/Empty" },
    { type: "DIRECTORY", relativePath: "M6-Mixed/Assets" },
    { type: "DIRECTORY", relativePath: "M6-Mixed/Assets/Tiny" },
    { type: "DIRECTORY", relativePath: "M6-Mixed/Assets/Medium" },
    { type: "FILE", relativePath: "M6-Mixed/empty.txt", sizeBytes: 0 },
    { type: "FILE", relativePath: "M6-Mixed/Assets/large.bin", sizeBytes: largeBytes },
    { type: "FILE", relativePath: "M6-Mixed/Assets/Medium/medium.bin", sizeBytes: 512 * 1024 }
  ];
  for (let index = 0; index < 128; index += 1)
    entries.push({
      type: "FILE",
      relativePath: "M6-Mixed/Assets/Tiny/tiny-" + String(index).padStart(3, "0") + ".bin",
      sizeBytes: index % 9 === 0 ? 0 : 16 + (index % 17)
    });
  const manifest = createStreamPackManifest({ entries, blockBytes: 8 * 1024 * 1024 });
  const layout = new StreamPackLayout(manifest);
  return {
    manifest,
    layout,
    assertUnchanged,
    async read(offset, length) {
      const output = new Uint8Array(length);
      for (const range of layout.ranges(offset, length)) {
        const destinationOffset = range.streamOffset - offset;
        for (let index = 0; index < range.length; index += 1)
          output[destinationOffset + index] =
            (range.fileId * 43 + (range.fileOffset + index) * 13) % 251;
      }
      return output;
    }
  };
}

/** Mixed hierarchy used by browser qualification: empty paths, tiny assets, and a large asset. */
export function createM6MixedFixture(): StreamPackSource {
  return createMixedSource(16 * 1024 * 1024, async () => undefined);
}

/** Six logical blocks make three browser reconnections observable near 20%, 55%, and 85%. */
export function createM6InterruptionFixture(): StreamPackSource {
  return createMixedSource(46 * 1024 * 1024, async () => undefined);
}

export type M6MutableFixture = {
  source: StreamPackSource;
  mutate(): void;
};

/** Qualification-only source mutation model; production directory sources re-enumerate metadata. */
export function createM6MutableFixture(): M6MutableFixture {
  let changed = false;
  return {
    source: createMixedSource(16 * 1024 * 1024, async () => {
      if (changed) throw new Error("FS_STREAMPACK_SOURCE_CHANGED");
    }),
    mutate() {
      changed = true;
    }
  };
}

export function m6MixedTreeByte(): StreamPackTreeByte {
  return (fileId, offset) => (fileId * 43 + offset * 13) % 251;
}
