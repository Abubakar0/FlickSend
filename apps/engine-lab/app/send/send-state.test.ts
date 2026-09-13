import type { ConnectionSnapshot } from "@flicksend/engine-core";
import { describe, expect, it } from "vitest";
import { developmentCurrentUser, developmentRecipients } from "./recipients";
import {
  createInitialSendWorkflow,
  mapProductError,
  reduceSendWorkflow,
  type PreparedSendSource,
  type SendWorkflowSnapshot
} from "./send-state";

const source = {
  kind: "folder",
  displayName: "Project Footage",
  fileCount: 3,
  folderCount: 3,
  sizeBytes: 184_000_000_000,
  transfer: { kind: "folder", source: {} }
} as unknown as PreparedSendSource;

function engineSnapshot(
  transferState: string,
  transferId: string | null,
  error: string | null = null
): ConnectionSnapshot {
  return {
    state: transferState === "RECONNECTING" ? "RECONNECTING" : "CONNECTED",
    data: "open",
    error,
    transfer: {
      state: transferState,
      transferId,
      error,
      integrity: { manifestRootMatch: transferState === "DELIVERED" }
    }
  } as unknown as ConnectionSnapshot;
}

function reviewReady(): SendWorkflowSnapshot {
  let state = createInitialSendWorkflow(developmentCurrentUser);
  state = reduceSendWorkflow(state, {
    type: "RECIPIENT_SELECTED",
    recipient: developmentRecipients[0]!
  });
  state = reduceSendWorkflow(state, { type: "SOURCE_PREPARING", revision: 1 });
  return reduceSendWorkflow(state, { type: "SOURCE_PREPARED", revision: 1, source });
}

describe("P4 sender workflow reducer", () => {
  it("requires DELIVERED for the active transfer identity before completion", () => {
    let state = reduceSendWorkflow(reviewReady(), { type: "START_REQUESTED" });
    state = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("TRANSFER_BYTES_COMPLETE", "fs_tr_active")
    });
    expect(state.phase).toBe("VERIFYING");

    const staleDelivered = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("DELIVERED", "fs_tr_stale")
    });
    expect(staleDelivered.phase).toBe("VERIFYING");

    const delivered = reduceSendWorkflow(staleDelivered, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("DELIVERED", "fs_tr_active")
    });
    expect(delivered.phase).toBe("COMPLETED");
  });

  it("does not let stale preparation overwrite a newer source choice", () => {
    let state = reduceSendWorkflow(reviewReady(), { type: "SOURCE_PREPARING", revision: 2 });
    state = reduceSendWorkflow(state, { type: "SOURCE_PREPARED", revision: 1, source });
    expect(state.phase).toBe("PREPARING_SOURCE");
    expect(state.source).toBe(source);

    const replacement = { ...source, displayName: "Updated Footage" };
    state = reduceSendWorkflow(state, {
      type: "SOURCE_PREPARED",
      revision: 2,
      source: replacement
    });
    expect(state.phase).toBe("READY_TO_REVIEW");
    expect(state.source?.displayName).toBe("Updated Footage");
  });

  it("invalidates a pending session when recipient changes before a transfer identity exists", () => {
    let state = reduceSendWorkflow(reviewReady(), { type: "START_REQUESTED" });
    state = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("IDLE", null)
    });
    state = reduceSendWorkflow(state, {
      type: "RECIPIENT_SELECTED",
      recipient: developmentRecipients[1]!
    });
    expect(state.recipient?.id).toBe("jordan-lee");
    expect(state.phase).toBe("READY_TO_REVIEW");
    expect(state.engine).toBeNull();
    expect(state.sessionCode).toBeNull();
  });

  it("prevents duplicate starts from advancing the attempt counter", () => {
    const started = reduceSendWorkflow(reviewReady(), { type: "START_REQUESTED" });
    const repeated = reduceSendWorkflow(started, { type: "START_REQUESTED" });
    expect(repeated.startAttempt).toBe(1);
    expect(repeated).toBe(started);
  });

  it("keeps cancellation distinct from terminal failure", () => {
    let state = reduceSendWorkflow(reviewReady(), { type: "START_REQUESTED" });
    state = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("READY", "fs_tr_active")
    });
    state = reduceSendWorkflow(state, { type: "CANCEL_REQUESTED" });
    expect(state.phase).toBe("CANCELED");
    expect(state.error).toBeNull();
  });

  it("maps stable engine codes to privacy-safe product errors", () => {
    expect(mapProductError("FS_STREAMPACK_SOURCE_CHANGED").code).toBe("FS-PRODUCT-SOURCE-CHANGED");
    expect(mapProductError("FS_BLOCK_INTEGRITY_FAILED").code).toBe("FS-PRODUCT-INTEGRITY-FAILED");
    expect(mapProductError("FS_ROUTE_EXHAUSTED").code).toBe("FS-PRODUCT-NETWORK-RECOVERY-FAILED");
    expect(mapProductError("FS_PEOPLE_BLOCKED").code).toBe("FS-PRODUCT-PEOPLE-BLOCKED");
  });

  it("presents an exhausted route as terminal instead of continuing to reconnect", () => {
    let state = reduceSendWorkflow(reviewReady(), { type: "START_REQUESTED" });
    state = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("RECONNECTING", "fs_tr_active", "FS_ROUTE_EXHAUSTED")
    });
    state = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: {
        ...engineSnapshot("RECONNECTING", "fs_tr_active", "FS_ROUTE_EXHAUSTED"),
        state: "FAILED"
      }
    });
    expect(state.phase).toBe("FAILED");
    expect(state.error?.code).toBe("FS-PRODUCT-NETWORK-RECOVERY-FAILED");
  });

  it("keeps a late failed-transfer event from changing a new sender attempt", () => {
    let state = reduceSendWorkflow(reviewReady(), { type: "START_REQUESTED" });
    state = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("READY", "fs_tr_failed")
    });
    state = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: {
        ...engineSnapshot("RECONNECTING", "fs_tr_failed", "FS_ROUTE_EXHAUSTED"),
        state: "FAILED"
      }
    });
    state = reduceSendWorkflow(state, { type: "RESET", retainRecipient: true });
    state = reduceSendWorkflow(state, {
      type: "SOURCE_PREPARING",
      revision: state.sourceRevision + 1
    });
    state = reduceSendWorkflow(state, {
      type: "SOURCE_PREPARED",
      revision: state.sourceRevision,
      source
    });
    state = reduceSendWorkflow(state, { type: "START_REQUESTED" });
    state = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("READY", "fs_tr_new")
    });
    const stale = reduceSendWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("DELIVERED", "fs_tr_failed")
    });
    expect(stale).toBe(state);
    expect(stale.activeTransferId).toBe("fs_tr_new");
    expect(stale.phase).toBe("WAITING_FOR_RECIPIENT");
  });

  it("retains the browser capability decision when a terminal recovery starts a new send", () => {
    const capabilities = { supportedTransferModes: {} } as SendWorkflowSnapshot["capabilities"];
    const compatibility = {
      requiredCapabilityMissing: false
    } as SendWorkflowSnapshot["compatibility"];
    const reset = reduceSendWorkflow(
      {
        ...reviewReady(),
        capabilities,
        compatibility,
        phase: "FAILED"
      },
      { type: "RESET", retainRecipient: true }
    );

    expect(reset.capabilities).toBe(capabilities);
    expect(reset.compatibility).toBe(compatibility);
    expect(reset.phase).toBe("SELECTING_SOURCE");
  });
});
