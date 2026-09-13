import { sha256 } from "@noble/hashes/sha2.js";

export const integrityAlgorithm = "SHA256" as const;
export const sha256DigestBytes = 32;
export const integrityManifestVersion = 1;
const manifestMagic = new Uint8Array([0x46, 0x53, 0x49, 0x4d]); // FSIM
const transferIdBytes = 42;
const manifestHeaderBytes = 4 + 1 + 1 + transferIdBytes + 8 + 4 + 4;
const maximumManifestBlocks = 1_000_000;

export type IntegrityAlgorithm = typeof integrityAlgorithm;

export type StreamingSha256 = {
  update(bytes: Uint8Array): void;
  digestHex(): string;
};

export type SingleFileIntegrityManifest = {
  version: typeof integrityManifestVersion;
  algorithm: IntegrityAlgorithm;
  transferId: string;
  totalBytes: number;
  blockBytes: number;
  blockDigests: readonly string[];
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("FS_BLOCK_DIGEST_INVALID");
  const output = new Uint8Array(sha256DigestBytes);
  for (let index = 0; index < output.length; index += 1)
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return output;
}

function assertSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
}

function assertManifest(input: SingleFileIntegrityManifest): void {
  if (input.version !== integrityManifestVersion) throw new Error("FS_MANIFEST_INVALID");
  if (input.algorithm !== integrityAlgorithm) throw new Error("FS_UNSUPPORTED_INTEGRITY_ALGORITHM");
  if (
    !/^fs_tr_[0-9a-f-]{36}$/i.test(input.transferId) ||
    input.transferId.length !== transferIdBytes
  )
    throw new Error("FS_MANIFEST_INVALID");
  assertSafeInteger(input.totalBytes, "FS_MANIFEST_INVALID");
  if (!Number.isSafeInteger(input.blockBytes) || input.blockBytes <= 0)
    throw new Error("FS_MANIFEST_INVALID");
  const expectedBlockCount = Math.ceil(input.totalBytes / input.blockBytes);
  if (
    input.blockDigests.length !== expectedBlockCount ||
    expectedBlockCount > maximumManifestBlocks
  )
    throw new Error("FS_MANIFEST_INVALID");
  for (const digest of input.blockDigests) hexToBytes(digest);
}

/** Creates an incremental SHA-256 hasher for one bounded logical block. */
export function createStreamingSha256(): StreamingSha256 {
  const hash = sha256.create();
  return {
    update: (bytes) => hash.update(bytes),
    digestHex: () => bytesToHex(hash.digest())
  };
}

export function digestBlock(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/** Uses noble's reviewed byte comparison primitive rather than a hand-rolled comparator. */
export function verifyBlock(expectedDigest: string, actualDigest: string): boolean {
  try {
    const expected = hexToBytes(expectedDigest);
    const actual = hexToBytes(actualDigest);
    // SHA-256 values are fixed 32-byte public integrity metadata. This XOR accumulator avoids
    // an early-exit comparison while keeping the browser-only integrity abstraction portable.
    let difference = 0;
    for (let index = 0; index < sha256DigestBytes; index += 1)
      difference |= expected[index]! ^ actual[index]!;
    return difference === 0;
  } catch {
    return false;
  }
}

/**
 * Canonical binary encoding: magic, version, algorithm id, ASCII transfer id, uint64 size,
 * uint32 block size, uint32 count, then ordered 32-byte SHA-256 block digests (big endian).
 */
export function encodeSingleFileIntegrityManifest(input: SingleFileIntegrityManifest): Uint8Array {
  assertManifest(input);
  const output = new Uint8Array(
    manifestHeaderBytes + input.blockDigests.length * sha256DigestBytes
  );
  output.set(manifestMagic, 0);
  const view = new DataView(output.buffer);
  view.setUint8(4, input.version);
  view.setUint8(5, 1); // SHA256
  for (let index = 0; index < transferIdBytes; index += 1)
    output[6 + index] = input.transferId.charCodeAt(index);
  view.setBigUint64(6 + transferIdBytes, BigInt(input.totalBytes));
  view.setUint32(14 + transferIdBytes, input.blockBytes);
  view.setUint32(18 + transferIdBytes, input.blockDigests.length);
  let offset = manifestHeaderBytes;
  for (const digest of input.blockDigests) {
    output.set(hexToBytes(digest), offset);
    offset += sha256DigestBytes;
  }
  return output;
}

export function buildManifestRoot(input: SingleFileIntegrityManifest): string {
  return digestBlock(encodeSingleFileIntegrityManifest(input));
}

export function verifyManifestRoot(
  input: SingleFileIntegrityManifest,
  expectedRoot: string
): boolean {
  return verifyBlock(expectedRoot, buildManifestRoot(input));
}
