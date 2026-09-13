import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import type { RecoveryRecord, RecoveryStore } from "@flicksend/resume";
import {
  TransferHealthAnalyzer,
  type RawTransferMetrics,
  type TransferHealthSnapshot
} from "@flicksend/transfer-health";
import { M5IntegritySingleFileTransfer } from "../src/m5-integrity-transfer.js";
import type { TransferSnapshot, TransferTransport } from "../src/transfer.js";

const MiB = 1024 * 1024;
const logicalBlockBytes = 8 * MiB;
const fixtureBytes = logicalBlockBytes * 4;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const evidenceDirectory = resolve(root, "test-results/m8-evidence");

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function waitFor(condition: () => boolean, timeoutMs = 45_000): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (condition()) return resolvePromise();
      if (Date.now() >= deadline) return reject(new Error("Timed out waiting for M8 M5 transfer."));
      setTimeout(check, 10);
    };
    check();
  });
}

class TestDestination implements RandomAccessFileDestination {
  readonly bytes = new Uint8Array(fixtureBytes);
  closed = false;

  constructor(private readonly writeDelayMs = 0) {}

  async write(): Promise<void> {}

  async writeAt(offset: number, chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    if (this.writeDelayMs) await sleep(this.writeDelayMs);
    this.bytes.set(chunk, offset);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async abort(): Promise<void> {}

  matches(fixture: Uint8Array): boolean {
    return this.bytes.every((value, index) => value === fixture[index]);
  }
}

class PacedTransport implements TransferTransport {
  peer?: M5IntegritySingleFileTransfer;
  private currentBufferedAmount = 0;
  readonly maximumDataMessageBytes = 64 * 1024 + 20;

  constructor(
    private readonly sendWaitMs = 0,
    private readonly highWaterBytes = 512 * 1024
  ) {}

  get bufferedAmount(): number {
    return this.currentBufferedAmount;
  }

  sendControl(raw: string): boolean {
    queueMicrotask(() => void this.peer?.handleControl(raw));
    return true;
  }

  sendData(frame: ArrayBuffer): boolean {
    this.currentBufferedAmount = this.sendWaitMs ? this.highWaterBytes : 0;
    queueMicrotask(() => void this.peer?.handleData(frame));
    return true;
  }

  async waitForBufferedAmountLow(): Promise<number> {
    if (!this.sendWaitMs) return 0;
    const startedAt = performance.now();
    await sleep(this.sendWaitMs);
    this.currentBufferedAmount = 0;
    return performance.now() - startedAt;
  }
}

function recoveryStore(): RecoveryStore {
  const records = new Map<string, RecoveryRecord>();
  return {
    load: async (transferId) => records.get(transferId) ?? null,
    save: async (record) => void records.set(record.transferId, record),
    remove: async (transferId) => void records.delete(transferId)
  };
}

function source(fixture: Uint8Array, readDelayMs: number): FileSource {
  return {
    name: "m8-qualification.bin",
    size: fixture.byteLength,
    type: "application/octet-stream",
    sourceIdentity: "m8-qualification-fixture-v1",
    read: async (offset, length) => {
      if (readDelayMs) await sleep(readDelayMs);
      return fixture.slice(offset, offset + length).buffer;
    }
  };
}

type M5Pair = {
  sender: M5IntegritySingleFileTransfer;
  receiver: M5IntegritySingleFileTransfer;
  senderTransport: PacedTransport;
  senderSnapshots: TransferSnapshot[];
  receiverSnapshots: TransferSnapshot[];
};

function m5Pair(sendWaitMs: number): M5Pair {
  const senderSnapshots: TransferSnapshot[] = [];
  const receiverSnapshots: TransferSnapshot[] = [];
  const senderTransport = new PacedTransport(sendWaitMs);
  const receiverTransport = new PacedTransport();
  const tuning = {
    framePayloadBytes: 64 * 1024,
    sendHighWaterBytes: 512 * 1024,
    sendLowWaterBytes: 0,
    readAheadBytes: 64 * 1024,
    writeBatchBytes: 64 * 1024,
    receiveWindowBytes: 8 * MiB,
    channelCount: 1,
    workerMode: "main-thread" as const,
    uiSnapshotIntervalMs: 25,
    throughputWindowMs: 1_000
  };
  const sender = new M5IntegritySingleFileTransfer(
    senderTransport,
    (snapshot) => senderSnapshots.push(snapshot),
    tuning
  );
  const receiver = new M5IntegritySingleFileTransfer(
    receiverTransport,
    (snapshot) => receiverSnapshots.push(snapshot),
    tuning
  );
  senderTransport.peer = receiver;
  receiverTransport.peer = sender;
  return { sender, receiver, senderTransport, senderSnapshots, receiverSnapshots };
}

function observedRaw(pair: M5Pair): RawTransferMetrics | null {
  const sender = pair.senderSnapshots.at(-1);
  const receiver = pair.receiverSnapshots.at(-1);
  if (!sender?.transferId || !receiver) return null;
  const observed = (value: number): number | null => (value > 0 ? value : null);
  return {
    timestampMs: performance.now(),
    transferId: sender.transferId,
    transferState: receiver.state,
    routeType: "DIRECT",
    routeDetail: "TEST_PACED_TRANSPORT",
    routeGeneration: 1,
    routeChangeCount: 0,
    applicationPayloadBytes: receiver.bytesTransferred,
    totalBytes: receiver.bytesTotal,
    sourceReadBps: observed(sender.metrics.sourceReadBps),
    destinationWriteBps: observed(receiver.metrics.destinationWriteBps),
    senderBufferedAmountBytes: pair.senderTransport.bufferedAmount,
    receiveQueueBytes: receiver.metrics.receiveQueueBytes,
    rttMs: null,
    availableOutgoingBitrateBps: null,
    webRtcBytesSent: sender.metrics.bytesSent,
    webRtcBytesReceived: receiver.metrics.bytesReceived,
    safeBytes: receiver.safeBytes,
    routeRecoveryCount: sender.reconnectCount,
    integrityRetryCount: sender.integrity.integrityRetryCount,
    senderHighWaterBytes: sender.tuning.sendHighWaterBytes,
    receiveQueueLimitBytes: receiver.tuning.receiveWindowBytes
  };
}

async function writeEvidence(name: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(resolve(evidenceDirectory, name), JSON.stringify(value, null, 2) + "\n");
}

async function qualifyPacedM5(options: {
  name: string;
  expectedBottleneck:
    "LIKELY_SOURCE_READ_LIMIT" | "LIKELY_DESTINATION_WRITE_LIMIT" | "LIKELY_NETWORK_LIMIT";
  sourceReadDelayMs?: number;
  destinationWriteDelayMs?: number;
  sendWaitMs?: number;
}): Promise<{
  snapshots: TransferHealthSnapshot[];
  proof: ReturnType<TransferHealthAnalyzer["finalize"]>;
  maxReceiveQueueBytes: number;
  maxBufferedAmountBytes: number;
}> {
  const fixture = Uint8Array.from({ length: fixtureBytes }, (_, index) => index % 251);
  const pair = m5Pair(options.sendWaitMs ?? 0);
  const destination = new TestDestination(options.destinationWriteDelayMs ?? 0);
  const analyzer = new TransferHealthAnalyzer({
    currentWindowMs: 1_000,
    rollingWindowMs: 2_000,
    warmupMs: 250,
    minimumObservedBytes: MiB,
    hysteresisSamples: 1,
    stallThresholdMs: 10_000
  });
  const snapshots: TransferHealthSnapshot[] = [];
  let maxReceiveQueueBytes = 0;
  let maxBufferedAmountBytes = 0;
  const sample = () => {
    const raw = observedRaw(pair);
    if (!raw) return;
    maxReceiveQueueBytes = Math.max(maxReceiveQueueBytes, raw.receiveQueueBytes ?? 0);
    maxBufferedAmountBytes = Math.max(maxBufferedAmountBytes, raw.senderBufferedAmountBytes ?? 0);
    snapshots.push(analyzer.observe(raw));
  };

  pair.sender.select(source(fixture, options.sourceReadDelayMs ?? 0));
  pair.sender.offer();
  await waitFor(() => pair.receiverSnapshots.at(-1)?.state === "READY");
  await pair.receiver.accept({
    destination,
    recoveryStore: recoveryStore(),
    destinationIdentity: "m8-qualification-destination-v1"
  });
  const sampler = setInterval(sample, 25);
  sample();
  try {
    await waitFor(
      () =>
        pair.senderSnapshots.at(-1)?.state === "DELIVERED" &&
        pair.receiverSnapshots.at(-1)?.state === "DELIVERED"
    );
  } finally {
    clearInterval(sampler);
  }
  sample();

  const senderFinal = pair.senderSnapshots.at(-1)!;
  const receiverFinal = pair.receiverSnapshots.at(-1)!;
  const matching = snapshots.filter(
    (snapshot) => snapshot.bottleneck === options.expectedBottleneck
  );
  expect(matching.length).toBeGreaterThan(0);
  expect(senderFinal.state).toBe("DELIVERED");
  expect(receiverFinal.state).toBe("DELIVERED");
  expect(receiverFinal.integrity.manifestRootMatch).toBe(true);
  expect(destination.closed).toBe(true);
  expect(destination.matches(fixture)).toBe(true);

  const proof = analyzer.finalize();
  expect(proof.dominantBottleneck).toBe(options.expectedBottleneck);
  await writeEvidence(options.name, {
    schemaVersion: 1,
    milestone: "M8",
    scenario: options.expectedBottleneck,
    evidenceMode:
      "Real M5 engine transfer with deterministic test-only source, destination, or transport pacing.",
    createdAt: new Date().toISOString(),
    adapterPacing: {
      sourceReadDelayMs: options.sourceReadDelayMs ?? 0,
      destinationWriteDelayMs: options.destinationWriteDelayMs ?? 0,
      sendWaitMs: options.sendWaitMs ?? 0
    },
    result: {
      delivered: senderFinal.state === "DELIVERED" && receiverFinal.state === "DELIVERED",
      transferIdStable: senderFinal.transferId === receiverFinal.transferId,
      manifestRootVerified: receiverFinal.integrity.manifestRootMatch,
      fixtureMatch: destination.matches(fixture),
      integrityRetryCount: senderFinal.integrity.integrityRetryCount,
      maxReceiveQueueBytes,
      maxBufferedAmountBytes,
      observedDiagnosis: matching.at(-1),
      speedProof: proof
    }
  });
  return { snapshots, proof, maxReceiveQueueBytes, maxBufferedAmountBytes };
}

describe("M8 real M5 paced qualification", () => {
  it("proves a paced source read can be identified without weakening M5 integrity", async () => {
    const result = await qualifyPacedM5({
      name: "m8-paced-source-limit.json",
      expectedBottleneck: "LIKELY_SOURCE_READ_LIMIT",
      sourceReadDelayMs: 600
    });
    expect(result.maxBufferedAmountBytes).toBe(0);
  }, 45_000);

  it("proves a paced destination writer creates actual bounded receive pressure", async () => {
    const result = await qualifyPacedM5({
      name: "m8-paced-destination-limit.json",
      expectedBottleneck: "LIKELY_DESTINATION_WRITE_LIMIT",
      destinationWriteDelayMs: 10
    });
    expect(result.maxReceiveQueueBytes).toBeGreaterThanOrEqual(logicalBlockBytes * 0.8);
  }, 45_000);

  it("proves deterministic transport backpressure can be identified with local work headroom", async () => {
    const result = await qualifyPacedM5({
      name: "m8-paced-network-limit.json",
      expectedBottleneck: "LIKELY_NETWORK_LIMIT",
      sendWaitMs: 8
    });
    expect(result.maxBufferedAmountBytes).toBeGreaterThan(0);
  }, 45_000);

  it("retains ambiguous and insufficient measurements without inventing a bottleneck", async () => {
    const analyzer = new TransferHealthAnalyzer({ warmupMs: 1_000, hysteresisSamples: 1 });
    let snapshot = analyzer.current();
    for (let index = 0; index < 4; index += 1) {
      snapshot = analyzer.observe({
        timestampMs: index * 250,
        transferId: "fs_tr_m8_unknown",
        transferState: "SENDING",
        routeType: "UNKNOWN",
        routeDetail: "UNKNOWN",
        routeGeneration: 0,
        routeChangeCount: 0,
        applicationPayloadBytes: index * 32 * 1024,
        totalBytes: MiB,
        sourceReadBps: null,
        destinationWriteBps: null,
        senderBufferedAmountBytes: null,
        receiveQueueBytes: null,
        rttMs: null,
        availableOutgoingBitrateBps: null,
        webRtcBytesSent: null,
        webRtcBytesReceived: null,
        safeBytes: 0,
        routeRecoveryCount: 0,
        integrityRetryCount: 0,
        senderHighWaterBytes: null,
        receiveQueueLimitBytes: null
      });
    }
    expect(snapshot.bottleneck).toBe("INSUFFICIENT_DATA");
    expect(snapshot.healthState).toBe("STARTING");
    await writeEvidence("m8-unknown-bottleneck.json", {
      schemaVersion: 1,
      milestone: "M8",
      scenario: "ambiguous-insufficient-measurements",
      createdAt: new Date().toISOString(),
      result: snapshot,
      speedProof: analyzer.finalize()
    });
  });
});
