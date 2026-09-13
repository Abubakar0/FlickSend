import type { StreamPackDestination } from "@flicksend/filesystem-browser";
import {
  StreamPackLayout,
  buildStreamPackManifestRoot,
  streamPackSourceIdentity,
  validateStreamPackManifest,
  type StreamPackManifest,
  type StreamPackSource
} from "@flicksend/stream-pack";
import { createStreamingSha256, digestBlock, verifyBlock } from "@flicksend/integrity";
import {
  decodeDataFrame,
  encodeDataFrame,
  m6StreamPackProtocolVersion,
  parseM6StreamPackControlMessage,
  type M6StreamPackControlMessage
} from "@flicksend/protocol";
import {
  blockByteRange,
  createRecoveryRecord,
  getVerifiedBlockDigest,
  markVerifiedBlockCommitted,
  missingBlockIndexes,
  pageBlockRanges,
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
import type { IntegrityFault } from "./m5-integrity-transfer.js";

type Offer = Extract<M6StreamPackControlMessage, { type: "STREAMPACK_OFFER" }>;
type Have = Extract<M6StreamPackControlMessage, { type: "STREAMPACK_HAVE_VERIFIED_BLOCKS" }>;
type Digest = Extract<M6StreamPackControlMessage, { type: "STREAMPACK_BLOCK_DIGEST" }>;
type M6Record = RecoveryRecord & { streamPack: { schemaVersion: 1; manifest: StreamPackManifest } };
export type M6AcceptOptions = {
  destination: StreamPackDestination;
  recoveryStore: RecoveryStore;
  destinationIdentity: string;
};

function pages(record: RecoveryRecord): readonly (readonly (readonly [number, number])[])[] {
  const value = pageBlockRanges(record.committedBlockRanges);
  return value.length ? value : [[]];
}
function verified(record: RecoveryRecord): boolean {
  for (const [start, end] of record.committedBlockRanges)
    for (let index = start; index < end; index += 1)
      if (!getVerifiedBlockDigest(record, index)) return false;
  return true;
}

/** Sequential logical blocks keep memory bounded while tiny files share one v5 transfer pipeline. */
export class M6StreamPackTransfer {
  private snapshot: TransferSnapshot;
  private source?: StreamPackSource;
  private record?: M6Record;
  private options?: M6AcceptOptions;
  private destination?: StreamPackDestination;
  private reference = 0;
  private offerMessage?: Offer;
  private entries: StreamPackManifest["entries"] = [];
  private chunkIndex = 0;
  private chunks = 0;
  private have: Have[] = [];
  private expected?: Digest;
  private block?: {
    index: number;
    offset: number;
    remaining: number;
    hash: ReturnType<typeof createStreamingSha256>;
  };
  private senderDigests = new Map<number, string>();
  private ready?: { index: number; resolve: () => void };
  private committed?: { index: number; resolve: (result: "committed" | "nack") => void };
  private sending = false;
  private sendingEpoch?: number;
  private cancelled = false;
  private protocolTrace: string[] = [];
  private dataChain = Promise.resolve();
  private fault?: IntegrityFault;
  private faultUses = 0;
  private transportEpoch = 0;
  private reconciliationStartedAt?: number;
  private activeSend?: { blockIndex: number; sentBytes: number; captured: boolean };
  private interruptedInflight: { blockIndex: number; sentBytes: number }[] = [];
  private readonly staleReferences = new Set<number>();
  private readonly rate: TransferMetricTracker;
  private readonly sourceRate: TransferMetricTracker;
  private readonly destinationRate: TransferMetricTracker;
  private receiveQueueBytes = 0;
  private lastMetricPublishAt = 0;

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

  select(source: StreamPackSource): void {
    this.cancelled = false;
    this.source = source;
    this.have = [];
    this.expected = undefined;
    this.block = undefined;
    this.senderDigests.clear();
    this.ready = undefined;
    this.committed = undefined;
    this.sending = false;
    this.sendingEpoch = undefined;
    this.reconciliationStartedAt = undefined;
    this.activeSend = undefined;
    this.interruptedInflight = [];
    this.reference = this.nextReference();
    this.staleReferences.clear();
    this.record = {
      ...createRecoveryRecord({
        transferId: "fs_tr_" + crypto.randomUUID(),
        protocolVersion: m6StreamPackProtocolVersion,
        manifestIdentity: crypto.randomUUID(),
        sourceIdentity: streamPackSourceIdentity(source.manifest),
        destinationIdentity: null,
        totalBytes: source.manifest.totalBytes,
        blockBytes: source.manifest.blockBytes
      }),
      streamPack: { schemaVersion: 1, manifest: source.manifest }
    };
    this.snapshot = this.makeSnapshot("READY", this.record);
    this.publish();
  }
  offer(): void {
    if (
      !this.record ||
      !this.source ||
      (this.snapshot.state !== "READY" && this.snapshot.state !== "RECONNECTING")
    )
      return;
    if (this.snapshot.state === "RECONNECTING") {
      this.have = [];
      this.reconciliationStartedAt = performance.now();
      // Data buffered on the old channel must not be interpreted as a frame on this route.
      this.reference = this.nextReference();
    }
    void this.source.assertUnchanged().then(
      () => {
        this.send({
          type: "STREAMPACK_OFFER",
          protocolVersion: m6StreamPackProtocolVersion,
          transferId: this.record!.transferId,
          manifestIdentity: this.record!.manifestIdentity,
          transferReference: this.reference,
          sourceIdentity: this.record!.sourceIdentity,
          totalBytes: this.record!.totalBytes,
          resumeBlockBytes: 8 * 1024 * 1024,
          blockCount: this.record!.blockCount,
          entryCount: this.record!.streamPack.manifest.entries.length
        });
      },
      () => this.fail("FS_STREAMPACK_SOURCE_CHANGED")
    );
  }
  async accept(options: M6AcceptOptions): Promise<void> {
    this.options = options;
    this.destination = options.destination;
    if (this.record)
      this.record = { ...this.record, destinationIdentity: options.destinationIdentity };
    if (this.offerMessage) this.acceptOffer();
  }
  replaceTransport(transport: TransferTransport): void {
    this.transport = transport;
  }
  /** Route exhaustion preserves receiver-verified recovery data for a later explicit retry. */
  routeRecoveryFailed(code: string): void {
    if (!this.record || this.cancelled || this.snapshot.state !== "RECONNECTING") return;
    this.snapshot = { ...this.snapshot, error: code };
    this.publish();
  }
  configureFault(fault: IntegrityFault | undefined): void {
    this.fault = fault;
    this.faultUses = 0;
  }
  transportInterrupted(): void {
    if (this.record && !this.cancelled && this.snapshot.state !== "RECONNECTING") {
      this.transportEpoch += 1;
      this.captureActiveSend();
      this.ready?.resolve();
      this.committed?.resolve("nack");
      this.sending = false;
      this.sendingEpoch = undefined;
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
  }
  cancel(code = "CANCELLED"): void {
    this.cancelled = true;
    void this.destination?.abort();
    this.snapshot = { ...this.snapshot, state: "CANCELLED", error: code };
    this.publish();
  }
  dispose(): void {
    this.cancelled = true;
  }

  async handleControl(raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const message = parseM6StreamPackControlMessage(json);
    if (!message) return;
    this.trace("recv:" + message.type);
    if (message.type === "STREAMPACK_OFFER") return this.receiveOffer(message);
    if (
      !this.record ||
      message.transferId !== this.record.transferId ||
      message.manifestIdentity !== this.record.manifestIdentity
    )
      return this.fail("FS_STREAMPACK_MANIFEST_INVALID");
    switch (message.type) {
      case "STREAMPACK_ACCEPT":
        return this.sendManifest();
      case "STREAMPACK_MANIFEST_BEGIN":
        return this.manifestBegin(message);
      case "STREAMPACK_MANIFEST_CHUNK":
        return this.manifestChunk(message);
      case "STREAMPACK_MANIFEST_END":
        return void this.manifestEnd(message);
      case "STREAMPACK_READY":
        return void this.sendMissing();
      case "STREAMPACK_HAVE_VERIFIED_BLOCKS":
        this.have.push(message);
        return;
      case "STREAMPACK_BLOCK_DIGEST":
        return this.beginBlock(message);
      case "STREAMPACK_BLOCK_READY":
        if (this.ready?.index === message.blockIndex) this.ready.resolve();
        return;
      case "STREAMPACK_BLOCK_COMMITTED":
        this.recordCommitted(message.blockIndex);
        if (this.committed?.index === message.blockIndex) this.committed.resolve("committed");
        return;
      case "STREAMPACK_BLOCK_NACK":
        if (this.committed?.index === message.blockIndex) this.committed.resolve("nack");
        return;
      case "STREAMPACK_MANIFEST_ROOT":
        return void this.verifyRoot(message.root);
      case "STREAMPACK_MANIFEST_VERIFIED":
        this.snapshot = {
          ...this.snapshot,
          state: "VERIFIED",
          integrity: { ...this.snapshot.integrity, manifestRootMatch: true }
        };
        return this.publish();
      case "STREAMPACK_DELIVERED":
        this.snapshot = { ...this.snapshot, state: "DELIVERED" };
        return this.publish();
      case "STREAMPACK_REJECT":
      case "STREAMPACK_FAIL":
        return this.fail(message.code);
      default:
        return;
    }
  }

  handleData(raw: ArrayBuffer): Promise<void> {
    // Ordered data channels still need serialized async writes to preserve offsets.
    const frame = decodeDataFrame(raw);
    const queuedBytes = frame?.payload.byteLength ?? 0;
    this.receiveQueueBytes += queuedBytes;
    this.snapshot = {
      ...this.snapshot,
      metrics: { ...this.snapshot.metrics, receiveQueueBytes: this.receiveQueueBytes }
    };
    this.publishMetrics();
    this.dataChain = this.dataChain
      .then(() => this.receiveData(raw))
      .finally(() => {
        this.receiveQueueBytes = Math.max(0, this.receiveQueueBytes - queuedBytes);
        this.snapshot = {
          ...this.snapshot,
          metrics: { ...this.snapshot.metrics, receiveQueueBytes: this.receiveQueueBytes }
        };
        this.publishMetrics();
      });
    return this.dataChain;
  }

  private async receiveData(raw: ArrayBuffer): Promise<void> {
    const epoch = this.transportEpoch;
    const block = this.block;
    const frame = decodeDataFrame(raw);
    if (!frame || frame.protocolVersion !== m6StreamPackProtocolVersion)
      return this.fail("FS_STREAMPACK_RANGE_INVALID");
    if (frame.transferReference !== this.reference) {
      if (this.staleReferences.has(frame.transferReference)) return;
      return this.fail("FS_STREAMPACK_RANGE_INVALID");
    }
    // The old route can dispatch queued frames after interruption but before the replacement
    // control handshake. They were never committed and are safely replaced by reconciliation.
    if (this.snapshot.state === "RECONNECTING") return;
    if (!this.record || !this.destination || !block)
      return this.fail("FS_STREAMPACK_RANGE_INVALID");
    this.trace("recv:data:" + frame.payload.byteLength, false);
    if (frame.offset !== block.offset || frame.payload.byteLength > block.remaining)
      return this.fail("FS_STREAMPACK_RANGE_INVALID");
    try {
      const destinationWriteStartedAt = performance.now();
      const layout = new StreamPackLayout(this.record.streamPack.manifest);
      for (const range of layout.ranges(frame.offset, frame.payload.byteLength)) {
        const relative = range.streamOffset - frame.offset;
        await this.destination.writeRange(
          range.fileId,
          range.fileOffset,
          frame.payload.subarray(relative, relative + range.length)
        );
        // A queued frame from the old DataChannel may finish a destination write after recovery
        // has reset its block state. The resent uncommitted block is authoritative instead.
        if (epoch !== this.transportEpoch || this.block !== block) return;
      }
      block.hash.update(frame.payload);
      block.offset += frame.payload.byteLength;
      block.remaining -= frame.payload.byteLength;
      const rates = this.rate.record(frame.payload.byteLength);
      const destinationRates = this.destinationRate.recordWork(
        frame.payload.byteLength,
        destinationWriteStartedAt
      );
      this.snapshot = {
        ...this.snapshot,
        bytesTransferred: this.snapshot.bytesTransferred + frame.payload.byteLength,
        frameCount: this.snapshot.frameCount + 1,
        metrics: {
          ...this.snapshot.metrics,
          bytesReceived: this.snapshot.metrics.bytesReceived + frame.payload.byteLength,
          currentThroughputBps: rates.currentBps,
          averageThroughputBps: rates.averageBps,
          peakThroughputBps: rates.peakBps,
          destinationWriteBps: destinationRates.currentBps,
          elapsedMs: this.rate.elapsed(),
          frameCount: this.snapshot.metrics.frameCount + 1
        }
      };
      if (block.remaining) {
        this.publishMetrics();
        return;
      }
      const expected = this.expected;
      if (!expected || !verifyBlock(expected.digest, block.hash.digestHex())) {
        this.snapshot = {
          ...this.snapshot,
          integrity: {
            ...this.snapshot.integrity,
            integrityMismatchCount: this.snapshot.integrity.integrityMismatchCount + 1
          }
        };
        this.send({
          type: "STREAMPACK_BLOCK_NACK",
          protocolVersion: m6StreamPackProtocolVersion,
          transferId: this.record.transferId,
          manifestIdentity: this.record.manifestIdentity,
          blockIndex: block.index,
          reason: "INTEGRITY_MISMATCH"
        });
      } else {
        this.record = markVerifiedBlockCommitted(
          this.record,
          block.index,
          expected.digest
        ) as M6Record;
        await this.options!.recoveryStore.save(this.record);
        const committedSnapshot = this.makeSnapshot(
          "RECEIVING",
          this.record,
          this.snapshot.bytesTransferred
        );
        this.snapshot = {
          ...committedSnapshot,
          frameCount: this.snapshot.frameCount,
          metrics: {
            ...committedSnapshot.metrics,
            bytesReceived: this.snapshot.metrics.bytesReceived,
            frameCount: this.snapshot.metrics.frameCount
          },
          integrity: {
            ...committedSnapshot.integrity,
            integrityMismatchCount: this.snapshot.integrity.integrityMismatchCount
          }
        };
        this.send({
          type: "STREAMPACK_BLOCK_COMMITTED",
          protocolVersion: m6StreamPackProtocolVersion,
          transferId: this.record.transferId,
          manifestIdentity: this.record.manifestIdentity,
          blockIndex: block.index
        });
      }
      this.expected = undefined;
      this.block = undefined;
      this.publish();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "FS_STREAMPACK_RECONSTRUCTION_FAILED");
    }
  }

  private receiveOffer(message: Offer): void {
    // A reconnect carries the stable transfer identity. Retain the verified
    // checkpoint and manifest context; only uncommitted in-flight state resets.
    if (
      this.record &&
      this.record.transferId === message.transferId &&
      this.record.manifestIdentity === message.manifestIdentity &&
      this.record.protocolVersion === m6StreamPackProtocolVersion
    ) {
      this.rememberStaleReference(this.reference);
      this.reference = message.transferReference;
      this.offerMessage = message;
      this.expected = undefined;
      this.block = undefined;
      this.snapshot = this.makeSnapshot(
        "RECONNECTING",
        this.record,
        this.snapshot.bytesTransferred
      );
      this.publish();
      if (this.options) this.acceptOffer();
      return;
    }
    this.rememberStaleReference(this.reference);
    this.reference = message.transferReference;
    this.offerMessage = message;
    this.record = {
      ...createRecoveryRecord({
        transferId: message.transferId,
        protocolVersion: m6StreamPackProtocolVersion,
        manifestIdentity: message.manifestIdentity,
        sourceIdentity: message.sourceIdentity,
        destinationIdentity: this.options?.destinationIdentity ?? null,
        totalBytes: message.totalBytes,
        blockBytes: message.resumeBlockBytes
      }),
      streamPack: { schemaVersion: 1, manifest: undefined as unknown as StreamPackManifest }
    };
    this.snapshot = {
      ...initialTransferSnapshot,
      protocolVersion: m6StreamPackProtocolVersion,
      transferId: message.transferId,
      name: "StreamPack folder",
      state: "READY",
      bytesTotal: message.totalBytes,
      blocksMissing: message.blockCount,
      metrics: { ...initialTransferMetrics, bytesTotal: message.totalBytes },
      tuning: this.tuning
    };
    this.publish();
    if (this.options) this.acceptOffer();
  }
  private acceptOffer(): void {
    if (!this.record) return;
    this.send({
      type: "STREAMPACK_ACCEPT",
      protocolVersion: m6StreamPackProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity
    });
  }
  private sendManifest(): void {
    if (!this.record) return;
    const entries = this.record.streamPack.manifest.entries;
    this.send({
      type: "STREAMPACK_MANIFEST_BEGIN",
      protocolVersion: m6StreamPackProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity,
      entryCount: entries.length,
      totalBytes: this.record.totalBytes,
      resumeBlockBytes: 8 * 1024 * 1024,
      blockCount: this.record.blockCount
    });
    const chunks: StreamPackManifest["entries"][] = [];
    let current: StreamPackManifest["entries"] = [];
    for (const entry of entries) {
      const candidate = [...current, entry];
      if (
        current.length &&
        (candidate.length > 128 || JSON.stringify(candidate).length > 12 * 1024)
      ) {
        chunks.push(current);
        current = [];
      }
      current = [...current, entry];
    }
    if (current.length) chunks.push(current);
    for (let index = 0; index < chunks.length; index += 1)
      this.send({
        type: "STREAMPACK_MANIFEST_CHUNK",
        protocolVersion: m6StreamPackProtocolVersion,
        transferId: this.record.transferId,
        manifestIdentity: this.record.manifestIdentity,
        chunkIndex: index,
        entries: chunks[index]! as never
      });
    this.send({
      type: "STREAMPACK_MANIFEST_END",
      protocolVersion: m6StreamPackProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity,
      chunkCount: chunks.length
    });
  }
  private manifestBegin(
    message: Extract<M6StreamPackControlMessage, { type: "STREAMPACK_MANIFEST_BEGIN" }>
  ): void {
    if (
      !this.record ||
      message.entryCount !== this.offerMessage?.entryCount ||
      message.totalBytes !== this.record.totalBytes ||
      message.blockCount !== this.record.blockCount
    )
      return this.fail("FS_STREAMPACK_MANIFEST_INVALID");
    this.entries = [];
    this.chunkIndex = 0;
    this.chunks = 0;
  }
  private manifestChunk(
    message: Extract<M6StreamPackControlMessage, { type: "STREAMPACK_MANIFEST_CHUNK" }>
  ): void {
    if (
      message.chunkIndex !== this.chunkIndex++ ||
      this.entries.length + message.entries.length > 100_000
    )
      return this.fail("FS_STREAMPACK_MANIFEST_INVALID");
    this.entries = [...this.entries, ...message.entries];
    this.chunks += 1;
  }
  private async manifestEnd(
    message: Extract<M6StreamPackControlMessage, { type: "STREAMPACK_MANIFEST_END" }>
  ): Promise<void> {
    if (
      !this.record ||
      !this.options ||
      !this.destination ||
      message.chunkCount !== this.chunks ||
      this.entries.length !== this.offerMessage?.entryCount
    )
      return this.fail("FS_STREAMPACK_MANIFEST_INVALID");
    try {
      const manifest = validateStreamPackManifest({
        schemaVersion: 1,
        integrityAlgorithm: "SHA256",
        integrityManifestVersion: 1,
        rootSemantics: "RECREATE_SELECTED_ROOT",
        entries: this.entries,
        totalBytes: this.record.totalBytes,
        blockBytes: this.record.blockBytes,
        blockCount: this.record.blockCount
      });
      if (streamPackSourceIdentity(manifest) !== this.record.sourceIdentity)
        return this.fail("FS_STREAMPACK_MANIFEST_INVALID");
      const existing = await this.options.recoveryStore.load(this.record.transferId);
      if (
        existing &&
        (existing.protocolVersion !== m6StreamPackProtocolVersion ||
          !verified(existing) ||
          existing.destinationIdentity !== this.options.destinationIdentity ||
          existing.sourceIdentity !== this.record.sourceIdentity ||
          (existing as M6Record).streamPack?.schemaVersion !== 1)
      )
        return this.fail("FS_STREAMPACK_DESTINATION_CHANGED");
      this.record = (existing as M6Record | undefined) ?? {
        ...this.record,
        streamPack: { schemaVersion: 1, manifest }
      };
      if (!existing) await this.options.recoveryStore.save(this.record);
      await this.destination.prepare(manifest);
      if (existing) {
        if (!this.destination.validateVerifiedRecovery)
          return this.fail("FS_STREAMPACK_DESTINATION_CHANGED");
        await this.destination.validateVerifiedRecovery(manifest, this.record);
      }
      const recoveredPages = pages(this.record);
      for (let page = 0; page < recoveredPages.length; page += 1)
        this.send({
          type: "STREAMPACK_HAVE_VERIFIED_BLOCKS",
          protocolVersion: m6StreamPackProtocolVersion,
          transferId: this.record.transferId,
          manifestIdentity: this.record.manifestIdentity,
          totalBytes: this.record.totalBytes,
          resumeBlockBytes: 8 * 1024 * 1024,
          blockCount: this.record.blockCount,
          page,
          hasMore: page < recoveredPages.length - 1,
          committedBlockRanges: recoveredPages[page]!.map(
            ([start, end]) => [start, end] as [number, number]
          )
        });
      this.snapshot = this.makeSnapshot("RECEIVING", this.record);
      this.rate.start();
      this.destinationRate.start();
      this.publish();
      this.send({
        type: "STREAMPACK_READY",
        protocolVersion: m6StreamPackProtocolVersion,
        transferId: this.record.transferId,
        manifestIdentity: this.record.manifestIdentity
      });
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "FS_STREAMPACK_MANIFEST_INVALID");
    }
  }
  private async sendMissing(): Promise<void> {
    if (!this.source || !this.record || this.sending) return;
    const epoch = this.transportEpoch;
    this.sending = true;
    this.sendingEpoch = epoch;
    this.rate.start();
    this.sourceRate.start();
    try {
      await this.source.assertUnchanged();
      const completed = new Set<number>();
      for (const page of this.have)
        for (const [start, end] of page.committedBlockRanges)
          for (let index = start; index < end; index += 1) completed.add(index);
      const missing = Array.from({ length: this.record.blockCount }, (_, index) => index).filter(
        (index) => !completed.has(index)
      );
      const remainingBytes = missing.reduce((total, index) => {
        const [start, end] = blockByteRange(
          index,
          this.record!.totalBytes,
          this.record!.blockBytes
        );
        return total + end - start;
      }, 0);
      const missingSet = new Set(missing);
      const ambiguousInflightBytesRetransmitted = this.interruptedInflight.reduce(
        (total, candidate) =>
          missingSet.has(candidate.blockIndex) ? total + candidate.sentBytes : total,
        0
      );
      this.interruptedInflight = [];
      this.snapshot = {
        ...this.makeSnapshot("SENDING", this.record),
        blocksMissing: missing.length,
        reconnectCount: this.snapshot.reconnectCount,
        continuity: {
          ...this.snapshot.continuity,
          safeBytesBeforeDisconnect: this.record.totalBytes - remainingBytes,
          remainingBytesAtResume: remainingBytes,
          duplicateRetransmittedBytes: 0,
          committedBlocksRetransmitted: 0,
          ambiguousInflightBytesRetransmitted:
            this.snapshot.continuity.ambiguousInflightBytesRetransmitted +
            ambiguousInflightBytesRetransmitted
        },
        recoveryReconciliationMs:
          this.reconciliationStartedAt === undefined
            ? null
            : Math.max(performance.now() - this.reconciliationStartedAt, 0)
      };
      this.publish();
      for (const index of missing) {
        let attempts = 0;
        while (true) {
          // A source change after earlier blocks commit must fail rather than
          // silently mixing two directory versions in one manifest.
          if (epoch !== this.transportEpoch) throw new Error("TRANSPORT_INTERRUPTED");
          await this.source.assertUnchanged();
          if ((await this.sendBlock(index, epoch)) === "committed") break;
          if (epoch !== this.transportEpoch) throw new Error("TRANSPORT_INTERRUPTED");
          attempts += 1;
          if (attempts > 3) return this.fail("FS_BLOCK_INTEGRITY_FAILED");
          this.snapshot = {
            ...this.snapshot,
            integrity: {
              ...this.snapshot.integrity,
              integrityRetryCount: this.snapshot.integrity.integrityRetryCount + 1
            }
          };
        }
      }
      this.send({
        type: "STREAMPACK_BYTES_COMPLETE",
        protocolVersion: m6StreamPackProtocolVersion,
        transferId: this.record.transferId,
        manifestIdentity: this.record.manifestIdentity
      });
      this.send({
        type: "STREAMPACK_MANIFEST_ROOT",
        protocolVersion: m6StreamPackProtocolVersion,
        transferId: this.record.transferId,
        manifestIdentity: this.record.manifestIdentity,
        root: await this.root()
      });
    } catch (error) {
      const interrupted =
        (error instanceof Error && error.message === "TRANSPORT_INTERRUPTED") ||
        this.snapshot.state === "RECONNECTING";
      // A read issued on an obsolete route can resolve after reconciliation has already begun.
      // It must not interrupt the replacement transport or emit a stale control message.
      if (interrupted && epoch === this.transportEpoch) this.transportInterrupted();
      else if (!interrupted)
        this.fail(error instanceof Error ? error.message : "FS_STREAMPACK_SOURCE_CHANGED");
    } finally {
      if (this.sendingEpoch === epoch) {
        this.sending = false;
        this.sendingEpoch = undefined;
      }
    }
  }
  private beginBlock(message: Digest): void {
    if (
      !this.record ||
      this.block ||
      message.blockIndex < 0 ||
      message.blockIndex >= this.record.blockCount
    )
      return this.fail("FS_STREAMPACK_RANGE_INVALID");
    const [start, end] = blockByteRange(
      message.blockIndex,
      this.record.totalBytes,
      this.record.blockBytes
    );
    if (message.byteOffset !== start || message.byteLength !== end - start)
      return this.fail("FS_STREAMPACK_RANGE_INVALID");
    this.expected = message;
    this.block = {
      index: message.blockIndex,
      offset: start,
      remaining: end - start,
      hash: createStreamingSha256()
    };
    this.send({
      type: "STREAMPACK_BLOCK_READY",
      protocolVersion: m6StreamPackProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity,
      blockIndex: message.blockIndex
    });
  }
  private async sendBlock(index: number, epoch: number): Promise<"committed" | "nack"> {
    if (!this.source || !this.record) throw new Error("FS_STREAMPACK_MANIFEST_INVALID");
    const [start, end] = blockByteRange(index, this.record.totalBytes, this.record.blockBytes);
    const sourceReadStartedAt = performance.now();
    const payload = await this.source.read(start, end - start);
    if (epoch !== this.transportEpoch) throw new Error("TRANSPORT_INTERRUPTED");
    const sourceRates = this.sourceRate.recordWork(payload.byteLength, sourceReadStartedAt);
    this.snapshot = {
      ...this.snapshot,
      metrics: { ...this.snapshot.metrics, sourceReadBps: sourceRates.currentBps }
    };
    const digest = digestBlock(payload);
    this.senderDigests.set(index, digest);
    // Register the waiter before sending so a fast peer cannot reply before it exists.
    let readyWaiter: { index: number; resolve: () => void } | undefined;
    const ready = new Promise<void>((resolve) => {
      readyWaiter = { index, resolve };
      this.ready = readyWaiter;
    });
    this.send({
      type: "STREAMPACK_BLOCK_DIGEST",
      protocolVersion: m6StreamPackProtocolVersion,
      transferId: this.record.transferId,
      manifestIdentity: this.record.manifestIdentity,
      blockIndex: index,
      byteOffset: start,
      byteLength: payload.byteLength,
      digest
    });
    await ready.finally(() => {
      if (this.ready === readyWaiter) this.ready = undefined;
    });
    if (epoch !== this.transportEpoch) throw new Error("TRANSPORT_INTERRUPTED");
    // A receiver may commit immediately after the final frame, so install this
    // waiter before emitting payload rather than after the send loop.
    let committedWaiter:
      { index: number; resolve: (result: "committed" | "nack") => void } | undefined;
    const committed = new Promise<"committed" | "nack">((resolve) => {
      committedWaiter = { index, resolve };
      this.committed = committedWaiter;
    });
    const activeSend = { blockIndex: index, sentBytes: 0, captured: false };
    this.activeSend = activeSend;
    try {
      for (
        let offset = 0;
        offset < payload.byteLength;
        offset += Math.min(64 * 1024, this.transport.maximumDataMessageBytes - 20)
      ) {
        const length = Math.min(
          64 * 1024,
          this.transport.maximumDataMessageBytes - 20,
          payload.byteLength - offset
        );
        await this.transport.waitForBufferedAmountLow(
          this.tuning.sendHighWaterBytes,
          this.tuning.sendLowWaterBytes
        );
        if (epoch !== this.transportEpoch) throw new Error("TRANSPORT_INTERRUPTED");
        const payloadSlice = payload.subarray(offset, offset + length);
        const framePayload = this.consumePayloadFault(index, offset)
          ? payloadSlice.slice()
          : payloadSlice;
        if (framePayload !== payloadSlice) framePayload[0] = framePayload[0]! ^ 1;
        if (
          !this.transport.sendData(
            encodeDataFrame({
              protocolVersion: m6StreamPackProtocolVersion,
              transferReference: this.reference,
              offset: start + offset,
              payload: framePayload
            })
          )
        )
          throw new Error("TRANSPORT_INTERRUPTED");
        activeSend.sentBytes += length;
        const rates = this.rate.record(length);
        this.snapshot = {
          ...this.snapshot,
          bytesTransferred: this.snapshot.bytesTransferred + length,
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
            frameCount: this.snapshot.metrics.frameCount + 1
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
      return await committed;
    } catch (error) {
      this.captureActiveSend(activeSend);
      throw error;
    } finally {
      if (this.activeSend === activeSend) this.activeSend = undefined;
      if (this.committed === committedWaiter) this.committed = undefined;
    }
  }
  private async verifyRoot(root: string): Promise<void> {
    if (
      !this.record ||
      !this.destination ||
      missingBlockIndexes(this.record).length ||
      !verified(this.record)
    )
      return this.fail("FS_MANIFEST_INVALID");
    if (!verifyBlock(root, await this.root())) return this.fail("FS_MANIFEST_INTEGRITY_FAILED");
    try {
      await this.destination.close();
      this.snapshot = {
        ...this.snapshot,
        state: "DELIVERED",
        integrity: { ...this.snapshot.integrity, manifestRootMatch: true },
        streamPack: {
          ...this.snapshot.streamPack!,
          peakOpenDestinationHandles: this.destination.peakOpenDestinationHandles
        }
      };
      this.publish();
      this.send({
        type: "STREAMPACK_MANIFEST_VERIFIED",
        protocolVersion: m6StreamPackProtocolVersion,
        transferId: this.record.transferId,
        manifestIdentity: this.record.manifestIdentity,
        root
      });
      this.send({
        type: "STREAMPACK_DELIVERED",
        protocolVersion: m6StreamPackProtocolVersion,
        transferId: this.record.transferId,
        manifestIdentity: this.record.manifestIdentity
      });
    } catch {
      this.fail("DESTINATION_FINALIZATION_FAILED");
    }
  }
  private async root(): Promise<string> {
    if (!this.record) throw new Error("FS_MANIFEST_INVALID");
    const digests: string[] = [];
    for (let index = 0; index < this.record.blockCount; index += 1) {
      let digest = this.senderDigests.get(index) ?? getVerifiedBlockDigest(this.record, index);
      if (!digest && this.source) {
        const [start, end] = blockByteRange(index, this.record.totalBytes, this.record.blockBytes);
        digest = digestBlock(await this.source.read(start, end - start));
      }
      if (!digest) throw new Error("FS_INTEGRITY_STATE_INVALID");
      digests.push(digest);
    }
    return buildStreamPackManifestRoot({
      manifest: this.record.streamPack.manifest,
      blockDigests: digests
    });
  }

  /** A receiver commit is authoritative verified progress for the sender's product snapshot. */
  private recordCommitted(blockIndex: number): void {
    if (!this.record || missingBlockIndexes(this.record).includes(blockIndex) === false) return;
    const digest = this.senderDigests.get(blockIndex);
    if (!digest) return this.fail("FS_INTEGRITY_STATE_INVALID");
    this.record = markVerifiedBlockCommitted(this.record, blockIndex, digest) as M6Record;
    const [start, end] = blockByteRange(blockIndex, this.record.totalBytes, this.record.blockBytes);
    const committed = this.record.blockCount - missingBlockIndexes(this.record).length;
    this.snapshot = {
      ...this.snapshot,
      safeBytes: this.snapshot.safeBytes + end - start,
      blocksCommitted: committed,
      blocksMissing: this.record.blockCount - committed,
      integrity: {
        ...this.snapshot.integrity,
        blocksVerifiedReceiver: committed,
        verifiedBytes: this.snapshot.safeBytes + end - start
      }
    };
    this.publish();
  }

  private makeSnapshot(
    state: TransferSnapshot["state"],
    record: M6Record,
    transferred = 0
  ): TransferSnapshot {
    const manifest = record.streamPack.manifest;
    const files = manifest.entries.filter((entry) => entry.type === "FILE").length;
    const dirs = manifest.entries.length - files;
    const missing = missingBlockIndexes(record);
    const safeBytes =
      record.totalBytes -
      missing.reduce((total, index) => {
        const [start, end] = blockByteRange(index, record.totalBytes, record.blockBytes);
        return total + end - start;
      }, 0);
    return {
      ...initialTransferSnapshot,
      protocolVersion: m6StreamPackProtocolVersion,
      transferId: record.transferId,
      name: "StreamPack folder",
      state,
      bytesTotal: record.totalBytes,
      bytesTransferred: transferred,
      safeBytes,
      blocksCommitted: record.blockCount - missing.length,
      blocksMissing: missing.length,
      reconnectCount: this.snapshot.reconnectCount,
      recoveryReconciliationMs: this.snapshot.recoveryReconciliationMs,
      continuity: { ...this.snapshot.continuity },
      frameCount: this.snapshot.frameCount,
      integrity: {
        ...initialTransferSnapshot.integrity,
        algorithm: "SHA256",
        blocksHashedSender: this.snapshot.integrity.blocksHashedSender,
        blocksVerifiedReceiver: record.blockCount - missing.length,
        integrityMismatchCount: this.snapshot.integrity.integrityMismatchCount,
        integrityRetryCount: this.snapshot.integrity.integrityRetryCount,
        hashBytesProcessed: this.snapshot.integrity.hashBytesProcessed,
        senderHashingMs: this.snapshot.integrity.senderHashingMs,
        receiverHashingMs: this.snapshot.integrity.receiverHashingMs,
        manifestRootMatch: this.snapshot.integrity.manifestRootMatch,
        verifiedBytes: safeBytes
      },
      metrics: {
        ...this.snapshot.metrics,
        bytesTotal: record.totalBytes,
        bytesSent: this.snapshot.metrics.bytesSent,
        bytesReceived: this.snapshot.metrics.bytesReceived,
        frameCount: this.snapshot.metrics.frameCount
      },
      tuning: this.tuning,
      streamPack: {
        filesTotal: files,
        directoriesTotal: dirs,
        filesComplete: 0,
        directoriesCreated: dirs,
        manifestEntries: manifest.entries.length,
        manifestBytes: JSON.stringify(manifest).length,
        peakOpenDestinationHandles: this.destination?.peakOpenDestinationHandles ?? 0,
        protocolTrace: this.protocolTrace
      }
    };
  }
  private send(message: M6StreamPackControlMessage): void {
    this.trace("send:" + message.type);
    if (!this.transport.sendControl(JSON.stringify(message))) this.transportInterrupted();
  }
  private trace(stage: string, shouldPublish = true): void {
    this.protocolTrace = [...this.protocolTrace, stage].slice(-40);
    if (!this.snapshot.streamPack) return;
    this.snapshot = {
      ...this.snapshot,
      streamPack: { ...this.snapshot.streamPack, protocolTrace: this.protocolTrace }
    };
    if (shouldPublish) this.publish();
  }
  private consumePayloadFault(blockIndex: number, offset: number): boolean {
    if (offset !== 0 || this.fault?.kind !== "payload") return false;
    if (this.fault.blockIndex !== undefined && this.fault.blockIndex !== blockIndex) return false;
    if (this.fault.mode === "once" && this.faultUses > 0) return false;
    this.faultUses += 1;
    return true;
  }
  private nextReference(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0]! || 1;
  }
  private rememberStaleReference(reference: number): void {
    if (!reference) return;
    this.staleReferences.add(reference);
    while (this.staleReferences.size > 8)
      this.staleReferences.delete(this.staleReferences.values().next().value!);
  }
  private captureActiveSend(
    activeSend: { blockIndex: number; sentBytes: number; captured: boolean } | undefined = this
      .activeSend
  ): void {
    if (!activeSend?.sentBytes || activeSend.captured) return;
    activeSend.captured = true;
    this.interruptedInflight.push({
      blockIndex: activeSend.blockIndex,
      sentBytes: activeSend.sentBytes
    });
  }
  private fail(code: string): void {
    if (
      this.snapshot.state === "FAILED" ||
      this.snapshot.state === "CANCELLED" ||
      this.snapshot.state === "INTEGRITY_FAILED"
    )
      return;
    this.cancelled = true;
    this.snapshot = {
      ...this.snapshot,
      state: code.includes("INTEGRITY") ? "INTEGRITY_FAILED" : "FAILED",
      error: code
    };
    this.publish();
    if (this.record)
      this.transport.sendControl(
        JSON.stringify({
          type: "STREAMPACK_FAIL",
          protocolVersion: m6StreamPackProtocolVersion,
          transferId: this.record.transferId,
          manifestIdentity: this.record.manifestIdentity,
          code
        })
      );
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
