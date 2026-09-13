/** v3 adds the fixed-width SHA-256 table required to trust a committed M5 block. */
export const recoverySchemaVersion = 3;
export const m4ResumeBlockBytes = 8 * 1024 * 1024;
export const verifiedBlockDigestBytes = 32;
export const maximumRecoveryBlocks = 1_000_000;
export const resumeBlockCandidates = [
  1 * 1024 * 1024,
  4 * 1024 * 1024,
  8 * 1024 * 1024,
  16 * 1024 * 1024
] as const;

export type BlockRange = readonly [start: number, endExclusive: number];

export type RecoveryRecord = {
  schemaVersion: typeof recoverySchemaVersion;
  transferId: string;
  protocolVersion: number;
  /** Opaque transfer-manifest identity, not a filename or a payload digest. */
  manifestIdentity: string;
  /** Source metadata identity used to refuse an unsafe rebind before M5 integrity exists. */
  sourceIdentity: string;
  /** Destination binding required before a persisted map can be reused. */
  destinationIdentity: string | null;
  totalBytes: number;
  blockBytes: number;
  blockCount: number;
  committedBlockRanges: readonly BlockRange[];
  /** Base64 encoded fixed-width SHA-256 table, one 32-byte slot per logical block. */
  verifiedDigestTable: string;
  updatedAtMs: number;
};

export type RecoveryStore = {
  load(transferId: string): Promise<RecoveryRecord | null>;
  save(record: RecoveryRecord): Promise<void>;
  remove(transferId: string): Promise<void>;
};

function assertSafeNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${field} must be a safe integer.`);
}

function assertTransferId(transferId: string): void {
  if (!/^fs_tr_[0-9a-f-]{36}$/i.test(transferId)) throw new Error("Invalid transfer ID.");
}

export function blockCountFor(totalBytes: number, blockBytes: number): number {
  assertSafeNonNegativeInteger(totalBytes, "totalBytes");
  assertSafeNonNegativeInteger(blockBytes, "blockBytes");
  if (blockBytes === 0) throw new Error("blockBytes must be greater than zero.");
  const count = Math.ceil(totalBytes / blockBytes);
  if (count > maximumRecoveryBlocks)
    throw new Error("Recovery block count exceeds the safe limit.");
  return count;
}

function encodeBase64(bytes: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
}

function decodeBase64(value: string): Uint8Array {
  let text: string;
  try {
    text = atob(value);
  } catch {
    throw new Error("Invalid recovery digest table.");
  }
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

export function createVerifiedDigestTable(blockCount: number): string {
  assertSafeNonNegativeInteger(blockCount, "blockCount");
  if (blockCount > maximumRecoveryBlocks)
    throw new Error("Recovery block count exceeds the safe limit.");
  return encodeBase64(new Uint8Array(blockCount * verifiedBlockDigestBytes));
}

export function decodeVerifiedDigestTable(record: RecoveryRecord): Uint8Array {
  const bytes = decodeBase64(record.verifiedDigestTable);
  if (bytes.byteLength !== record.blockCount * verifiedBlockDigestBytes)
    throw new Error("Invalid recovery digest table.");
  return bytes;
}

export function getVerifiedBlockDigest(record: RecoveryRecord, blockIndex: number): string | null {
  const [start] = blockByteRange(blockIndex, record.totalBytes, record.blockBytes);
  void start;
  const table = decodeVerifiedDigestTable(record);
  const offset = blockIndex * verifiedBlockDigestBytes;
  const digest = table.subarray(offset, offset + verifiedBlockDigestBytes);
  if (digest.every((value) => value === 0)) return null;
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function setVerifiedBlockDigest(
  record: RecoveryRecord,
  blockIndex: number,
  digest: string,
  updatedAtMs = Date.now()
): RecoveryRecord {
  validateRecoveryRecord(record);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid recovery block digest.");
  blockByteRange(blockIndex, record.totalBytes, record.blockBytes);
  const table = decodeVerifiedDigestTable(record);
  const offset = blockIndex * verifiedBlockDigestBytes;
  for (let index = 0; index < verifiedBlockDigestBytes; index += 1)
    table[offset + index] = Number.parseInt(digest.slice(index * 2, index * 2 + 2), 16);
  return { ...record, verifiedDigestTable: encodeBase64(table), updatedAtMs };
}

export function blockByteRange(
  blockIndex: number,
  totalBytes: number,
  blockBytes: number
): BlockRange {
  const blockCount = blockCountFor(totalBytes, blockBytes);
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0 || blockIndex >= blockCount)
    throw new Error("Block index is out of range.");
  const start = blockIndex * blockBytes;
  return [start, Math.min(start + blockBytes, totalBytes)];
}

export function compactBlockIndexes(
  indexes: Iterable<number>,
  blockCount: number
): readonly BlockRange[] {
  assertSafeNonNegativeInteger(blockCount, "blockCount");
  const sorted = [...new Set(indexes)].sort((left, right) => left - right);
  for (const index of sorted) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= blockCount)
      throw new Error("Committed block index is out of range.");
  }
  const ranges: BlockRange[] = [];
  for (const index of sorted) {
    const previous = ranges.at(-1);
    if (previous && previous[1] === index) {
      ranges[ranges.length - 1] = [previous[0], index + 1];
    } else {
      ranges.push([index, index + 1]);
    }
  }
  return ranges;
}

export function expandBlockRanges(
  ranges: readonly BlockRange[],
  blockCount: number
): readonly number[] {
  assertSafeNonNegativeInteger(blockCount, "blockCount");
  const indexes: number[] = [];
  let previousEnd = 0;
  for (const range of ranges) {
    const [start, endExclusive] = range;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(endExclusive) ||
      start < previousEnd ||
      endExclusive <= start ||
      endExclusive > blockCount
    ) {
      throw new Error("Recovery block ranges are invalid.");
    }
    for (let index = start; index < endExclusive; index += 1) indexes.push(index);
    previousEnd = endExclusive;
  }
  return indexes;
}

export function createRecoveryRecord(input: {
  transferId: string;
  protocolVersion: number;
  manifestIdentity?: string;
  sourceIdentity?: string;
  destinationIdentity?: string | null;
  totalBytes: number;
  blockBytes?: number;
  updatedAtMs?: number;
}): RecoveryRecord {
  assertTransferId(input.transferId);
  assertSafeNonNegativeInteger(input.protocolVersion, "protocolVersion");
  const blockBytes = input.blockBytes ?? m4ResumeBlockBytes;
  const blockCount = blockCountFor(input.totalBytes, blockBytes);
  return {
    schemaVersion: recoverySchemaVersion,
    transferId: input.transferId,
    protocolVersion: input.protocolVersion,
    manifestIdentity: input.manifestIdentity ?? crypto.randomUUID(),
    sourceIdentity: input.sourceIdentity ?? "unbound-source",
    destinationIdentity: input.destinationIdentity ?? null,
    totalBytes: input.totalBytes,
    blockBytes,
    blockCount,
    committedBlockRanges: [],
    verifiedDigestTable: createVerifiedDigestTable(blockCount),
    updatedAtMs: input.updatedAtMs ?? Date.now()
  };
}

export function validateRecoveryRecord(record: RecoveryRecord): RecoveryRecord {
  if (record.schemaVersion !== recoverySchemaVersion)
    throw new Error("Unsupported recovery schema.");
  assertTransferId(record.transferId);
  if (!/^[0-9a-f-]{36}$/i.test(record.manifestIdentity))
    throw new Error("Invalid recovery manifest identity.");
  if (typeof record.sourceIdentity !== "string" || record.sourceIdentity.length < 1)
    throw new Error("Invalid recovery source identity.");
  if (record.destinationIdentity !== null && typeof record.destinationIdentity !== "string")
    throw new Error("Invalid recovery destination identity.");
  assertSafeNonNegativeInteger(record.protocolVersion, "protocolVersion");
  assertSafeNonNegativeInteger(record.updatedAtMs, "updatedAtMs");
  if (record.blockCount !== blockCountFor(record.totalBytes, record.blockBytes))
    throw new Error("Recovery block count does not match transfer size.");
  expandBlockRanges(record.committedBlockRanges, record.blockCount);
  decodeVerifiedDigestTable(record);
  return record;
}

export function markBlockCommitted(
  record: RecoveryRecord,
  blockIndex: number,
  updatedAtMs = Date.now()
): RecoveryRecord {
  validateRecoveryRecord(record);
  return {
    ...record,
    committedBlockRanges: compactBlockIndexes(
      [...expandBlockRanges(record.committedBlockRanges, record.blockCount), blockIndex],
      record.blockCount
    ),
    updatedAtMs
  };
}

/** M5 calls this only after destination writes and SHA-256 verification have both completed. */
export function markVerifiedBlockCommitted(
  record: RecoveryRecord,
  blockIndex: number,
  digest: string,
  updatedAtMs = Date.now()
): RecoveryRecord {
  return markBlockCommitted(
    setVerifiedBlockDigest(record, blockIndex, digest, updatedAtMs),
    blockIndex,
    updatedAtMs
  );
}

export function verifiedCommittedBlockDigests(record: RecoveryRecord): readonly string[] {
  validateRecoveryRecord(record);
  const digests: string[] = [];
  for (const blockIndex of expandBlockRanges(record.committedBlockRanges, record.blockCount)) {
    const digest = getVerifiedBlockDigest(record, blockIndex);
    if (!digest) throw new Error("FS_INTEGRITY_STATE_INVALID");
    digests.push(digest);
  }
  return digests;
}

export function missingBlockIndexes(record: RecoveryRecord): readonly number[] {
  validateRecoveryRecord(record);
  const committed = new Set(expandBlockRanges(record.committedBlockRanges, record.blockCount));
  const missing: number[] = [];
  for (let index = 0; index < record.blockCount; index += 1)
    if (!committed.has(index)) missing.push(index);
  return missing;
}

/** Splits sparse completion metadata so a recovery handshake never emits an unbounded control message. */
export function pageBlockRanges(
  ranges: readonly BlockRange[],
  maximumRangesPerPage = 1024
): readonly (readonly BlockRange[])[] {
  if (!Number.isSafeInteger(maximumRangesPerPage) || maximumRangesPerPage < 1)
    throw new Error("maximumRangesPerPage must be a positive integer.");
  const pages: BlockRange[][] = [];
  for (let offset = 0; offset < ranges.length; offset += maximumRangesPerPage)
    pages.push(ranges.slice(offset, offset + maximumRangesPerPage));
  return pages;
}

/** Sender reconciliation always treats the receiver's committed map as authoritative. */
export function reconcileMissingBlocks(
  sender: Pick<
    RecoveryRecord,
    "transferId" | "manifestIdentity" | "totalBytes" | "blockBytes" | "blockCount"
  >,
  receiver: RecoveryRecord
): readonly number[] {
  validateRecoveryRecord(receiver);
  if (
    sender.transferId !== receiver.transferId ||
    sender.manifestIdentity !== receiver.manifestIdentity ||
    sender.totalBytes !== receiver.totalBytes ||
    sender.blockBytes !== receiver.blockBytes ||
    sender.blockCount !== receiver.blockCount
  ) {
    throw new Error("Recovery state does not match the transfer manifest.");
  }
  return missingBlockIndexes(receiver);
}
