import type { ProductErrorViewModel } from "@flicksend/ui";

export type RecoveryReason =
  | "NETWORK_INTERRUPTION"
  | "ROUTE_RECOVERY"
  | "SENDER_UNAVAILABLE"
  | "RECIPIENT_UNAVAILABLE"
  | "SOURCE_CHANGED"
  | "DESTINATION_CHANGED"
  | "DESTINATION_PERMISSION_LOST"
  | "DESTINATION_UNAVAILABLE"
  | "STORAGE_FULL"
  | "INTEGRITY_RETRY"
  | "INTEGRITY_EXHAUSTED"
  | "SERVICE_UNAVAILABLE"
  | "BROWSER_CAPABILITY"
  | "UNKNOWN";

export type RecoveryMode = "automatic" | "action_required" | "terminal" | "recovered";
export type ProgressSafety = "safe" | "unknown" | "not_applicable";
export type RecoveryAction =
  | "ASK_SENDER_TO_START_AGAIN"
  | "CHOOSE_DESTINATION"
  | "CHOOSE_SOURCE_AGAIN"
  | "NONE"
  | "RETURN_TO_TRANSFERS"
  | "START_NEW_SEND"
  | "TRY_CONNECTING_AGAIN";

export type RecoveryActor = "recipient" | "sender";

export type RecoveryViewModel = {
  action: RecoveryAction;
  explanation: string;
  mode: RecoveryMode;
  newTransferRequired: boolean;
  progressSafety: ProgressSafety;
  reason: RecoveryReason;
  recommendedAction: string;
  severity: "danger" | "info" | "warning";
  title: string;
};

export type RecoveryPresentationInput = {
  actor: RecoveryActor;
  error: (ProductErrorViewModel & { code: string }) | null;
  integrityRetryCount: number;
  phase: string;
};

const terminalErrorReasons: Record<string, RecoveryReason> = {
  "FS-PRODUCT-BROWSER-UNAVAILABLE": "BROWSER_CAPABILITY",
  "FS-PRODUCT-DESTINATION-CHANGED": "DESTINATION_CHANGED",
  "FS-PRODUCT-DESTINATION-FINALIZE": "DESTINATION_UNAVAILABLE",
  "FS-PRODUCT-DESTINATION-PERMISSION": "DESTINATION_PERMISSION_LOST",
  "FS-PRODUCT-DESTINATION-UNAVAILABLE": "DESTINATION_UNAVAILABLE",
  "FS-PRODUCT-INTEGRITY-FAILED": "INTEGRITY_EXHAUSTED",
  "FS-PRODUCT-NETWORK-RECOVERY-FAILED": "ROUTE_RECOVERY",
  "FS-PRODUCT-SERVICE-UNAVAILABLE": "SERVICE_UNAVAILABLE",
  "FS-PRODUCT-SOURCE-CHANGED": "SOURCE_CHANGED",
  "FS-PRODUCT-SOURCE-UNAVAILABLE": "SOURCE_CHANGED",
  "FS-PRODUCT-STORAGE-FULL": "STORAGE_FULL"
};

function terminalAction(reason: RecoveryReason, actor: RecoveryActor): RecoveryAction {
  if (reason === "SOURCE_CHANGED")
    return actor === "sender" ? "CHOOSE_SOURCE_AGAIN" : "ASK_SENDER_TO_START_AGAIN";
  if (["DESTINATION_PERMISSION_LOST", "DESTINATION_UNAVAILABLE", "STORAGE_FULL"].includes(reason))
    return actor === "recipient" ? "CHOOSE_DESTINATION" : "START_NEW_SEND";
  return actor === "sender" ? "START_NEW_SEND" : "ASK_SENDER_TO_START_AGAIN";
}

function actionLabel(action: RecoveryAction): string {
  switch (action) {
    case "ASK_SENDER_TO_START_AGAIN":
      return "Ask sender to start a new transfer";
    case "CHOOSE_DESTINATION":
      return "Choose another destination";
    case "CHOOSE_SOURCE_AGAIN":
      return "Choose source again";
    case "RETURN_TO_TRANSFERS":
      return "Return to transfers";
    case "START_NEW_SEND":
      return "Start a new send";
    case "TRY_CONNECTING_AGAIN":
      return "Try connecting again";
    case "NONE":
      return "";
  }
}

function terminalPresentation(
  error: ProductErrorViewModel & { code: string },
  actor: RecoveryActor
): RecoveryViewModel {
  const reason = terminalErrorReasons[error.code] ?? "UNKNOWN";
  const action = terminalAction(reason, actor);
  return {
    action,
    explanation: error.explanation,
    mode: error.kind === "action_required" ? "action_required" : "terminal",
    newTransferRequired: [
      "SOURCE_CHANGED",
      "DESTINATION_CHANGED",
      "INTEGRITY_EXHAUSTED",
      "ROUTE_RECOVERY"
    ].includes(reason),
    progressSafety: "not_applicable",
    reason,
    recommendedAction: actionLabel(action) || error.recommendedAction,
    severity: error.kind === "action_required" ? "warning" : "danger",
    title: error.title
  };
}

/**
 * Presentation-only mapping from already-authoritative product snapshots. It has no recovery
 * authority: `RECONNECTING`, error codes, and integrity retry counts originate in P4/P5/engine.
 */
export function recoveryPresentation(input: RecoveryPresentationInput): RecoveryViewModel | null {
  if (input.phase === "RECONNECTING")
    return {
      action: "NONE",
      explanation: "Connection interrupted. Your verified progress is safe.",
      mode: "automatic",
      newTransferRequired: false,
      progressSafety: "safe",
      reason: "NETWORK_INTERRUPTION",
      recommendedAction: "Keep FlickSend open while it reconnects.",
      severity: "info",
      title: "Reconnecting"
    };
  if (
    input.integrityRetryCount > 0 &&
    ["TRANSFERRING", "RECEIVING", "VERIFYING"].includes(input.phase)
  )
    return {
      action: "NONE",
      explanation: "FlickSend is checking what can continue safely.",
      mode: "automatic",
      newTransferRequired: false,
      progressSafety: "unknown",
      reason: "INTEGRITY_RETRY",
      recommendedAction: "Keep FlickSend open while checking continues.",
      severity: "info",
      title: "Checking transferred data"
    };
  return input.error ? terminalPresentation(input.error, input.actor) : null;
}

export function recoveredPresentation(): RecoveryViewModel {
  return {
    action: "NONE",
    explanation: "Continuing from verified progress.",
    mode: "recovered",
    newTransferRequired: false,
    progressSafety: "safe",
    reason: "ROUTE_RECOVERY",
    recommendedAction: "Keep FlickSend open while the transfer continues.",
    severity: "info",
    title: "Connection restored"
  };
}

export function recoveryActionLabel(action: RecoveryAction): string | null {
  return action === "NONE" ? null : actionLabel(action);
}
