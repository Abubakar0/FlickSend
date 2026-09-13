import type {
  BrowserCapabilitySnapshot,
  RuntimeCompatibilityDecision
} from "@flicksend/browser-capabilities";
import type { ConnectionSnapshot } from "@flicksend/engine-core";
import type { StreamPackSource } from "@flicksend/stream-pack";
import type {
  ProductErrorViewModel,
  ProductHealthState,
  ProductTransferState
} from "@flicksend/ui";
import type { CurrentUser, SendRecipient } from "./recipients";

export const sendWorkflowStates = [
  "SELECTING_RECIPIENT",
  "SELECTING_SOURCE",
  "PREPARING_SOURCE",
  "READY_TO_REVIEW",
  "WAITING_FOR_RECIPIENT",
  "CONNECTING",
  "TRANSFERRING",
  "RECONNECTING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELED"
] as const;

export type SendWorkflowState = (typeof sendWorkflowStates)[number];
export type SourceKind = "single-file" | "multiple-files" | "folder";

export type PreparedSendSource = {
  kind: SourceKind;
  displayName: string;
  fileCount: number;
  folderCount: number;
  sizeBytes: number;
  transfer: { kind: "file"; file: File } | { kind: "folder"; source: StreamPackSource };
};

export type PreparationProgress = {
  filesDiscovered: number;
  directoriesDiscovered: number;
  totalBytesDiscovered: number;
};

export type ProductSendError = ProductErrorViewModel & { code: string };

export type SendWorkflowSnapshot = {
  activeTransferId: string | null;
  capabilities: BrowserCapabilitySnapshot | null;
  compatibility: RuntimeCompatibilityDecision | null;
  currentUser: CurrentUser;
  engine: ConnectionSnapshot | null;
  error: ProductSendError | null;
  phase: SendWorkflowState;
  preparation: PreparationProgress | null;
  recipient: SendRecipient | null;
  sessionCode: string | null;
  source: PreparedSendSource | null;
  sourceRevision: number;
  startAttempt: number;
};

export type SendWorkflowEvent =
  | {
      type: "CAPABILITIES_RESOLVED";
      capabilities: BrowserCapabilitySnapshot;
      compatibility: RuntimeCompatibilityDecision;
    }
  | { type: "RECIPIENT_SELECTED"; recipient: SendRecipient }
  | { type: "SOURCE_PREPARING"; revision: number }
  | { type: "SOURCE_PROGRESS"; revision: number; progress: PreparationProgress }
  | { type: "SOURCE_PREPARED"; revision: number; source: PreparedSendSource }
  | { type: "SOURCE_FAILED"; revision: number; error: ProductSendError }
  | { type: "SOURCE_CLEARED" }
  | { type: "START_REQUESTED" }
  | { type: "SESSION_CREATED"; code: string }
  | { type: "START_FAILED"; error: ProductSendError }
  | { type: "ENGINE_SNAPSHOT"; snapshot: ConnectionSnapshot }
  | { type: "CANCEL_REQUESTED" }
  | { type: "RESET"; retainRecipient: boolean };

export function createInitialSendWorkflow(currentUser: CurrentUser): SendWorkflowSnapshot {
  return {
    activeTransferId: null,
    capabilities: null,
    compatibility: null,
    currentUser,
    engine: null,
    error: null,
    phase: "SELECTING_RECIPIENT",
    preparation: null,
    recipient: null,
    sessionCode: null,
    source: null,
    sourceRevision: 0,
    startAttempt: 0
  };
}

const sourceChangedCodes = new Set(["FS_SOURCE_CHANGED", "FS_STREAMPACK_SOURCE_CHANGED"]);
const emptySourceCodes = new Set(["FS_SOURCE_EMPTY"]);
const integrityCodes = new Set([
  "FS_BLOCK_INTEGRITY_FAILED",
  "FS_MANIFEST_INTEGRITY_FAILED",
  "FS_MANIFEST_ROOT_MISMATCH"
]);
const recoveryCodes = new Set(["FS_ROUTE_EXHAUSTED", "FS_ROUTE_RECOVERY_FAILED"]);
const peopleBlockedCodes = new Set(["FS_PEOPLE_BLOCKED", "FS_PEOPLE_NOT_ELIGIBLE"]);

export function mapProductError(code: string | null | undefined): ProductSendError {
  if (peopleBlockedCodes.has(code ?? ""))
    return {
      code: "FS-PRODUCT-PEOPLE-BLOCKED",
      kind: "action_required",
      title: "This connection isn't available",
      explanation: "This person is no longer available for a new send.",
      recommendedAction: "Choose a connected person before sending.",
      retryable: false
    };
  if (emptySourceCodes.has(code ?? ""))
    return {
      code: "FS-PRODUCT-SOURCE-UNAVAILABLE",
      kind: "action_required",
      title: "Choose files or a folder",
      explanation: "Choose at least one file or one folder before sending.",
      recommendedAction: "Select files or choose a folder to continue.",
      retryable: false
    };
  if (sourceChangedCodes.has(code ?? ""))
    return {
      code: "FS-PRODUCT-SOURCE-CHANGED",
      kind: "terminal",
      title: "Source changed",
      explanation:
        "The file or folder changed while it was being sent, so this transfer stopped to keep the result correct.",
      recommendedAction: "Choose the updated source and send again.",
      retryable: false
    };
  if (integrityCodes.has(code ?? "") || code?.includes("INTEGRITY"))
    return {
      code: "FS-PRODUCT-INTEGRITY-FAILED",
      kind: "terminal",
      title: "Transfer couldn't be verified",
      explanation: "FlickSend could not verify this transfer. Nothing has been marked complete.",
      recommendedAction: "Send again after checking the source and destination.",
      retryable: false
    };
  if (recoveryCodes.has(code ?? ""))
    return {
      code: "FS-PRODUCT-NETWORK-RECOVERY-FAILED",
      kind: "terminal",
      title: "Couldn't reconnect",
      explanation:
        "FlickSend could not restore this transfer connection. Nothing unverified was marked complete.",
      recommendedAction:
        "Check both connections and start a new transfer if recovery cannot resume.",
      retryable: false
    };
  if (code?.startsWith("FS_CAP_"))
    return {
      code: "FS-PRODUCT-BROWSER-UNAVAILABLE",
      kind: "action_required",
      title: "This browser can't complete that action",
      explanation: "A required browser capability is unavailable or not qualified for this action.",
      recommendedAction: "Use a qualified Windows desktop browser or choose a supported action.",
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
  if (code === "FS_STREAMPACK_PATH_COLLISION")
    return {
      code: "FS-PRODUCT-SOURCE-UNAVAILABLE",
      kind: "action_required",
      title: "Can't prepare the source",
      explanation: "Selected files need distinct names for one transfer.",
      recommendedAction: "Choose a different set of files and try again.",
      retryable: false
    };
  return {
    code: "FS-PRODUCT-UNKNOWN-FAILED",
    kind: "terminal",
    title: "Transfer couldn't continue",
    explanation: "FlickSend stopped this transfer to avoid an incorrect result.",
    recommendedAction: "Try again; if the problem continues, start a new transfer.",
    retryable: false
  };
}

function localSelectionPhase(recipient: SendRecipient | null, source: PreparedSendSource | null) {
  if (!recipient) return "SELECTING_RECIPIENT" as const;
  return source ? ("READY_TO_REVIEW" as const) : ("SELECTING_SOURCE" as const);
}

function isTerminalTransferState(state: string): boolean {
  return state === "FAILED" || state === "INTEGRITY_FAILED" || state === "CANCELLED";
}

function phaseFromEngine(
  current: SendWorkflowSnapshot,
  snapshot: ConnectionSnapshot,
  activeTransferId: string | null
): { phase: SendWorkflowState; error: ProductSendError | null } | null {
  const transfer = snapshot.transfer;
  if (transfer.state === "DELIVERED") {
    if (!activeTransferId || transfer.transferId !== activeTransferId) return null;
    return { phase: "COMPLETED", error: null };
  }
  if (transfer.state === "CANCELLED" || transfer.state === "CANCELLING")
    return { phase: "CANCELED", error: null };
  if (isTerminalTransferState(transfer.state) || snapshot.state === "FAILED")
    return { phase: "FAILED", error: mapProductError(transfer.error ?? snapshot.error) };
  if (snapshot.state === "RECONNECTING" || transfer.state === "RECONNECTING")
    return { phase: "RECONNECTING", error: null };
  if (["SENDING", "RECEIVING"].includes(transfer.state))
    return { phase: "TRANSFERRING", error: null };
  if (["FINALIZING", "TRANSFER_BYTES_COMPLETE", "VERIFYING", "VERIFIED"].includes(transfer.state))
    return { phase: "VERIFYING", error: null };
  if (transfer.state === "READY") return { phase: "WAITING_FOR_RECIPIENT", error: null };
  if (["SIGNALLING_CONNECTING", "NEGOTIATING", "CONNECTING", "CONNECTED"].includes(snapshot.state))
    return { phase: "CONNECTING", error: null };
  if (snapshot.state === "WAITING_FOR_PEER") return { phase: "WAITING_FOR_RECIPIENT", error: null };
  return current.source && current.recipient
    ? { phase: "WAITING_FOR_RECIPIENT", error: null }
    : null;
}

export function reduceSendWorkflow(
  state: SendWorkflowSnapshot,
  event: SendWorkflowEvent
): SendWorkflowSnapshot {
  switch (event.type) {
    case "CAPABILITIES_RESOLVED":
      return { ...state, capabilities: event.capabilities, compatibility: event.compatibility };
    case "RECIPIENT_SELECTED":
      if (
        !["SELECTING_RECIPIENT", "SELECTING_SOURCE", "READY_TO_REVIEW"].includes(state.phase) &&
        !(
          state.activeTransferId === null &&
          ["WAITING_FOR_RECIPIENT", "CONNECTING"].includes(state.phase)
        )
      )
        return state;
      return {
        ...state,
        activeTransferId: null,
        engine: null,
        recipient: event.recipient,
        phase: localSelectionPhase(event.recipient, state.source),
        sessionCode: null,
        sourceRevision: state.sourceRevision + 1
      };
    case "SOURCE_PREPARING":
      if (!state.recipient) return state;
      return {
        ...state,
        activeTransferId: null,
        engine: null,
        error: null,
        phase: "PREPARING_SOURCE",
        preparation: { filesDiscovered: 0, directoriesDiscovered: 0, totalBytesDiscovered: 0 },
        sessionCode: null,
        sourceRevision: event.revision
      };
    case "SOURCE_PROGRESS":
      return event.revision === state.sourceRevision
        ? { ...state, preparation: event.progress }
        : state;
    case "SOURCE_PREPARED":
      return event.revision === state.sourceRevision
        ? {
            ...state,
            error: null,
            phase: "READY_TO_REVIEW",
            preparation: null,
            source: event.source
          }
        : state;
    case "SOURCE_FAILED":
      return event.revision === state.sourceRevision
        ? {
            ...state,
            error: event.error,
            phase: "SELECTING_SOURCE",
            preparation: null,
            source: null
          }
        : state;
    case "SOURCE_CLEARED":
      if (
        !["SELECTING_SOURCE", "READY_TO_REVIEW", "PREPARING_SOURCE"].includes(state.phase) &&
        !(
          state.activeTransferId === null &&
          ["WAITING_FOR_RECIPIENT", "CONNECTING"].includes(state.phase)
        )
      )
        return state;
      return {
        ...state,
        activeTransferId: null,
        engine: null,
        error: null,
        phase: localSelectionPhase(state.recipient, null),
        preparation: null,
        sessionCode: null,
        source: null,
        sourceRevision: state.sourceRevision + 1
      };
    case "START_REQUESTED":
      if (state.phase !== "READY_TO_REVIEW" || !state.recipient || !state.source) return state;
      return {
        ...state,
        activeTransferId: null,
        engine: null,
        error: null,
        phase: "WAITING_FOR_RECIPIENT",
        sessionCode: null,
        startAttempt: state.startAttempt + 1
      };
    case "SESSION_CREATED":
      return { ...state, sessionCode: event.code };
    case "START_FAILED":
      return { ...state, error: event.error, phase: "FAILED" };
    case "ENGINE_SNAPSHOT": {
      const incomingTransferId = event.snapshot.transfer.transferId;
      if (
        state.activeTransferId &&
        incomingTransferId &&
        incomingTransferId !== state.activeTransferId
      )
        return state;
      const activeTransferId = state.activeTransferId ?? incomingTransferId;
      const mapping = phaseFromEngine(state, event.snapshot, activeTransferId);
      return mapping
        ? {
            ...state,
            activeTransferId,
            engine: event.snapshot,
            error: mapping.error,
            phase: mapping.phase
          }
        : { ...state, engine: event.snapshot };
    }
    case "CANCEL_REQUESTED":
      return state.activeTransferId ? { ...state, phase: "CANCELED", error: null } : state;
    case "RESET": {
      const recipient = event.retainRecipient ? state.recipient : null;
      return {
        ...createInitialSendWorkflow(state.currentUser),
        // Capability detection describes the active browser, not a single transfer attempt.
        // Retaining it lets a recovery action safely begin a new send without a stale UI lockout.
        capabilities: state.capabilities,
        compatibility: state.compatibility,
        phase: localSelectionPhase(recipient, null),
        recipient,
        sourceRevision: state.sourceRevision + 1
      };
    }
  }
}

export function isSendReady(state: SendWorkflowSnapshot): boolean {
  return (
    state.phase === "READY_TO_REVIEW" &&
    state.recipient !== null &&
    state.source !== null &&
    state.compatibility !== null &&
    state.compatibility.requiredCapabilityMissing !== true
  );
}

export function activeProductState(state: SendWorkflowState): ProductTransferState | null {
  switch (state) {
    case "WAITING_FOR_RECIPIENT":
      return "WAITING_FOR_RECIPIENT";
    case "CONNECTING":
      return "CONNECTING";
    case "TRANSFERRING":
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

export function healthForProduct(snapshot: ConnectionSnapshot | null): {
  confidence: "HIGH" | "MEDIUM" | "LOW";
  etaMs: number | null;
  state: ProductHealthState;
} | null {
  const health = snapshot?.health;
  if (!health) return null;
  if (snapshot?.state === "RECONNECTING" || snapshot?.transfer.state === "RECONNECTING")
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

export function statusAnnouncement(state: SendWorkflowSnapshot): string {
  const name = state.recipient?.displayName ?? "recipient";
  switch (state.phase) {
    case "WAITING_FOR_RECIPIENT":
      return `Waiting for ${name}.`;
    case "CONNECTING":
      return "Connecting.";
    case "TRANSFERRING":
      return "Transfer started.";
    case "RECONNECTING":
      return "Connection interrupted. Your verified progress is safe. Reconnecting.";
    case "VERIFYING":
      return "Checking everything arrived.";
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
