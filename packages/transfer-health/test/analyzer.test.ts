import { describe, expect, it } from "vitest";
import { TransferHealthAnalyzer, type RawTransferMetrics } from "../src/index.js";

const MiB = 1024 * 1024;

function sample(
  timestampMs: number,
  payloadBytes: number,
  update: Partial<RawTransferMetrics> = {}
): RawTransferMetrics {
  return {
    timestampMs,
    transferId: "fs_tr_health_test",
    transferState: "SENDING",
    routeType: "DIRECT",
    routeDetail: "DIRECT_HOST_UDP",
    routeGeneration: 1,
    routeChangeCount: 0,
    applicationPayloadBytes: payloadBytes,
    totalBytes: 128 * MiB,
    sourceReadBps: 40 * MiB,
    destinationWriteBps: 40 * MiB,
    senderBufferedAmountBytes: MiB,
    receiveQueueBytes: MiB,
    rttMs: 12,
    availableOutgoingBitrateBps: 80 * MiB,
    webRtcBytesSent: payloadBytes,
    webRtcBytesReceived: 0,
    safeBytes: 0,
    routeRecoveryCount: 0,
    integrityRetryCount: 0,
    senderHighWaterBytes: 16 * MiB,
    receiveQueueLimitBytes: 16 * MiB,
    ...update
  };
}

function observeSeries(
  analyzer: TransferHealthAnalyzer,
  update: Partial<RawTransferMetrics>
): ReturnType<TransferHealthAnalyzer["current"]> {
  let snapshot = analyzer.current();
  for (let index = 0; index < 9; index += 1)
    snapshot = analyzer.observe(sample(index * 500, index * 5 * MiB, update));
  return snapshot;
}

describe("TransferHealthAnalyzer", () => {
  it("keeps warmup separate from an insufficient-data diagnosis", () => {
    const analyzer = new TransferHealthAnalyzer();
    const snapshot = analyzer.observe(sample(0, 0));

    expect(snapshot.healthState).toBe("STARTING");
    expect(snapshot.bottleneck).toBe("INSUFFICIENT_DATA");
    expect(snapshot.reasons[0]?.code).toBe("WARMUP");
  });

  it("identifies a source-limited transfer when read rate tracks payload and queues drain", () => {
    const snapshot = observeSeries(new TransferHealthAnalyzer(), {
      sourceReadBps: 10 * MiB,
      destinationWriteBps: 40 * MiB,
      availableOutgoingBitrateBps: 80 * MiB,
      senderBufferedAmountBytes: MiB
    });

    expect(snapshot.bottleneck).toBe("LIKELY_SOURCE_READ_LIMIT");
    expect(snapshot.confidence).toBe("HIGH");
    expect(snapshot.healthState).toBe("DEGRADED");
  });

  it("identifies destination pressure only when bounded receive backlog agrees", () => {
    const snapshot = observeSeries(new TransferHealthAnalyzer(), {
      sourceReadBps: 40 * MiB,
      destinationWriteBps: 10 * MiB,
      receiveQueueBytes: 15 * MiB
    });

    expect(snapshot.bottleneck).toBe("LIKELY_DESTINATION_WRITE_LIMIT");
    expect(snapshot.reasons.map((reason) => reason.code)).toContain("RECEIVE_QUEUE_PRESSURE");
  });

  it("identifies network pressure only when local stages have headroom", () => {
    const snapshot = observeSeries(new TransferHealthAnalyzer(), {
      sourceReadBps: 40 * MiB,
      destinationWriteBps: 40 * MiB,
      senderBufferedAmountBytes: 15 * MiB,
      availableOutgoingBitrateBps: 11 * MiB
    });

    expect(snapshot.bottleneck).toBe("LIKELY_NETWORK_LIMIT");
    expect(snapshot.reasons.map((reason) => reason.code)).toContain("BUFFER_PRESSURE");
  });

  it("suppresses bottleneck claims while recovery is active", () => {
    const analyzer = new TransferHealthAnalyzer();
    const snapshot = analyzer.observe(sample(4_000, 20 * MiB, { transferState: "RECONNECTING" }));

    expect(snapshot.healthState).toBe("RECOVERING");
    expect(snapshot.bottleneck).toBe("RECOVERING");
    expect(snapshot.confidence).toBe("HIGH");
  });

  it("retains route segments and resets short-window inference after a route replacement", () => {
    const analyzer = new TransferHealthAnalyzer({ warmupMs: 500, hysteresisSamples: 1 });
    for (let index = 0; index < 4; index += 1)
      analyzer.observe(sample(index * 500, index * 5 * MiB));
    const snapshot = analyzer.observe(
      sample(2_000, 20 * MiB, {
        routeType: "RELAY",
        routeDetail: "RELAY_UDP",
        routeGeneration: 2,
        routeChangeCount: 1
      })
    );

    expect(snapshot.routeHistory).toHaveLength(2);
    expect(snapshot.routeHistory[0]?.endedAtMs).toBe(2_000);
    expect(snapshot.events.some((event) => event.type === "ROUTE_CHANGED")).toBe(true);
    expect(snapshot.healthState).toBe("STARTING");
    expect(snapshot.bottleneck).toBe("INSUFFICIENT_DATA");
  });

  it("suppresses pause time and restarts warmup before diagnosing a resumed transfer", () => {
    const analyzer = new TransferHealthAnalyzer({ warmupMs: 1_000, hysteresisSamples: 1 });
    analyzer.observe(sample(0, 0));
    analyzer.observe(sample(1_000, 5 * MiB));
    const paused = analyzer.observe(sample(10_000, 5 * MiB, { transferState: "PAUSED" }));
    const resumed = analyzer.observe(sample(10_500, 6 * MiB));

    expect(paused.healthState).toBe("PAUSED");
    expect(paused.stallCount).toBe(0);
    expect(paused.bottleneck).toBe("INSUFFICIENT_DATA");
    expect(paused.etaMs).toBeNull();
    expect(resumed.healthState).toBe("STARTING");
    expect(resumed.bottleneck).toBe("INSUFFICIENT_DATA");
    expect(resumed.stallCount).toBe(0);
    expect(resumed.etaMs).toBeNull();
  });

  it("freezes the last meaningful active diagnosis in SpeedProof after delivery", () => {
    const analyzer = new TransferHealthAnalyzer();
    observeSeries(analyzer, {
      sourceReadBps: 10 * MiB,
      destinationWriteBps: 40 * MiB,
      senderBufferedAmountBytes: MiB
    });
    analyzer.observe(sample(4_500, 45 * MiB, { transferState: "DELIVERED" }));
    const proof = analyzer.finalize();

    expect(proof.dominantBottleneck).toBe("LIKELY_SOURCE_READ_LIMIT");
    expect(proof.bottleneckConfidence).toBe("HIGH");
    expect(proof.routeHistory[0]?.averageThroughputBps).toBeGreaterThan(0);
  });

  it("bounds observation history and event history under long-running inputs", () => {
    const analyzer = new TransferHealthAnalyzer({ maxSamples: 4, maxEvents: 2, warmupMs: 500 });
    let snapshot = analyzer.current();
    for (let index = 0; index < 30; index += 1)
      snapshot = analyzer.observe(sample(index * 500, index * MiB));

    expect(snapshot.events.length).toBeLessThanOrEqual(2);
    expect(analyzer.debugSampleCount()).toBeLessThanOrEqual(4);
  });

  it("does not convert unavailable measurements into zeros or issue a false limit", () => {
    const snapshot = observeSeries(new TransferHealthAnalyzer(), {
      sourceReadBps: null,
      destinationWriteBps: null,
      senderBufferedAmountBytes: null,
      receiveQueueBytes: null,
      availableOutgoingBitrateBps: null,
      rttMs: null,
      webRtcBytesSent: null
    });

    expect(snapshot.measurementAvailability.sourceRead).toBe("UNAVAILABLE");
    expect(snapshot.measurementAvailability.availableOutgoingBitrate).toBe("UNAVAILABLE");
    expect(snapshot.bottleneck).toBe("NONE_DETECTED");
  });

  it("rejects impossible counters instead of producing misleading diagnostics", () => {
    const analyzer = new TransferHealthAnalyzer();
    expect(() => analyzer.observe(sample(0, -1))).toThrow("payload counter");
    expect(() =>
      analyzer.observe(sample(0, 0, { totalBytes: Number.MAX_SAFE_INTEGER + 1 }))
    ).toThrow("total bytes");
  });
});
