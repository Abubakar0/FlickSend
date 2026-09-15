"use client";

import {
  AppShell,
  Button,
  Card,
  Cluster,
  ConfirmDialog,
  DropZone,
  ErrorCallout,
  FileSummary,
  Heading,
  Inline,
  Metric,
  Page,
  PageHeader,
  PersonChip,
  PersonRow,
  RouteLabel,
  Stack,
  StatusBadge,
  Text,
  ThemeControl,
  TransferHealth,
  VerifiedProgress,
  formatBytes,
  formatEta,
  formatSpeed,
  useTheme
} from "@flicksend/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createP4MutableFolderFixture,
  createP4RecoveryFolderFixture,
  createP4StructuralFolderFixture
} from "./p4-fixtures";
import {
  developmentCurrentUser,
  developmentRecipients,
  type CurrentUser,
  type SendRecipient
} from "./recipients";
import { SendSessionController } from "./send-controller";
import {
  issueProductionSignallingSession,
  productionWorkerUrl
} from "../signaling/production-client";
import {
  activeProductState,
  healthForProduct,
  isSendReady,
  statusAnnouncement,
  type SendWorkflowState
} from "./send-state";
import type { TransferLifecycleRecorder } from "../transfers/transfer-lifecycle-recorder";
import { RecoveryNotice, useRecoveryNotice } from "../recovery/recovery-notice";

declare global {
  interface Window {
    __flicksendP4?: {
      clearFault: () => void;
      configureIntegrityFailure: () => void;
      configureIntegrityRetry: () => void;
      exhaustRecovery: () => void;
      failService: () => void;
      interruptAfterVerifiedProgress: () => void;
      loadMutableFolderFixture: () => Promise<void>;
      loadRecoveryFolderFixture: () => Promise<void>;
      loadStructuralFolderFixture: () => Promise<void>;
      mutateSelectedFixture: () => void;
      recoveryEvidence: () => {
        committedBlocksRetransmitted: number;
        duplicateRetransmittedBytes: number;
        reconnectCount: number;
        safeBytes: number;
      } | null;
      resumeReconnect: () => Promise<void>;
      simulateDisconnect: () => Promise<void>;
      snapshot: () => ReturnType<SendSessionController["getSnapshot"]>;
    };
  }
}

function ThemeUtility() {
  const theme = useTheme();
  return <ThemeControl preference={theme.preference} onPreferenceChange={theme.setPreference} />;
}

function sourceKind(
  source: NonNullable<ReturnType<SendSessionController["getSnapshot"]>["source"]>
) {
  return source.kind === "folder" ? "folder" : "file";
}

function activePhase(phase: SendWorkflowState): boolean {
  return [
    "WAITING_FOR_RECIPIENT",
    "CONNECTING",
    "TRANSFERRING",
    "RECONNECTING",
    "VERIFYING"
  ].includes(phase);
}

export function SendWorkspace({
  currentUser = developmentCurrentUser,
  lifecycleRecorder,
  recipientSourceReady = true,
  preselectedRecipientId = null,
  recipients = developmentRecipients,
  productionSignalling = false
}: {
  currentUser?: CurrentUser;
  lifecycleRecorder?: TransferLifecycleRecorder;
  recipientSourceReady?: boolean;
  preselectedRecipientId?: string | null;
  productionSignalling?: boolean;
  recipients?: readonly SendRecipient[];
}) {
  const recipientsRef = useRef<readonly SendRecipient[]>(recipients);
  recipientsRef.current = recipientSourceReady ? recipients : [];
  const controllerRef = useRef<SendSessionController | null>(null);
  if (!controllerRef.current) {
    const signalingUrl = productionSignalling
      ? (productionWorkerUrl() ?? "")
      : (process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://127.0.0.1:8787");
    controllerRef.current = new SendSessionController(
      signalingUrl,
      undefined,
      () => recipientsRef.current,
      currentUser,
      productionSignalling ? issueProductionSignallingSession : undefined
    );
  }
  const controller = controllerRef.current;
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot()
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const terminalFocus = useRef<HTMLDivElement>(null);
  const mutableFixture = useRef<ReturnType<typeof createP4MutableFolderFixture> | null>(null);
  const pendingRecipientId = useRef<string | null>(null);
  const preselectedRecipient = useRef<string | null>(null);
  const [receiverLinkCopied, setReceiverLinkCopied] = useState(false);

  useEffect(() => {
    void controller.initializeCapabilities();
    return () => controller.dispose();
  }, [controller]);

  async function copyReceiverLink(): Promise<void> {
    if (!snapshot.receiverPath || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(
        new URL(snapshot.receiverPath, window.location.origin).toString()
      );
      setReceiverLinkCopied(true);
    } catch {
      setReceiverLinkCopied(false);
    }
  }

  useEffect(() => {
    lifecycleRecorder?.observeSend(snapshot);
  }, [lifecycleRecorder, snapshot]);

  useEffect(() => {
    if (
      !recipientSourceReady ||
      !preselectedRecipientId ||
      preselectedRecipient.current === preselectedRecipientId
    )
      return;
    preselectedRecipient.current = preselectedRecipientId;
    const recipient = recipients.find((candidate) => candidate.id === preselectedRecipientId);
    if (recipient) controller.selectRecipient(recipient);
  }, [controller, preselectedRecipientId, recipientSourceReady, recipients]);

  useEffect(() => {
    if (recipientSourceReady) controller.reconcileRecipientEligibility();
  }, [controller, recipientSourceReady, recipients]);

  useEffect(() => {
    if (!recipientSourceReady || !pendingRecipientId.current) return;
    const recipient = recipients.find((candidate) => candidate.id === pendingRecipientId.current);
    pendingRecipientId.current = null;
    if (recipient) controller.selectRecipient(recipient);
  }, [controller, recipientSourceReady, recipients]);

  useEffect(() => {
    if (!["COMPLETED", "FAILED", "CANCELED"].includes(snapshot.phase)) return;
    terminalFocus.current?.focus();
  }, [snapshot.phase]);

  useEffect(() => {
    if (!activePhase(snapshot.phase) || !snapshot.activeTransferId) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [snapshot.activeTransferId, snapshot.phase]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__flicksendP4 = {
      clearFault: () => controller.configureDevelopmentFault(undefined),
      configureIntegrityFailure: () =>
        controller.configureDevelopmentFault({ kind: "payload", blockIndex: 0, mode: "always" }),
      configureIntegrityRetry: () =>
        controller.configureDevelopmentFault({ kind: "payload", blockIndex: 0, mode: "once" }),
      exhaustRecovery: () => controller.exhaustDevelopmentRecovery(),
      failService: () => controller.failDevelopmentService(),
      interruptAfterVerifiedProgress: () =>
        controller.armDevelopmentInterruptAfterVerifiedProgress(),
      loadMutableFolderFixture: async () => {
        const fixture = createP4MutableFolderFixture();
        mutableFixture.current = fixture;
        await controller.selectDevelopmentFolderFixture(
          "folder",
          "Mutable Footage",
          fixture.source
        );
      },
      loadRecoveryFolderFixture: () =>
        controller.selectDevelopmentFolderFixture(
          "folder",
          "Recovery Footage",
          createP4RecoveryFolderFixture()
        ),
      loadStructuralFolderFixture: () =>
        controller.selectDevelopmentFolderFixture(
          "folder",
          "Project Footage",
          createP4StructuralFolderFixture()
        ),
      mutateSelectedFixture: () => mutableFixture.current?.mutate(),
      recoveryEvidence: () => {
        const transfer = controller.getSnapshot().engine?.transfer;
        return transfer
          ? {
              committedBlocksRetransmitted: transfer.continuity.committedBlocksRetransmitted,
              duplicateRetransmittedBytes: transfer.continuity.duplicateRetransmittedBytes,
              reconnectCount: transfer.reconnectCount,
              safeBytes: transfer.safeBytes
            }
          : null;
      },
      resumeReconnect: () => controller.resumeDevelopmentReconnect(),
      simulateDisconnect: () => controller.simulateDevelopmentDisconnect(),
      snapshot: () => controller.getSnapshot()
    };
    return () => {
      delete window.__flicksendP4;
    };
  }, [controller]);

  const transfer = snapshot.engine?.transfer;
  const productState = activeProductState(snapshot.phase);
  const health = healthForProduct(snapshot.engine);
  const recovery = useRecoveryNotice({
    actor: "sender",
    error: snapshot.error,
    integrityRetryCount: transfer?.integrity.integrityRetryCount ?? 0,
    phase: snapshot.phase
  });
  const canEditSelection =
    ["SELECTING_RECIPIENT", "SELECTING_SOURCE", "PREPARING_SOURCE", "READY_TO_REVIEW"].includes(
      snapshot.phase
    ) ||
    (snapshot.activeTransferId === null &&
      ["WAITING_FOR_RECIPIENT", "CONNECTING"].includes(snapshot.phase));
  const canChooseSource = snapshot.recipient !== null && canEditSelection;
  const sendReady = isSendReady(snapshot);
  const route =
    snapshot.engine?.route.routeType === "DIRECT"
      ? "Direct"
      : snapshot.engine?.route.routeType === "RELAY"
        ? "Relayed"
        : null;

  return (
    <AppShell
      activeId="send"
      navigation={[
        { href: "/send", id: "send", label: "Send" },
        { href: "/people", id: "people", label: "People" },
        { href: "/transfers", id: "transfers", label: "Transfers" }
      ]}
      utility={<ThemeUtility />}
    >
      <Page className="p4-send-page">
        <div aria-atomic="true" aria-live="polite" className="p4-sr-status">
          {recovery?.mode === "recovered"
            ? "Connection restored. Transfer continuing."
            : statusAnnouncement(snapshot)}
        </div>
        <PageHeader eyebrow="FlickSend">
          <Heading as="h1" size="page">
            Send a file or folder
          </Heading>
          <Text tone="secondary">
            Choose a person, choose what to send, and FlickSend will verify it before completion.
          </Text>
        </PageHeader>

        <Stack gap="lg">
          <Card className="p4-send-card" aria-labelledby="p4-recipient-title">
            <Stack gap="md">
              <div>
                <Text as="p" size="label" tone="muted">
                  1. Recipient
                </Text>
                <Heading as="h2" id="p4-recipient-title" size="section">
                  Choose who you&apos;re sending to
                </Heading>
              </div>
              <div className="p4-recipient-list">
                {recipients.map((recipient) => {
                  const selected = snapshot.recipient?.id === recipient.id;
                  return (
                    <PersonRow
                      action={
                        <Button
                          aria-pressed={selected}
                          disabled={!canEditSelection}
                          onClick={() => {
                            if (recipientSourceReady) controller.selectRecipient(recipient);
                            else pendingRecipientId.current = recipient.id;
                          }}
                          size="sm"
                          variant={selected ? "primary" : "secondary"}
                        >
                          {selected ? "Selected" : `Send to ${recipient.displayName}`}
                        </Button>
                      }
                      key={recipient.id}
                      person={{ name: recipient.displayName, presence: recipient.presence }}
                    />
                  );
                })}
              </div>
              <Text as="p" size="small" tone="muted">
                Recipient availability is advisory. Live transfer begins when the recipient is
                ready.
              </Text>
            </Stack>
          </Card>

          <Card className="p4-send-card" aria-labelledby="p4-source-title">
            <Stack gap="md">
              <div>
                <Text as="p" size="label" tone="muted">
                  2. Source
                </Text>
                <Heading as="h2" id="p4-source-title" size="section">
                  Choose files or a folder
                </Heading>
              </div>
              <input
                aria-label="Source files"
                className="p4-file-input"
                multiple
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.currentTarget.value = "";
                  void controller.selectFiles(files);
                }}
                ref={fileInput}
                type="file"
              />
              <DropZone
                disabled={!canChooseSource}
                onSelectFiles={() => fileInput.current?.click()}
                onSelectFolder={() => void controller.selectFolder()}
                state={snapshot.phase === "PREPARING_SOURCE" ? "drag-active" : "idle"}
                supportingText={
                  snapshot.recipient
                    ? "Choose one or more files, or choose one folder."
                    : "Choose a recipient before selecting a source."
                }
              />
              {snapshot.phase === "PREPARING_SOURCE" ? (
                <div className="p4-preparing" role="status">
                  <strong>Preparing folder…</strong>
                  {snapshot.preparation &&
                  (snapshot.preparation.filesDiscovered > 0 ||
                    snapshot.preparation.directoriesDiscovered > 0) ? (
                    <span>
                      {snapshot.preparation.filesDiscovered} files ·{" "}
                      {snapshot.preparation.directoriesDiscovered} folders ·{" "}
                      {formatBytes(snapshot.preparation.totalBytesDiscovered)}
                    </span>
                  ) : (
                    <span>Reading source details without loading file contents.</span>
                  )}
                </div>
              ) : null}
              {snapshot.source ? (
                <div className="p4-source-summary" data-testid="send-source-summary">
                  <FileSummary
                    fileCount={snapshot.source.fileCount}
                    folderCount={snapshot.source.folderCount}
                    kind={sourceKind(snapshot.source)}
                    name={snapshot.source.displayName}
                    sizeBytes={snapshot.source.sizeBytes}
                  />
                  {canEditSelection ? (
                    <Cluster>
                      <Button onClick={() => fileInput.current?.click()} size="sm" variant="quiet">
                        Change files
                      </Button>
                      <Button onClick={() => controller.clearSource()} size="sm" variant="quiet">
                        Clear source
                      </Button>
                    </Cluster>
                  ) : null}
                </div>
              ) : null}
              {snapshot.error && snapshot.phase !== "FAILED" ? (
                <ErrorCallout error={snapshot.error} />
              ) : null}
            </Stack>
          </Card>

          {snapshot.phase === "READY_TO_REVIEW" && snapshot.recipient && snapshot.source ? (
            <Card className="p4-send-card p4-review" aria-labelledby="p4-review-title">
              <Stack gap="md">
                <div>
                  <Text as="p" size="label" tone="muted">
                    3. Review
                  </Text>
                  <Heading as="h2" id="p4-review-title" size="section">
                    Ready to send
                  </Heading>
                </div>
                <Inline align="center" gap="md">
                  <PersonChip
                    person={{
                      name: snapshot.recipient.displayName,
                      presence: snapshot.recipient.presence
                    }}
                  />
                  <Text as="span" tone="secondary">
                    {snapshot.source.displayName}
                  </Text>
                </Inline>
                <div className="p4-review-metrics">
                  <Metric label="Size" value={formatBytes(snapshot.source.sizeBytes)} />
                  <Metric label="Contents" value={`${snapshot.source.fileCount} files`} />
                  {snapshot.source.folderCount > 0 ? (
                    <Metric label="Folders" value={snapshot.source.folderCount} />
                  ) : null}
                </div>
                {snapshot.compatibility?.requiredCapabilityMissing ? (
                  <ErrorCallout error={mapBrowserError()} />
                ) : null}
                <div className="p4-send-action">
                  <Button disabled={!sendReady} onClick={() => void controller.start()} size="lg">
                    Send
                  </Button>
                  <Text as="p" size="small" tone="muted">
                    Keep FlickSend open while sending.
                  </Text>
                </div>
              </Stack>
            </Card>
          ) : null}

          {activePhase(snapshot.phase) && snapshot.recipient && snapshot.source ? (
            <Card className="p4-send-card p4-transfer" data-testid="send-active-transfer">
              <Stack gap="lg">
                <div className="p4-transfer-heading">
                  <div>
                    <Text as="p" size="label" tone="muted">
                      Sending to
                    </Text>
                    <Heading as="h2" size="section">
                      {snapshot.phase === "WAITING_FOR_RECIPIENT"
                        ? `Waiting for ${snapshot.recipient.displayName}`
                        : snapshot.phase === "CONNECTING"
                          ? "Connecting…"
                          : snapshot.phase === "RECONNECTING"
                            ? "Reconnecting…"
                            : snapshot.phase === "VERIFYING"
                              ? "Checking everything arrived…"
                              : "Sending"}
                    </Heading>
                  </div>
                  {productState ? <StatusBadge state={productState} /> : null}
                </div>
                <FileSummary
                  fileCount={snapshot.source.fileCount}
                  folderCount={snapshot.source.folderCount}
                  kind={sourceKind(snapshot.source)}
                  name={snapshot.source.displayName}
                  sizeBytes={snapshot.source.sizeBytes}
                />
                {transfer ? (
                  <>
                    <VerifiedProgress
                      label="Transfer progress"
                      transferred={
                        (transfer.bytesTransferred / Math.max(transfer.bytesTotal, 1)) * 100
                      }
                      verified={(transfer.safeBytes / Math.max(transfer.bytesTotal, 1)) * 100}
                    />
                    <div className="p4-transfer-metrics">
                      <Metric
                        label="Transferred"
                        value={`${formatBytes(transfer.bytesTransferred)} of ${formatBytes(transfer.bytesTotal)}`}
                      />
                      <Metric
                        label="Speed"
                        value={formatSpeed(
                          health?.state === "NOT_ENOUGH_INFORMATION"
                            ? null
                            : health
                              ? transfer.currentBps || null
                              : null
                        )}
                      />
                      <Metric
                        label="Time remaining"
                        value={formatEta(
                          health?.etaMs ?? null,
                          health?.etaMs === null ? "calculating" : "known"
                        )}
                      />
                      {route ? <Metric label="Route" value={<RouteLabel route={route} />} /> : null}
                    </div>
                  </>
                ) : null}
                {snapshot.phase === "WAITING_FOR_RECIPIENT" ? (
                  <Text tone="secondary">
                    Keep FlickSend open. The transfer will start when{" "}
                    {snapshot.recipient.displayName} is ready.
                  </Text>
                ) : null}
                {recovery && snapshot.phase !== "FAILED" ? (
                  <RecoveryNotice
                    details={
                      transfer
                        ? [
                            { label: "Route", value: route ?? "Unavailable" },
                            { label: "Reconnects", value: String(transfer.reconnectCount) },
                            {
                              label: "Integrity retries",
                              value: String(transfer.integrity.integrityRetryCount)
                            }
                          ]
                        : []
                    }
                    presentation={recovery}
                  />
                ) : null}
                {health && snapshot.phase !== "RECONNECTING" ? (
                  <TransferHealth confidence={health.confidence} state={health.state} />
                ) : null}
                {snapshot.activeTransferId ? (
                  <ConfirmDialog
                    actionLabel="Cancel transfer"
                    description="This will stop the current transfer. It will not be marked complete."
                    onConfirm={() => controller.cancel()}
                    title="Cancel transfer?"
                    trigger={<Button variant="danger">Cancel transfer</Button>}
                  >
                    <Text as="p" tone="secondary">
                      Current transfer activity will stop.
                    </Text>
                  </ConfirmDialog>
                ) : null}
              </Stack>
            </Card>
          ) : null}

          {snapshot.phase === "COMPLETED" && snapshot.recipient && snapshot.source ? (
            <div ref={terminalFocus} tabIndex={-1}>
              <Card className="p4-send-card p4-completion">
                <Stack gap="md">
                  <StatusBadge state="COMPLETED" />
                  <Heading as="h2" size="section">
                    Sent to {snapshot.recipient.displayName}
                  </Heading>
                  <FileSummary
                    fileCount={snapshot.source.fileCount}
                    folderCount={snapshot.source.folderCount}
                    kind={sourceKind(snapshot.source)}
                    name={snapshot.source.displayName}
                    sizeBytes={snapshot.source.sizeBytes}
                  />
                  <Text>Completed and verified.</Text>
                  <Button onClick={() => controller.reset()}>Send something else</Button>
                </Stack>
              </Card>
            </div>
          ) : null}

          {snapshot.phase === "FAILED" && recovery ? (
            <div
              className="p4-terminal"
              data-testid="send-terminal-error"
              ref={terminalFocus}
              tabIndex={-1}
            >
              <RecoveryNotice presentation={recovery} onAction={() => controller.reset()} />
            </div>
          ) : null}

          {snapshot.phase === "CANCELED" ? (
            <div ref={terminalFocus} tabIndex={-1}>
              <Card className="p4-send-card p4-completion">
                <Stack gap="md">
                  <StatusBadge state="CANCELED" />
                  <Heading as="h2" size="section">
                    Transfer canceled
                  </Heading>
                  <Text tone="secondary">Nothing has been marked complete.</Text>
                  <Button onClick={() => controller.reset()}>Start a new send</Button>
                </Stack>
              </Card>
            </div>
          ) : null}

          {process.env.NODE_ENV !== "production" && snapshot.sessionCode ? (
            <details className="p4-development-handoff">
              <summary>Development receiver handoff</summary>
              <Text as="p" size="small" tone="secondary">
                Development harness only. This temporary session code is not a production
                invitation.
              </Text>
              <code data-testid="p4-development-session-code">{snapshot.sessionCode}</code>
            </details>
          ) : null}

          {snapshot.receiverPath && snapshot.phase === "WAITING_FOR_RECIPIENT" ? (
            <Card className="p4-send-card">
              <Stack gap="sm">
                <Heading as="h2" size="section">
                  Invite your recipient to join
                </Heading>
                <Text tone="secondary">
                  Share this private transfer link with your selected recipient. It expires shortly.
                </Text>
                <Inline gap="sm">
                  <Button onClick={() => void copyReceiverLink()}>Copy transfer link</Button>
                  {receiverLinkCopied ? <Text role="status">Transfer link copied.</Text> : null}
                </Inline>
              </Stack>
            </Card>
          ) : null}
        </Stack>
      </Page>
    </AppShell>
  );
}

function mapBrowserError() {
  return {
    code: "FS-PRODUCT-BROWSER-UNAVAILABLE",
    kind: "action_required" as const,
    title: "This browser can't complete that action",
    explanation: "A required browser capability is unavailable or not qualified for this action.",
    recommendedAction: "Use a qualified Windows desktop browser or choose a supported action.",
    retryable: false
  };
}
