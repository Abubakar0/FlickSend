import { z } from "zod";

// M3 adds receiver flow control and pause controls. Version 1 peers must fail explicitly.
export const transferProtocolVersion = 2;
export const m4RecoveryProtocolVersion = 3;
/** FSTP v4 makes block integrity and verified delivery mandatory for the active Engine Lab path. */
export const m5IntegrityProtocolVersion = 4;
/** FSTP v5 is StreamPack-only; v4 single-file controls remain immutable. */
export const m6StreamPackProtocolVersion = 5;
export const transferFrameHeaderBytes = 20;
export const defaultFramePayloadBytes = 64 * 1024;
export const maximumFramePayloadBytes = 256 * 1024;

export const transferStates = [
  "IDLE",
  "SELECTED",
  "PREPARING",
  "READY",
  "SENDING",
  "RECEIVING",
  "RECONNECTING",
  "PAUSED",
  "FINALIZING",
  "TRANSFER_BYTES_COMPLETE",
  "VERIFYING",
  "VERIFIED",
  "DELIVERED",
  "INTEGRITY_FAILED",
  "COMPLETED",
  "CANCELLING",
  "CANCELLED",
  "FAILED"
] as const;
export type TransferState = (typeof transferStates)[number];

const transferIdSchema = z.string().regex(/^fs_tr_[0-9a-f-]{36}$/i);
const fileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[\\/\0]/.test(value), "A filename must not contain a path.");

const resumeBlockBytesSchema = z.union([
  z.literal(1 * 1024 * 1024),
  z.literal(4 * 1024 * 1024),
  z.literal(8 * 1024 * 1024),
  z.literal(16 * 1024 * 1024)
]);
const blockRangeSchema = z
  .tuple([
    z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
  ])
  .refine(([start, endExclusive]) => start < endExclusive, "Block range must not be empty.");
const blockRangesPageSchema = z
  .array(blockRangeSchema)
  .max(1024)
  .superRefine((ranges, context) => {
    let previousEnd = 0;
    for (const [start, endExclusive] of ranges) {
      if (start < previousEnd) {
        context.addIssue({ code: "custom", message: "Block ranges must be ordered and disjoint." });
        return;
      }
      previousEnd = endExclusive;
    }
  });

export const transferControlMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TRANSFER_OFFER"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema,
    transferReference: z.number().int().min(1).max(0xffffffff),
    name: fileNameSchema,
    size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    mimeType: z.string().max(255).optional()
  }),
  z.object({
    type: z.literal("TRANSFER_ACCEPT"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema,
    receiveWindowBytes: z
      .number()
      .int()
      .min(32 * 1024)
      .max(64 * 1024 * 1024)
  }),
  z.object({
    type: z.literal("TRANSFER_REJECT"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema,
    code: z.string().max(64)
  }),
  z.object({
    type: z.literal("TRANSFER_START"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema,
    framePayloadBytes: z.number().int().min(1024).max(maximumFramePayloadBytes)
  }),
  z.object({
    type: z.literal("TRANSFER_FINISH"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema,
    bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  }),
  z.object({
    type: z.literal("TRANSFER_VERIFY_OK"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema
  }),
  z.object({
    type: z.literal("TRANSFER_FLOW_CONTROL"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema,
    bytesWritten: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    receiveWindowBytes: z
      .number()
      .int()
      .min(32 * 1024)
      .max(64 * 1024 * 1024)
  }),
  z.object({
    type: z.literal("TRANSFER_PAUSE"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema
  }),
  z.object({
    type: z.literal("TRANSFER_RESUME"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema
  }),
  z.object({
    type: z.literal("TRANSFER_CANCEL"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema,
    code: z.string().max(64)
  }),
  z.object({
    type: z.literal("TRANSFER_FAIL"),
    protocolVersion: z.literal(transferProtocolVersion),
    transferId: transferIdSchema,
    code: z.string().max(64)
  })
]);
export type TransferControlMessage = z.infer<typeof transferControlMessageSchema>;

/**
 * M4 recovery controls are version 3 and intentionally inactive until the engine can make
 * random-access destination writes. Pages bound sparse completion maps on the control channel.
 */
export const m4RecoveryControlMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TRANSFER_RESUME_OFFER"),
    protocolVersion: z.literal(m4RecoveryProtocolVersion),
    transferId: transferIdSchema,
    transferReference: z.number().int().min(1).max(0xffffffff),
    name: fileNameSchema,
    mimeType: z.string().max(255).optional(),
    manifestIdentity: z.string().uuid(),
    sourceIdentity: z.string().min(1).max(1024),
    totalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    resumeBlockBytes: resumeBlockBytesSchema,
    blockCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
  }),
  z.object({
    type: z.literal("TRANSFER_HAVE_BLOCKS"),
    protocolVersion: z.literal(m4RecoveryProtocolVersion),
    transferId: transferIdSchema,
    manifestIdentity: z.string().uuid(),
    totalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    resumeBlockBytes: resumeBlockBytesSchema,
    blockCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    page: z.number().int().min(0),
    hasMore: z.boolean(),
    committedBlockRanges: blockRangesPageSchema
  }),
  z.object({
    type: z.literal("TRANSFER_BLOCK_COMMITTED"),
    protocolVersion: z.literal(m4RecoveryProtocolVersion),
    transferId: transferIdSchema,
    manifestIdentity: z.string().uuid(),
    blockIndex: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
  }),
  z.object({
    type: z.literal("TRANSFER_BYTES_COMPLETE"),
    protocolVersion: z.literal(m4RecoveryProtocolVersion),
    transferId: transferIdSchema,
    manifestIdentity: z.string().uuid()
  }),
  z.object({
    type: z.literal("TRANSFER_PAUSE"),
    protocolVersion: z.literal(m4RecoveryProtocolVersion),
    transferId: transferIdSchema,
    manifestIdentity: z.string().uuid()
  }),
  z.object({
    type: z.literal("TRANSFER_RESUME"),
    protocolVersion: z.literal(m4RecoveryProtocolVersion),
    transferId: transferIdSchema,
    manifestIdentity: z.string().uuid()
  }),
  z.object({
    type: z.literal("TRANSFER_FAIL"),
    protocolVersion: z.literal(m4RecoveryProtocolVersion),
    transferId: transferIdSchema,
    code: z.string().max(64)
  })
]);
export type M4RecoveryControlMessage = z.infer<typeof m4RecoveryControlMessageSchema>;

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const m5Base = {
  protocolVersion: z.literal(m5IntegrityProtocolVersion),
  transferId: transferIdSchema,
  manifestIdentity: z.string().uuid()
};

/** v4 is deliberately separate from v3: committed blocks now mean verified-and-persisted. */
export const m5IntegrityControlMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TRANSFER_INTEGRITY_OFFER"),
    ...m5Base,
    transferReference: z.number().int().min(1).max(0xffffffff),
    name: fileNameSchema,
    mimeType: z.string().max(255).optional(),
    sourceIdentity: z.string().min(1).max(1024),
    totalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    resumeBlockBytes: resumeBlockBytesSchema,
    blockCount: z.number().int().min(0).max(1_000_000),
    integrityAlgorithm: z.literal("SHA256"),
    integrityManifestVersion: z.literal(1)
  }),
  z.object({
    type: z.literal("TRANSFER_HAVE_VERIFIED_BLOCKS"),
    ...m5Base,
    totalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    resumeBlockBytes: resumeBlockBytesSchema,
    blockCount: z.number().int().min(0).max(1_000_000),
    integrityAlgorithm: z.literal("SHA256"),
    page: z.number().int().min(0),
    hasMore: z.boolean(),
    committedBlockRanges: blockRangesPageSchema
  }),
  z.object({
    type: z.literal("TRANSFER_BLOCK_DIGEST"),
    ...m5Base,
    integrityAlgorithm: z.literal("SHA256"),
    blockIndex: z.number().int().min(0).max(1_000_000),
    byteOffset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    byteLength: z
      .number()
      .int()
      .min(0)
      .max(16 * 1024 * 1024),
    digest: digestSchema
  }),
  z.object({
    type: z.literal("TRANSFER_BLOCK_COMMITTED"),
    ...m5Base,
    blockIndex: z.number().int().min(0).max(1_000_000)
  }),
  z.object({
    type: z.literal("TRANSFER_BLOCK_READY"),
    ...m5Base,
    blockIndex: z.number().int().min(0).max(1_000_000)
  }),
  z.object({
    type: z.literal("TRANSFER_BLOCK_NACK"),
    ...m5Base,
    blockIndex: z.number().int().min(0).max(1_000_000),
    reason: z.enum(["INTEGRITY_MISMATCH", "DIGEST_MISSING", "DIGEST_INVALID"])
  }),
  z.object({ type: z.literal("TRANSFER_BYTES_COMPLETE"), ...m5Base }),
  z.object({ type: z.literal("TRANSFER_MANIFEST_ROOT"), ...m5Base, root: digestSchema }),
  z.object({ type: z.literal("TRANSFER_MANIFEST_VERIFIED"), ...m5Base, root: digestSchema }),
  z.object({ type: z.literal("TRANSFER_DELIVERED"), ...m5Base }),
  z.object({
    type: z.literal("TRANSFER_FAIL"),
    protocolVersion: z.literal(m5IntegrityProtocolVersion),
    transferId: transferIdSchema,
    code: z.string().max(64)
  })
]);
export type M5IntegrityControlMessage = z.infer<typeof m5IntegrityControlMessageSchema>;

const streamPackEntrySchema = z.discriminatedUnion("type", [
  z.object({
    entryId: z.number().int().min(0).max(100_000),
    type: z.literal("DIRECTORY"),
    relativePath: z.string().min(1).max(4096)
  }),
  z.object({
    entryId: z.number().int().min(0).max(100_000),
    type: z.literal("FILE"),
    relativePath: z.string().min(1).max(4096),
    fileId: z.number().int().min(0).max(100_000),
    sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
  })
]);
const m6Base = {
  protocolVersion: z.literal(m6StreamPackProtocolVersion),
  transferId: transferIdSchema,
  manifestIdentity: z.string().uuid()
};

/**
 * v5 chunks metadata as bounded JSON objects. Payload remains binary FSTP frames and no bulk
 * manifest is Base64 encoded. Receiver validation is required before STREAMPACK_READY.
 */
export const m6StreamPackControlMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("STREAMPACK_OFFER"),
    ...m6Base,
    transferReference: z.number().int().min(1).max(0xffffffff),
    sourceIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    totalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    resumeBlockBytes: z.literal(8 * 1024 * 1024),
    blockCount: z.number().int().min(0).max(1_000_000),
    entryCount: z.number().int().min(1).max(100_000)
  }),
  z.object({ type: z.literal("STREAMPACK_ACCEPT"), ...m6Base }),
  z.object({
    type: z.literal("STREAMPACK_MANIFEST_BEGIN"),
    ...m6Base,
    entryCount: z.number().int().min(1).max(100_000),
    totalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    resumeBlockBytes: z.literal(8 * 1024 * 1024),
    blockCount: z.number().int().min(0).max(1_000_000)
  }),
  z.object({
    type: z.literal("STREAMPACK_MANIFEST_CHUNK"),
    ...m6Base,
    chunkIndex: z.number().int().min(0).max(100_000),
    entries: z.array(streamPackEntrySchema).min(1).max(128)
  }),
  z.object({
    type: z.literal("STREAMPACK_MANIFEST_END"),
    ...m6Base,
    chunkCount: z.number().int().min(1).max(100_000)
  }),
  z.object({ type: z.literal("STREAMPACK_READY"), ...m6Base }),
  z.object({
    type: z.literal("STREAMPACK_HAVE_VERIFIED_BLOCKS"),
    ...m6Base,
    totalBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    resumeBlockBytes: z.literal(8 * 1024 * 1024),
    blockCount: z.number().int().min(0).max(1_000_000),
    page: z.number().int().min(0),
    hasMore: z.boolean(),
    committedBlockRanges: blockRangesPageSchema
  }),
  z.object({
    type: z.literal("STREAMPACK_BLOCK_DIGEST"),
    ...m6Base,
    blockIndex: z.number().int().min(0).max(1_000_000),
    byteOffset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    byteLength: z
      .number()
      .int()
      .min(0)
      .max(8 * 1024 * 1024),
    digest: digestSchema
  }),
  z.object({
    type: z.literal("STREAMPACK_BLOCK_READY"),
    ...m6Base,
    blockIndex: z.number().int().min(0).max(1_000_000)
  }),
  z.object({
    type: z.literal("STREAMPACK_BLOCK_COMMITTED"),
    ...m6Base,
    blockIndex: z.number().int().min(0).max(1_000_000)
  }),
  z.object({
    type: z.literal("STREAMPACK_BLOCK_NACK"),
    ...m6Base,
    blockIndex: z.number().int().min(0).max(1_000_000),
    reason: z.enum(["INTEGRITY_MISMATCH", "DIGEST_MISSING", "DIGEST_INVALID"])
  }),
  z.object({ type: z.literal("STREAMPACK_BYTES_COMPLETE"), ...m6Base }),
  z.object({ type: z.literal("STREAMPACK_MANIFEST_ROOT"), ...m6Base, root: digestSchema }),
  z.object({ type: z.literal("STREAMPACK_MANIFEST_VERIFIED"), ...m6Base, root: digestSchema }),
  z.object({ type: z.literal("STREAMPACK_DELIVERED"), ...m6Base }),
  z.object({ type: z.literal("STREAMPACK_REJECT"), ...m6Base, code: z.string().max(64) }),
  z.object({ type: z.literal("STREAMPACK_FAIL"), ...m6Base, code: z.string().max(64) })
]);
export type M6StreamPackControlMessage = z.infer<typeof m6StreamPackControlMessageSchema>;

export type DataFrame = {
  protocolVersion?:
    | typeof transferProtocolVersion
    | typeof m4RecoveryProtocolVersion
    | typeof m5IntegrityProtocolVersion
    | typeof m6StreamPackProtocolVersion;
  transferReference: number;
  offset: number;
  payload: Uint8Array<ArrayBuffer>;
};

export function parseTransferControlMessage(value: unknown): TransferControlMessage | null {
  return transferControlMessageSchema.safeParse(value).data ?? null;
}

export function parseM4RecoveryControlMessage(value: unknown): M4RecoveryControlMessage | null {
  return m4RecoveryControlMessageSchema.safeParse(value).data ?? null;
}

export function parseM5IntegrityControlMessage(value: unknown): M5IntegrityControlMessage | null {
  return m5IntegrityControlMessageSchema.safeParse(value).data ?? null;
}
export function parseM6StreamPackControlMessage(value: unknown): M6StreamPackControlMessage | null {
  return m6StreamPackControlMessageSchema.safeParse(value).data ?? null;
}

export function encodeDataFrame(frame: DataFrame): ArrayBuffer {
  if (!Number.isSafeInteger(frame.offset) || frame.offset < 0)
    throw new Error("Invalid frame offset.");
  if (frame.payload.byteLength > maximumFramePayloadBytes)
    throw new Error("Frame payload is too large.");
  const output = new Uint8Array(transferFrameHeaderBytes + frame.payload.byteLength);
  const view = new DataView(output.buffer);
  view.setUint8(0, frame.protocolVersion ?? transferProtocolVersion);
  view.setUint8(1, 1);
  view.setUint16(2, 0);
  view.setUint32(4, frame.transferReference);
  view.setBigUint64(8, BigInt(frame.offset));
  view.setUint32(16, frame.payload.byteLength);
  output.set(frame.payload, transferFrameHeaderBytes);
  return output.buffer;
}

export function decodeDataFrame(input: ArrayBuffer): DataFrame | null {
  if (input.byteLength < transferFrameHeaderBytes) return null;
  const view = new DataView(input);
  if (
    (view.getUint8(0) !== transferProtocolVersion &&
      view.getUint8(0) !== m4RecoveryProtocolVersion &&
      view.getUint8(0) !== m5IntegrityProtocolVersion &&
      view.getUint8(0) !== m6StreamPackProtocolVersion) ||
    view.getUint8(1) !== 1 ||
    view.getUint16(2) !== 0
  ) {
    return null;
  }
  const payloadLength = view.getUint32(16);
  if (
    payloadLength > maximumFramePayloadBytes ||
    input.byteLength !== transferFrameHeaderBytes + payloadLength
  ) {
    return null;
  }
  const offset = Number(view.getBigUint64(8));
  if (!Number.isSafeInteger(offset)) return null;
  return {
    protocolVersion: view.getUint8(0) as DataFrame["protocolVersion"],
    transferReference: view.getUint32(4),
    offset,
    // The DataChannel-owned ArrayBuffer is retained through the sequential destination write.
    // Avoiding slice() removes an otherwise unnecessary full-payload copy on every frame.
    payload: new Uint8Array(input, transferFrameHeaderBytes, payloadLength)
  };
}
