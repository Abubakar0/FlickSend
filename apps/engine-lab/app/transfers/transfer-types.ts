import type { SpeedProofRecord } from "@flicksend/engine-core";
import type { ProductHealthState } from "@flicksend/ui";

export const transferRecordStatuses = [
  "WAITING_FOR_RECIPIENT",
  "WAITING_FOR_SENDER",
  "CONNECTING",
  "TRANSFERRING",
  "RECONNECTING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELED"
] as const;

export type TransferRecordStatus = (typeof transferRecordStatuses)[number];
export type TransferDirection = "sent" | "received";
export type TransferSourceKind = "single_file" | "multiple_files" | "folder";
export type SafeRouteLabel = "Direct" | "Relayed";
export type SafeFailureCategory =
  "BROWSER" | "DESTINATION" | "INTEGRITY" | "NETWORK" | "SERVICE" | "SOURCE" | "UNKNOWN";

export type SafeSpeedProofRouteSegment = {
  averagePayloadSpeedBps: number | null;
  route: SafeRouteLabel;
};

/**
 * M8 output reduced to product-safe diagnostics. It deliberately excludes transfer IDs,
 * route details, event details, and any browser or networking identifiers.
 */
export type SafeSpeedProofSummary = {
  averagePayloadSpeedBps: number | null;
  bottleneckConfidence: SpeedProofRecord["bottleneckConfidence"];
  dominantBottleneck: SpeedProofRecord["dominantBottleneck"];
  durationMs: number;
  integrityRetryCount: number;
  measurementAvailability: SpeedProofRecord["measurementAvailability"];
  payloadBytes: number;
  peakPayloadSpeedBps: number | null;
  reconnectCount: number;
  routeChangeCount: number;
  routeSegments: readonly SafeSpeedProofRouteSegment[];
  stallCount: number;
  stalledDurationMs: number;
};

/** Active-only metadata is removed when a terminal record is finalized. */
export type ActiveTransferMetadata = {
  currentPayloadSpeedBps: number | null;
  etaMs: number | null;
  health: ProductHealthState | null;
  route: SafeRouteLabel | null;
  transferredBytes: number;
  verifiedBytes: number;
};

/**
 * Public P7 record. It is provider-independent and safe to serialize from the development store.
 * Its opaque `recordId` is distinct from FSTP transfer identity.
 */
export type TransferHistoryRecord = {
  active: ActiveTransferMetadata | null;
  direction: TransferDirection;
  endedAt: string | null;
  failureCategory: SafeFailureCategory | null;
  fileCount: number | null;
  folderCount: number | null;
  peerPersonId: string | null;
  productStatus: TransferRecordStatus;
  recordId: string;
  sourceKind: TransferSourceKind;
  speedProof: SafeSpeedProofSummary | null;
  startedAt: string;
  totalBytes: number | null;
};

/** Input for the development lifecycle repository. `lifecycleKey` is private runtime correlation only. */
export type TransferLifecycleEvent = Omit<
  TransferHistoryRecord,
  "endedAt" | "recordId" | "startedAt"
> & {
  deliveryConfirmed: boolean;
  lifecycleKey: string;
};

export function isTerminalTransferRecordStatus(status: TransferRecordStatus): boolean {
  return ["COMPLETED", "FAILED", "CANCELED"].includes(status);
}

export function speedProofSummary(proof: SpeedProofRecord | null): SafeSpeedProofSummary | null {
  if (!proof) return null;
  return {
    averagePayloadSpeedBps: proof.averageThroughputBps,
    bottleneckConfidence: proof.bottleneckConfidence,
    dominantBottleneck: proof.dominantBottleneck,
    durationMs: proof.durationMs,
    integrityRetryCount: proof.integrityRetryCount,
    measurementAvailability: proof.measurementAvailability,
    payloadBytes: proof.payloadBytes,
    peakPayloadSpeedBps: proof.peakThroughputBps,
    reconnectCount: proof.reconnectCount,
    routeChangeCount: proof.routeChangeCount,
    routeSegments: proof.routeHistory.reduce<SafeSpeedProofRouteSegment[]>((segments, segment) => {
      if (segment.routeType === "DIRECT")
        segments.push({ route: "Direct", averagePayloadSpeedBps: segment.averageThroughputBps });
      if (segment.routeType === "RELAY")
        segments.push({ route: "Relayed", averagePayloadSpeedBps: segment.averageThroughputBps });
      return segments;
    }, []),
    stallCount: proof.stallCount,
    stalledDurationMs: proof.stallDurationMs
  };
}
