import type {
  BrowserCapabilitySnapshot,
  RuntimeCompatibilityDecision
} from "@flicksend/browser-capabilities";
import type { ConnectionSnapshot } from "@flicksend/engine-core";
import type {
  ProductErrorViewModel,
  ProductHealthState,
  ProductTransferState
} from "@flicksend/ui";

export const receiveWorkflowStates = [
  "OPENING",
  "AUTHORIZING",
  "REVIEWING",
  "CHOOSING_DESTINATION",
  "PREPARING_DESTINATION",
  "READY_TO_RECEIVE",
  "WAITING_FOR_SENDER",
  "CONNECTING",
  "RECEIVING",
  "RECONNECTING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELED"
] as const;

export type ReceiveWorkflowState = (typeof receiveWorkflowStates)[number];
export type IncomingSourceKind = "single-file" | "folder-or-files";

export type IncomingTransferSummary = {
  displayName: string;
  fileCount: number | null;
  folderCount: number | null;
  kind: IncomingSourceKind;
  senderName: string;
  sizeBytes: number;
};

export type DestinationSummary = {
  kind: "file" | "folder" | "fixture";
  label: string;
};

export type ProductReceiveError = ProductErrorViewModel & { code: string };

export type ReceiveWorkflowSnapshot = {
  activeTransferId: string | null;
  capabilities: BrowserCapabilitySnapshot | null;
  compatibility: RuntimeCompatibilityDecision | null;
  destination: DestinationSummary | null;
  destinationRevision: number;
  engine: ConnectionSnapshot | null;
  error: ProductReceiveError | null;
  incoming: IncomingTransferSummary | null;
  phase: ReceiveWorkflowState;
  sessionRevision: number;
};

export type ReceiveWorkflowEvent =
  | { type: "SESSION_OPENING"; revision: number }
  | { type: "SESSION_AUTHORIZING"; revision: number }
  | {
      type: "CAPABILITIES_RESOLVED";
      revision: number;
      capabilities: BrowserCapabilitySnapshot;
      compatibility: RuntimeCompatibilityDecision;
    }
  | { type: "WAITING_FOR_SENDER"; revision: number; engine: ConnectionSnapshot }
  | { type: "SESSION_UNAVAILABLE"; revision: number }
  | {
      type: "OFFER_AUTHORIZED";
      revision: number;
      incoming: IncomingTransferSummary;
      snapshot: ConnectionSnapshot;
    }
  | { type: "ACCEPT_REQUESTED" }
  | { type: "DESTINATION_PREPARING"; revision: number }
  | { type: "DESTINATION_PREPARED"; revision: number; destination: DestinationSummary }
  | { type: "DESTINATION_CANCELED"; revision: number }
  | { type: "DESTINATION_FAILED"; revision: number; error: ProductReceiveError }
  | { type: "RECEIVE_REQUESTED" }
  | { type: "ENGINE_SNAPSHOT"; snapshot: ConnectionSnapshot }
  | { type: "DECLINED" }
  | { type: "CANCEL_REQUESTED" }
  | { type: "RESET"; revision: number };

export function createInitialReceiveWorkflow(): ReceiveWorkflowSnapshot {
  return {
    activeTransferId: null,
    capabilities: null,
    compatibility: null,
    destination: null,
    destinationRevision: 0,
    engine: null,
    error: null,
    incoming: null,
    phase: "OPENING",
    sessionRevision: 0
  };
}

const integrityCodes = new Set([
  "BLOCK_INTEGRITY_FAILED",
  "MANIFEST_INTEGRITY_FAILED",
  "MANIFEST_ROOT_MISMATCH"
]);
const destinationChangedCodes = new Set(["STREAMPACK_DESTINATION_CHANGED"]);
const destinationFinalizeCodes = new Set(["DESTINATION_FINALIZATION_FAILED"]);
const destinationPermissionCodes = new Set([
  "DESTINATION_PERMISSION_DENIED",
  "PRODUCT_DESTINATION_PERMISSION"
]);
const destinationUnavailableCodes = new Set([
  "STREAMPACK_DESTINATION_INVALID",
  "STREAMPACK_RECONSTRUCTION_FAILED",
  "PRODUCT_DESTINATION_UNAVAILABLE"
]);
const storageCodes = new Set(["DESTINATION_STORAGE_FULL", "PRODUCT_STORAGE_FULL"]);
const sourceChangedCodes = new Set(["SOURCE_CHANGED", "STREAMPACK_SOURCE_CHANGED"]);
const recoveryCodes = new Set(["ROUTE_EXHAUSTED", "ROUTE_RECOVERY_FAILED"]);

function normalizedEngineErrorCode(code: string | null | undefined): string {
  return code?.replace(/^FS_/, "") ?? "";
}

export function unavailableSessionError(): ProductReceiveError {
  return {
    code: "FS-PRODUCT-AUTH-UNAUTHORIZED",
    kind: "terminal",
    title: "This transfer isn't available",
    explanation: "Ask the sender for a new invitation.",
    recommendedAction: "Return to the sender for a new invitation.",
    retryable: false
  };
}

export function mapReceiveProductError(code: string | null | undefined): ProductReceiveError {
  const normalizedCode = normalizedEngineErrorCode(code);
  if (destinationChangedCodes.has(normalizedCode))
    return {
      code: "FS-PRODUCT-DESTINATION-CHANGED",
      kind: "terminal",
      title: "Destination changed",
      explanation: "Previously saved verified data no longer matches what FlickSend expected.",
      recommendedAction: "Choose a clean destination and receive again.",
      retryable: false
    };
  if (destinationFinalizeCodes.has(normalizedCode))
    return {
      code: "FS-PRODUCT-DESTINATION-FINALIZE",
      kind: "terminal",
      title: "Couldn't finish saving",
      explanation: "FlickSend could not finish the destination, so nothing was marked complete.",
      recommendedAction: "Check the destination and receive again.",
      retryable: true
    };
  if (destinationPermissionCodes.has(normalizedCode))
    return {
      code: "FS-PRODUCT-DESTINATION-PERMISSION",
      kind: "action_required",
      title: "Can't save there",
      explanation: "FlickSend no longer has permission to write to this destination.",
      recommendedAction: "Choose or reauthorize a destination.",
      retryable: true
    };
  if (storageCodes.has(normalizedCode))
    return {
      code: "FS-PRODUCT-STORAGE-FULL",
      kind: "terminal",
      title: "Not enough space",
      explanation: "The destination could not continue saving this transfer.",
      recommendedAction: "Free space or choose another destination and receive again.",
      retryable: true
    };
  if (destinationUnavailableCodes.has(normalizedCode))
    return {
      code: "FS-PRODUCT-DESTINATION-UNAVAILABLE",
      kind: "action_required",
      title: "Destination unavailable",
      explanation: "FlickSend can no longer safely write to the selected destination.",
      recommendedAction: "Choose another supported destination.",
      retryable: true
    };
  if (sourceChangedCodes.has(normalizedCode))
    return {
      code: "FS-PRODUCT-SOURCE-CHANGED",
      kind: "terminal",
      title: "Source changed",
      explanation:
        "The sender's file or folder changed, so this transfer stopped to keep it correct.",
      recommendedAction: "Ask the sender to prepare a new transfer.",
      retryable: false
    };
  if (integrityCodes.has(normalizedCode) || normalizedCode.includes("INTEGRITY"))
    return {
      code: "FS-PRODUCT-INTEGRITY-FAILED",
      kind: "terminal",
      title: "Transfer couldn't be verified",
      explanation: "FlickSend could not verify this transfer. Nothing has been marked complete.",
      recommendedAction: "Ask the sender to start a new transfer.",
      retryable: false
    };
  if (recoveryCodes.has(normalizedCode))
    return {
      code: "FS-PRODUCT-NETWORK-RECOVERY-FAILED",
      kind: "terminal",
      title: "Couldn't reconnect",
      explanation:
        "FlickSend could not restore this connection. Nothing unverified was marked complete.",
      recommendedAction: "Check both connections and receive a new transfer if needed.",
      retryable: false
    };
  if (code?.startsWith("FS_CAP_"))
    return {
      code: "FS-PRODUCT-BROWSER-UNAVAILABLE",
      kind: "action_required",
      title: "This browser can't save this transfer",
      explanation: "A required browser capability is unavailable or not qualified for this action.",
      recommendedAction:
        "Use a qualified Windows desktop browser or choose a supported destination.",
      retryable: false
    };
  if (code?.startsWith("FS_TURN_") || code === "FS_ICE_NEGOTIATION_FAILED")
    return {
      code: "FS-PRODUCT-SERVICE-UNAVAILABLE",
      kind: "action_required",
      title: "FlickSend is temporarily unavailable",
      explanation: "A service needed to arrange the transfer is unavailable.",
      recommendedAction: "Try again shortly.",
      retryable: true
    };
  return {
    code: "FS-PRODUCT-UNKNOWN-FAILED",
    kind: "terminal",
    title: "Transfer couldn't continue",
    explanation: "FlickSend stopped this transfer to avoid an incorrect result.",
    recommendedAction: "Ask the sender to start a new transfer.",
    retryable: false
  };
}

function isTerminalEngineState(state: string): boolean {
  return state === "FAILED" || state === "INTEGRITY_FAILED";
}

function refreshedIncoming(
  incoming: IncomingTransferSummary,
  snapshot: ConnectionSnapshot
): IncomingTransferSummary {
  const streamPack = snapshot.transfer.streamPack;
  if (!streamPack) return incoming;
  return {
    ...incoming,
    fileCount: streamPack.filesTotal,
    folderCount: streamPack.directoriesTotal,
    kind: "folder-or-files"
  };
}

function mapEnginePhase(
  state: ReceiveWorkflowSnapshot,
  snapshot: ConnectionSnapshot
): { phase: ReceiveWorkflowState; error: ProductReceiveError | null } | null {
  const transfer = snapshot.transfer;
  if (transfer.state === "DELIVERED") {
    if (!state.activeTransferId || transfer.transferId !== state.activeTransferId) return null;
    return { phase: "COMPLETED", error: null };
  }
  if (transfer.state === "CANCELLED" || transfer.state === "CANCELLING")
    return { phase: "CANCELED", error: null };
  if (isTerminalEngineState(transfer.state) || snapshot.state === "FAILED")
    return {
      phase: "FAILED",
      error: mapReceiveProductError(transfer.error ?? snapshot.error)
    };
  if (snapshot.state === "RECONNECTING" || transfer.state === "RECONNECTING")
    return { phase: "RECONNECTING", error: null };
  if (snapshot.state === "WAITING_FOR_PEER") return { phase: "WAITING_FOR_SENDER", error: null };
  if (
    state.phase === "WAITING_FOR_SENDER" &&
    state.destination &&
    transfer.state === "READY" &&
    snapshot.state === "CONNECTED"
  )
    return { phase: "READY_TO_RECEIVE", error: null };
  if (transfer.state === "RECEIVING") return { phase: "RECEIVING", error: null };
  if (["FINALIZING", "TRANSFER_BYTES_COMPLETE", "VERIFYING", "VERIFIED"].includes(transfer.state))
    return { phase: "VERIFYING", error: null };
  if (
    state.phase === "CONNECTING" ||
    (state.phase === "READY_TO_RECEIVE" && snapshot.state === "CONNECTING")
  )
    return { phase: "CONNECTING", error: null };
  return null;
}

export function reduceReceiveWorkflow(
  state: ReceiveWorkflowSnapshot,
  event: ReceiveWorkflowEvent
): ReceiveWorkflowSnapshot {
  switch (event.type) {
    case "SESSION_OPENING":
      return {
        ...createInitialReceiveWorkflow(),
        phase: "OPENING",
        sessionRevision: event.revision
      };
    case "SESSION_AUTHORIZING":
      return event.revision === state.sessionRevision ? { ...state, phase: "AUTHORIZING" } : state;
    case "CAPABILITIES_RESOLVED":
      return event.revision === state.sessionRevision
        ? { ...state, capabilities: event.capabilities, compatibility: event.compatibility }
        : state;
    case "WAITING_FOR_SENDER":
      return event.revision === state.sessionRevision && !state.incoming
        ? { ...state, engine: event.engine, phase: "WAITING_FOR_SENDER" }
        : state;
    case "SESSION_UNAVAILABLE":
      return event.revision === state.sessionRevision
        ? {
            ...state,
            activeTransferId: null,
            destination: null,
            engine: null,
            error: unavailableSessionError(),
            incoming: null,
            phase: "FAILED"
          }
        : state;
    case "OFFER_AUTHORIZED": {
      const transferId = event.snapshot.transfer.transferId;
      if (
        event.revision !== state.sessionRevision ||
        !transferId ||
        (state.activeTransferId !== null && state.activeTransferId !== transferId)
      )
        return state;
      if (state.activeTransferId === transferId)
        return {
          ...state,
          engine: event.snapshot,
          incoming: state.incoming
            ? refreshedIncoming(state.incoming, event.snapshot)
            : event.incoming
        };
      return {
        ...state,
        activeTransferId: transferId,
        engine: event.snapshot,
        error: null,
        incoming: event.incoming,
        phase: "REVIEWING"
      };
    }
    case "ACCEPT_REQUESTED":
      return state.phase === "REVIEWING"
        ? { ...state, error: null, phase: "CHOOSING_DESTINATION" }
        : state;
    case "DESTINATION_PREPARING":
      return ["CHOOSING_DESTINATION", "PREPARING_DESTINATION", "READY_TO_RECEIVE"].includes(
        state.phase
      )
        ? {
            ...state,
            destination: null,
            destinationRevision: event.revision,
            error: null,
            phase: "PREPARING_DESTINATION"
          }
        : state;
    case "DESTINATION_PREPARED":
      return event.revision === state.destinationRevision && state.phase === "PREPARING_DESTINATION"
        ? { ...state, destination: event.destination, error: null, phase: "READY_TO_RECEIVE" }
        : state;
    case "DESTINATION_CANCELED":
      return event.revision === state.destinationRevision
        ? { ...state, destination: null, error: null, phase: "CHOOSING_DESTINATION" }
        : state;
    case "DESTINATION_FAILED":
      return event.revision === state.destinationRevision
        ? { ...state, destination: null, error: event.error, phase: "CHOOSING_DESTINATION" }
        : state;
    case "RECEIVE_REQUESTED":
      return state.phase === "READY_TO_RECEIVE" && state.destination && state.activeTransferId
        ? { ...state, error: null, phase: "CONNECTING" }
        : state;
    case "ENGINE_SNAPSHOT": {
      const incomingTransferId = event.snapshot.transfer.transferId;
      if (
        state.activeTransferId &&
        incomingTransferId &&
        incomingTransferId !== state.activeTransferId
      )
        return state;
      if (!state.incoming) return state;
      const mapping = mapEnginePhase(state, event.snapshot);
      return mapping
        ? {
            ...state,
            engine: event.snapshot,
            error: mapping.error,
            incoming: refreshedIncoming(state.incoming, event.snapshot),
            phase: mapping.phase
          }
        : {
            ...state,
            engine: event.snapshot,
            incoming: refreshedIncoming(state.incoming, event.snapshot)
          };
    }
    case "DECLINED":
      return state.phase === "REVIEWING" ? { ...state, phase: "CANCELED" } : state;
    case "CANCEL_REQUESTED":
      return state.activeTransferId ? { ...state, error: null, phase: "CANCELED" } : state;
    case "RESET":
      return { ...createInitialReceiveWorkflow(), sessionRevision: event.revision };
  }
}

export function activeReceiveProductState(
  state: ReceiveWorkflowState
): ProductTransferState | null {
  switch (state) {
    case "CONNECTING":
      return "CONNECTING";
    case "RECEIVING":
      return "TRANSFERRING";
    case "RECONNECTING":
      return "RECONNECTING";
    case "VERIFYING":
      return "VERIFYING";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    case "CANCELED":
      return "CANCELED";
    default:
      return null;
  }
}

export function receiveHealthForProduct(snapshot: ConnectionSnapshot | null): {
  confidence: "HIGH" | "MEDIUM" | "LOW";
  etaMs: number | null;
  state: ProductHealthState;
} | null {
  const health = snapshot?.health;
  if (!health) return null;
  if (snapshot.state === "RECONNECTING" || snapshot.transfer.state === "RECONNECTING")
    return { confidence: "HIGH", etaMs: null, state: "RECONNECTING" };
  if (health.healthState === "GOOD")
    return {
      confidence: health.confidence,
      etaMs: health.confidence === "HIGH" ? health.etaMs : null,
      state: "GOOD"
    };
  if (health.healthState === "STARTING" || health.healthState === "UNKNOWN")
    return { confidence: health.confidence, etaMs: null, state: "NOT_ENOUGH_INFORMATION" };
  if (health.healthState === "STALLED")
    return { confidence: health.confidence, etaMs: null, state: "SLOWER_THAN_EXPECTED" };
  return { confidence: health.confidence, etaMs: null, state: "UNSTABLE" };
}

export function receiveStatusAnnouncement(state: ReceiveWorkflowSnapshot): string {
  switch (state.phase) {
    case "REVIEWING":
      return "Transfer available.";
    case "WAITING_FOR_SENDER":
      return state.incoming ? `Waiting for ${state.incoming.senderName}.` : "Waiting for sender.";
    case "CONNECTING":
      return "Connecting.";
    case "RECEIVING":
      return "Receiving.";
    case "RECONNECTING":
      return "Connection interrupted. Your verified progress is safe. Reconnecting.";
    case "VERIFYING":
      return "Checking transferred data.";
    case "COMPLETED":
      return "Transfer completed and verified.";
    case "FAILED":
      return "Transfer failed.";
    case "CANCELED":
      return "Transfer canceled.";
    default:
      return "";
  }
}
