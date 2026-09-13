import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import {
  decodeDataFrame,
  encodeDataFrame,
  m4RecoveryProtocolVersion,
  type M4RecoveryControlMessage
} from "@flicksend/protocol";
import {
  blockByteRange,
  missingBlockIndexes,
  validateRecoveryRecord,
  type RecoveryRecord,
  type RecoveryStore
} from "@flicksend/resume";
import {
  commitBlockAndCreateAcknowledgement,
  createHaveBlocksPages,
  ReceiverRecoveryCheckpoint,
  RecoveryReconciler
} from "./recovery.js";

type HaveBlocksPage = Extract<M4RecoveryControlMessage, { type: "TRANSFER_HAVE_BLOCKS" }>;
type BlockCommitted = Extract<M4RecoveryControlMessage, { type: "TRANSFER_BLOCK_COMMITTED" }>;

export type M4FrameSender = (frame: ArrayBuffer) => Promise<void>;

/** Sender-side M4 data plane: reconciliation selects missing blocks before bounded source reads begin. */
export class M4ResumableSender {
  private readonly frameBytes: number;

  constructor(
    private readonly source: FileSource,
    private readonly record: RecoveryRecord,
    private readonly transferReference: number,
    frameBytes = 64 * 1024
  ) {
    validateRecoveryRecord(record);
    if (source.size !== record.totalBytes)
      throw new Error("Source size does not match recovery state.");
    if (!Number.isSafeInteger(transferReference) || transferReference < 1)
      throw new Error("Invalid transfer reference.");
    if (!Number.isSafeInteger(frameBytes) || frameBytes < 1024 || frameBytes > record.blockBytes)
      throw new Error("Invalid M4 frame size.");
    this.frameBytes = frameBytes;
  }

  reconcile(pages: readonly HaveBlocksPage[]): readonly number[] {
    const reconciler = new RecoveryReconciler(this.record);
    let missing: readonly number[] | null = null;
    for (const page of pages) missing = reconciler.accept(page);
    if (missing === null) throw new Error("Recovery map ended before its final page.");
    return missing;
  }

  async sendMissingBlocks(pages: readonly HaveBlocksPage[], send: M4FrameSender): Promise<void> {
    for (const blockIndex of this.reconcile(pages)) {
      const [start, endExclusive] = blockByteRange(
        blockIndex,
        this.source.size,
        this.record.blockBytes
      );
      for (let offset = start; offset < endExclusive; offset += this.frameBytes) {
        const length = Math.min(this.frameBytes, endExclusive - offset);
        const payload = new Uint8Array(await this.source.read(offset, length));
        if (payload.byteLength !== length)
          throw new Error("Source read returned an unexpected length.");
        await send(
          encodeDataFrame({
            protocolVersion: m4RecoveryProtocolVersion,
            transferReference: this.transferReference,
            offset,
            payload
          })
        );
      }
    }
  }
}

/** Receiver-side M4 data plane. It accepts only the next byte of the next missing block. */
export class M4ResumableReceiver {
  private readonly missingBlocks: readonly number[];
  private nextBlock = 0;
  private expectedOffset: number;
  private receiveQueue = Promise.resolve();

  private constructor(
    private readonly destination: RandomAccessFileDestination,
    private readonly checkpoint: ReceiverRecoveryCheckpoint,
    private readonly record: RecoveryRecord,
    private readonly transferReference: number,
    private readonly onBlockCommitted?: (acknowledgement: BlockCommitted) => Promise<void> | void
  ) {
    this.missingBlocks = missingBlockIndexes(checkpoint.snapshot());
    this.expectedOffset = this.missingBlocks.length
      ? blockByteRange(this.missingBlocks[0]!, record.totalBytes, record.blockBytes)[0]
      : record.totalBytes;
  }

  static async open(options: {
    destination: RandomAccessFileDestination;
    recoveryStore: RecoveryStore;
    recoveryRecord: RecoveryRecord;
    transferReference: number;
    onBlockCommitted?: (acknowledgement: BlockCommitted) => Promise<void> | void;
  }): Promise<M4ResumableReceiver> {
    const checkpoint = await ReceiverRecoveryCheckpoint.open(
      options.recoveryStore,
      options.recoveryRecord
    );
    return new M4ResumableReceiver(
      options.destination,
      checkpoint,
      options.recoveryRecord,
      options.transferReference,
      options.onBlockCommitted
    );
  }

  haveBlocksPages(): readonly HaveBlocksPage[] {
    return createHaveBlocksPages(this.checkpoint.snapshot());
  }

  /** Wait for already accepted frames to finish their write/checkpoint chain before rebind. */
  async settle(): Promise<void> {
    await this.receiveQueue;
  }

  async receive(frameBytes: ArrayBuffer): Promise<void> {
    const received = this.receiveQueue.then(() => this.processReceive(frameBytes));
    this.receiveQueue = received.catch(() => undefined);
    return received;
  }

  private async processReceive(frameBytes: ArrayBuffer): Promise<void> {
    const frame = decodeDataFrame(frameBytes);
    if (
      !frame ||
      frame.protocolVersion !== m4RecoveryProtocolVersion ||
      frame.transferReference !== this.transferReference ||
      frame.offset !== this.expectedOffset
    ) {
      throw new Error("Invalid M4 recovery frame.");
    }
    const blockIndex = this.missingBlocks[this.nextBlock];
    if (blockIndex === undefined) throw new Error("Received data after recovery completion.");
    const [, blockEnd] = blockByteRange(blockIndex, this.record.totalBytes, this.record.blockBytes);
    if (frame.offset + frame.payload.byteLength > blockEnd)
      throw new Error("Frame crosses recovery block.");
    await this.destination.writeAt(frame.offset, frame.payload);
    this.expectedOffset += frame.payload.byteLength;
    if (this.expectedOffset !== blockEnd) return;
    const acknowledgement = await commitBlockAndCreateAcknowledgement(this.checkpoint, blockIndex);
    this.nextBlock += 1;
    this.expectedOffset =
      this.nextBlock < this.missingBlocks.length
        ? blockByteRange(
            this.missingBlocks[this.nextBlock]!,
            this.record.totalBytes,
            this.record.blockBytes
          )[0]
        : this.record.totalBytes;
    await this.onBlockCommitted?.(acknowledgement);
  }
}
