import { describe, expect, it } from "vitest";
import {
  identifyBrowser,
  runtimeCompatibility,
  snapshotFromProbe,
  type BrowserCapabilityProbe
} from "../src/index.js";

function probe(overrides: Partial<BrowserCapabilityProbe> = {}): BrowserCapabilityProbe {
  return {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/152.0.4191.66 Safari/537.36",
    platform: "Win32",
    architecture: "x86",
    detectedAt: "2026-09-09T00:00:00.000Z",
    webRtcDataChannel: "AVAILABLE",
    webRtcStats: "AVAILABLE",
    fileSelection: "AVAILABLE",
    directorySelection: "AVAILABLE",
    dragDropFiles: "AVAILABLE",
    dragDropDirectories: "AVAILABLE",
    directFileWrite: "AVAILABLE",
    directDirectoryWrite: "AVAILABLE",
    opfs: "AVAILABLE",
    persistentStorage: "AVAILABLE",
    persistentStorageState: "NOT_PERSISTED",
    storageEstimate: { availability: "AVAILABLE", quotaBytes: 1024, usageBytes: 10 },
    webCryptoSha256: "AVAILABLE",
    webWorkers: "AVAILABLE",
    wakeLock: "AVAILABLE",
    ...overrides
  };
}

describe("browser capability detection", () => {
  it("uses user-agent parsing only to label an Edge qualification environment", () => {
    expect(identifyBrowser(probe().userAgent, "Win32", "x86")).toMatchObject({
      browser: "EDGE",
      browserVersion: "152.0.4191.66",
      engine: "BLINK",
      operatingSystem: "WINDOWS",
      deviceClass: "DESKTOP"
    });
  });

  it("keeps dynamic metrics and reload recovery unknown until a live transfer proves them", () => {
    const snapshot = snapshotFromProbe(probe());

    expect(snapshot.rttStats).toBe("UNKNOWN");
    expect(snapshot.availableOutgoingBitrate).toBe("UNKNOWN");
    expect(snapshot.backgroundBehavior).toBe("UNKNOWN");
    expect(snapshot.supportedTransferModes.canResumeAfterReload).toBe("UNKNOWN");
  });

  it("does not offer a full-support tier from feature detection alone", () => {
    const decision = runtimeCompatibility(snapshotFromProbe(probe()));

    expect(decision.proposedSupportTier).toBe("SUPPORTED_WITH_LIMITATIONS");
    expect(decision.reasonCodes).toContain("FS_CAP_PERSISTENT_HANDLE_UNAVAILABLE");
  });

  it("blocks only missing required capabilities and gives a typed reason", () => {
    const decision = runtimeCompatibility(
      snapshotFromProbe(probe({ webRtcDataChannel: "UNAVAILABLE", webCryptoSha256: "UNAVAILABLE" }))
    );

    expect(decision.proposedSupportTier).toBe("UNSUPPORTED");
    expect(decision.requiredCapabilityMissing).toBe(true);
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining(["FS_CAP_WEBRTC_UNAVAILABLE", "FS_CAP_CRYPTO_UNAVAILABLE"])
    );
  });

  it("reports unavailable directory APIs as a limitation without browser-name blocking", () => {
    const decision = runtimeCompatibility(
      snapshotFromProbe(
        probe({
          directorySelection: "UNAVAILABLE",
          directDirectoryWrite: "UNAVAILABLE"
        })
      )
    );

    expect(decision.proposedSupportTier).toBe("SUPPORTED_WITH_LIMITATIONS");
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "FS_CAP_DIRECTORY_SELECTION_UNAVAILABLE",
        "FS_CAP_DIRECTORY_WRITE_UNAVAILABLE"
      ])
    );
  });
});
