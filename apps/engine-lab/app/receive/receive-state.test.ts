import type { ConnectionSnapshot } from "@flicksend/engine-core";
import { describe, expect, it } from "vitest";
import {
  createInitialReceiveWorkflow,
  mapReceiveProductError,
  receiveStatusAnnouncement,
  reduceReceiveWorkflow,
  type IncomingTransferSummary,
  type ReceiveWorkflowSnapshot
} from "./receive-state";

const incoming: IncomingTransferSummary = {
  displayName: "Project Footage.mov",
  fileCount: 1,
  folderCount: 0,
  kind: "single-file",
  senderName: "Alex Morgan",
  sizeBytes: 184_000_000_000
};

function engineSnapshot(
  transferState: string,
  transferId: string | null,
  error: string | null = null,
  connectionState = transferState === "RECONNECTING" ? "RECONNECTING" : "CONNECTED"
): ConnectionSnapshot {
  return {
    state: connectionState,
    data: "open",
    error,
    transfer: {
      state: transferState,
      transferId,
      error,
      bytesTotal: incoming.sizeBytes,
      integrity: { manifestRootMatch: transferState === "DELIVERED" }
    }
  } as unknown as ConnectionSnapshot;
}

function authorizedReview(): ReceiveWorkflowSnapshot {
  let state = createInitialReceiveWorkflow();
  state = reduceReceiveWorkflow(state, { type: "SESSION_OPENING", revision: 1 });
  return reduceReceiveWorkflow(state, {
    type: "OFFER_AUTHORIZED",
    revision: 1,
    incoming,
    snapshot: engineSnapshot("READY", "fs_tr_active")
  });
}

describe("P5 recipient workflow reducer", () => {
  it("does not reveal metadata for an unavailable session", () => {
    let state = createInitialReceiveWorkflow();
    state = reduceReceiveWorkflow(state, { type: "SESSION_OPENING", revision: 1 });
    state = reduceReceiveWorkflow(state, { type: "SESSION_UNAVAILABLE", revision: 1 });
    expect(state.phase).toBe("FAILED");
    expect(state.incoming).toBeNull();
    expect(state.activeTransferId).toBeNull();
    expect(state.error?.title).toBe("This transfer isn't available");
  });

  it("requires matching active DELIVERED before recipient completion", () => {
    let state = authorizedReview();
    state = reduceReceiveWorkflow(state, { type: "ACCEPT_REQUESTED" });
    state = reduceReceiveWorkflow(state, { type: "DESTINATION_PREPARING", revision: 1 });
    state = reduceReceiveWorkflow(state, {
      type: "DESTINATION_PREPARED",
      revision: 1,
      destination: { kind: "fixture", label: "Test destination" }
    });
    state = reduceReceiveWorkflow(state, { type: "RECEIVE_REQUESTED" });
    state = reduceReceiveWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("TRANSFER_BYTES_COMPLETE", "fs_tr_active")
    });
    expect(state.phase).toBe("VERIFYING");

    const stale = reduceReceiveWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("DELIVERED", "fs_tr_stale")
    });
    expect(stale.phase).toBe("VERIFYING");

    const delivered = reduceReceiveWorkflow(stale, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("DELIVERED", "fs_tr_active")
    });
    expect(delivered.phase).toBe("COMPLETED");
  });

  it("keeps accept idempotent and decline distinct from failure", () => {
    const accepted = reduceReceiveWorkflow(authorizedReview(), { type: "ACCEPT_REQUESTED" });
    expect(accepted.phase).toBe("CHOOSING_DESTINATION");
    expect(reduceReceiveWorkflow(accepted, { type: "ACCEPT_REQUESTED" })).toBe(accepted);

    const declined = reduceReceiveWorkflow(authorizedReview(), { type: "DECLINED" });
    expect(declined.phase).toBe("CANCELED");
    expect(declined.error).toBeNull();
  });

  it("prevents a late destination A from replacing or starting payload ahead of destination B", () => {
    let state = reduceReceiveWorkflow(authorizedReview(), { type: "ACCEPT_REQUESTED" });
    state = reduceReceiveWorkflow(state, { type: "DESTINATION_PREPARING", revision: 1 });
    state = reduceReceiveWorkflow(state, { type: "DESTINATION_PREPARING", revision: 2 });
    const stale = reduceReceiveWorkflow(state, {
      type: "DESTINATION_PREPARED",
      revision: 1,
      destination: { kind: "folder", label: "Destination A" }
    });
    expect(stale.phase).toBe("PREPARING_DESTINATION");
    const current = reduceReceiveWorkflow(stale, {
      type: "DESTINATION_PREPARED",
      revision: 2,
      destination: { kind: "folder", label: "Destination B" }
    });
    expect(current.destination?.label).toBe("Destination B");
    const receiving = reduceReceiveWorkflow(current, { type: "RECEIVE_REQUESTED" });
    expect(receiving.phase).toBe("CONNECTING");
    expect(receiving.destination?.label).toBe("Destination B");
    const lateA = reduceReceiveWorkflow(receiving, {
      type: "DESTINATION_PREPARED",
      revision: 1,
      destination: { kind: "folder", label: "Destination A" }
    });
    expect(lateA).toBe(receiving);
  });

  it("keeps accepted destination work intact when the same offer is replayed", () => {
    let state = reduceReceiveWorkflow(authorizedReview(), { type: "ACCEPT_REQUESTED" });
    state = reduceReceiveWorkflow(state, { type: "DESTINATION_PREPARING", revision: 1 });
    const replayed = reduceReceiveWorkflow(state, {
      type: "OFFER_AUTHORIZED",
      revision: 1,
      incoming,
      snapshot: engineSnapshot("READY", "fs_tr_active")
    });
    expect(replayed.phase).toBe("PREPARING_DESTINATION");
    expect(replayed.destinationRevision).toBe(1);
    expect(replayed.activeTransferId).toBe("fs_tr_active");
  });

  it("rejects late session A metadata and snapshots after session B becomes active", () => {
    let state = createInitialReceiveWorkflow();
    state = reduceReceiveWorkflow(state, { type: "SESSION_OPENING", revision: 1 });
    state = reduceReceiveWorkflow(state, { type: "SESSION_OPENING", revision: 2 });
    const incomingB = { ...incoming, senderName: "Jordan Lee" };
    state = reduceReceiveWorkflow(state, {
      type: "OFFER_AUTHORIZED",
      revision: 2,
      incoming: incomingB,
      snapshot: engineSnapshot("READY", "fs_tr_b")
    });
    const stale = reduceReceiveWorkflow(state, {
      type: "OFFER_AUTHORIZED",
      revision: 1,
      incoming,
      snapshot: engineSnapshot("READY", "fs_tr_a")
    });
    expect(stale.incoming?.senderName).toBe("Jordan Lee");
    expect(stale.activeTransferId).toBe("fs_tr_b");
    expect(stale.phase).toBe("REVIEWING");
    const staleTransfer = reduceReceiveWorkflow(stale, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("RECEIVING", "fs_tr_a")
    });
    expect(staleTransfer).toBe(stale);
  });

  it("waits with an authorized prepared destination until the sender returns", () => {
    let state = reduceReceiveWorkflow(authorizedReview(), { type: "ACCEPT_REQUESTED" });
    state = reduceReceiveWorkflow(state, { type: "DESTINATION_PREPARING", revision: 1 });
    state = reduceReceiveWorkflow(state, {
      type: "DESTINATION_PREPARED",
      revision: 1,
      destination: { kind: "fixture", label: "Destination B" }
    });
    state = reduceReceiveWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("READY", "fs_tr_active", null, "WAITING_FOR_PEER")
    });
    expect(state.phase).toBe("WAITING_FOR_SENDER");
    expect(state.activeTransferId).toBe("fs_tr_active");
    expect(state.destination?.label).toBe("Destination B");
    expect(state.error).toBeNull();
    expect(receiveStatusAnnouncement(state)).toBe("Waiting for Alex Morgan.");
    state = reduceReceiveWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("READY", "fs_tr_active")
    });
    expect(state.phase).toBe("READY_TO_RECEIVE");
    state = reduceReceiveWorkflow(state, { type: "RECEIVE_REQUESTED" });
    state = reduceReceiveWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("RECEIVING", "fs_tr_active")
    });
    expect(state.phase).toBe("RECEIVING");
  });

  it("keeps reconnection nonterminal and cancellation distinct from failure", () => {
    let state = authorizedReview();
    state = reduceReceiveWorkflow(state, { type: "ACCEPT_REQUESTED" });
    state = reduceReceiveWorkflow(state, { type: "DESTINATION_PREPARING", revision: 1 });
    state = reduceReceiveWorkflow(state, {
      type: "DESTINATION_PREPARED",
      revision: 1,
      destination: { kind: "fixture", label: "Test destination" }
    });
    state = reduceReceiveWorkflow(state, { type: "RECEIVE_REQUESTED" });
    state = reduceReceiveWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: engineSnapshot("RECONNECTING", "fs_tr_active")
    });
    expect(state.phase).toBe("RECONNECTING");
    expect(state.error).toBeNull();
    state = reduceReceiveWorkflow(state, { type: "CANCEL_REQUESTED" });
    expect(state.phase).toBe("CANCELED");
    expect(state.error).toBeNull();
  });

  it("presents exhausted recovery as terminal even when the transfer snapshot remains reconnecting", () => {
    let state = authorizedReview();
    state = reduceReceiveWorkflow(state, { type: "ACCEPT_REQUESTED" });
    state = reduceReceiveWorkflow(state, { type: "DESTINATION_PREPARING", revision: 1 });
    state = reduceReceiveWorkflow(state, {
      type: "DESTINATION_PREPARED",
      revision: 1,
      destination: { kind: "fixture", label: "Test destination" }
    });
    state = reduceReceiveWorkflow(state, { type: "RECEIVE_REQUESTED" });
    state = reduceReceiveWorkflow(state, {
      type: "ENGINE_SNAPSHOT",
      snapshot: {
        ...engineSnapshot("RECONNECTING", "fs_tr_active", "FS_ROUTE_EXHAUSTED"),
        state: "FAILED"
      }
    });
    expect(state.phase).toBe("FAILED");
    expect(state.error?.code).toBe("FS-PRODUCT-NETWORK-RECOVERY-FAILED");
  });

  it("maps receiver destination and integrity errors to stable product codes", () => {
    expect(mapReceiveProductError("FS_STREAMPACK_DESTINATION_CHANGED").code).toBe(
      "FS-PRODUCT-DESTINATION-CHANGED"
    );
    expect(mapReceiveProductError("DESTINATION_FINALIZATION_FAILED").code).toBe(
      "FS-PRODUCT-DESTINATION-FINALIZE"
    );
    expect(mapReceiveProductError("FS_BLOCK_INTEGRITY_FAILED").code).toBe(
      "FS-PRODUCT-INTEGRITY-FAILED"
    );
  });
});
