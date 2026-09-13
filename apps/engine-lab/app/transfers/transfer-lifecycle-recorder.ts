import type { ProductHealthState } from "@flicksend/ui";
import type { ReceiveWorkflowSnapshot } from "../receive/receive-state";
import type { SendWorkflowSnapshot, SourceKind } from "../send/send-state";
import {
  speedProofSummary,
  type SafeFailureCategory,
  type TransferLifecycleEvent
} from "./transfer-types";
import { TransfersController } from "./transfers-controller";

const minimumPersistenceIntervalMs = 750;

/**
 * Converts prepared P4/P5 workflow snapshots into bounded lifecycle transitions. It keeps engine
 * transfer identity only in this runtime map and sends an unrelated opaque lifecycle key to P7.
 */
export class TransferLifecycleRecorder {
  private readonly lifecycleKeyByTransferIdentity = new Map<string, string>();
  private readonly lastPersistedAtByLifecycleKey = new Map<string, number>();

  constructor(
    private readonly controller: TransfersController,
    private readonly now: () => number = () => Date.now()
  ) {}

  observeSend(snapshot: SendWorkflowSnapshot): void {
    const transferIdentity = snapshot.activeTransferId;
    const source = snapshot.source;
    const recipient = snapshot.recipient;
    if (!transferIdentity || !source || !recipient) return;
    const status = sendStatus(snapshot.phase);
    if (!status) return;
    this.persist(
      transferIdentity,
      this.event({
        active: activeMetadata(snapshot.engine),
        deliveryConfirmed: delivered(
          transferIdentity,
          snapshot.engine?.transfer.transferId,
          snapshot.engine?.transfer.state
        ),
        direction: "sent",
        failureCategory: failureCategory(snapshot.error?.code),
        fileCount: source.fileCount,
        folderCount: source.folderCount,
        peerPersonId: recipient.id,
        productStatus: status,
        sourceKind: sourceKind(source.kind),
        speedProof: speedProofSummary(snapshot.engine?.speedProof ?? null),
        totalBytes: source.sizeBytes
      })
    );
  }

  observeReceive(snapshot: ReceiveWorkflowSnapshot, peerPersonId: string | null): void {
    const transferIdentity = snapshot.activeTransferId;
    const incoming = snapshot.incoming;
    if (!transferIdentity || !incoming) return;
    const status = receiveStatus(snapshot.phase);
    if (!status) return;
    this.persist(
      transferIdentity,
      this.event({
        active: activeMetadata(snapshot.engine),
        deliveryConfirmed: delivered(
          transferIdentity,
          snapshot.engine?.transfer.transferId,
          snapshot.engine?.transfer.state
        ),
        direction: "received",
        failureCategory: failureCategory(snapshot.error?.code),
        fileCount: incoming.fileCount,
        folderCount: incoming.folderCount,
        peerPersonId,
        productStatus: status,
        sourceKind: incomingSourceKind(incoming.fileCount, incoming.folderCount),
        speedProof: speedProofSummary(snapshot.engine?.speedProof ?? null),
        totalBytes: incoming.sizeBytes
      })
    );
  }

  private event(
    event: Omit<TransferLifecycleEvent, "lifecycleKey">
  ): Omit<TransferLifecycleEvent, "lifecycleKey"> {
    return event;
  }

  private persist(
    transferIdentity: string,
    event: Omit<TransferLifecycleEvent, "lifecycleKey">
  ): void {
    const lifecycleKey =
      this.lifecycleKeyByTransferIdentity.get(transferIdentity) ?? this.newLifecycleKey();
    this.lifecycleKeyByTransferIdentity.set(transferIdentity, lifecycleKey);
    const terminal = ["COMPLETED", "FAILED", "CANCELED"].includes(event.productStatus);
    const now = this.now();
    const last = this.lastPersistedAtByLifecycleKey.get(lifecycleKey) ?? 0;
    if (!terminal && now - last < minimumPersistenceIntervalMs) return;
    this.lastPersistedAtByLifecycleKey.set(lifecycleKey, now);
    this.controller.record({ ...event, lifecycleKey });
  }

  private newLifecycleKey(): string {
    return `p7-${crypto.randomUUID()}`;
  }
}

function activeMetadata(
  snapshot: SendWorkflowSnapshot["engine"] | ReceiveWorkflowSnapshot["engine"]
) {
  const transfer = snapshot?.transfer;
  if (!transfer) return null;
  return {
    currentPayloadSpeedBps: transfer.currentBps || null,
    etaMs: snapshot?.health?.etaMs ?? null,
    health: healthState(snapshot),
    route:
      snapshot?.route.routeType === "DIRECT"
        ? ("Direct" as const)
        : snapshot?.route.routeType === "RELAY"
          ? ("Relayed" as const)
          : null,
    transferredBytes: transfer.bytesTransferred,
    verifiedBytes: transfer.safeBytes
  };
}

function healthState(
  snapshot: SendWorkflowSnapshot["engine"] | ReceiveWorkflowSnapshot["engine"]
): ProductHealthState | null {
  const health = snapshot?.health;
  if (!health) return null;
  if (snapshot.state === "RECONNECTING" || snapshot.transfer.state === "RECONNECTING")
    return "RECONNECTING";
  if (health.healthState === "GOOD") return "GOOD";
  if (health.healthState === "STALLED") return "SLOWER_THAN_EXPECTED";
  if (health.healthState === "DEGRADED") return "UNSTABLE";
  return "NOT_ENOUGH_INFORMATION";
}

function delivered(
  activeTransferIdentity: string,
  snapshotTransferIdentity: string | null | undefined,
  state: string | undefined
): boolean {
  return state === "DELIVERED" && activeTransferIdentity === snapshotTransferIdentity;
}

function sendStatus(
  phase: SendWorkflowSnapshot["phase"]
): TransferLifecycleEvent["productStatus"] | null {
  switch (phase) {
    case "WAITING_FOR_RECIPIENT":
    case "CONNECTING":
    case "TRANSFERRING":
    case "RECONNECTING":
    case "VERIFYING":
    case "COMPLETED":
    case "FAILED":
    case "CANCELED":
      return phase;
    default:
      return null;
  }
}

function receiveStatus(
  phase: ReceiveWorkflowSnapshot["phase"]
): TransferLifecycleEvent["productStatus"] | null {
  switch (phase) {
    case "WAITING_FOR_SENDER":
    case "CONNECTING":
    case "RECEIVING":
      return phase === "RECEIVING" ? "TRANSFERRING" : phase;
    case "RECONNECTING":
    case "VERIFYING":
    case "COMPLETED":
    case "FAILED":
    case "CANCELED":
      return phase;
    default:
      return null;
  }
}

function sourceKind(kind: SourceKind): TransferLifecycleEvent["sourceKind"] {
  return kind === "single-file"
    ? "single_file"
    : kind === "multiple-files"
      ? "multiple_files"
      : "folder";
}

function incomingSourceKind(
  fileCount: number | null,
  folderCount: number | null
): TransferLifecycleEvent["sourceKind"] {
  if ((folderCount ?? 0) > 0) return "folder";
  return fileCount === 1 ? "single_file" : "multiple_files";
}

function failureCategory(code: string | undefined): SafeFailureCategory | null {
  if (!code) return null;
  if (code.includes("INTEGRITY")) return "INTEGRITY";
  if (code.includes("SOURCE")) return "SOURCE";
  if (code.includes("DESTINATION") || code.includes("STORAGE")) return "DESTINATION";
  if (code.includes("NETWORK") || code.includes("ROUTE")) return "NETWORK";
  if (code.includes("SERVICE") || code.includes("TURN") || code.includes("ICE")) return "SERVICE";
  if (code.includes("BROWSER") || code.includes("CAP_")) return "BROWSER";
  return "UNKNOWN";
}
