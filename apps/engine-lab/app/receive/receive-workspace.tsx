"use client";

import {
  AppShell,
  Button,
  Card,
  Cluster,
  ConfirmDialog,
  ErrorCallout,
  FileSummary,
  Heading,
  Inline,
  Metric,
  Page,
  PageHeader,
  PersonChip,
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
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ReceiveSessionController } from "./receive-controller";
import type { TransferLifecycleRecorder } from "../transfers/transfer-lifecycle-recorder";
import {
  activeReceiveProductState,
  receiveHealthForProduct,
  receiveStatusAnnouncement,
  type IncomingTransferSummary,
  type ReceiveWorkflowState
} from "./receive-state";
import { RecoveryNotice, useRecoveryNotice } from "../recovery/recovery-notice";

declare global {
  interface Window {
    __flicksendP5?: {
      configureDestinationFailure: (
        code:
          | "FS_DESTINATION_PERMISSION_DENIED"
          | "FS_DESTINATION_STORAGE_FULL"
          | "FS_PRODUCT_DESTINATION_UNAVAILABLE"
          | undefined
      ) => void;
      configureFinalizationFailure: (enabled: boolean) => void;
      fixtureFileDigest: () => Promise<string | null>;
      fixtureFolderDigests: () => Promise<Record<number, string> | null>;
      mutateDestination: () => void;
      snapshot: () => ReturnType<ReceiveSessionController["getSnapshot"]>;
    };
  }
}

function ThemeUtility() {
  const theme = useTheme();
  return <ThemeControl preference={theme.preference} onPreferenceChange={theme.setPreference} />;
}

function isActiveReceive(phase: ReceiveWorkflowState): boolean {
  return ["CONNECTING", "RECEIVING", "RECONNECTING", "VERIFYING"].includes(phase);
}

function sourceKind(summary: IncomingTransferSummary): "file" | "folder" {
  return summary.kind === "single-file" ? "file" : "folder";
}

function sourceLabel(summary: IncomingTransferSummary): string {
  return summary.kind === "single-file" ? "Single file" : "Folder or files";
}

function transferHeading(phase: ReceiveWorkflowState, sender: string): string {
  switch (phase) {
    case "WAITING_FOR_SENDER":
      return `Waiting for ${sender}`;
    case "CONNECTING":
      return "Connecting…";
    case "RECEIVING":
      return "Receiving";
    case "RECONNECTING":
      return "Reconnecting…";
    case "VERIFYING":
      return "Checking transferred data…";
    default:
      return "Receiving";
  }
}

export function ReceiveWorkspace({
  lifecycleRecorder,
  session
}: Readonly<{
  lifecycleRecorder?: TransferLifecycleRecorder;
  session: string;
}>) {
  const controllerRef = useRef<ReceiveSessionController | null>(null);
  if (!controllerRef.current) {
    const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://127.0.0.1:8787";
    controllerRef.current = new ReceiveSessionController(signalingUrl);
  }
  const controller = controllerRef.current;
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot()
  );
  const terminalFocus = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void controller.open(session);
    return () => controller.dispose();
  }, [controller, session]);

  useEffect(() => {
    // P5's development session fixture has a known synthetic sender identity; P7 stores only it.
    lifecycleRecorder?.observeReceive(snapshot, "dev-sender");
  }, [lifecycleRecorder, snapshot]);

  useEffect(() => {
    if (!["REVIEWING", "FAILED", "COMPLETED", "CANCELED"].includes(snapshot.phase)) return;
    terminalFocus.current?.focus();
  }, [snapshot.phase]);

  useEffect(() => {
    if (!isActiveReceive(snapshot.phase) || !snapshot.activeTransferId) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [snapshot.activeTransferId, snapshot.phase]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__flicksendP5 = {
      configureDestinationFailure: (code) =>
        controller.configureDevelopmentDestinationFailure(code),
      configureFinalizationFailure: (enabled) =>
        controller.configureDevelopmentFinalizationFailure(enabled),
      fixtureFileDigest: () => controller.developmentFixtureFileDigest(),
      fixtureFolderDigests: () => controller.developmentFixtureFolderDigests(),
      mutateDestination: () => controller.mutateDevelopmentDestination(),
      snapshot: () => controller.getSnapshot()
    };
    return () => {
      delete window.__flicksendP5;
    };
  }, [controller]);

  const incoming = snapshot.incoming;
  const transfer = snapshot.engine?.transfer;
  const health = receiveHealthForProduct(snapshot.engine);
  const recovery = useRecoveryNotice({
    actor: "recipient",
    error: snapshot.error,
    integrityRetryCount: transfer?.integrity.integrityRetryCount ?? 0,
    phase: snapshot.phase
  });
  const productState = activeReceiveProductState(snapshot.phase);
  const route =
    snapshot.engine?.route.routeType === "DIRECT"
      ? "Direct"
      : snapshot.engine?.route.routeType === "RELAY"
        ? "Relayed"
        : null;
  return (
    <AppShell activeId="receive" navigation={[]} utility={<ThemeUtility />}>
      <Page className="p5-receive-page">
        <div aria-atomic="true" aria-live="polite" className="p5-sr-status">
          {recovery?.mode === "recovered"
            ? "Connection restored. Transfer continuing."
            : receiveStatusAnnouncement(snapshot)}
        </div>
        <PageHeader eyebrow="FlickSend">
          <Heading as="h1" size="page">
            {snapshot.phase === "FAILED" && !incoming
              ? "This transfer isn't available"
              : "Receive a transfer"}
          </Heading>
          <Text tone="secondary">
            {incoming
              ? `Keep FlickSend open while receiving from ${incoming.senderName}.`
              : "FlickSend will show transfer details after the session is authorized."}
          </Text>
        </PageHeader>

        <Stack gap="lg">
          {["OPENING", "AUTHORIZING"].includes(snapshot.phase) ? (
            <Card className="p5-receive-card" role="status">
              <Stack gap="sm">
                <Heading as="h2" size="section">
                  Opening transfer…
                </Heading>
                <Text tone="secondary">
                  Checking this transfer session without revealing its details.
                </Text>
              </Stack>
            </Card>
          ) : null}

          {snapshot.phase === "WAITING_FOR_SENDER" ? (
            <Card className="p5-receive-card" data-testid="receive-waiting" role="status">
              <Stack gap="sm">
                <StatusBadge state="WAITING_FOR_SENDER" />
                <Heading as="h2" size="section">
                  {incoming ? `Waiting for ${incoming.senderName}` : "Waiting for sender"}
                </Heading>
                <Text tone="secondary">
                  {incoming && snapshot.destination
                    ? "Your destination is ready. Keep FlickSend open while the sender becomes available."
                    : "Keep FlickSend open while the sender becomes available."}
                </Text>
                {incoming && snapshot.destination ? (
                  <div className="p5-destination-summary" data-testid="receive-waiting-destination">
                    <Text as="p" size="label" tone="muted">
                      Destination ready
                    </Text>
                    <strong>{snapshot.destination.label}</strong>
                  </div>
                ) : null}
              </Stack>
            </Card>
          ) : null}

          {snapshot.phase === "REVIEWING" && incoming ? (
            <div ref={terminalFocus} tabIndex={-1}>
              <Card className="p5-receive-card" data-testid="receive-review">
                <Stack gap="lg">
                  <div>
                    <Text as="p" size="label" tone="muted">
                      Incoming transfer
                    </Text>
                    <Heading as="h2" size="section">
                      {incoming.senderName} is sending you
                    </Heading>
                  </div>
                  <Inline align="center" gap="md">
                    <PersonChip person={{ name: incoming.senderName, presence: "available" }} />
                    <Text as="span" tone="secondary">
                      From {incoming.senderName}
                    </Text>
                  </Inline>
                  <IncomingSummary summary={incoming} />
                  <div className="p5-receive-action">
                    <Button onClick={() => controller.accept()} size="lg">
                      Accept
                    </Button>
                    <Button onClick={() => controller.decline()} variant="quiet">
                      Decline
                    </Button>
                  </div>
                  <Text as="p" size="small" tone="muted">
                    Keep FlickSend open while receiving. This is a live transfer, not an offline
                    download.
                  </Text>
                </Stack>
              </Card>
            </div>
          ) : null}

          {["CHOOSING_DESTINATION", "PREPARING_DESTINATION", "READY_TO_RECEIVE"].includes(
            snapshot.phase
          ) && incoming ? (
            <Card className="p5-receive-card" data-testid="receive-destination">
              <Stack gap="lg">
                <div>
                  <Text as="p" size="label" tone="muted">
                    Save destination
                  </Text>
                  <Heading as="h2" size="section">
                    {snapshot.phase === "PREPARING_DESTINATION"
                      ? "Preparing destination…"
                      : snapshot.destination
                        ? "Ready to receive"
                        : "Choose where to save"}
                  </Heading>
                </div>
                <IncomingSummary summary={incoming} compact />
                {snapshot.destination ? (
                  <div className="p5-destination-summary" data-testid="receive-destination-summary">
                    <Text as="p" size="label" tone="muted">
                      Saving to
                    </Text>
                    <strong>{snapshot.destination.label}</strong>
                  </div>
                ) : null}
                {recovery ? (
                  <RecoveryNotice
                    onAction={
                      recovery.action === "CHOOSE_DESTINATION"
                        ? () => void controller.chooseDestination()
                        : undefined
                    }
                    presentation={recovery}
                  />
                ) : snapshot.error ? (
                  <ErrorCallout error={snapshot.error} />
                ) : null}
                {snapshot.phase === "PREPARING_DESTINATION" ? (
                  <Text role="status" tone="secondary">
                    Checking the selected destination before any payload can start.
                  </Text>
                ) : null}
                {snapshot.phase !== "PREPARING_DESTINATION" ? (
                  <Cluster>
                    <Button onClick={() => void controller.chooseDestination()} size="lg">
                      {snapshot.destination ? "Change destination" : "Choose destination"}
                    </Button>
                    {snapshot.destination ? (
                      <Button
                        onClick={() => void controller.beginReceiving()}
                        size="lg"
                        variant="primary"
                      >
                        Receive
                      </Button>
                    ) : null}
                  </Cluster>
                ) : null}
                {process.env.NODE_ENV !== "production" ? (
                  <details className="p5-development-destination">
                    <summary>Development qualification destination</summary>
                    <Text as="p" size="small" tone="secondary">
                      P5 development authorization/session fixture only. This is not a browser
                      picker or production invitation security.
                    </Text>
                    <Button
                      onClick={() => void controller.chooseDevelopmentFixtureDestination()}
                      size="sm"
                      variant="secondary"
                    >
                      Use development test destination
                    </Button>
                  </details>
                ) : null}
              </Stack>
            </Card>
          ) : null}

          {isActiveReceive(snapshot.phase) && incoming ? (
            <Card
              className="p5-receive-card p5-active-transfer"
              data-testid="receive-active-transfer"
            >
              <Stack gap="lg">
                <div className="p5-transfer-heading">
                  <div>
                    <Text as="p" size="label" tone="muted">
                      From {incoming.senderName}
                    </Text>
                    <Heading as="h2" size="section">
                      {transferHeading(snapshot.phase, incoming.senderName)}
                    </Heading>
                  </div>
                  {productState ? <StatusBadge state={productState} /> : null}
                </div>
                <IncomingSummary summary={incoming} compact />
                {transfer ? (
                  <>
                    <VerifiedProgress
                      label="Receive progress"
                      transferred={
                        (transfer.bytesTransferred / Math.max(transfer.bytesTotal, 1)) * 100
                      }
                      verified={(transfer.safeBytes / Math.max(transfer.bytesTotal, 1)) * 100}
                    />
                    <div className="p5-transfer-metrics">
                      <Metric
                        label="Received"
                        value={`${formatBytes(transfer.bytesTransferred)} of ${formatBytes(transfer.bytesTotal)}`}
                      />
                      <Metric
                        label="Speed"
                        value={formatSpeed(
                          health?.state === "NOT_ENOUGH_INFORMATION" || !health
                            ? null
                            : transfer.currentBps || null
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
                {recovery ? (
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
                <ConfirmDialog
                  actionLabel="Cancel transfer"
                  description="This stops the current transfer. It will not be marked complete."
                  onConfirm={() => controller.cancel()}
                  title="Cancel transfer?"
                  trigger={<Button variant="danger">Cancel transfer</Button>}
                >
                  <Text as="p" tone="secondary">
                    Existing partial destination data is not automatically deleted.
                  </Text>
                </ConfirmDialog>
              </Stack>
            </Card>
          ) : null}

          {snapshot.phase === "COMPLETED" && incoming ? (
            <div ref={terminalFocus} tabIndex={-1}>
              <Card className="p5-receive-card p5-completion" data-testid="receive-completed">
                <Stack gap="md">
                  <StatusBadge state="COMPLETED" />
                  <Heading as="h2" size="section">
                    Received from {incoming.senderName}
                  </Heading>
                  <IncomingSummary summary={incoming} compact />
                  <Text>Completed and verified.</Text>
                </Stack>
              </Card>
            </div>
          ) : null}

          {snapshot.phase === "FAILED" && recovery ? (
            <div
              className="p5-terminal"
              data-testid="receive-terminal-error"
              ref={terminalFocus}
              tabIndex={-1}
            >
              <RecoveryNotice presentation={recovery} />
            </div>
          ) : null}

          {snapshot.phase === "CANCELED" ? (
            <div ref={terminalFocus} tabIndex={-1}>
              <Card className="p5-receive-card p5-completion" data-testid="receive-canceled">
                <Stack gap="md">
                  <StatusBadge state="CANCELED" />
                  <Heading as="h2" size="section">
                    Transfer canceled
                  </Heading>
                  <Text tone="secondary">
                    Nothing has been marked complete. Existing partial destination data was not
                    automatically deleted.
                  </Text>
                </Stack>
              </Card>
            </div>
          ) : null}
        </Stack>
      </Page>
    </AppShell>
  );
}

function IncomingSummary({
  summary,
  compact = false
}: Readonly<{ summary: IncomingTransferSummary; compact?: boolean }>) {
  const showFileSummary = summary.fileCount !== null;
  return (
    <div
      className={
        compact ? "p5-incoming-summary p5-incoming-summary--compact" : "p5-incoming-summary"
      }
    >
      {showFileSummary ? (
        <FileSummary
          fileCount={summary.fileCount ?? 0}
          folderCount={summary.folderCount ?? 0}
          kind={sourceKind(summary)}
          name={summary.displayName}
          sizeBytes={summary.sizeBytes}
        />
      ) : (
        <div className="p5-source-overview">
          <strong>{summary.displayName}</strong>
          <Text as="span" tone="secondary">
            {sourceLabel(summary)} · {formatBytes(summary.sizeBytes)}
          </Text>
        </div>
      )}
      {!compact ? (
        <div className="p5-review-metrics">
          <Metric label="Type" value={sourceLabel(summary)} />
          <Metric label="Size" value={formatBytes(summary.sizeBytes)} />
          {summary.fileCount !== null ? <Metric label="Files" value={summary.fileCount} /> : null}
          {summary.folderCount && summary.folderCount > 0 ? (
            <Metric label="Folders" value={summary.folderCount} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
