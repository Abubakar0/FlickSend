import { describe, expect, it } from "vitest";
import {
  buildManifestRoot,
  digestBlock,
  encodeSingleFileIntegrityManifest,
  integrityAlgorithm,
  verifyBlock,
  verifyManifestRoot
} from "../src/index.js";

const transferId = "fs_tr_00000000-0000-4000-8000-000000000001";

describe("M5 SHA-256 integrity", () => {
  it("matches the SHA-256 known vector and detects one-bit differences", () => {
    expect(digestBlock(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(verifyBlock(digestBlock(new Uint8Array([1])), digestBlock(new Uint8Array([0])))).toBe(
      false
    );
  });

  it("uses canonical ordered binary manifests", () => {
    const manifest = {
      version: 1 as const,
      algorithm: integrityAlgorithm,
      transferId,
      totalBytes: 9,
      blockBytes: 8,
      blockDigests: [digestBlock(new Uint8Array(8)), digestBlock(new Uint8Array(1))]
    };
    const root = buildManifestRoot(manifest);
    expect(encodeSingleFileIntegrityManifest(manifest)).toHaveLength(128);
    expect(verifyManifestRoot(manifest, root)).toBe(true);
    expect(
      verifyManifestRoot({ ...manifest, blockDigests: [...manifest.blockDigests].reverse() }, root)
    ).toBe(false);
  });

  it("supports a deterministic empty-file manifest", () => {
    const manifest = {
      version: 1 as const,
      algorithm: integrityAlgorithm,
      transferId,
      totalBytes: 0,
      blockBytes: 8 * 1024 * 1024,
      blockDigests: []
    };
    expect(verifyManifestRoot(manifest, buildManifestRoot(manifest))).toBe(true);
  });
});
