import type { ReactNode } from "react";
import { Button } from "./actions.js";
import { Icon, type IconName } from "./icons.js";
import { StatusBadge, TransferHealth, VerifiedProgress } from "./feedback.js";
import type { ProductHealthState, ProductTransferState } from "./product-types.js";
import { Avatar, type PersonSummary } from "./people.js";
import { classNames, formatBytes, formatCount, formatEta, formatSpeed } from "./utils.js";

export type FileKind = "archive" | "audio" | "document" | "file" | "folder" | "image" | "video";

const fileIcon: Record<FileKind, IconName> = {
  archive: "archive",
  audio: "file",
  document: "document",
  file: "file",
  folder: "folder",
  image: "image",
  video: "video"
};

export function FileTypeIcon({ kind = "file" }: { kind?: FileKind }) {
  return (
    <span aria-hidden="true" className={classNames("fs-file-icon", `fs-file-icon--${kind}`)}>
      <Icon name={fileIcon[kind]} />
    </span>
  );
}

export function FileSummary({
  fileCount = 0,
  folderCount = 0,
  kind = "folder",
  name,
  sizeBytes
}: {
  fileCount?: number;
  folderCount?: number;
  kind?: FileKind;
  name?: string;
  sizeBytes: number;
}) {
  const safeName = name?.split(/[\\/]/).filter(Boolean).at(-1);
  const counts = [
    fileCount > 0 ? formatCount(fileCount, "file") : null,
    folderCount > 0 ? formatCount(folderCount, "folder") : null
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="fs-file-summary">
      <FileTypeIcon kind={kind} />
      <div>
        <strong className="fs-number">{formatBytes(sizeBytes)}</strong>
        {safeName ? (
          <span className="fs-file-summary__name" title={safeName}>
            {safeName}
          </span>
        ) : null}
        <span>{counts || "No items"}</span>
      </div>
    </div>
  );
}

export function TransferCard({
  direction,
  etaMs,
  fileCount,
  folderCount,
  health,
  person,
  progress,
  route,
  sizeBytes,
  speedBytesPerSecond,
  status,
  timestamp,
  verifiedProgress
}: {
  direction: "sent" | "received";
  etaMs: number | null;
  fileCount: number;
  folderCount?: number;
  health?: ProductHealthState;
  person: PersonSummary;
  progress: number;
  route?: "Direct" | "Relayed";
  sizeBytes: number;
  speedBytesPerSecond: number | null;
  status: ProductTransferState;
  timestamp: string;
  verifiedProgress?: number;
}) {
  const verb = direction === "sent" ? "Sending to" : "Receiving from";
  return (
    <article className="fs-transfer-card">
      <div className="fs-transfer-card__header">
        <div className="fs-transfer-card__person">
          <Avatar initials={person.initials} name={person.name} />
          <div>
            <span>{verb}</span>
            <strong>{person.name}</strong>
          </div>
        </div>
        <StatusBadge state={status} />
      </div>
      <FileSummary fileCount={fileCount} folderCount={folderCount} sizeBytes={sizeBytes} />
      <VerifiedProgress transferred={progress} verified={verifiedProgress ?? progress} />
      <dl className="fs-transfer-card__metrics">
        <div>
          <dt>Speed</dt>
          <dd className="fs-number">{formatSpeed(speedBytesPerSecond)}</dd>
        </div>
        <div>
          <dt>Time remaining</dt>
          <dd>{formatEta(etaMs, etaMs === null ? "calculating" : "known")}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{timestamp}</dd>
        </div>
        {route ? (
          <div>
            <dt>Route</dt>
            <dd>{route}</dd>
          </div>
        ) : null}
      </dl>
      {health ? (
        <TransferHealth
          confidence={health === "NOT_ENOUGH_INFORMATION" ? "LOW" : "HIGH"}
          state={health}
        />
      ) : null}
    </article>
  );
}

export function DropZone({
  disabled = false,
  onSelectFiles,
  onSelectFolder,
  state = "idle",
  supportingText = "Choose files or a folder. Drag and drop is optional."
}: {
  disabled?: boolean;
  onSelectFiles?: () => void;
  onSelectFolder?: () => void;
  state?: "idle" | "drag-active" | "invalid";
  supportingText?: string;
}) {
  return (
    <section
      aria-label="Source selection"
      className={classNames("fs-drop-zone", `fs-drop-zone--${state}`, disabled && "is-disabled")}
    >
      <span className="fs-drop-zone__icon">
        <Icon name="folder" />
      </span>
      <div>
        <h3>Bring your work together</h3>
        <p>{supportingText}</p>
      </div>
      <div className="fs-drop-zone__actions">
        <Button disabled={disabled} onClick={onSelectFiles} variant="secondary">
          Select files
        </Button>
        <Button disabled={disabled} onClick={onSelectFolder} variant="ghost">
          Select folder
        </Button>
      </div>
    </section>
  );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fs-metric">
      <span>{label}</span>
      <strong className="fs-number">{value}</strong>
    </div>
  );
}
