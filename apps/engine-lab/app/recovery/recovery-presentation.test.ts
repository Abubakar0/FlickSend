import { describe, expect, it } from "vitest";
import { recoveryPresentation } from "./recovery-presentation";

function productError(code: string, kind: "action_required" | "terminal" = "terminal") {
  return {
    code,
    explanation: "Safe product explanation.",
    kind,
    recommendedAction: "Safe product action.",
    retryable: false,
    title: "Safe product title"
  } as const;
}

describe("P8 recovery presentation", () => {
  it("treats an authoritative reconnecting snapshot as automatic and receiver-safe", () => {
    expect(
      recoveryPresentation({
        actor: "sender",
        error: null,
        integrityRetryCount: 0,
        phase: "RECONNECTING"
      })
    ).toMatchObject({
      action: "NONE",
      mode: "automatic",
      progressSafety: "safe",
      reason: "NETWORK_INTERRUPTION",
      title: "Reconnecting"
    });
  });

  it("does not claim verified progress is safe during an integrity retry", () => {
    expect(
      recoveryPresentation({
        actor: "recipient",
        error: null,
        integrityRetryCount: 1,
        phase: "RECEIVING"
      })
    ).toMatchObject({
      mode: "automatic",
      progressSafety: "unknown",
      reason: "INTEGRITY_RETRY",
      title: "Checking transferred data"
    });
  });

  it.each([
    ["FS-PRODUCT-SOURCE-CHANGED", "SOURCE_CHANGED"],
    ["FS-PRODUCT-DESTINATION-CHANGED", "DESTINATION_CHANGED"],
    ["FS-PRODUCT-DESTINATION-PERMISSION", "DESTINATION_PERMISSION_LOST"],
    ["FS-PRODUCT-DESTINATION-UNAVAILABLE", "DESTINATION_UNAVAILABLE"],
    ["FS-PRODUCT-STORAGE-FULL", "STORAGE_FULL"],
    ["FS-PRODUCT-INTEGRITY-FAILED", "INTEGRITY_EXHAUSTED"],
    ["FS-PRODUCT-NETWORK-RECOVERY-FAILED", "ROUTE_RECOVERY"],
    ["FS-PRODUCT-SERVICE-UNAVAILABLE", "SERVICE_UNAVAILABLE"],
    ["FS-PRODUCT-BROWSER-UNAVAILABLE", "BROWSER_CAPABILITY"]
  ])("maps %s to the canonical P8 reason", (code, reason) => {
    expect(
      recoveryPresentation({
        actor: "recipient",
        error: productError(code, code.includes("PERMISSION") ? "action_required" : "terminal"),
        integrityRetryCount: 0,
        phase: "FAILED"
      })
    ).toMatchObject({ progressSafety: "not_applicable", reason });
  });

  it("requires a new transfer after source, destination, integrity, or exhausted-route correctness failures", () => {
    for (const code of [
      "FS-PRODUCT-SOURCE-CHANGED",
      "FS-PRODUCT-DESTINATION-CHANGED",
      "FS-PRODUCT-INTEGRITY-FAILED",
      "FS-PRODUCT-NETWORK-RECOVERY-FAILED"
    ])
      expect(
        recoveryPresentation({
          actor: "sender",
          error: productError(code),
          integrityRetryCount: 0,
          phase: "FAILED"
        })?.newTransferRequired
      ).toBe(true);
  });

  it("keeps unsupported errors generic and never derives a diagnostic from raw text", () => {
    const presentation = recoveryPresentation({
      actor: "sender",
      error: {
        ...productError("FS-PRODUCT-UNKNOWN-FAILED"),
        explanation: "Safe product explanation.",
        title: "Transfer couldn't continue"
      },
      integrityRetryCount: 0,
      phase: "FAILED"
    });
    expect(presentation).toMatchObject({ reason: "UNKNOWN", progressSafety: "not_applicable" });
    expect(JSON.stringify(presentation)).not.toContain("FS-PRODUCT-UNKNOWN-FAILED");
  });
});
