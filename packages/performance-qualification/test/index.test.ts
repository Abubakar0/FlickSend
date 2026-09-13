import { describe, expect, it } from "vitest";
import {
  deriveNetworkUtilization,
  summarizeProcessSamples,
  validatePhysicalTransfer,
  validatePrivacySafeLabel
} from "../src/index.js";

describe("M10 evidence helpers", () => {
  it("summarizes bounded process samples and identifies only sustained monotonic growth", () => {
    const summary = summarizeProcessSamples([
      { timestampMs: 1, memoryBytes: 100, cpuPercent: null },
      { timestampMs: 2, memoryBytes: 120, cpuPercent: 25 },
      { timestampMs: 3, memoryBytes: 140, cpuPercent: 50 }
    ]);

    expect(summary).toMatchObject({
      sampleCount: 3,
      initialMemoryBytes: 100,
      peakMemoryBytes: 140,
      averageCpuPercent: 37.5,
      memoryTrend: "MONOTONIC_GROWTH"
    });
  });

  it("does not calculate utilization without a measured positive iperf baseline", () => {
    expect(deriveNetworkUtilization(100, null)).toBeNull();
    expect(deriveNetworkUtilization(100, 0)).toBeNull();
    expect(deriveNetworkUtilization(100, 1_000)).toBe(0.8);
  });

  it("requires two physical peers, matching identity, integrity, route, and continuity", () => {
    const valid = {
      evidenceClass: "TWO_MACHINE_PHYSICAL" as const,
      expectedRoute: "DIRECT" as const,
      senderRole: "SENDER" as const,
      receiverRole: "RECEIVER" as const,
      senderDelivered: true,
      receiverDelivered: true,
      receiverManifestRootVerified: true,
      receiverDestinationVerified: true,
      senderTransferId: "fs_example",
      receiverTransferId: "fs_example",
      selectedRoute: "DIRECT" as const,
      payloadBytes: 8 * 1024 * 1024,
      duplicateRetransmittedBytes: 0,
      committedBlocksRetransmitted: 0
    };

    expect(validatePhysicalTransfer(valid)).toEqual([]);
    expect(
      validatePhysicalTransfer({
        ...valid,
        evidenceClass: "SAME_HOST_PHYSICAL_BROWSER",
        receiverDestinationVerified: false,
        committedBlocksRetransmitted: 1
      })
    ).toEqual(
      expect.arrayContaining([
        "M10 completion requires two-machine physical evidence.",
        "The receiver must verify every fixture byte before M10 retention.",
        "Receiver-committed blocks were retransmitted."
      ])
    );
  });

  it("permits role labels but rejects address-like labels", () => {
    expect(validatePrivacySafeLabel("SENDER_A")).toBe("SENDER_A");
    expect(() => validatePrivacySafeLabel("192.168.1.1")).toThrow("uppercase role label");
  });
});
