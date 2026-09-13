export const kibibyte = 1024;
export const mebibyte = 1024 * kibibyte;

export type WorkerMode = "main-thread" | "source-worker-experimental";

export type TransferTuning = {
  framePayloadBytes: number;
  readAheadBytes: number;
  sendHighWaterBytes: number;
  sendLowWaterBytes: number;
  receiveWindowBytes: number;
  writeBatchBytes: number;
  uiSnapshotIntervalMs: number;
  throughputWindowMs: number;
  channelCount: 1;
  workerMode: WorkerMode;
};

/**
 * M3 benchmark defaults, not permanent protocol constants. They intentionally favor bounded
 * queues and stable UI over an unmeasured peak-throughput claim.
 */
export const m3BenchmarkDefaults: Readonly<TransferTuning> = {
  framePayloadBytes: 64 * kibibyte,
  readAheadBytes: 256 * kibibyte,
  sendHighWaterBytes: 8 * mebibyte,
  sendLowWaterBytes: 2 * mebibyte,
  receiveWindowBytes: 8 * mebibyte,
  writeBatchBytes: 256 * kibibyte,
  uiSnapshotIntervalMs: 125,
  throughputWindowMs: 1000,
  channelCount: 1,
  workerMode: "main-thread"
};

const frameSizes = new Set([32 * kibibyte, 64 * kibibyte, 128 * kibibyte, 256 * kibibyte]);
const maximumReadAheadBytes = 16 * mebibyte;
// Chromium rejects queued sends above roughly 16 MiB before an application-level 32 MiB
// high-water check can run. Keep all exposed M3 profiles below that transport boundary.
const maximumWatermarkBytes = 16 * mebibyte;
const maximumWriteBatchBytes = 4 * mebibyte;

export function validateTransferTuning(value: TransferTuning): TransferTuning {
  if (!frameSizes.has(value.framePayloadBytes))
    throw new Error("Frame payload must be one of 32, 64, 128, or 256 KiB.");
  if (
    !Number.isSafeInteger(value.readAheadBytes) ||
    value.readAheadBytes < value.framePayloadBytes ||
    value.readAheadBytes > maximumReadAheadBytes
  )
    throw new Error("Read-ahead must hold at least one frame.");
  if (
    !Number.isSafeInteger(value.sendLowWaterBytes) ||
    !Number.isSafeInteger(value.sendHighWaterBytes) ||
    value.sendLowWaterBytes < 0 ||
    value.sendHighWaterBytes < value.sendLowWaterBytes ||
    value.sendHighWaterBytes > maximumWatermarkBytes
  ) {
    throw new Error("DataChannel watermarks are invalid.");
  }
  if (
    !Number.isSafeInteger(value.receiveWindowBytes) ||
    value.receiveWindowBytes < value.framePayloadBytes ||
    value.receiveWindowBytes > maximumWatermarkBytes
  )
    throw new Error("Receive window must hold at least one frame.");
  if (
    !Number.isSafeInteger(value.writeBatchBytes) ||
    value.writeBatchBytes < value.framePayloadBytes ||
    value.writeBatchBytes > maximumWriteBatchBytes
  )
    throw new Error("Write batch must hold at least one frame.");
  if (value.uiSnapshotIntervalMs < 50 || value.uiSnapshotIntervalMs > 1000)
    throw new Error("UI snapshot interval must be between 50 ms and 1 second.");
  if (value.throughputWindowMs < 250 || value.throughputWindowMs > 5000)
    throw new Error("Throughput window must be between 250 ms and 5 seconds.");
  if (value.channelCount !== 1)
    throw new Error("M3's reliable production path uses one bulk channel only.");
  return value;
}

export function mergeTransferTuning(update: Partial<TransferTuning>): TransferTuning {
  return validateTransferTuning({ ...m3BenchmarkDefaults, ...update });
}
