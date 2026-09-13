"use client";

import {
  AppShell,
  Button,
  Card,
  Cluster,
  EmptyState,
  FileSummary,
  Heading,
  Inline,
  Metric,
  Page,
  PageHeader,
  RouteLabel,
  Stack,
  StatusBadge,
  Text,
  ThemeControl,
  TransferCard,
  TransferHealth,
  formatCount,
  formatDuration,
  formatSpeed,
  useTheme,
  type ProductTransferState
} from "@flicksend/ui";
import { useEffect, useState } from "react";
import type { TransferListFilter, TransfersSnapshot } from "./transfers-controller";
import type {
  SafeSpeedProofSummary,
  TransferHistoryRecord,
  TransferRecordStatus
} from "./transfer-types";

type PersonResolution = { displayName: string; eligibleForSendAgain: boolean };

function ThemeUtility() {
  const theme = useTheme();
  return <ThemeControl preference={theme.preference} onPreferenceChange={theme.setPreference} />;
}

function isActive(record: TransferHistoryRecord): boolean {
  return record.active !== null;
}

function productState(status: TransferRecordStatus): ProductTransferState {
  return status;
}

function recordHref(record: TransferHistoryRecord): string {
  return `/transfers/${encodeURIComponent(record.recordId)}`;
}

function sourceKind(record: TransferHistoryRecord): "file" | "folder" {
  return record.sourceKind === "folder" ? "folder" : "file";
}

function itemCounts(record: TransferHistoryRecord): string {
  const values = [
    record.fileCount === null ? null : formatCount(record.fileCount, "file"),
    record.folderCount && record.folderCount > 0 ? formatCount(record.folderCount, "folder") : null
  ].filter((value): value is string => value !== null);
  return values.length ? values.join(" · ") : "Item count unavailable";
}

function displayTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    parsed
  );
}

function directionLabel(record: TransferHistoryRecord, person: PersonResolution): string {
  return record.direction === "sent"
    ? `Sent to ${person.displayName}`
    : `Received from ${person.displayName}`;
}

function healthForCard(record: TransferHistoryRecord) {
  return record.active?.health ?? undefined;
}

function failureExplanation(record: TransferHistoryRecord): string {
  switch (record.failureCategory) {
    case "DESTINATION":
      return "The destination could not continue safely.";
    case "INTEGRITY":
      return "The transfer could not be verified.";
    case "NETWORK":
      return "The connection could not be restored.";
    case "SERVICE":
      return "FlickSend was temporarily unavailable.";
    case "SOURCE":
      return "The source could not continue safely.";
    default:
      return "FlickSend stopped the transfer to avoid an incorrect result.";
  }
}

function TransferRow({
  person,
  record
}: {
  person: PersonResolution;
  record: TransferHistoryRecord;
}) {
  const active = record.active;
  if (active)
    return (
      <a className="p7-transfer-link" href={recordHref(record)}>
        <TransferCard
          direction={record.direction}
          etaMs={active.etaMs}
          fileCount={record.fileCount ?? 0}
          folderCount={record.folderCount ?? 0}
          health={healthForCard(record)}
          person={{ name: person.displayName }}
          progress={(active.transferredBytes / Math.max(record.totalBytes ?? 1, 1)) * 100}
          route={active.route ?? undefined}
          sizeBytes={record.totalBytes ?? 0}
          speedBytesPerSecond={active.currentPayloadSpeedBps}
          status={productState(record.productStatus)}
          timestamp={displayTime(record.startedAt)}
          verifiedProgress={(active.verifiedBytes / Math.max(record.totalBytes ?? 1, 1)) * 100}
        />
      </a>
    );
  return (
    <a className="p7-transfer-link" href={recordHref(record)}>
      <Card className="p7-recent-card">
        <Stack gap="md">
          <Inline align="center" gap="md">
            <div>
              <Text as="p" size="label" tone="muted">
                {record.direction === "sent" ? "Sent" : "Received"}
              </Text>
              <Heading as="h3" size="card">
                {directionLabel(record, person)}
              </Heading>
            </div>
            <StatusBadge state={productState(record.productStatus)} />
          </Inline>
          <FileSummary
            fileCount={record.fileCount ?? 0}
            folderCount={record.folderCount ?? 0}
            kind={sourceKind(record)}
            sizeBytes={record.totalBytes ?? 0}
          />
          <div className="p7-recent-card__meta">
            <span>{itemCounts(record)}</span>
            <span>{displayTime(record.endedAt ?? record.startedAt)}</span>
          </div>
        </Stack>
      </Card>
    </a>
  );
}

export function TransfersWorkspace({
  onFilterChange,
  resolvePerson,
  snapshot
}: {
  onFilterChange: (filter: TransferListFilter) => void;
  resolvePerson: (personId: string | null) => PersonResolution;
  snapshot: TransfersSnapshot;
}) {
  const filtered = snapshot.records.filter(
    (record) =>
      snapshot.filter === "ALL" ||
      (snapshot.filter === "SENT" ? record.direction === "sent" : record.direction === "received")
  );
  const active = filtered.filter(isActive);
  const recent = filtered.filter((record) => !isActive(record));
  return (
    <AppShell
      activeId="transfers"
      navigation={[
        { href: "/send", id: "send", label: "Send" },
        { href: "/people", id: "people", label: "People" },
        { href: "/transfers", id: "transfers", label: "Transfers" }
      ]}
      utility={<ThemeUtility />}
    >
      <Page className="p7-transfers-page">
        <PageHeader eyebrow="FlickSend">
          <Heading as="h1" size="page">
            Transfers
          </Heading>
          <Text tone="secondary">
            Live transfer activity and recent outcomes. FlickSend does not store transferred files.
          </Text>
        </PageHeader>
        <Stack gap="lg">
          <Cluster aria-label="Transfer filter" className="p7-filter-bar">
            {(
              [
                ["ALL", "All"],
                ["SENT", "Sent"],
                ["RECEIVED", "Received"]
              ] as const
            ).map(([filter, label]) => (
              <Button
                aria-pressed={snapshot.filter === filter}
                key={filter}
                onClick={() => onFilterChange(filter)}
                size="sm"
                variant={snapshot.filter === filter ? "primary" : "secondary"}
              >
                {label}
              </Button>
            ))}
          </Cluster>
          {snapshot.error ? (
            <Text role="alert" tone="secondary">
              Transfers are temporarily unavailable. Existing transfer activity is unaffected.
            </Text>
          ) : null}
          {snapshot.isLoading ? (
            <Text role="status" tone="secondary">
              Loading transfers…
            </Text>
          ) : null}
          {!snapshot.isLoading && filtered.length === 0 ? (
            <EmptyState
              description="Transfers you send or receive will appear here."
              icon="send"
              title="No transfers yet"
            />
          ) : null}
          {active.length ? (
            <section aria-labelledby="p7-active-heading">
              <Stack gap="md">
                <div>
                  <Text as="p" size="label" tone="muted">
                    Current activity
                  </Text>
                  <Heading as="h2" id="p7-active-heading" size="section">
                    Active
                  </Heading>
                </div>
                <div className="p7-transfer-list">
                  {active.map((record) => (
                    <TransferRow
                      key={record.recordId}
                      person={resolvePerson(record.peerPersonId)}
                      record={record}
                    />
                  ))}
                </div>
              </Stack>
            </section>
          ) : null}
          {recent.length ? (
            <section aria-labelledby="p7-recent-heading">
              <Stack gap="md">
                <div>
                  <Text as="p" size="label" tone="muted">
                    Metadata only
                  </Text>
                  <Heading as="h2" id="p7-recent-heading" size="section">
                    Recent
                  </Heading>
                </div>
                <div className="p7-transfer-list">
                  {recent.map((record) => (
                    <TransferRow
                      key={record.recordId}
                      person={resolvePerson(record.peerPersonId)}
                      record={record}
                    />
                  ))}
                </div>
              </Stack>
            </section>
          ) : null}
        </Stack>
      </Page>
    </AppShell>
  );
}

export function TransferDetail({
  getRecord,
  recordId,
  resolvePerson
}: {
  getRecord: (recordId: string) => Promise<TransferHistoryRecord | null>;
  recordId: string;
  resolvePerson: (personId: string | null) => PersonResolution;
}) {
  const [record, setRecord] = useState<TransferHistoryRecord | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void getRecord(recordId).then((next) => {
      if (active) setRecord(next);
    });
    return () => {
      active = false;
    };
  }, [getRecord, recordId]);
  const person = record ? resolvePerson(record.peerPersonId) : null;
  return (
    <AppShell
      activeId="transfers"
      navigation={[
        { href: "/send", id: "send", label: "Send" },
        { href: "/people", id: "people", label: "People" },
        { href: "/transfers", id: "transfers", label: "Transfers" }
      ]}
      utility={<ThemeUtility />}
    >
      <Page className="p7-transfers-page">
        <PageHeader
          actions={
            <a className="p7-back-link" href="/transfers">
              Back to transfers
            </a>
          }
          eyebrow="FlickSend"
        >
          <Heading as="h1" size="page">
            {person ? `Transfer with ${person.displayName}` : "Transfer details"}
          </Heading>
          <Text tone="secondary">Transfer summary and observed diagnostics.</Text>
        </PageHeader>
        {record === undefined ? <Text role="status">Loading transfer…</Text> : null}
        {record === null ? (
          <EmptyState
            description="This transfer record is unavailable in the current development history."
            title="Transfer unavailable"
          />
        ) : null}
        {record && person ? (
          <Stack gap="lg">
            <Card className="p7-detail-summary">
              <Stack gap="md">
                <Inline align="center" gap="md">
                  <div>
                    <Text as="p" size="label" tone="muted">
                      {record.direction === "sent" ? "Sent transfer" : "Received transfer"}
                    </Text>
                    <Heading as="h2" size="section">
                      {directionLabel(record, person)}
                    </Heading>
                  </div>
                  <StatusBadge state={productState(record.productStatus)} />
                </Inline>
                <FileSummary
                  fileCount={record.fileCount ?? 0}
                  folderCount={record.folderCount ?? 0}
                  kind={sourceKind(record)}
                  sizeBytes={record.totalBytes ?? 0}
                />
                <div className="p7-detail-metrics">
                  <Metric label="Contents" value={itemCounts(record)} />
                  <Metric label="Started" value={displayTime(record.startedAt)} />
                  {record.endedAt ? (
                    <Metric label="Finished" value={displayTime(record.endedAt)} />
                  ) : null}
                </div>
                {record.productStatus === "COMPLETED" ? <Text>Completed and verified.</Text> : null}
                {record.productStatus === "FAILED" ? (
                  <Text>Transfer didn&apos;t complete. {failureExplanation(record)}</Text>
                ) : null}
                {record.productStatus === "CANCELED" ? (
                  <Text tone="secondary">Canceled. Nothing has been marked complete.</Text>
                ) : null}
                {record.active?.health ? (
                  <TransferHealth confidence="HIGH" state={record.active.health} />
                ) : null}
                {record.direction === "sent" && person.eligibleForSendAgain ? (
                  <a
                    className="fs-button fs-button--primary"
                    href={`/send?person=${encodeURIComponent(record.peerPersonId ?? "")}`}
                  >
                    Send again
                  </a>
                ) : null}
              </Stack>
            </Card>
            <SpeedProofDetail proof={record.speedProof} />
          </Stack>
        ) : null}
      </Page>
    </AppShell>
  );
}

function SpeedProofDetail({ proof }: { proof: SafeSpeedProofSummary | null }) {
  if (!proof)
    return (
      <Card className="p7-speed-proof" aria-labelledby="p7-speed-proof-heading">
        <Stack gap="sm">
          <Heading as="h2" id="p7-speed-proof-heading" size="section">
            SpeedProof
          </Heading>
          <Text tone="secondary">Not enough information is available for a transfer summary.</Text>
        </Stack>
      </Card>
    );
  const routes = [...new Set(proof.routeSegments.map((segment) => segment.route))];
  const bottleneck =
    proof.dominantBottleneck === "INSUFFICIENT_DATA"
      ? "Not enough information"
      : proof.dominantBottleneck.replaceAll("_", " ").toLowerCase();
  return (
    <Card className="p7-speed-proof" aria-labelledby="p7-speed-proof-heading">
      <Stack gap="md">
        <div>
          <Text as="p" size="label" tone="muted">
            Observed transfer summary
          </Text>
          <Heading as="h2" id="p7-speed-proof-heading" size="section">
            SpeedProof
          </Heading>
        </div>
        <Text tone="secondary">
          This is an observed transfer diagnostic, not an internet speed test.
        </Text>
        {proof.reconnectCount > 0 ? (
          <Text tone="secondary">
            Recovered through {proof.reconnectCount}{" "}
            {proof.reconnectCount === 1 ? "reconnection" : "reconnections"}.
          </Text>
        ) : null}
        <div className="p7-detail-metrics">
          <Metric label="Transfer duration" value={formatDuration(proof.durationMs)} />
          <Metric
            label="Average transfer speed"
            value={formatSpeed(proof.averagePayloadSpeedBps)}
          />
          <Metric label="Peak transfer speed" value={formatSpeed(proof.peakPayloadSpeedBps)} />
          <Metric label="Reconnects" value={proof.reconnectCount} />
          <Metric label="Stalls" value={proof.stallCount} />
          <Metric label="Stalled duration" value={formatDuration(proof.stalledDurationMs)} />
          <Metric label="Integrity retries" value={proof.integrityRetryCount} />
          <Metric
            label="Route"
            value={
              routes.length
                ? routes.map((route) => <RouteLabel key={route} route={route} />)
                : "Unavailable"
            }
          />
          <Metric label="Observed bottleneck" value={bottleneck} />
        </div>
      </Stack>
    </Card>
  );
}
