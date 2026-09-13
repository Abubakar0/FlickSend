import type { FileDestination, FileSource } from "@flicksend/filesystem-browser";
import { createStreamingSha256 } from "@flicksend/integrity";
import {
  decodeDataFrame,
  encodeDataFrame,
  parseTransferControlMessage,
  transferProtocolVersion,
  type TransferControlMessage,
  type TransferState
} from "@flicksend/protocol";
import { initialTransferMetrics, TransferMetricTracker, type TransferMetrics } from "./metrics.js";
import { m3BenchmarkDefaults, validateTransferTuning, type TransferTuning } from "./tuning.js";

export type TransferSnapshot = {
  protocolVersion: number | null;
  transferId: string | null;
  name: string | null;
  state: TransferState;
  bytesTransferred: number;
  bytesTotal: number;
  safeBytes: number;
  blocksCommitted: number;
  blocksMissing: number;
  retransmittedBytes: number;
  integrity: {
    algorithm: "SHA256" | null;
    blocksHashedSender: number;
    blocksVerifiedReceiver: number;
    integrityMismatchCount: number;
    integrityRetryCount: number;
    hashBytesProcessed: number;
    senderHashingMs: number;
    receiverHashingMs: number;
    manifestBuildMs: number;
    manifestVerifyMs: number;
    manifestRootMatch: boolean | null;
    verifiedBytes: number;
  };
  /** @deprecated Use continuity.resumedPayloadBytes and related fields for M4 recovery evidence. */
  continuity: {
    safeBytesBeforeDisconnect: number;
    remainingBytesAtResume: number;
    resumedPayloadBytes: number;
    duplicateRetransmittedBytes: number;
    committedBlocksRetransmitted: number;
    ambiguousInflightBytesRetransmitted: number;
  };
  reconnectCount: number;
  recoveryReconciliationMs: number | null;
  frameCount: number;
  currentBps: number;
  averageBps: number;
  error: string | null;
  metrics: TransferMetrics;
  tuning: TransferTuning;
  streamPack?: {
    filesTotal: number;
    directoriesTotal: number;
    filesComplete: number;
    directoriesCreated: number;
    manifestEntries: number;
    manifestBytes: number;
    peakOpenDestinationHandles: number;
    /** Bounded control-plane diagnostics; excludes file names, paths, and payload. */
    protocolTrace: readonly string[];
  };
};

export type TransferTransport = {
  sendControl(raw: string): boolean;
  sendData(frame: ArrayBuffer): boolean;
  waitForBufferedAmountLow(highWater: number, lowWater: number): Promise<number>;
  readonly bufferedAmount: number;
  readonly maximumDataMessageBytes: number;
};

export const initialTransferSnapshot: TransferSnapshot = {
  protocolVersion: null,
  transferId: null,
  name: null,
  state: "IDLE",
  bytesTransferred: 0,
  bytesTotal: 0,
  safeBytes: 0,
  blocksCommitted: 0,
  blocksMissing: 0,
  retransmittedBytes: 0,
  integrity: {
    algorithm: null,
    blocksHashedSender: 0,
    blocksVerifiedReceiver: 0,
    integrityMismatchCount: 0,
    integrityRetryCount: 0,
    hashBytesProcessed: 0,
    senderHashingMs: 0,
    receiverHashingMs: 0,
    manifestBuildMs: 0,
    manifestVerifyMs: 0,
    manifestRootMatch: null,
    verifiedBytes: 0
  },
  continuity: {
    safeBytesBeforeDisconnect: 0,
    remainingBytesAtResume: 0,
    resumedPayloadBytes: 0,
    duplicateRetransmittedBytes: 0,
    committedBlocksRetransmitted: 0,
    ambiguousInflightBytesRetransmitted: 0
  },
  reconnectCount: 0,
  recoveryReconciliationMs: null,
  frameCount: 0,
  currentBps: 0,
  averageBps: 0,
  error: null,
  metrics: initialTransferMetrics,
  tuning: m3BenchmarkDefaults
};

type PreparedFrame = { offset: number; payload: Uint8Array<ArrayBuffer> };

/** A bounded, ordered window over File.slice() reads. It never retains the complete file. */
class ReadAheadSource {
  private nextOffset = 0;
  private nextToConsume = 0;
  private readonly reads = new Map<number, Promise<PreparedFrame>>();

  constructor(
    private readonly source: FileSource,
    private readonly frameBytes: number,
    private readonly readAheadBytes: number,
    private readonly onRead: (bytes: number) => void
  ) {}

  async next(): Promise<PreparedFrame | null> {
    this.fill();
    if (this.nextToConsume >= this.source.size) return null;
    const read = this.reads.get(this.nextToConsume);
    if (!read) throw new Error("Read-ahead window lost the next source frame.");
    const frame = await read;
    this.reads.delete(frame.offset);
    this.nextToConsume += frame.payload.byteLength;
    this.fill();
    return frame;
  }

  close(): void {
    for (const read of this.reads.values()) void read.catch(() => undefined);
    this.reads.clear();
  }

  private fill(): void {
    while (
      this.nextOffset < this.source.size &&
      this.nextOffset - this.nextToConsume < this.readAheadBytes
    ) {
      const offset = this.nextOffset;
      const length = Math.min(this.frameBytes, this.source.size - offset);
      if (
        this.reads.size > 0 &&
        this.nextOffset - this.nextToConsume + length > this.readAheadBytes
      )
        break;
      this.nextOffset += length;
      this.reads.set(
        offset,
        this.source.read(offset, length).then((buffer) => {
          if (buffer.byteLength !== length)
            throw new Error("Source read returned an unexpected length.");
          this.onRead(length);
          return { offset, payload: new Uint8Array(buffer) };
        })
      );
    }
  }
}

export class SingleFileTransfer {
  private snapshot: TransferSnapshot;
  private source?: FileSource;
  private destination?: FileDestination;
  private reference = 0;
  private sourceHash?: ReturnType<typeof createStreamingSha256>;
  private destinationHash?: ReturnType<typeof createStreamingSha256>;
  private pendingFinish?: { bytes: number; sha256: string };
  private readAhead?: ReadAheadSource;
  private readonly sourceMetrics: TransferMetricTracker;
  private readonly destinationMetrics: TransferMetricTracker;
  private readonly transferMetrics: TransferMetricTracker;
  private startedAt = 0;
  private cancelled = false;
  private paused = false;
  private stateBeforePause: TransferState = "IDLE";
  private pauseWaiters = new Set<() => void>();
  private flowWaiters = new Set<() => void>();
  private remoteBytesWritten = 0;
  private remoteReceiveWindow = 0;
  private expectedReceiveOffset = 0;
  private writeQueue: Uint8Array<ArrayBuffer>[] = [];
  private queuedWriteBytes = 0;
  private inFlightWriteBytes = 0;
  private writeDrain?: Promise<void>;
  private snapshotTimer?: ReturnType<typeof setTimeout>;
  private lastPublishedAt = 0;
  private firstReadRecorded = false;
  private firstQueuedRecorded = false;
  private firstReceivedRecorded = false;
  private firstWrittenRecorded = false;
  private metricSampleIntervalMs = 100;
  private nextMetricSampleAt = 0;

  constructor(
    private readonly transport: TransferTransport,
    private readonly emit: (snapshot: TransferSnapshot) => void,
    private readonly tuning: TransferTuning = m3BenchmarkDefaults
  ) {
    validateTransferTuning(tuning);
    this.snapshot = { ...initialTransferSnapshot, tuning };
    this.sourceMetrics = new TransferMetricTracker(tuning);
    this.destinationMetrics = new TransferMetricTracker(tuning);
    this.transferMetrics = new TransferMetricTracker(tuning);
  }

  select(source: FileSource): void {
    this.resetTransfer();
    const transferId = "fs_tr_" + crypto.randomUUID();
    this.source = source;
    this.reference = crypto.getRandomValues(new Uint32Array(1))[0]! || 1;
    this.snapshot = {
      ...initialTransferSnapshot,
      transferId,
      name: source.name,
      state: "READY",
      bytesTotal: source.size,
      metrics: { ...initialTransferMetrics, bytesTotal: source.size },
      tuning: this.tuning
    };
    this.publish(true);
  }

  offer(): void {
    if (!this.source || !this.snapshot.transferId || this.snapshot.state !== "READY") return;
    this.send({
      type: "TRANSFER_OFFER",
      protocolVersion: transferProtocolVersion,
      transferId: this.snapshot.transferId,
      transferReference: this.reference,
      name: this.source.name,
      size: this.source.size,
      mimeType: this.source.type || undefined
    });
  }

  async accept(destination: FileDestination): Promise<void> {
    const transferId = this.snapshot.transferId;
    if (!transferId || this.snapshot.state !== "READY") return;
    this.destination = destination;
    this.destinationHash = createStreamingSha256();
    this.beginTiming();
    this.snapshot = { ...this.snapshot, state: "RECEIVING", error: null };
    this.publish(true);
    this.send({
      type: "TRANSFER_ACCEPT",
      protocolVersion: transferProtocolVersion,
      transferId,
      receiveWindowBytes: this.tuning.receiveWindowBytes
    });
  }

  pause(): void {
    if (!this.canPause()) return;
    this.paused = true;
    this.stateBeforePause = this.snapshot.state;
    this.snapshot = { ...this.snapshot, state: "PAUSED" };
    this.publish(true);
    this.sendPauseControl("TRANSFER_PAUSE");
  }

  resume(): void {
    if (!this.paused || !this.snapshot.transferId) return;
    this.paused = false;
    this.snapshot = { ...this.snapshot, state: this.stateBeforePause };
    this.resolveWaiters(this.pauseWaiters);
    this.publish(true);
    this.sendPauseControl("TRANSFER_RESUME");
  }

  cancel(code = "CANCELLED_BY_USER"): void {
    if (!this.snapshot.transferId || this.snapshot.state === "CANCELLED") return;
    this.cancelled = true;
    this.readAhead?.close();
    this.writeQueue = [];
    this.queuedWriteBytes = 0;
    this.inFlightWriteBytes = 0;
    this.updateReceiveQueueMetric();
    this.resolveWaiters(this.pauseWaiters);
    this.resolveWaiters(this.flowWaiters);
    void this.destination?.abort();
    this.send({
      type: "TRANSFER_CANCEL",
      protocolVersion: transferProtocolVersion,
      transferId: this.snapshot.transferId,
      code
    });
    this.snapshot = { ...this.snapshot, state: "CANCELLED" };
    this.publish(true);
  }

  dispose(): void {
    this.readAhead?.close();
    this.readAhead = undefined;
    this.writeQueue = [];
    this.queuedWriteBytes = 0;
    this.inFlightWriteBytes = 0;
    this.updateReceiveQueueMetric();
    this.resolveWaiters(this.pauseWaiters);
    this.resolveWaiters(this.flowWaiters);
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.snapshotTimer = undefined;
  }

  async handleControl(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.fail("MALFORMED_CONTROL");
    }
    const message = parseTransferControlMessage(parsed);
    if (!message) return this.fail("INVALID_CONTROL");
    await this.processControl(message);
  }

  handleData(raw: ArrayBuffer): void {
    if (!this.canReceiveData() || !this.destination || !this.destinationHash)
      return this.fail("UNEXPECTED_FRAME");
    const frame = decodeDataFrame(raw);
    if (
      !frame ||
      frame.transferReference !== this.reference ||
      frame.offset !== this.expectedReceiveOffset
    ) {
      return this.fail("INVALID_FRAME");
    }
    if (this.expectedReceiveOffset + frame.payload.byteLength > this.snapshot.bytesTotal)
      return this.fail("RECEIVER_OVERRUN");
    if (this.receiveQueueBytes() + frame.payload.byteLength > this.tuning.receiveWindowBytes)
      return this.fail("RECEIVE_WINDOW_EXCEEDED");

    this.expectedReceiveOffset += frame.payload.byteLength;
    this.writeQueue.push(frame.payload);
    this.queuedWriteBytes += frame.payload.byteLength;
    if (!this.firstReceivedRecorded) {
      this.firstReceivedRecorded = true;
      this.setMetric("timeToFirstFrameReceivedMs", this.elapsed());
    }
    this.snapshot = {
      ...this.snapshot,
      frameCount: this.snapshot.frameCount + 1,
      metrics: {
        ...this.snapshot.metrics,
        bytesReceived: this.snapshot.metrics.bytesReceived + frame.payload.byteLength,
        frameCount: this.snapshot.metrics.frameCount + 1,
        receiveQueueBytes: this.receiveQueueBytes()
      }
    };
    this.recordMetricSample();
    this.publish();
    void this.drainWrites();
  }

  private async processControl(message: TransferControlMessage): Promise<void> {
    if (message.type === "TRANSFER_OFFER") {
      this.resetTransfer();
      this.reference = message.transferReference;
      this.snapshot = {
        ...initialTransferSnapshot,
        transferId: message.transferId,
        name: message.name,
        state: "READY",
        bytesTotal: message.size,
        metrics: { ...initialTransferMetrics, bytesTotal: message.size },
        tuning: this.tuning
      };
      this.publish(true);
      return;
    }
    if (!this.snapshot.transferId || message.transferId !== this.snapshot.transferId)
      return this.fail("UNKNOWN_TRANSFER");
    if (message.type === "TRANSFER_ACCEPT" && this.source) {
      this.remoteReceiveWindow = message.receiveWindowBytes;
      this.remoteBytesWritten = 0;
      void this.sendFile();
      return;
    }
    if (message.type === "TRANSFER_START" && this.destination) {
      if (message.framePayloadBytes > this.tuning.receiveWindowBytes)
        return this.fail("FRAME_EXCEEDS_RECEIVE_WINDOW");
      this.setMetric("effectiveFramePayloadBytes", message.framePayloadBytes);
      this.publish(true);
      return;
    }
    if (message.type === "TRANSFER_FLOW_CONTROL" && this.source) {
      if (message.bytesWritten < this.remoteBytesWritten || message.bytesWritten > this.source.size)
        return this.fail("INVALID_FLOW_CONTROL");
      this.remoteBytesWritten = message.bytesWritten;
      this.remoteReceiveWindow = message.receiveWindowBytes;
      this.resolveWaiters(this.flowWaiters);
      return;
    }
    if (message.type === "TRANSFER_PAUSE") {
      this.applyRemotePause();
      return;
    }
    if (message.type === "TRANSFER_RESUME") {
      this.applyRemoteResume();
      return;
    }
    if (message.type === "TRANSFER_FINISH" && this.destination && this.destinationHash) {
      this.pendingFinish = { bytes: message.bytes, sha256: message.sha256 };
      await this.finalizeReceiverIfReady();
      return;
    }
    if (message.type === "TRANSFER_VERIFY_OK") {
      this.snapshot = {
        ...this.snapshot,
        state: "COMPLETED",
        metrics: {
          ...this.snapshot.metrics,
          bufferedAmountBytes: this.transport.bufferedAmount,
          elapsedMs: this.elapsed()
        }
      };
      this.publish(true);
      return;
    }
    if (message.type === "TRANSFER_CANCEL" || message.type === "TRANSFER_REJECT") {
      this.cancelled = true;
      this.readAhead?.close();
      this.writeQueue = [];
      this.queuedWriteBytes = 0;
      this.inFlightWriteBytes = 0;
      this.updateReceiveQueueMetric();
      this.resolveWaiters(this.pauseWaiters);
      this.resolveWaiters(this.flowWaiters);
      await this.destination?.abort();
      this.snapshot = { ...this.snapshot, state: "CANCELLED", error: message.code };
      this.publish(true);
      return;
    }
    if (message.type === "TRANSFER_FAIL") this.fail(message.code);
  }

  private async sendFile(): Promise<void> {
    const transferId = this.snapshot.transferId;
    if (!this.source || !transferId) return;
    const framePayloadBytes = Math.min(
      this.tuning.framePayloadBytes,
      this.transport.maximumDataMessageBytes - 20
    );
    if (framePayloadBytes < 32 * 1024) return this.fail("NEGOTIATED_MESSAGE_SIZE_TOO_SMALL");

    this.beginTiming();
    this.sourceHash = createStreamingSha256();
    this.readAhead = new ReadAheadSource(
      this.source,
      framePayloadBytes,
      this.tuning.readAheadBytes,
      (bytes) => this.recordSourceRead(bytes)
    );
    this.snapshot = {
      ...this.snapshot,
      state: "SENDING",
      error: null,
      metrics: { ...this.snapshot.metrics, effectiveFramePayloadBytes: framePayloadBytes }
    };
    this.publish(true);
    this.send({
      type: "TRANSFER_START",
      protocolVersion: transferProtocolVersion,
      transferId,
      framePayloadBytes
    });
    try {
      for (;;) {
        await this.waitUntilRunnable();
        const prepared = await this.readAhead.next();
        if (!prepared || this.cancelled) break;
        await this.waitForReceiveWindow(prepared.offset + prepared.payload.byteLength);
        await this.waitUntilRunnable();
        const stalledMs = await this.transport.waitForBufferedAmountLow(
          this.tuning.sendHighWaterBytes,
          this.tuning.sendLowWaterBytes
        );
        if (
          !this.transport.sendData(
            encodeDataFrame({ transferReference: this.reference, ...prepared })
          )
        )
          throw new Error("Data channel closed.");
        if (!this.firstQueuedRecorded) {
          this.firstQueuedRecorded = true;
          this.setMetric("timeToFirstFrameQueuedMs", this.elapsed());
        }
        this.sourceHash.update(prepared.payload);
        this.recordSent(prepared.payload.byteLength, stalledMs);
      }
      if (this.cancelled) return;
      this.snapshot = { ...this.snapshot, state: "FINALIZING" };
      this.publish(true);
      this.send({
        type: "TRANSFER_FINISH",
        protocolVersion: transferProtocolVersion,
        transferId,
        bytes: this.snapshot.bytesTransferred,
        sha256: this.sourceHash.digestHex()
      });
    } catch {
      if (!this.cancelled) this.fail("SOURCE_OR_TRANSPORT_FAILED");
    } finally {
      this.readAhead?.close();
      this.readAhead = undefined;
    }
  }

  private async drainWrites(): Promise<void> {
    if (this.writeDrain) return this.writeDrain;
    this.writeDrain = this.drainWriteQueue().finally(() => {
      this.writeDrain = undefined;
      if (this.writeQueue.length > 0 && !this.cancelled) void this.drainWrites();
    });
    return this.writeDrain;
  }

  private async drainWriteQueue(): Promise<void> {
    while (this.writeQueue.length > 0 && !this.cancelled) {
      const batch = this.takeWriteBatch();
      try {
        await this.destination?.write(batch);
        if (this.cancelled) {
          this.inFlightWriteBytes = 0;
          this.updateReceiveQueueMetric();
          return;
        }
        this.destinationHash?.update(batch);
        this.inFlightWriteBytes = 0;
        this.recordDestinationWrite(batch.byteLength);
        this.sendFlowControl();
        await this.finalizeReceiverIfReady();
      } catch {
        this.inFlightWriteBytes = 0;
        this.fail("DESTINATION_WRITE_FAILED");
        return;
      }
    }
  }

  private takeWriteBatch(): Uint8Array<ArrayBuffer> {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    while (this.writeQueue.length > 0) {
      const next = this.writeQueue[0]!;
      if (bytes > 0 && bytes + next.byteLength > this.tuning.writeBatchBytes) break;
      this.writeQueue.shift();
      this.queuedWriteBytes -= next.byteLength;
      chunks.push(next);
      bytes += next.byteLength;
      if (bytes >= this.tuning.writeBatchBytes) break;
    }
    this.inFlightWriteBytes = bytes;
    this.updateReceiveQueueMetric();
    if (chunks.length === 1) return chunks[0]!;
    const batch = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      batch.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return batch;
  }

  private async finalizeReceiverIfReady(): Promise<void> {
    const transferId = this.snapshot.transferId;
    if (!this.pendingFinish || !this.destination || !this.destinationHash || !transferId) return;
    if (this.pendingFinish.bytes < this.snapshot.bytesTransferred)
      return this.fail("RECEIVED_BYTES_EXCEED_FINISH");
    if (this.pendingFinish.bytes !== this.snapshot.bytesTransferred || this.receiveQueueBytes() > 0)
      return;
    if (
      this.snapshot.bytesTransferred !== this.snapshot.bytesTotal ||
      this.pendingFinish.sha256 !== this.destinationHash.digestHex()
    ) {
      return this.fail("INTEGRITY_MISMATCH");
    }
    try {
      await this.destination.close();
      this.snapshot = { ...this.snapshot, state: "COMPLETED" };
      this.publish(true);
      this.send({
        type: "TRANSFER_VERIFY_OK",
        protocolVersion: transferProtocolVersion,
        transferId
      });
    } catch {
      this.fail("DESTINATION_CLOSE_FAILED");
    }
  }

  private recordSourceRead(bytes: number): void {
    const rates = this.sourceMetrics.record(bytes);
    if (!this.firstReadRecorded) {
      this.firstReadRecorded = true;
      this.setMetric("timeToFirstReadMs", this.elapsed());
    }
    this.snapshot = {
      ...this.snapshot,
      metrics: { ...this.snapshot.metrics, sourceReadBps: rates.currentBps }
    };
  }

  private recordSent(bytes: number, stalledMs: number): void {
    const rates = this.transferMetrics.record(bytes);
    this.snapshot = {
      ...this.snapshot,
      bytesTransferred: this.snapshot.bytesTransferred + bytes,
      frameCount: this.snapshot.frameCount + 1,
      currentBps: rates.currentBps,
      averageBps: rates.averageBps,
      metrics: {
        ...this.snapshot.metrics,
        bytesSent: this.snapshot.metrics.bytesSent + bytes,
        currentThroughputBps: rates.currentBps,
        averageThroughputBps: rates.averageBps,
        peakThroughputBps: rates.peakBps,
        bufferedAmountBytes: this.transport.bufferedAmount,
        elapsedMs: this.elapsed(),
        frameCount: this.snapshot.metrics.frameCount + 1,
        stalledMs: this.snapshot.metrics.stalledMs + stalledMs
      }
    };
    this.recordMetricSample();
    this.publish();
  }

  private recordDestinationWrite(bytes: number): void {
    const destinationRates = this.destinationMetrics.record(bytes);
    const transferRates = this.transferMetrics.record(bytes);
    if (!this.firstWrittenRecorded) {
      this.firstWrittenRecorded = true;
      const firstByte = this.elapsed();
      this.setMetric("timeToFirstDestinationWriteMs", firstByte);
      this.setMetric("timeToFirstByteMs", firstByte);
    }
    this.snapshot = {
      ...this.snapshot,
      bytesTransferred: this.snapshot.bytesTransferred + bytes,
      currentBps: transferRates.currentBps,
      averageBps: transferRates.averageBps,
      metrics: {
        ...this.snapshot.metrics,
        currentThroughputBps: transferRates.currentBps,
        averageThroughputBps: transferRates.averageBps,
        peakThroughputBps: transferRates.peakBps,
        destinationWriteBps: destinationRates.currentBps,
        receiveQueueBytes: this.receiveQueueBytes(),
        elapsedMs: this.elapsed()
      }
    };
    this.recordMetricSample();
    this.publish();
  }

  private sendFlowControl(): void {
    if (!this.snapshot.transferId) return;
    this.send({
      type: "TRANSFER_FLOW_CONTROL",
      protocolVersion: transferProtocolVersion,
      transferId: this.snapshot.transferId,
      bytesWritten: this.snapshot.bytesTransferred,
      receiveWindowBytes: this.tuning.receiveWindowBytes
    });
  }

  private async waitForReceiveWindow(endOffset: number): Promise<void> {
    while (!this.cancelled && endOffset > this.remoteBytesWritten + this.remoteReceiveWindow) {
      await new Promise<void>((resolve) => this.flowWaiters.add(resolve));
    }
  }

  private async waitUntilRunnable(): Promise<void> {
    while (this.paused && !this.cancelled)
      await new Promise<void>((resolve) => this.pauseWaiters.add(resolve));
  }

  private applyRemotePause(): void {
    if (this.paused || !this.canPause()) return;
    this.paused = true;
    this.stateBeforePause = this.snapshot.state;
    this.snapshot = { ...this.snapshot, state: "PAUSED" };
    this.publish(true);
  }

  private applyRemoteResume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.snapshot = { ...this.snapshot, state: this.stateBeforePause };
    this.resolveWaiters(this.pauseWaiters);
    this.publish(true);
  }

  private sendPauseControl(type: "TRANSFER_PAUSE" | "TRANSFER_RESUME"): void {
    if (!this.snapshot.transferId) return;
    this.send({
      type,
      protocolVersion: transferProtocolVersion,
      transferId: this.snapshot.transferId
    });
  }

  private canPause(): boolean {
    return this.snapshot.state === "SENDING" || this.snapshot.state === "RECEIVING";
  }

  private canReceiveData(): boolean {
    return (
      this.snapshot.state === "RECEIVING" ||
      (this.snapshot.state === "PAUSED" && this.stateBeforePause === "RECEIVING")
    );
  }

  private beginTiming(): void {
    const now = performance.now();
    this.startedAt = now;
    this.sourceMetrics.start(now);
    this.destinationMetrics.start(now);
    this.transferMetrics.start(now);
  }

  private elapsed(): number {
    return this.startedAt === 0 ? 0 : Math.max(performance.now() - this.startedAt, 0);
  }

  private receiveQueueBytes(): number {
    return this.queuedWriteBytes + this.inFlightWriteBytes;
  }

  private updateReceiveQueueMetric(): void {
    this.snapshot = {
      ...this.snapshot,
      metrics: { ...this.snapshot.metrics, receiveQueueBytes: this.receiveQueueBytes() }
    };
  }

  private setMetric<K extends keyof TransferMetrics>(key: K, value: TransferMetrics[K]): void {
    this.snapshot = { ...this.snapshot, metrics: { ...this.snapshot.metrics, [key]: value } };
  }

  private recordMetricSample(): void {
    const elapsedMs = this.elapsed();
    if (elapsedMs < this.nextMetricSampleAt) return;
    const samples = [...this.snapshot.metrics.samples];
    if (samples.length >= 3600) {
      samples.splice(0, samples.length, ...samples.filter((_, index) => index % 2 === 0));
      this.metricSampleIntervalMs *= 2;
    }
    samples.push({
      elapsedMs,
      bytesSent: this.snapshot.metrics.bytesSent,
      bytesReceived: this.snapshot.metrics.bytesReceived,
      bufferedAmountBytes: this.snapshot.metrics.bufferedAmountBytes,
      receiveQueueBytes: this.snapshot.metrics.receiveQueueBytes,
      throughputBps: this.snapshot.metrics.currentThroughputBps,
      sourceReadBps: this.snapshot.metrics.sourceReadBps,
      destinationWriteBps: this.snapshot.metrics.destinationWriteBps
    });
    this.nextMetricSampleAt = elapsedMs + this.metricSampleIntervalMs;
    this.snapshot = { ...this.snapshot, metrics: { ...this.snapshot.metrics, samples } };
  }

  private send(message: TransferControlMessage): void {
    if (!this.transport.sendControl(JSON.stringify(message))) this.fail("CONTROL_CHANNEL_CLOSED");
  }

  private fail(code: string): void {
    if (this.snapshot.state === "FAILED" || this.snapshot.state === "CANCELLED") return;
    this.cancelled = true;
    this.readAhead?.close();
    this.writeQueue = [];
    this.queuedWriteBytes = 0;
    this.inFlightWriteBytes = 0;
    this.resolveWaiters(this.pauseWaiters);
    this.resolveWaiters(this.flowWaiters);
    void this.destination?.abort();
    this.snapshot = { ...this.snapshot, state: "FAILED", error: code };
    this.publish(true);
    if (this.snapshot.transferId)
      this.transport.sendControl(
        JSON.stringify({
          type: "TRANSFER_FAIL",
          protocolVersion: transferProtocolVersion,
          transferId: this.snapshot.transferId,
          code
        })
      );
  }

  private resetTransfer(): void {
    this.readAhead?.close();
    this.readAhead = undefined;
    this.writeQueue = [];
    this.queuedWriteBytes = 0;
    this.inFlightWriteBytes = 0;
    this.pendingFinish = undefined;
    this.cancelled = false;
    this.paused = false;
    this.remoteBytesWritten = 0;
    this.remoteReceiveWindow = 0;
    this.expectedReceiveOffset = 0;
    this.firstReadRecorded = false;
    this.firstQueuedRecorded = false;
    this.firstReceivedRecorded = false;
    this.firstWrittenRecorded = false;
    this.metricSampleIntervalMs = 100;
    this.nextMetricSampleAt = 0;
    this.resolveWaiters(this.pauseWaiters);
    this.resolveWaiters(this.flowWaiters);
  }

  private resolveWaiters(waiters: Set<() => void>): void {
    for (const resolve of waiters) resolve();
    waiters.clear();
  }

  private publish(force = false): void {
    if (force) {
      if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
      this.snapshotTimer = undefined;
      this.lastPublishedAt = performance.now();
      this.emit(this.snapshot);
      return;
    }
    const delay = this.tuning.uiSnapshotIntervalMs - (performance.now() - this.lastPublishedAt);
    if (delay <= 0) {
      this.lastPublishedAt = performance.now();
      this.emit(this.snapshot);
      return;
    }
    if (!this.snapshotTimer) {
      this.snapshotTimer = setTimeout(() => {
        this.snapshotTimer = undefined;
        this.lastPublishedAt = performance.now();
        this.emit(this.snapshot);
      }, delay);
    }
  }
}
