import { describe, expect, it } from "vitest";
import {
  DevelopmentTransferStore,
  DevelopmentTransferStoreError,
  developmentTransferHistoryLimit
} from "./development-transfer-store";
import { speedProofSummary, type TransferLifecycleEvent } from "./transfer-types";

function event(overrides: Partial<TransferLifecycleEvent> = {}): TransferLifecycleEvent {
  return {
    active: {
      currentPayloadSpeedBps: 200_000,
      etaMs: 4_000,
      health: "GOOD",
      route: "Direct",
      transferredBytes: 256,
      verifiedBytes: 128
    },
    deliveryConfirmed: false,
    direction: "sent",
    failureCategory: null,
    fileCount: 1,
    folderCount: 0,
    lifecycleKey: "p7-alpha",
    peerPersonId: "alex-morgan",
    productStatus: "TRANSFERRING",
    sourceKind: "single_file",
    speedProof: null,
    totalBytes: 512,
    ...overrides
  };
}

function store() {
  let tick = 0;
  return new DevelopmentTransferStore(
    () => new Date(Date.UTC(2026, 8, 12, 0, 0, tick++)),
    () => `tr-${tick}`
  );
}

describe("P7 development transfer store", () => {
  it("creates one opaque metadata-only record and never serializes private lifecycle correlation", () => {
    const history = store();
    const record = history.record("dev-sender", event());
    const serialized = JSON.stringify(record);

    expect(record.recordId).toMatch(/^tr-/);
    expect(record.recordId).not.toContain("p7-alpha");
    expect(serialized).not.toContain("p7-alpha");
    expect(serialized).not.toContain("PRIVATE-HISTORY-NAME-MUST-NOT-PERSIST.mov");
    expect(serialized).not.toContain("C:\\Users\\private");
    expect(serialized).not.toContain("engine-transfer-private");
    expect(record.active?.verifiedBytes).toBe(128);
  });

  it("allows COMPLETED only when the lifecycle confirms DELIVERED", () => {
    const history = store();
    history.record("dev-sender", event());
    let failure: unknown;
    try {
      history.record(
        "dev-sender",
        event({ active: null, productStatus: "COMPLETED", speedProof: null })
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(DevelopmentTransferStoreError);
    expect((failure as DevelopmentTransferStoreError).code).toBe("TRANSFERS_DELIVERY_REQUIRED");

    const completed = history.record(
      "dev-sender",
      event({
        active: null,
        deliveryConfirmed: true,
        productStatus: "COMPLETED",
        speedProof: null
      })
    );
    expect(completed.productStatus).toBe("COMPLETED");
    expect(completed.endedAt).not.toBeNull();
  });

  it("deduplicates recovery and repeated delivery without changing a terminal record", () => {
    const history = store();
    const active = history.record("dev-sender", event());
    const reconnecting = history.record(
      "dev-sender",
      event({
        active: { ...event().active!, health: "RECONNECTING", route: "Relayed" },
        productStatus: "RECONNECTING"
      })
    );
    const completed = history.record(
      "dev-sender",
      event({ active: null, deliveryConfirmed: true, productStatus: "COMPLETED" })
    );
    const replayed = history.record(
      "dev-sender",
      event({ active: null, deliveryConfirmed: true, productStatus: "COMPLETED" })
    );

    expect(reconnecting.recordId).toBe(active.recordId);
    expect(completed.recordId).toBe(active.recordId);
    expect(replayed).toEqual(completed);
    expect(history.list("dev-sender")).toHaveLength(1);
  });

  it("keeps failed and canceled outcomes distinct", () => {
    const history = store();
    const failed = history.record(
      "dev-sender",
      event({
        active: null,
        failureCategory: "INTEGRITY",
        lifecycleKey: "p7-failed",
        productStatus: "FAILED"
      })
    );
    const canceled = history.record(
      "dev-sender",
      event({ active: null, lifecycleKey: "p7-canceled", productStatus: "CANCELED" })
    );

    expect(failed.failureCategory).toBe("INTEGRITY");
    expect(canceled.failureCategory).toBeNull();
    expect(new Set(history.list("dev-sender").map((record) => record.productStatus))).toEqual(
      new Set(["FAILED", "CANCELED"])
    );
  });

  it("ignores a late terminal replay for A after independent transfer B starts", () => {
    const history = store();
    history.record("dev-sender", event({ lifecycleKey: "p7-a" }));
    history.record(
      "dev-sender",
      event({
        active: null,
        deliveryConfirmed: true,
        lifecycleKey: "p7-a",
        productStatus: "COMPLETED"
      })
    );
    const transferB = history.record("dev-sender", event({ lifecycleKey: "p7-b" }));
    history.record(
      "dev-sender",
      event({
        active: null,
        deliveryConfirmed: true,
        lifecycleKey: "p7-a",
        productStatus: "COMPLETED"
      })
    );

    expect(history.get("dev-sender", transferB.recordId)?.productStatus).toBe("TRANSFERRING");
    expect(history.list("dev-sender")).toHaveLength(2);
  });

  it("orders newest first and evicts only oldest terminal records at the bounded development limit", () => {
    const history = store();
    for (let index = 0; index <= developmentTransferHistoryLimit; index += 1)
      history.record(
        "dev-sender",
        event({
          active: null,
          deliveryConfirmed: true,
          lifecycleKey: `p7-${index}`,
          productStatus: "COMPLETED"
        })
      );

    const records = history.list("dev-sender");
    expect(records).toHaveLength(developmentTransferHistoryLimit);
    expect(records[0]!.startedAt >= records.at(-1)!.startedAt).toBe(true);
  });

  it("reduces M8 SpeedProof output without transfer or route-detail exposure", () => {
    const summary = speedProofSummary({
      averageDestinationWriteBps: null,
      averageSourceReadBps: null,
      averageThroughputBps: 10,
      bottleneckConfidence: "LOW",
      dominantBottleneck: "INSUFFICIENT_DATA",
      durationMs: 500,
      integrityRetryCount: 0,
      measurementAvailability: {
        applicationPayload: "OBSERVED",
        availableOutgoingBitrate: "UNAVAILABLE",
        destinationWrite: "UNAVAILABLE",
        receiveQueue: "UNAVAILABLE",
        route: "OBSERVED",
        rtt: "UNAVAILABLE",
        senderBufferedAmount: "UNAVAILABLE",
        sourceRead: "UNAVAILABLE",
        webRtcBytes: "UNAVAILABLE"
      },
      payloadBytes: 512,
      peakThroughputBps: 12,
      reconnectCount: 0,
      routeChangeCount: 0,
      routeHistory: [
        {
          averageThroughputBps: 10,
          endedAtMs: 500,
          routeDetail: "private-candidate-detail",
          routeType: "DIRECT",
          startedAtMs: 0
        }
      ],
      schemaVersion: 1,
      stallCount: 0,
      stallDurationMs: 0,
      transferId: "engine-transfer-private"
    });

    expect(JSON.stringify(summary)).not.toContain("engine-transfer-private");
    expect(JSON.stringify(summary)).not.toContain("private-candidate-detail");
    expect(summary?.routeSegments).toEqual([{ averagePayloadSpeedBps: 10, route: "Direct" }]);
  });
});
