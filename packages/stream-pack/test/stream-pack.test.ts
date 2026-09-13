import { describe, expect, it } from "vitest";
import {
  StreamPackLayout,
  buildStreamPackManifestRoot,
  canonicalRelativePath,
  createStreamPackManifest,
  streamPackSourceIdentity,
  validateStreamPackManifest
} from "../src/index.js";
import type { StreamPackManifest } from "../src/index.js";

function manifest() {
  return createStreamPackManifest({
    blockBytes: 8,
    entries: [
      { type: "FILE", relativePath: "Root/z.txt", sizeBytes: 3 },
      { type: "DIRECTORY", relativePath: "Root" },
      { type: "FILE", relativePath: "Root/a.txt", sizeBytes: 5 },
      { type: "DIRECTORY", relativePath: "Root/Empty" },
      { type: "FILE", relativePath: "Root/zero", sizeBytes: 0 }
    ]
  });
}

describe("StreamPack manifest", () => {
  it("uses canonical ordering, stable IDs, empty entries, and tiny-file aggregation", () => {
    const value = manifest();
    expect(value.entries.map((entry) => entry.relativePath)).toEqual([
      "Root",
      "Root/Empty",
      "Root/a.txt",
      "Root/z.txt",
      "Root/zero"
    ]);
    expect(
      value.entries.filter((entry) => entry.type === "FILE").map((entry) => entry.fileId)
    ).toEqual([0, 1, 2]);
    expect(value.totalBytes).toBe(8);
    expect(new StreamPackLayout(value).blockRanges(0)).toEqual([
      { streamOffset: 0, length: 5, fileId: 0, fileOffset: 0 },
      { streamOffset: 5, length: 3, fileId: 1, fileOffset: 0 }
    ]);
  });

  it("maps across files without an O(files) frame scan", () => {
    expect(new StreamPackLayout(manifest()).ranges(4, 4)).toEqual([
      { streamOffset: 4, length: 1, fileId: 0, fileOffset: 4 },
      { streamOffset: 5, length: 3, fileId: 1, fileOffset: 0 }
    ]);
  });

  it("skips zero-byte files while mapping a payload range across later files", () => {
    const value = createStreamPackManifest({
      blockBytes: 8,
      entries: [
        { type: "DIRECTORY", relativePath: "Root" },
        { type: "FILE", relativePath: "Root/a.bin", sizeBytes: 3 },
        { type: "FILE", relativePath: "Root/empty.bin", sizeBytes: 0 },
        { type: "FILE", relativePath: "Root/z.bin", sizeBytes: 5 }
      ]
    });
    expect(new StreamPackLayout(value).ranges(0, 8)).toEqual([
      { streamOffset: 0, length: 3, fileId: 0, fileOffset: 0 },
      { streamOffset: 3, length: 5, fileId: 2, fileOffset: 0 }
    ]);
  });

  it.each([
    "../secret.txt",
    "a/../../b",
    "/rooted",
    "C:/x",
    "\\\\server/share",
    "a//b",
    "a/./b",
    "A.",
    "NUL"
  ])("rejects unsafe path %s", (path) =>
    expect(() => canonicalRelativePath(path)).toThrow("FS_STREAMPACK_PATH_INVALID")
  );

  it("rejects portable collisions and malformed manifests before a destination exists", () => {
    expect(() =>
      createStreamPackManifest({
        blockBytes: 8,
        entries: [
          { type: "DIRECTORY", relativePath: "Root" },
          { type: "FILE", relativePath: "Root/A.txt", sizeBytes: 1 },
          { type: "FILE", relativePath: "Root/a.txt", sizeBytes: 1 }
        ]
      })
    ).toThrow("FS_STREAMPACK_PATH_COLLISION");
    expect(() => validateStreamPackManifest({ ...manifest(), totalBytes: 99 })).toThrow(
      "FS_STREAMPACK_MANIFEST_INVALID"
    );
  });

  it.each([
    ["trailing space", "Root/name "],
    ["trailing dot", "Root/name."],
    ["reserved device", "Root/COM1.txt"],
    ["drive-qualified component", "Root/C:"],
    ["embedded backslash", "Root/a\\b.txt"]
  ])("rejects unsafe portable path form: %s", (_name, path) => {
    expect(() => canonicalRelativePath(path)).toThrow("FS_STREAMPACK_PATH_INVALID");
  });

  it.each([
    [
      "duplicate canonical path",
      (value: StreamPackManifest) => {
        value.entries[3]!.relativePath = "Root/a.txt";
      },
      "FS_STREAMPACK_PATH_COLLISION"
    ],
    [
      "non-canonical NFC path",
      (value: StreamPackManifest) => {
        value.entries[2]!.relativePath = "Root/e\u0301.txt";
      },
      "FS_STREAMPACK_PATH_COLLISION"
    ],
    [
      "missing parent directory",
      (value: StreamPackManifest) => {
        value.entries[1]!.relativePath = "Root/Missing/Empty";
      },
      "FS_STREAMPACK_MANIFEST_INVALID"
    ],
    [
      "out-of-sequence entry id",
      (value: StreamPackManifest) => {
        value.entries[2]!.entryId = 99;
      },
      "FS_STREAMPACK_MANIFEST_INVALID"
    ],
    [
      "out-of-sequence file id",
      (value: StreamPackManifest) => {
        value.entries[2]!.fileId = 99;
      },
      "FS_STREAMPACK_MANIFEST_INVALID"
    ],
    [
      "incorrect block count",
      (value: StreamPackManifest) => {
        value.blockCount += 1;
      },
      "FS_STREAMPACK_MANIFEST_INVALID"
    ]
  ])("rejects untrusted manifest with %s", (_name, mutate, code) => {
    const value = structuredClone(manifest());
    mutate(value);
    expect(() => validateStreamPackManifest(value)).toThrow(code);
  });

  it("binds structure and ordered digests in a deterministic root", () => {
    const value = manifest();
    const digests = ["a".repeat(64)];
    expect(buildStreamPackManifestRoot({ manifest: value, blockDigests: digests })).toBe(
      buildStreamPackManifestRoot({ manifest: value, blockDigests: digests })
    );
    expect(streamPackSourceIdentity(value)).not.toBe(
      buildStreamPackManifestRoot({ manifest: value, blockDigests: digests })
    );
  });

  it("handles 10,000 tiny files as one indexed virtual stream without per-file protocol state", () => {
    const entries = [{ type: "DIRECTORY" as const, relativePath: "Root" }];
    for (let index = 0; index < 10_000; index += 1)
      entries.push({
        type: "FILE" as const,
        relativePath: "Root/file-" + String(index).padStart(5, "0"),
        sizeBytes: 16
      });
    const value = createStreamPackManifest({ entries, blockBytes: 8 * 1024 * 1024 });
    const layout = new StreamPackLayout(value);
    expect(value.entries.length).toBe(10_001);
    expect(value.blockCount).toBe(1);
    expect(layout.blockRanges(0)).toHaveLength(10_000);
    expect(layout.ranges(159_984, 16)).toEqual([
      { streamOffset: 159_984, length: 16, fileId: 9999, fileOffset: 0 }
    ]);
  });
});
