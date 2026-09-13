export const productTransferStates = [
  "PREPARING",
  "WAITING_FOR_RECIPIENT",
  "WAITING_FOR_SENDER",
  "CONNECTING",
  "TRANSFERRING",
  "RECONNECTING",
  "PAUSED",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELED"
] as const;

export type ProductTransferState = (typeof productTransferStates)[number];
export type StatusTone =
  "neutral" | "active" | "info" | "recovering" | "success" | "warning" | "danger";

export type StatusPresentation = {
  label: string;
  detail: string;
  tone: StatusTone;
};

const transferStatePresentation: Record<ProductTransferState, StatusPresentation> = {
  PREPARING: { label: "Preparing", detail: "Preparing your selected items.", tone: "neutral" },
  WAITING_FOR_RECIPIENT: {
    label: "Waiting for recipient",
    detail: "Ready when the recipient accepts.",
    tone: "info"
  },
  WAITING_FOR_SENDER: {
    label: "Waiting for sender",
    detail: "Ready when the sender starts the transfer.",
    tone: "info"
  },
  CONNECTING: { label: "Connecting", detail: "Connecting to the recipient.", tone: "active" },
  TRANSFERRING: { label: "Transferring", detail: "Transfer in progress.", tone: "active" },
  RECONNECTING: {
    label: "Reconnecting",
    detail: "Connection interrupted. Your verified progress is safe.",
    tone: "recovering"
  },
  PAUSED: { label: "Paused", detail: "Transfer is paused.", tone: "warning" },
  VERIFYING: {
    label: "Verifying",
    detail: "Checking that everything arrived correctly.",
    tone: "info"
  },
  COMPLETED: { label: "Completed", detail: "Completed and verified.", tone: "success" },
  FAILED: { label: "Needs attention", detail: "This transfer could not continue.", tone: "danger" },
  CANCELED: { label: "Canceled", detail: "This transfer was canceled.", tone: "neutral" }
};

export function getTransferStatusPresentation(state: ProductTransferState): StatusPresentation {
  return transferStatePresentation[state];
}

export const transferHealthStates = [
  "GOOD",
  "UNSTABLE",
  "RECONNECTING",
  "SLOWER_THAN_EXPECTED",
  "NOT_ENOUGH_INFORMATION"
] as const;

export type ProductHealthState = (typeof transferHealthStates)[number];
export type HealthConfidence = "HIGH" | "MEDIUM" | "LOW";

const healthPresentation: Record<ProductHealthState, StatusPresentation> = {
  GOOD: {
    label: "Connection looks good",
    detail: "Transfer conditions look stable.",
    tone: "success"
  },
  UNSTABLE: {
    label: "Connection is unstable",
    detail: "The transfer may vary while conditions settle.",
    tone: "warning"
  },
  RECONNECTING: {
    label: "Reconnecting",
    detail: "Connection interrupted. Your verified progress is safe.",
    tone: "recovering"
  },
  SLOWER_THAN_EXPECTED: {
    label: "Slower than expected",
    detail: "The transfer is taking longer than its recent pace suggests.",
    tone: "warning"
  },
  NOT_ENOUGH_INFORMATION: {
    label: "Not enough information yet",
    detail: `${workingBrand.shortName} is still gathering safe transfer signals.`,
    tone: "neutral"
  }
};

export function getHealthPresentation(state: ProductHealthState): StatusPresentation {
  return healthPresentation[state];
}

export type ProductErrorKind = "recovering" | "action_required" | "terminal";

export type ProductErrorViewModel = {
  kind: ProductErrorKind;
  title: string;
  explanation: string;
  recommendedAction: string;
  retryable: boolean;
  supportReference?: string;
};

export const productErrorFixtures = {
  reconnecting: {
    kind: "recovering",
    title: "Reconnecting",
    explanation: "The connection was interrupted. Your verified progress is safe.",
    recommendedAction: `Keep ${workingBrand.shortName} open while it reconnects.`,
    retryable: true
  },
  sourceChanged: {
    kind: "terminal",
    title: "Source changed",
    explanation:
      "The file or folder changed while it was being sent, so this transfer stopped to keep the result correct.",
    recommendedAction: "Choose the updated source and send again.",
    retryable: false
  },
  destinationPermission: {
    kind: "action_required",
    title: "Can't save there",
    explanation: `${workingBrand.shortName} no longer has permission to write to this destination.`,
    recommendedAction: "Choose or reauthorize a destination, then retry when supported.",
    retryable: true
  },
  integrityFailed: {
    kind: "terminal",
    title: "Transfer couldn't be verified",
    explanation: `${workingBrand.shortName} could not verify this transfer. Nothing has been marked complete.`,
    recommendedAction: "Send again after checking the source and destination.",
    retryable: false
  }
} as const satisfies Record<string, ProductErrorViewModel>;
import { workingBrand } from "./brand.js";
