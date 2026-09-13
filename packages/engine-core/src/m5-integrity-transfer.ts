import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import {
  buildManifestRoot,
  createStreamingSha256,
  digestBlock,
  integrityAlgorithm,
  integrityManifestVersion,
  verifyBlock
} from "@flicksend/integrity";
import {
  decodeDataFrame,
  encodeDataFrame,
  m5IntegrityProtocolVersion,
  parseM5IntegrityControlMessage,
  type M5IntegrityControlMessage
} from "@flicksend/protocol";
import {
  blockByteRange,
  createRecoveryRecord,
  getVerifiedBlockDigest,
  markVerifiedBlockCommitted,
  missingBlockIndexes,
  pageBlockRanges,
  setVerifiedBlockDigest,
  validateRecoveryRecord,
  type RecoveryRecord,
  type RecoveryStore
} from "@flicksend/resume";
import { initialTransferMetrics, TransferMetricTracker } from "./metrics.js";
import {
  initialTransferSnapshot,
  type TransferSnapshot,
  type TransferTransport
} from "./transfer.js";
import { m3BenchmarkDefaults, type TransferTuning } from "./tuning.js";

type Offer = Extract<M5IntegrityControlMessage, { type: "TRANSFER_INTEGRITY_OFFER" }>;
type HavePage = Extract<M5IntegrityControlMessage, { type: "TRANSFER_HAVE_VERIFIED_BLOCKS" }>;
type BlockDigest = Extract<M5IntegrityControlMessage, { type: "TRANSFER_BLOCK_DIGEST" }>;
type IntegrityFaultKind = "payload" | "expectedDigest" | "storedReceiverDigest" | "manifestRoot";

export type IntegrityFault = {
  kind: IntegrityFaultKind;
  blockIndex?: number;
  mode: "once" | "always";
};

export type M5ResumableAcceptOptions = {
  destination: RandomAccessFileDestination;
  recoveryStore: RecoveryStore;
  destinationIdentity: string;
};

function rangesPages(record: RecoveryRecord): readonly HavePage["committedBlockRanges"][] {
  const pages = pageBlockRanges(record.committedBlockRanges);
  return (pages.length ? pages : [[]]).map((ranges) =>
    ranges.map(([start, end]) => [start, end] as [number, number])
  );
}

function hasDigestForAllCommitted(record: RecoveryRecord): boolean {
  for (const [start, end] of record.committedBlockRanges)
    for (let index = start; index < end; index += 1)
      if (!getVerifiedBlockDigest(record, index)) return false;
  return true;
}

class M5Receiver {
  private record: RecoveryRecord;
  private readonly missing: readonly number[];
  private nextMissing = 0;
  private expectedOffset: number;
  private expectedDigest?: BlockDigest;
  private hash = createStreamingSha256();
  private queue = Promise.resolve();

  private constructor(
    private readonly destination: RandomAccessFileDestination,
    private readonly store: RecoveryStore,
    record: RecoveryRecord,
    private readonly reference: number,
    private readonly fault: (blockIndex: number) => IntegrityFault | null,
    private readonly onCommitted: (blockIndex: number) => Promise<void>,
    private readonly onNack: (
      blockIndex: number,
      reason: "INTEGRITY_MISMATCH" | "DIGEST_MISSING"
    ) => void,
    private readonly onHash: (bytes: number, elapsedMs: number) => void,
    private readonly onDestinationWrite: (bytes: number, elapsedMs: number) => void
  ) {
    this.record = record;
    this.missing = missingBlockIndexes(record);
    this.expectedOffset = this.missing.length
      ? blockByteRange(this.missing[0]!, record.totalBytes, record.blockBytes)[0]
      : record.totalBytes;
  }

  static async open(options: {
    destination: RandomAccessFileDestination;
    recoveryStore: RecoveryStore;
    record: RecoveryRecord;
    reference: number;
    fault: (blockIndex: number) => IntegrityFault | null;
    onCommitted: (blockIndex: number) => Promise<void>;
    onNack: (blockIndex: number, reason: "INTEGRITY_MISMATCH" | "DIGEST_MISSING") => void;
    onHash: (bytes: number, elapsedMs: number) => void;
    onDestinationWrite: (bytes: number, elapsedMs: number) => void;
  }): Promise<M5Receiver> {
    const existing = await options.recoveryStore.load(options.record.transferId);
    let record = options.record;
    if (existing) {
      // A v2 M4 checkpoint has no digest table and is never eligible for v4 trusted recovery.
      validateRecoveryRecord(existing);
      if (
        existing.protocolVersion !== options.record.protocolVersion ||
        existing.manifestIdentity !== options.record.manifestIdentity ||
        existing.sourceIdentity !== options.record.sourceIdentity ||
        existing.destinationIdentity !== options.record.destinationIdentity ||
        existing.totalBytes !== options.record.totalBytes ||
        existing.blockBytes !== options.record.blockBytes ||
        !hasDigestForAllCommitted(existing)
      ) {
        throw new Error("FS_INTEGRITY_STATE_INVALID");
      }
      record = existing;
    } else {
      await options.recoveryStore.save(record);
    }
    return new M5Receiver(
      options.destination,
      options.recoveryStore,
      record,
      options.reference,
      options.fault,
      options.onCommitted,
      options.onNack,
      options.onHash,
      options.onDestinationWrite
    );
  }

  havePages(): readonly HavePage[] {
    return rangesPages(this.record).map((committedBlockRanges, page) => ({
      type: "TRANSFER_HAVE_VERIFIED_BLOCKS",
      protocolVersion: m5IntegrityProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity,
      totalBytes: this.record.totalBytes,
      resumeBlockBytes: this.record.blockBytes as HavePage["resumeBlockBytes"],
      blockCount: this.record.blockCount,
      integrityAlgorithm,
      page,
      hasMore: page < rangesPages(this.record).length - 1,
      committedBlockRanges
    }));
  }

  recordSnapshot(): RecoveryRecord {
    return this.record;
  }

  setExpectedDigest(message: BlockDigest): void {
    const blockIndex = this.missing[this.nextMissing];
    if (blockIndex === undefined || message.blockIndex !== blockIndex)
      throw new Error("FS_BLOCK_DIGEST_INVALID");
    const [start, end] = blockByteRange(blockIndex, this.record.totalBytes, this.record.blockBytes);
    if (message.byteOffset !== start || message.byteLength !== end - start)
      throw new Error("FS_BLOCK_DIGEST_INVALID");
    this.expectedDigest = message;
    this.hash = createStreamingSha256();
  }

  async settle(): Promise<void> {
    await this.queue;
  }

  async receive(raw: ArrayBuffer): Promise<void> {
    const received = this.queue.then(() => this.process(raw));
    this.queue = received.catch(() => undefined);
    return received;
  }

  private async process(raw: ArrayBuffer): Promise<void> {
    const frame = decodeDataFrame(raw);
    if (
      !frame ||
      frame.protocolVersion !== m5IntegrityProtocolVersion ||
      frame.transferReference !== this.reference ||
      frame.offset !== this.expectedOffset
    ) {
      throw new Error("INVALID_M5_DATA_FRAME");
    }
    const blockIndex = this.missing[this.nextMissing];
    if (blockIndex === undefined || !this.expectedDigest)
      throw new Error("FS_BLOCK_DIGEST_MISSING");
    const [, blockEnd] = blockByteRange(blockIndex, this.record.totalBytes, this.record.blockBytes);
    if (frame.offset + frame.payload.byteLength > blockEnd)
      throw new Error("INVALID_M5_DATA_FRAME");
    const startedAt = performance.now();
    this.hash.update(frame.payload);
    this.onHash(frame.payload.byteLength, performance.now() - startedAt);
    const destinationWriteStartedAt = performance.now();
    await this.destination.writeAt(frame.offset, frame.payload);
    this.onDestinationWrite(
      frame.payload.byteLength,
      performance.now() - destinationWriteStartedAt
    );
    this.expectedOffset += frame.payload.byteLength;
    if (this.expectedOffset !== blockEnd) return;
    const digestStartedAt = performance.now();
    const actualDigest = this.hash.digestHex();
    this.onHash(0, performance.now() - digestStartedAt);
    if (!verifyBlock(this.expectedDigest.digest, actualDigest)) {
      this.expectedOffset = blockByteRange(
        blockIndex,
        this.record.totalBytes,
        this.record.blockBytes
      )[0];
      this.expectedDigest = undefined;
      this.hash = createStreamingSha256();
      this.onNack(blockIndex, "INTEGRITY_MISMATCH");
      return;
    }
    const fault = this.fault(blockIndex);
    const persistedDigest =
      fault?.kind === "storedReceiverDigest" && fault.blockIndex === blockIndex
        ? `${actualDigest.slice(0, 63)}${actualDigest.endsWith("0") ? "1" : "0"}`
        : actualDigest;
    this.record = markVerifiedBlockCommitted(this.record, blockIndex, persistedDigest);
    await this.store.save(this.record);
    this.nextMissing += 1;
    this.expectedDigest = undefined;
    this.hash = createStreamingSha256();
    this.expectedOffset =
      this.nextMissing < this.missing.length
        ? blockByteRange(
            this.missing[this.nextMissing]!,
            this.record.totalBytes,
            this.record.blockBytes
          )[0]
        : this.record.totalBytes;
    await this.onCommitted(blockIndex);
  }
}

/** The active M5 engine path. v3 remains available only for historical M4 test coverage. */
export class M5IntegritySingleFileTransfer {
  private source?: FileSource;
  private record?: RecoveryRecord;
  private incomingOffer?: Offer;
  private receiver?: M5Receiver;
  private acceptOptions?: M5ResumableAcceptOptions;
  private reference = 0;
  private pendingPages: HavePage[] = [];
  private sending = false;
  private cancelled = false;
  private transportEpoch = 0;
  private committed = new Set<number>();
  private fault?: IntegrityFault;
  private faultUses = 0;
  private awaitingBlock?: {
    blockIndex: number;
    resolve: (outcome: "committed" | "nack") => void;
    reject: (error: Error) => void;
  };
  private awaitingReady?: {
    blockIndex: number;
    resolve: () => void;
    reject: (error: Error) => void;
  };
  private readonly rate: TransferMetricTracker;
  private readonly sourceRate: TransferMetricTracker;
  private readonly destinationRate: TransferMetricTracker;
  private receiveQueueBytes = 0;
  private lastMetricPublishAt = 0;
  private snapshot: TransferSnapshot;

  constructor(
    private transport: TransferTransport,
    private readonly emit: (snapshot: TransferSnapshot) => void,
    private readonly tuning: TransferTuning = m3BenchmarkDefaults
  ) {
    this.snapshot = { ...initialTransferSnapshot, tuning };
    this.rate = new TransferMetricTracker(tuning);
    this.sourceRate = new TransferMetricTracker(tuning);
    this.destinationRate = new TransferMetricTracker(tuning);
  }

  configureFault(fault: IntegrityFault | undefined): void {
    this.fault = fault;
    this.faultUses = 0;
  }

  select(source: FileSource): void {
    this.cancelled = false;
    this.source = source;
    this.reference = crypto.getRandomValues(new Uint32Array(1))[0]! || 1;
    this.record = createRecoveryRecord({
      transferId: `fs_tr_${crypto.randomUUID()}`,
      protocolVersion: m5IntegrityProtocolVersion,
      totalBytes: source.size,
      sourceIdentity: source.sourceIdentity ?? "unbound-source"
    });
    this.committed.clear();
    this.snapshot = {
      ...initialTransferSnapshot,
      protocolVersion: m5IntegrityProtocolVersion,
      transferId: this.record.transferId,
      name: source.name,
      state: "READY",
      bytesTotal: source.size,
      blocksMissing: this.record.blockCount,
      integrity: { ...initialTransferSnapshot.integrity, algorithm: integrityAlgorithm },
      metrics: { ...initialTransferMetrics, bytesTotal: source.size },
      tuning: this.tuning
    };
    this.publish();
  }

  offer(): void {
    if (!this.source || !this.record || this.cancelled) return;
    this.send(this.offerMessage());
  }

  async accept(options: M5ResumableAcceptOptions): Promise<void> {
    if (!this.record || !this.incomingOffer) return;
    this.acceptOptions = options;
    this.record = { ...this.record, destinationIdentity: options.destinationIdentity };
    await this.openReceiver();
  }

  async handleControl(raw: string): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return this.fail("MALFORMED_CONTROL_MESSAGE");
    }
    const message = parseM5IntegrityControlMessage(value);
    if (!message) return this.fail("INVALID_M5_CONTROL_MESSAGE");
    if (message.type === "TRANSFER_INTEGRITY_OFFER") return this.handleOffer(message);
    if (!this.record || message.transferId !== this.record.transferId)
      return this.fail("TRANSFER_ID_MISMATCH");
    if ("manifestIdentity" in message && message.manifestIdentity !== this.record.manifestIdentity)
      return this.fail("FS_MANIFEST_MISMATCH");
    if (message.type === "TRANSFER_HAVE_VERIFIED_BLOCKS") {
      this.pendingPages.push(message);
      if (!message.hasMore) void this.sendVerifiedMissingBlocks();
      return;
    }
    if (message.type === "TRANSFER_BLOCK_DIGEST") {
      try {
        this.receiver?.setExpectedDigest(message);
        if (this.record)
          this.send({
            type: "TRANSFER_BLOCK_READY",
            protocolVersion: m5IntegrityProtocolVersion,
            transferId: this.record.transferId,
            manifestIdentity: this.record.manifestIdentity,
            blockIndex: message.blockIndex
          });
      } catch (error) {
        this.fail(error instanceof Error ? error.message : "FS_BLOCK_DIGEST_INVALID");
      }
      return;
    }
    if (message.type === "TRANSFER_BLOCK_READY") {
      if (this.awaitingReady?.blockIndex === message.blockIndex) this.awaitingReady.resolve();
      return;
    }
    if (message.type === "TRANSFER_BLOCK_COMMITTED") {
      this.recordCommitted(message.blockIndex);
      if (this.awaitingBlock?.blockIndex === message.blockIndex)
        this.awaitingBlock.resolve("committed");
      return;
    }
    if (message.type === "TRANSFER_BLOCK_NACK") {
      this.snapshot = {
        ...this.snapshot,
        integrity: {
          ...this.snapshot.integrity,
          integrityMismatchCount: this.snapshot.integrity.integrityMismatchCount + 1
        }
      };
      this.publish();
      if (this.awaitingBlock?.blockIndex === message.blockIndex) this.awaitingBlock.resolve("nack");
      return;
    }
    if (message.type === "TRANSFER_BYTES_COMPLETE") {
      this.snapshot = { ...this.snapshot, state: "TRANSFER_BYTES_COMPLETE" };
      this.publish();
      this.sendManifestRoot();
      return;
    }
    if (message.type === "TRANSFER_MANIFEST_ROOT") return this.verifyManifestRoot(message.root);
    if (message.type === "TRANSFER_MANIFEST_VERIFIED") {
      if (!this.record || !this.buildRootMatches(message.root))
        return this.fail("FS_MANIFEST_INTEGRITY_FAILED");
      this.snapshot = { ...this.snapshot, state: "VERIFIED" };
      this.send({
        type: "TRANSFER_DELIVERED",
        protocolVersion: m5IntegrityProtocolVersion,
        transferId: this.record.transferId,
        manifestIdentity: this.record.manifestIdentity
      });
      this.snapshot = { ...this.snapshot, state: "DELIVERED" };
      return this.publish();
    }
    if (message.type === "TRANSFER_DELIVERED") {
      if (this.snapshot.state === "VERIFIED") {
        this.snapshot = { ...this.snapshot, state: "DELIVERED" };
        this.publish();
      }
      return;
    }
    this.fail(message.code);
  }

  async handleData(raw: ArrayBuffer): Promise<void> {
    if (!this.receiver || this.snapshot.state === "INTEGRITY_FAILED" || this.cancelled) return;
    const frame = decodeDataFrame(raw);
    if (!frame || frame.protocolVersion !== m5IntegrityProtocolVersion)
      return this.fail("INVALID_M5_DATA_FRAME");
    this.receiveQueueBytes += frame.payload.byteLength;
    this.snapshot = {
      ...this.snapshot,
      metrics: { ...this.snapshot.metrics, receiveQueueBytes: this.receiveQueueBytes }
    };
    this.publishMetrics();
    try {
      await this.receiver.receive(raw);
      const rates = this.rate.record(frame.payload.byteLength);
      this.snapshot = {
        ...this.snapshot,
        bytesTransferred: this.snapshot.bytesTransferred + frame.payload.byteLength,
        currentBps: rates.currentBps,
        averageBps: rates.averageBps,
        frameCount: this.snapshot.frameCount + 1,
        metrics: {
          ...this.snapshot.metrics,
          bytesReceived: this.snapshot.metrics.bytesReceived + frame.payload.byteLength,
          currentThroughputBps: rates.currentBps,
          averageThroughputBps: rates.averageBps,
          peakThroughputBps: rates.peakBps,
          elapsedMs: this.rate.elapsed(),
          frameCount: this.snapshot.metrics.frameCount + 1
        }
      };
      this.publishMetrics();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "DESTINATION_WRITE_FAILED");
    } finally {
      this.receiveQueueBytes = Math.max(0, this.receiveQueueBytes - frame.payload.byteLength);
      this.snapshot = {
        ...this.snapshot,
        metrics: { ...this.snapshot.metrics, receiveQueueBytes: this.receiveQueueBytes }
      };
      this.publishMetrics();
    }
  }

  transportInterrupted(): void {
    if (
      !this.record ||
      this.snapshot.state === "DELIVERED" ||
      this.snapshot.state === "INTEGRITY_FAILED"
    )
      return;
    if (this.snapshot.state === "RECONNECTING") return;
    this.transportEpoch += 1;
    this.sending = false;
    this.awaitingBlock?.reject(new Error("TRANSPORT_INTERRUPTED"));
    this.awaitingBlock = undefined;
    this.awaitingReady?.reject(new Error("TRANSPORT_INTERRUPTED"));
    this.awaitingReady = undefined;
    this.snapshot = {
      ...this.snapshot,
      state: "RECONNECTING",
      reconnectCount: this.snapshot.reconnectCount + 1,
      continuity: {
        ...this.snapshot.continuity,
        safeBytesBeforeDisconnect: this.snapshot.safeBytes
      }
    };
    this.publish();
  }

  replaceTransport(transport: TransferTransport): void {
    this.transport = transport;
    if (!this.cancelled && this.record && this.source) this.offer();
  }
  /** Route exhaustion preserves receiver-verified recovery data for a later explicit retry. */
  routeRecoveryFailed(code: string): void {
    if (!this.record || this.cancelled || this.snapshot.state !== "RECONNECTING") return;
    this.snapshot = { ...this.snapshot, error: code };
    this.publish();
  }

  pause(): void {}
  resume(): void {}
  cancel(code = "CANCELLED_BY_USER"): void {
    this.cancelled = true;
    void this.acceptOptions?.destination.abort();
    this.snapshot = { ...this.snapshot, state: "CANCELLED", error: code };
    this.publish();
  }
  dispose(): void {
    this.cancelled = true;
  }

  private async handleOffer(offer: Offer): Promise<void> {
    const proposed = createRecoveryRecord({
      transferId: offer.transferId,
      protocolVersion: offer.protocolVersion,
      manifestIdentity: offer.manifestIdentity,
      sourceIdentity: offer.sourceIdentity,
      totalBytes: offer.totalBytes,
      blockBytes: offer.resumeBlockBytes
    });
    if (proposed.blockCount !== offer.blockCount || offer.integrityAlgorithm !== integrityAlgorithm)
      return this.fail("FS_MANIFEST_INVALID");
    if (this.record) {
      if (
        this.record.transferId !== proposed.transferId ||
        this.record.manifestIdentity !== proposed.manifestIdentity ||
        this.record.sourceIdentity !== proposed.sourceIdentity
      )
        return this.fail("FS_INTEGRITY_STATE_INVALID");
    } else {
      this.record = proposed;
      this.reference = offer.transferReference;
      this.snapshot = {
        ...initialTransferSnapshot,
        protocolVersion: m5IntegrityProtocolVersion,
        transferId: offer.transferId,
        name: offer.name,
        state: "READY",
        bytesTotal: offer.totalBytes,
        blocksMissing: offer.blockCount,
        integrity: { ...initialTransferSnapshot.integrity, algorithm: integrityAlgorithm },
        metrics: { ...initialTransferMetrics, bytesTotal: offer.totalBytes },
        tuning: this.tuning
      };
    }
    this.incomingOffer = offer;
    if (this.acceptOptions) await this.openReceiver();
    else this.publish();
  }

  private async openReceiver(): Promise<void> {
    if (!this.record || !this.acceptOptions || !this.incomingOffer) return;
    try {
      await this.receiver?.settle();
      this.receiver = await M5Receiver.open({
        destination: this.acceptOptions.destination,
        recoveryStore: this.acceptOptions.recoveryStore,
        record: this.record,
        reference: this.incomingOffer.transferReference,
        fault: (blockIndex) => this.consumeFault("storedReceiverDigest", blockIndex),
        onCommitted: async (blockIndex) => {
          this.recordCommitted(blockIndex);
          this.send({
            type: "TRANSFER_BLOCK_COMMITTED",
            protocolVersion: m5IntegrityProtocolVersion,
            transferId: this.record!.transferId,
            manifestIdentity: this.record!.manifestIdentity,
            blockIndex
          });
          if (this.snapshot.blocksMissing === 0) {
            this.snapshot = { ...this.snapshot, state: "TRANSFER_BYTES_COMPLETE" };
            this.publish();
            this.send({
              type: "TRANSFER_BYTES_COMPLETE",
              protocolVersion: m5IntegrityProtocolVersion,
              transferId: this.record!.transferId,
              manifestIdentity: this.record!.manifestIdentity
            });
          }
        },
        onNack: (blockIndex, reason) =>
          this.send({
            type: "TRANSFER_BLOCK_NACK",
            protocolVersion: m5IntegrityProtocolVersion,
            transferId: this.record!.transferId,
            manifestIdentity: this.record!.manifestIdentity,
            blockIndex,
            reason
          }),
        onHash: (bytes, elapsedMs) => {
          this.snapshot = {
            ...this.snapshot,
            integrity: {
              ...this.snapshot.integrity,
              hashBytesProcessed: this.snapshot.integrity.hashBytesProcessed + bytes,
              receiverHashingMs: this.snapshot.integrity.receiverHashingMs + elapsedMs
            }
          };
        },
        onDestinationWrite: (bytes, elapsedMs) => {
          const finishedAt = performance.now();
          const destinationRates = this.destinationRate.recordWork(
            bytes,
            finishedAt - elapsedMs,
            finishedAt
          );
          this.snapshot = {
            ...this.snapshot,
            metrics: {
              ...this.snapshot.metrics,
              destinationWriteBps: destinationRates.currentBps
            }
          };
        }
      });
      this.record = this.receiver.recordSnapshot();
      const committed = this.record.committedBlockRanges.flatMap(([start, end]) =>
        Array.from({ length: end - start }, (_, index) => start + index)
      );
      this.committed = new Set(committed);
      const safeBytes = committed.reduce((total, blockIndex) => {
        const [start, end] = blockByteRange(
          blockIndex,
          this.record!.totalBytes,
          this.record!.blockBytes
        );
        return total + end - start;
      }, 0);
      this.snapshot = {
        ...this.snapshot,
        safeBytes,
        blocksCommitted: committed.length,
        blocksMissing: this.record.blockCount - committed.length,
        integrity: {
          ...this.snapshot.integrity,
          blocksVerifiedReceiver: committed.length,
          verifiedBytes: safeBytes
        }
      };
      for (const page of this.receiver.havePages()) this.send(page);
      this.rate.start();
      this.destinationRate.start();
      this.snapshot = { ...this.snapshot, state: "RECEIVING", error: null };
      this.publish();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "FS_INTEGRITY_STATE_INVALID");
    }
  }

  private async sendVerifiedMissingBlocks(): Promise<void> {
    if (!this.source || !this.record || this.sending || this.cancelled) return;
    const pages = this.pendingPages;
    this.pendingPages = [];
    const committed = new Set<number>();
    let expectedPage = 0;
    for (const page of pages) {
      if (
        page.page !== expectedPage++ ||
        page.totalBytes !== this.record.totalBytes ||
        page.blockCount !== this.record.blockCount ||
        page.resumeBlockBytes !== this.record.blockBytes
      )
        return this.fail("FS_INTEGRITY_STATE_INVALID");
      for (const [start, end] of page.committedBlockRanges)
        for (let index = start; index < end; index += 1) committed.add(index);
    }
    const missing: number[] = [];
    for (let index = 0; index < this.record.blockCount; index += 1)
      if (!committed.has(index)) missing.push(index);
    this.sending = true;
    const epoch = this.transportEpoch;
    const start = performance.now();
    const remaining = missing.reduce((sum, index) => {
      const [from, to] = blockByteRange(index, this.record!.totalBytes, this.record!.blockBytes);
      return sum + to - from;
    }, 0);
    this.snapshot = {
      ...this.snapshot,
      state: "SENDING",
      blocksMissing: missing.length,
      continuity: {
        ...this.snapshot.continuity,
        safeBytesBeforeDisconnect: this.record.totalBytes - remaining,
        remainingBytesAtResume: remaining,
        resumedPayloadBytes: this.snapshot.reconnectCount
          ? 0
          : this.snapshot.continuity.resumedPayloadBytes,
        duplicateRetransmittedBytes: 0,
        committedBlocksRetransmitted: 0
      },
      recoveryReconciliationMs: performance.now() - start
    };
    this.rate.start();
    this.sourceRate.start();
    try {
      for (const blockIndex of missing) {
        let retries = 0;
        while (true) {
          if (epoch !== this.transportEpoch) throw new Error("TRANSPORT_INTERRUPTED");
          const outcome = await this.sendBlock(blockIndex, epoch);
          if (outcome === "committed") break;
          retries += 1;
          if (retries > 3) return this.fail("FS_BLOCK_INTEGRITY_FAILED");
          this.snapshot = {
            ...this.snapshot,
            integrity: {
              ...this.snapshot.integrity,
              integrityRetryCount: this.snapshot.integrity.integrityRetryCount + 1
            }
          };
          this.publish();
        }
      }
      if (missing.length === 0) {
        this.snapshot = { ...this.snapshot, state: "TRANSFER_BYTES_COMPLETE" };
        this.publish();
        this.send({
          type: "TRANSFER_BYTES_COMPLETE",
          protocolVersion: m5IntegrityProtocolVersion,
          transferId: this.record.transferId,
          manifestIdentity: this.record.manifestIdentity
        });
        this.sendManifestRoot();
      }
    } catch (error) {
      if (!this.cancelled && error instanceof Error && error.message !== "TRANSPORT_INTERRUPTED")
        this.fail(error.message);
    } finally {
      this.sending = false;
    }
  }

  private async sendBlock(blockIndex: number, epoch: number): Promise<"committed" | "nack"> {
    if (!this.source || !this.record) throw new Error("FS_INTEGRITY_STATE_INVALID");
    const [start, end] = blockByteRange(blockIndex, this.record.totalBytes, this.record.blockBytes);
    const sourceReadStartedAt = performance.now();
    const bytes = new Uint8Array(await this.source.read(start, end - start));
    if (bytes.byteLength !== end - start) throw new Error("SOURCE_READ_LENGTH_INVALID");
    const sourceRates = this.sourceRate.recordWork(bytes.byteLength, sourceReadStartedAt);
    this.snapshot = {
      ...this.snapshot,
      metrics: { ...this.snapshot.metrics, sourceReadBps: sourceRates.currentBps }
    };
    const hashStartedAt = performance.now();
    const digest = digestBlock(bytes);
    this.record = setVerifiedBlockDigest(this.record, blockIndex, digest);
    this.snapshot = {
      ...this.snapshot,
      integrity: {
        ...this.snapshot.integrity,
        blocksHashedSender: this.snapshot.integrity.blocksHashedSender + 1,
        hashBytesProcessed: this.snapshot.integrity.hashBytesProcessed + bytes.byteLength,
        senderHashingMs: this.snapshot.integrity.senderHashingMs + performance.now() - hashStartedAt
      }
    };
    const expectedDigest = this.consumeFault("expectedDigest", blockIndex)
      ? `${digest.slice(0, 63)}${digest.endsWith("0") ? "1" : "0"}`
      : digest;
    this.send({
      type: "TRANSFER_BLOCK_DIGEST",
      protocolVersion: m5IntegrityProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity,
      integrityAlgorithm,
      blockIndex,
      byteOffset: start,
      byteLength: bytes.byteLength,
      digest: expectedDigest
    });
    await new Promise<void>((resolve, reject) => {
      this.awaitingReady = { blockIndex, resolve, reject };
    }).finally(() => {
      this.awaitingReady = undefined;
    });
    const payloadFault = this.consumeFault("payload", blockIndex);
    for (
      let offset = 0;
      offset < bytes.byteLength;
      offset += Math.min(this.tuning.framePayloadBytes, this.transport.maximumDataMessageBytes - 20)
    ) {
      if (epoch !== this.transportEpoch) throw new Error("TRANSPORT_INTERRUPTED");
      const length = Math.min(
        Math.min(this.tuning.framePayloadBytes, this.transport.maximumDataMessageBytes - 20),
        bytes.byteLength - offset
      );
      const payload = bytes.subarray(offset, offset + length);
      const framePayload = payloadFault && offset === 0 ? payload.slice() : payload;
      if (payloadFault && offset === 0) framePayload[0] = framePayload[0]! ^ 1;
      const stalledMs = await this.transport.waitForBufferedAmountLow(
        this.tuning.sendHighWaterBytes,
        this.tuning.sendLowWaterBytes
      );
      if (
        !this.transport.sendData(
          encodeDataFrame({
            protocolVersion: m5IntegrityProtocolVersion,
            transferReference: this.reference,
            offset: start + offset,
            payload: framePayload
          })
        )
      )
        throw new Error("TRANSPORT_INTERRUPTED");
      const rates = this.rate.record(length);
      this.snapshot = {
        ...this.snapshot,
        bytesTransferred: this.snapshot.bytesTransferred + length,
        currentBps: rates.currentBps,
        averageBps: rates.averageBps,
        frameCount: this.snapshot.frameCount + 1,
        metrics: {
          ...this.snapshot.metrics,
          bytesSent: this.snapshot.metrics.bytesSent + length,
          currentThroughputBps: rates.currentBps,
          averageThroughputBps: rates.averageBps,
          peakThroughputBps: rates.peakBps,
          sourceReadBps: sourceRates.currentBps,
          bufferedAmountBytes: this.transport.bufferedAmount,
          elapsedMs: this.rate.elapsed(),
          frameCount: this.snapshot.metrics.frameCount + 1,
          stalledMs: this.snapshot.metrics.stalledMs + stalledMs
        },
        continuity: this.snapshot.reconnectCount
          ? {
              ...this.snapshot.continuity,
              resumedPayloadBytes: this.snapshot.continuity.resumedPayloadBytes + length
            }
          : this.snapshot.continuity
      };
      this.publishMetrics();
    }
    this.publish();
    return new Promise<"committed" | "nack">((resolve, reject) => {
      this.awaitingBlock = { blockIndex, resolve, reject };
    }).finally(() => {
      this.awaitingBlock = undefined;
    });
  }

  private sendManifestRoot(): void {
    if (!this.record) return;
    const startedAt = performance.now();
    const root = this.buildRoot();
    const outgoingRoot = this.consumeFault("manifestRoot")
      ? `${root.slice(0, 63)}${root.endsWith("0") ? "1" : "0"}`
      : root;
    this.snapshot = {
      ...this.snapshot,
      state: "VERIFYING",
      integrity: {
        ...this.snapshot.integrity,
        manifestBuildMs: this.snapshot.integrity.manifestBuildMs + performance.now() - startedAt
      }
    };
    this.publish();
    this.send({
      type: "TRANSFER_MANIFEST_ROOT",
      protocolVersion: m5IntegrityProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity,
      root: outgoingRoot
    });
  }

  private async verifyManifestRoot(expectedRoot: string): Promise<void> {
    if (!this.record || !this.receiver || this.snapshot.blocksMissing !== 0)
      return this.fail("FS_MANIFEST_INVALID");
    const startedAt = performance.now();
    const matches = this.buildRootMatches(expectedRoot, this.receiver.recordSnapshot());
    this.snapshot = {
      ...this.snapshot,
      state: "VERIFYING",
      integrity: {
        ...this.snapshot.integrity,
        manifestVerifyMs: this.snapshot.integrity.manifestVerifyMs + performance.now() - startedAt,
        manifestRootMatch: matches
      }
    };
    if (!matches) return this.fail("FS_MANIFEST_INTEGRITY_FAILED");
    try {
      await this.acceptOptions?.destination.close();
      this.snapshot = { ...this.snapshot, state: "VERIFIED" };
      this.publish();
      this.send({
        type: "TRANSFER_MANIFEST_VERIFIED",
        protocolVersion: m5IntegrityProtocolVersion,
        transferId: this.record.transferId,
        manifestIdentity: this.record.manifestIdentity,
        root: expectedRoot
      });
      this.snapshot = { ...this.snapshot, state: "DELIVERED" };
      this.publish();
    } catch {
      this.fail("DESTINATION_FINALIZATION_FAILED");
    }
  }

  private buildRoot(record = this.record): string {
    if (!record) throw new Error("FS_MANIFEST_INVALID");
    const digests: string[] = [];
    for (let index = 0; index < record.blockCount; index += 1) {
      const digest = getVerifiedBlockDigest(record, index);
      if (!digest) throw new Error("FS_INTEGRITY_STATE_INVALID");
      digests.push(digest);
    }
    return buildManifestRoot({
      version: integrityManifestVersion,
      algorithm: integrityAlgorithm,
      transferId: record.transferId,
      totalBytes: record.totalBytes,
      blockBytes: record.blockBytes,
      blockDigests: digests
    });
  }

  private buildRootMatches(root: string, record = this.record): boolean {
    try {
      return verifyBlock(root, this.buildRoot(record));
    } catch {
      return false;
    }
  }

  private recordCommitted(blockIndex: number): void {
    if (!this.record || this.committed.has(blockIndex)) return;
    this.committed.add(blockIndex);
    const [start, end] = blockByteRange(blockIndex, this.record.totalBytes, this.record.blockBytes);
    this.snapshot = {
      ...this.snapshot,
      safeBytes: this.snapshot.safeBytes + end - start,
      blocksCommitted: this.committed.size,
      blocksMissing: this.record.blockCount - this.committed.size,
      integrity: {
        ...this.snapshot.integrity,
        blocksVerifiedReceiver: this.committed.size,
        verifiedBytes: this.snapshot.safeBytes + end - start
      }
    };
    this.publish();
  }

  private offerMessage(): Offer {
    if (!this.record || !this.source) throw new Error("FS_MANIFEST_INVALID");
    return {
      type: "TRANSFER_INTEGRITY_OFFER",
      protocolVersion: m5IntegrityProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity,
      transferReference: this.reference,
      name: this.source.name,
      mimeType: this.source.type || undefined,
      sourceIdentity: this.record.sourceIdentity,
      totalBytes: this.record.totalBytes,
      resumeBlockBytes: this.record.blockBytes as Offer["resumeBlockBytes"],
      blockCount: this.record.blockCount,
      integrityAlgorithm,
      integrityManifestVersion
    };
  }

  private consumeFault(kind: IntegrityFaultKind, blockIndex?: number): IntegrityFault | null {
    if (!this.fault || this.fault.kind !== kind) return null;
    if (this.fault.blockIndex !== undefined && this.fault.blockIndex !== blockIndex) return null;
    if (this.fault.mode === "once" && this.faultUses > 0) return null;
    this.faultUses += 1;
    return this.fault;
  }

  private send(message: M5IntegrityControlMessage): void {
    if (!this.transport.sendControl(JSON.stringify(message))) this.transportInterrupted();
  }
  private fail(code: string): void {
    if (this.snapshot.state === "INTEGRITY_FAILED" || this.snapshot.state === "CANCELLED") return;
    this.snapshot = {
      ...this.snapshot,
      state:
        code.startsWith("FS_BLOCK_INTEGRITY") || code.startsWith("FS_MANIFEST_INTEGRITY")
          ? "INTEGRITY_FAILED"
          : "FAILED",
      error: code
    };
    this.publish();
  }
  private publish(): void {
    this.emit(this.snapshot);
  }

  /** Raw frame updates remain local; Engine Lab receives bounded progress snapshots. */
  private publishMetrics(): void {
    const now = performance.now();
    if (now - this.lastMetricPublishAt < this.tuning.uiSnapshotIntervalMs) return;
    this.lastMetricPublishAt = now;
    this.publish();
  }
}
