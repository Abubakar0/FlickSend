import { m4RecoveryProtocolVersion, type M4RecoveryControlMessage } from "@flicksend/protocol";
import {
  markBlockCommitted,
  missingBlockIndexes,
  pageBlockRanges,
  validateRecoveryRecord,
  type BlockRange,
  type RecoveryRecord,
  type RecoveryStore
} from "@flicksend/resume";

type HaveBlocksPage = Extract<M4RecoveryControlMessage, { type: "TRANSFER_HAVE_BLOCKS" }>;
type ResumeOffer = Extract<M4RecoveryControlMessage, { type: "TRANSFER_RESUME_OFFER" }>;
type BlockCommitted = Extract<M4RecoveryControlMessage, { type: "TRANSFER_BLOCK_COMMITTED" }>;

export function createResumeOffer(record: RecoveryRecord): ResumeOffer {
  validateRecoveryRecord(record);
  return {
    type: "TRANSFER_RESUME_OFFER",
    protocolVersion: m4RecoveryProtocolVersion,
    transferId: record.transferId,
    transferReference: 1,
    name: "recovery-rebind",
    manifestIdentity: record.manifestIdentity,
    sourceIdentity: record.sourceIdentity,
    totalBytes: record.totalBytes,
    resumeBlockBytes: record.blockBytes as ResumeOffer["resumeBlockBytes"],
    blockCount: record.blockCount
  };
}

export function createHaveBlocksPages(record: RecoveryRecord): readonly HaveBlocksPage[] {
  validateRecoveryRecord(record);
  const pages = pageBlockRanges(record.committedBlockRanges);
  const rangesPages = pages.length === 0 ? [[]] : pages;
  return rangesPages.map((committedBlockRanges, page) => ({
    type: "TRANSFER_HAVE_BLOCKS",
    protocolVersion: m4RecoveryProtocolVersion,
    transferId: record.transferId,
    manifestIdentity: record.manifestIdentity,
    totalBytes: record.totalBytes,
    resumeBlockBytes: record.blockBytes as HaveBlocksPage["resumeBlockBytes"],
    blockCount: record.blockCount,
    page,
    hasMore: page < rangesPages.length - 1,
    committedBlockRanges: committedBlockRanges.map(
      ([start, endExclusive]) => [start, endExclusive] as [number, number]
    )
  }));
}

/** Collects the receiver-authoritative recovery map without admitting partial or reordered pages. */
export class RecoveryReconciler {
  private expectedPage = 0;
  private readonly ranges: BlockRange[] = [];
  private complete = false;

  constructor(private readonly senderRecord: RecoveryRecord) {
    validateRecoveryRecord(senderRecord);
  }

  accept(page: HaveBlocksPage): readonly number[] | null {
    if (this.complete) throw new Error("Recovery reconciliation is already complete.");
    if (page.page !== this.expectedPage) throw new Error("Recovery pages are out of order.");
    if (
      page.transferId !== this.senderRecord.transferId ||
      page.manifestIdentity !== this.senderRecord.manifestIdentity ||
      page.totalBytes !== this.senderRecord.totalBytes ||
      page.resumeBlockBytes !== this.senderRecord.blockBytes ||
      page.blockCount !== this.senderRecord.blockCount
    ) {
      throw new Error("Recovery state does not match the transfer manifest.");
    }
    this.ranges.push(...page.committedBlockRanges);
    this.expectedPage += 1;
    if (page.hasMore) return null;
    this.complete = true;
    const receiverRecord: RecoveryRecord = {
      ...this.senderRecord,
      committedBlockRanges: this.ranges
    };
    return missingBlockIndexes(validateRecoveryRecord(receiverRecord));
  }
}

/** Persists a receiver block only after the destination adapter has completed its write. */
export class ReceiverRecoveryCheckpoint {
  private constructor(
    private readonly store: RecoveryStore,
    private record: RecoveryRecord
  ) {}

  static async open(
    store: RecoveryStore,
    expected: RecoveryRecord
  ): Promise<ReceiverRecoveryCheckpoint> {
    validateRecoveryRecord(expected);
    const existing = await store.load(expected.transferId);
    if (!existing) {
      await store.save(expected);
      return new ReceiverRecoveryCheckpoint(store, expected);
    }
    validateRecoveryRecord(existing);
    if (
      existing.protocolVersion !== expected.protocolVersion ||
      existing.manifestIdentity !== expected.manifestIdentity ||
      existing.sourceIdentity !== expected.sourceIdentity ||
      existing.destinationIdentity !== expected.destinationIdentity ||
      existing.totalBytes !== expected.totalBytes ||
      existing.blockBytes !== expected.blockBytes ||
      existing.blockCount !== expected.blockCount
    ) {
      throw new Error("Persisted recovery state does not match the transfer manifest.");
    }
    return new ReceiverRecoveryCheckpoint(store, existing);
  }

  snapshot(): RecoveryRecord {
    return this.record;
  }

  async commit(blockIndex: number): Promise<RecoveryRecord> {
    const next = markBlockCommitted(this.record, blockIndex);
    await this.store.save(next);
    this.record = next;
    return next;
  }
}

/** Acknowledgements are generated only after the committed-block record has been persisted. */
export async function commitBlockAndCreateAcknowledgement(
  checkpoint: ReceiverRecoveryCheckpoint,
  blockIndex: number
): Promise<BlockCommitted> {
  const record = await checkpoint.commit(blockIndex);
  return {
    type: "TRANSFER_BLOCK_COMMITTED",
    protocolVersion: m4RecoveryProtocolVersion,
    transferId: record.transferId,
    manifestIdentity: record.manifestIdentity,
    blockIndex
  };
}
