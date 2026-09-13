import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import {
  blockByteRange,
  missingBlockIndexes,
  m4ResumeBlockBytes,
  validateRecoveryRecord,
  type RecoveryRecord,
  type RecoveryStore
} from "@flicksend/resume";
import { ReceiverRecoveryCheckpoint } from "./recovery.js";

export type ResumableCopyOptions = {
  destination: RandomAccessFileDestination;
  recoveryStore: RecoveryStore;
  recoveryRecord: RecoveryRecord;
  frameBytes?: number;
  onBlockCommitted?: (blockIndex: number, record: RecoveryRecord) => Promise<void> | void;
};

/**
 * M4's bounded source/destination loop. Transport adapters will feed the same missing-block plan
 * after FSTP v3 reconciliation; this direct copier provides deterministic interruption evidence.
 */
export class ResumableBlockCopy {
  private readonly frameBytes: number;

  constructor(
    private readonly source: FileSource,
    private readonly options: ResumableCopyOptions
  ) {
    validateRecoveryRecord(options.recoveryRecord);
    if (source.size !== options.recoveryRecord.totalBytes)
      throw new Error("Source size does not match the recovery manifest.");
    this.frameBytes = options.frameBytes ?? 64 * 1024;
    if (!Number.isSafeInteger(this.frameBytes) || this.frameBytes < 1024)
      throw new Error("frameBytes must be a positive safe integer.");
  }

  async copyMissingBlocks(): Promise<RecoveryRecord> {
    const checkpoint = await ReceiverRecoveryCheckpoint.open(
      this.options.recoveryStore,
      this.options.recoveryRecord
    );
    for (const blockIndex of missingBlockIndexes(checkpoint.snapshot())) {
      const [start, endExclusive] = blockByteRange(
        blockIndex,
        this.source.size,
        checkpoint.snapshot().blockBytes
      );
      for (let offset = start; offset < endExclusive; offset += this.frameBytes) {
        const length = Math.min(this.frameBytes, endExclusive - offset);
        const bytes = await this.source.read(offset, length);
        if (bytes.byteLength !== length)
          throw new Error("Source read returned an unexpected length.");
        await this.options.destination.writeAt(offset, new Uint8Array(bytes));
      }
      const committed = await checkpoint.commit(blockIndex);
      await this.options.onBlockCommitted?.(blockIndex, committed);
    }
    return checkpoint.snapshot();
  }
}

export const m4DefaultCopyFrameBytes = 64 * 1024;
export const m4DefaultCopyBlockBytes = m4ResumeBlockBytes;
