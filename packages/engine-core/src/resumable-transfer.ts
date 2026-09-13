import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import {
  decodeDataFrame,
  m4RecoveryProtocolVersion,
  parseM4RecoveryControlMessage,
  type M4RecoveryControlMessage
} from "@flicksend/protocol";
import {
  blockByteRange,
  createRecoveryRecord,
  m4ResumeBlockBytes,
  type RecoveryRecord,
  type RecoveryStore
} from "@flicksend/resume";
import { M4ResumableReceiver, M4ResumableSender } from "./m4-transfer.js";
import { initialTransferMetrics, TransferMetricTracker } from "./metrics.js";
import {
  initialTransferSnapshot,
  type TransferSnapshot,
  type TransferTransport
} from "./transfer.js";
import { m3BenchmarkDefaults, type TransferTuning } from "./tuning.js";

type ResumeOffer = Extract<M4RecoveryControlMessage, { type: "TRANSFER_RESUME_OFFER" }>;
type HaveBlocksPage = Extract<M4RecoveryControlMessage, { type: "TRANSFER_HAVE_BLOCKS" }>;

export type ResumableAcceptOptions = {
  destination: RandomAccessFileDestination;
  recoveryStore: RecoveryStore;
  destinationIdentity: string;
};

/**
 * The active M4B Engine Lab coordinator. It has exactly one v3 path: all payload scheduling is
 * based on receiver-authoritative HAVE_BLOCKS and all safe progress comes from persisted commits.
 */
export class ResumableSingleFileTransfer {
  private source?: FileSource;
  private record?: RecoveryRecord;
  private incomingOffer?: ResumeOffer;
  private receiver?: M4ResumableReceiver;
  private acceptOptions?: ResumableAcceptOptions;
  private transferReference = 0;
  private pendingHavePages: HaveBlocksPage[] = [];
  private sending = false;
  private cancelled = false;
  private paused = false;
  private transportEpoch = 0;
  private safeBytesAtEpochStart = 0;
  private payloadSentInEpoch = 0;
  private safeBytesAtInterruptedEpochStart = 0;
  private payloadSentAtInterruption = 0;
  private readonly pauseWaiters = new Set<() => void>();
  private readonly committedBlocks = new Set<number>();
  private readonly rate: TransferMetricTracker;
  private snapshot: TransferSnapshot;

  constructor(
    private transport: TransferTransport,
    private readonly emit: (snapshot: TransferSnapshot) => void,
    private readonly tuning: TransferTuning = m3BenchmarkDefaults
  ) {
    this.snapshot = { ...initialTransferSnapshot, tuning };
    this.rate = new TransferMetricTracker(tuning);
  }

  select(source: FileSource): void {
    this.cancelled = false;
    this.source = source;
    this.transferReference = crypto.getRandomValues(new Uint32Array(1))[0]! || 1;
    this.record = createRecoveryRecord({
      transferId: `fs_tr_${crypto.randomUUID()}`,
      protocolVersion: m4RecoveryProtocolVersion,
      totalBytes: source.size,
      blockBytes: m4ResumeBlockBytes,
      sourceIdentity: source.sourceIdentity ?? "unbound-source"
    });
    this.committedBlocks.clear();
    this.snapshot = {
      ...initialTransferSnapshot,
      protocolVersion: m4RecoveryProtocolVersion,
      transferId: this.record.transferId,
      name: source.name,
      state: "READY",
      bytesTotal: source.size,
      blocksMissing: this.record.blockCount,
      metrics: { ...initialTransferMetrics, bytesTotal: source.size },
      tuning: this.tuning
    };
    this.publish();
  }

  offer(): void {
    if (!this.record || !this.source || this.snapshot.state === "CANCELLED") return;
    this.send(this.resumeOffer());
  }

  async accept(options: ResumableAcceptOptions): Promise<void> {
    if (!this.record || !this.incomingOffer || this.snapshot.state !== "READY") return;
    this.acceptOptions = options;
    const expected: RecoveryRecord = {
      ...this.record,
      destinationIdentity: options.destinationIdentity
    };
    this.record = expected;
    await this.openReceiverAndSendHave();
  }

  async handleControl(raw: string): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return this.fail("MALFORMED_CONTROL_MESSAGE");
    }
    const message = parseM4RecoveryControlMessage(value);
    if (!message) return this.fail("INVALID_M4_CONTROL_MESSAGE");

    if (message.type === "TRANSFER_RESUME_OFFER") return this.handleResumeOffer(message);
    if (!this.record || message.transferId !== this.record.transferId)
      return this.fail("TRANSFER_ID_MISMATCH");
    if ("manifestIdentity" in message && message.manifestIdentity !== this.record.manifestIdentity)
      return this.fail("FS_MANIFEST_MISMATCH");

    if (message.type === "TRANSFER_HAVE_BLOCKS") {
      if (!this.source) return this.fail("UNEXPECTED_HAVE_BLOCKS");
      this.pendingHavePages.push(message);
      if (!message.hasMore) await this.sendReconciledBlocks();
      return;
    }
    if (message.type === "TRANSFER_BLOCK_COMMITTED") {
      this.recordCommittedBlock(message.blockIndex);
      return;
    }
    if (message.type === "TRANSFER_BYTES_COMPLETE") {
      // The receiver sends this only after each block has been written and checkpointed. A final
      // per-block acknowledgement may have been lost with the transport that was just replaced,
      // so this terminal, manifest-bound confirmation completes the authoritative recovery map.
      this.recordAllBlocksCommitted();
      if (this.snapshot.safeBytes !== this.snapshot.bytesTotal)
        return this.fail("UNSAFE_COMPLETION");
      this.snapshot = { ...this.snapshot, state: "TRANSFER_BYTES_COMPLETE" };
      this.publish();
      return;
    }
    if (message.type === "TRANSFER_PAUSE") return this.pause();
    if (message.type === "TRANSFER_RESUME") return this.resume();
    this.fail(message.code);
  }

  async handleData(frame: ArrayBuffer): Promise<void> {
    if (
      !this.receiver ||
      this.snapshot.state === "CANCELLED" ||
      this.snapshot.state === "RECONNECTING"
    )
      return;
    const decoded = decodeDataFrame(frame);
    if (!decoded || decoded.protocolVersion !== m4RecoveryProtocolVersion)
      return this.fail("INVALID_M4_DATA_FRAME");
    try {
      await this.receiver.receive(frame);
      const rates = this.rate.record(decoded.payload.byteLength);
      this.snapshot = {
        ...this.snapshot,
        bytesTransferred: this.snapshot.bytesTransferred + decoded.payload.byteLength,
        currentBps: rates.currentBps,
        averageBps: rates.averageBps,
        frameCount: this.snapshot.frameCount + 1,
        metrics: {
          ...this.snapshot.metrics,
          bytesReceived: this.snapshot.metrics.bytesReceived + decoded.payload.byteLength,
          currentThroughputBps: rates.currentBps,
          averageThroughputBps: rates.averageBps,
          peakThroughputBps: rates.peakBps,
          destinationWriteBps: rates.currentBps,
          elapsedMs: this.rate.elapsed(),
          frameCount: this.snapshot.metrics.frameCount + 1
        }
      };
      this.publish();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "DESTINATION_WRITE_FAILED");
    }
  }

  replaceTransport(transport: TransferTransport): void {
    this.transport = transport;
    if (this.record && this.source) this.offer();
  }

  transportInterrupted(): void {
    if (!this.record || this.snapshot.state === "TRANSFER_BYTES_COMPLETE") return;
    if (this.snapshot.state === "RECONNECTING") return;
    this.safeBytesAtInterruptedEpochStart = this.safeBytesAtEpochStart;
    this.payloadSentAtInterruption = this.payloadSentInEpoch;
    this.transportEpoch += 1;
    this.pendingHavePages = [];
    this.sending = false;
    this.snapshot = {
      ...this.snapshot,
      state: "RECONNECTING",
      reconnectCount: this.snapshot.reconnectCount + 1,
      continuity: {
        ...this.snapshot.continuity,
        safeBytesBeforeDisconnect: this.snapshot.safeBytes,
        ambiguousInflightBytesRetransmitted: 0
      }
    };
    this.safeBytesAtEpochStart = this.snapshot.safeBytes;
    this.payloadSentInEpoch = 0;
    this.publish();
  }

  pause(): void {
    if (this.snapshot.state !== "SENDING" && this.snapshot.state !== "RECEIVING") return;
    this.paused = true;
    this.snapshot = { ...this.snapshot, state: "PAUSED" };
    this.publish();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const resolve of this.pauseWaiters) resolve();
    this.pauseWaiters.clear();
    this.snapshot = { ...this.snapshot, state: this.source ? "SENDING" : "RECEIVING" };
    this.publish();
  }

  cancel(code = "CANCELLED_BY_USER"): void {
    this.cancelled = true;
    void this.acceptOptions?.destination.abort();
    this.snapshot = { ...this.snapshot, state: "CANCELLED", error: code };
    this.publish();
  }

  dispose(): void {
    this.cancelled = true;
  }

  private async handleResumeOffer(offer: ResumeOffer): Promise<void> {
    const proposed = createRecoveryRecord({
      transferId: offer.transferId,
      protocolVersion: offer.protocolVersion,
      manifestIdentity: offer.manifestIdentity,
      sourceIdentity: offer.sourceIdentity,
      totalBytes: offer.totalBytes,
      blockBytes: offer.resumeBlockBytes
    });
    if (proposed.blockCount !== offer.blockCount) return this.fail("FS_MANIFEST_MISMATCH");
    if (this.record) {
      if (this.record.transferId !== proposed.transferId) return this.fail("TRANSFER_ID_MISMATCH");
      if (this.record.manifestIdentity !== proposed.manifestIdentity)
        return this.fail("FS_MANIFEST_MISMATCH");
      if (this.record.sourceIdentity !== proposed.sourceIdentity)
        return this.fail("FS_SOURCE_CHANGED");
      if (
        this.record.totalBytes !== proposed.totalBytes ||
        this.record.blockBytes !== proposed.blockBytes
      )
        return this.fail("FS_MANIFEST_MISMATCH");
    } else {
      this.record = proposed;
      this.transferReference = offer.transferReference;
      this.snapshot = {
        ...initialTransferSnapshot,
        protocolVersion: m4RecoveryProtocolVersion,
        transferId: offer.transferId,
        name: offer.name,
        state: "READY",
        bytesTotal: offer.totalBytes,
        blocksMissing: offer.blockCount,
        metrics: { ...initialTransferMetrics, bytesTotal: offer.totalBytes },
        tuning: this.tuning
      };
    }
    this.incomingOffer = offer;
    if (this.acceptOptions) await this.openReceiverAndSendHave();
    else this.publish();
  }

  private async openReceiverAndSendHave(): Promise<void> {
    if (!this.record || !this.acceptOptions || !this.incomingOffer) return;
    try {
      // Do not race a new recovery map with writes already accepted from the old transport.
      await this.receiver?.settle();
      this.receiver = await M4ResumableReceiver.open({
        destination: this.acceptOptions.destination,
        recoveryStore: this.acceptOptions.recoveryStore,
        recoveryRecord: this.record,
        transferReference: this.incomingOffer.transferReference,
        onBlockCommitted: async (acknowledgement) => {
          this.recordCommittedBlock(acknowledgement.blockIndex);
          this.send(acknowledgement);
          if (this.snapshot.blocksMissing === 0) {
            await this.acceptOptions?.destination.close();
            this.send({
              type: "TRANSFER_BYTES_COMPLETE",
              protocolVersion: m4RecoveryProtocolVersion,
              transferId: this.record!.transferId,
              manifestIdentity: this.record!.manifestIdentity
            });
            this.snapshot = { ...this.snapshot, state: "TRANSFER_BYTES_COMPLETE" };
            this.publish();
          }
        }
      });
      this.rate.start();
      this.snapshot = { ...this.snapshot, state: "RECEIVING", error: null };
      for (const page of this.receiver.haveBlocksPages()) this.send(page);
      this.publish();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "RECOVERY_OPEN_FAILED");
    }
  }

  private async sendReconciledBlocks(): Promise<void> {
    if (!this.source || !this.record || this.sending || this.cancelled) return;
    const pages = this.pendingHavePages;
    this.pendingHavePages = [];
    this.sending = true;
    const transportEpoch = this.transportEpoch;
    const retransmitting = this.snapshot.reconnectCount > 0;
    const startedAt = performance.now();
    const sender = new M4ResumableSender(
      this.source,
      this.record,
      this.transferReference,
      Math.min(this.tuning.framePayloadBytes, this.transport.maximumDataMessageBytes - 20)
    );
    try {
      const missing = sender.reconcile(pages);
      const remainingBytesAtResume = missing.reduce((total, blockIndex) => {
        const [start, end] = blockByteRange(
          blockIndex,
          this.record!.totalBytes,
          this.record!.blockBytes
        );
        return total + end - start;
      }, 0);
      const safeBytesBeforeDisconnect = this.record.totalBytes - remainingBytesAtResume;
      const committedDuringInterruptedEpoch = Math.max(
        0,
        safeBytesBeforeDisconnect - this.safeBytesAtInterruptedEpochStart
      );
      const ambiguousInflightBytesRetransmitted = Math.max(
        0,
        this.payloadSentAtInterruption - committedDuringInterruptedEpoch
      );
      this.snapshot = {
        ...this.snapshot,
        state: "SENDING",
        blocksMissing: missing.length,
        continuity: {
          ...this.snapshot.continuity,
          safeBytesBeforeDisconnect,
          remainingBytesAtResume,
          resumedPayloadBytes: 0,
          duplicateRetransmittedBytes: 0,
          committedBlocksRetransmitted: 0,
          ambiguousInflightBytesRetransmitted
        },
        recoveryReconciliationMs: performance.now() - startedAt,
        error: null
      };
      this.rate.start();
      await sender.sendMissingBlocks(pages, async (frame) => {
        if (this.cancelled) throw new Error("TRANSFER_CANCELLED");
        if (transportEpoch !== this.transportEpoch) throw new Error("TRANSPORT_INTERRUPTED");
        while (this.paused && !this.cancelled)
          await new Promise<void>((resolve) => this.pauseWaiters.add(resolve));
        const decoded = decodeDataFrame(frame);
        if (!decoded) throw new Error("INVALID_M4_DATA_FRAME");
        const stalledMs = await this.transport.waitForBufferedAmountLow(
          this.tuning.sendHighWaterBytes,
          this.tuning.sendLowWaterBytes
        );
        if (!this.transport.sendData(frame)) throw new Error("TRANSPORT_INTERRUPTED");
        this.payloadSentInEpoch += decoded.payload.byteLength;
        const rates = this.rate.record(decoded.payload.byteLength);
        this.snapshot = {
          ...this.snapshot,
          bytesTransferred: this.snapshot.bytesTransferred + decoded.payload.byteLength,
          currentBps: rates.currentBps,
          averageBps: rates.averageBps,
          frameCount: this.snapshot.frameCount + 1,
          metrics: {
            ...this.snapshot.metrics,
            bytesSent: this.snapshot.metrics.bytesSent + decoded.payload.byteLength,
            currentThroughputBps: rates.currentBps,
            averageThroughputBps: rates.averageBps,
            peakThroughputBps: rates.peakBps,
            bufferedAmountBytes: this.transport.bufferedAmount,
            elapsedMs: this.rate.elapsed(),
            frameCount: this.snapshot.metrics.frameCount + 1,
            stalledMs: this.snapshot.metrics.stalledMs + stalledMs
          }
        };
        if (retransmitting)
          this.snapshot = {
            ...this.snapshot,
            retransmittedBytes: this.snapshot.retransmittedBytes + decoded.payload.byteLength,
            continuity: {
              ...this.snapshot.continuity,
              resumedPayloadBytes:
                this.snapshot.continuity.resumedPayloadBytes + decoded.payload.byteLength
            }
          };
        this.publish();
      });
    } catch (error) {
      if (!this.cancelled) this.transportInterrupted();
      if (error instanceof Error && error.message !== "TRANSPORT_INTERRUPTED")
        this.snapshot = { ...this.snapshot, error: error.message };
    } finally {
      this.sending = false;
    }
  }

  private recordCommittedBlock(blockIndex: number): void {
    if (!this.record || this.committedBlocks.has(blockIndex)) return;
    this.committedBlocks.add(blockIndex);
    this.publishCommittedBlockProgress();
  }

  private recordAllBlocksCommitted(): void {
    if (!this.record) return;
    for (let blockIndex = 0; blockIndex < this.record.blockCount; blockIndex += 1)
      this.committedBlocks.add(blockIndex);
    this.publishCommittedBlockProgress();
  }

  private publishCommittedBlockProgress(): void {
    if (!this.record) return;
    const safeBytes = [...this.committedBlocks].reduce((total, index) => {
      const [blockStart, blockEnd] = blockByteRange(
        index,
        this.record!.totalBytes,
        this.record!.blockBytes
      );
      return total + (blockEnd - blockStart);
    }, 0);
    this.snapshot = {
      ...this.snapshot,
      safeBytes,
      blocksCommitted: this.committedBlocks.size,
      blocksMissing: this.record.blockCount - this.committedBlocks.size,
      retransmittedBytes: this.snapshot.retransmittedBytes
    };
    this.publish();
  }

  private resumeOffer(): ResumeOffer {
    if (!this.record || !this.source) throw new Error("No selected source to offer.");
    return {
      type: "TRANSFER_RESUME_OFFER",
      protocolVersion: m4RecoveryProtocolVersion,
      transferId: this.record.transferId,
      transferReference: this.transferReference,
      name: this.source.name,
      mimeType: this.source.type || undefined,
      manifestIdentity: this.record.manifestIdentity,
      sourceIdentity: this.record.sourceIdentity,
      totalBytes: this.record.totalBytes,
      resumeBlockBytes: this.record.blockBytes as ResumeOffer["resumeBlockBytes"],
      blockCount: this.record.blockCount
    };
  }

  private send(message: M4RecoveryControlMessage): void {
    if (!this.transport.sendControl(JSON.stringify(message))) this.transportInterrupted();
  }

  private fail(code: string): void {
    if (this.snapshot.state === "FAILED" || this.snapshot.state === "CANCELLED") return;
    this.snapshot = { ...this.snapshot, state: "FAILED", error: code };
    this.publish();
  }

  private publish(): void {
    this.emit(this.snapshot);
  }
}
