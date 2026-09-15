import {
  FailureCategory,
  Prisma,
  TransferDirection,
  TransferSourceKind,
  TransferStatus,
  databaseClient,
  type PrismaClient
} from "@flicksend/database";
import type { PersistentAccount } from "./account";
import {
  isTerminalTransferRecordStatus,
  type ActiveTransferMetadata,
  type SafeFailureCategory,
  type SafeSpeedProofRouteSegment,
  type SafeSpeedProofSummary,
  type TransferDirection as ProductTransferDirection,
  type TransferHistoryRecord,
  type TransferLifecycleEvent,
  type TransferRecordStatus,
  type TransferSourceKind as ProductTransferSourceKind
} from "../transfers/transfer-types";

export class PersistentTransfersError extends Error {
  constructor(readonly code: "TRANSFERS_DELIVERY_REQUIRED" | "TRANSFERS_INVALID_EVENT") {
    super(code);
  }
}

const transferPageSize = 50;
const transferPageMaximum = 100;
const maximumInt = 2_147_483_647;

const dbStatus: Record<TransferRecordStatus, TransferStatus> = {
  WAITING_FOR_RECIPIENT: TransferStatus.WAITING_FOR_RECIPIENT,
  WAITING_FOR_SENDER: TransferStatus.WAITING_FOR_SENDER,
  CONNECTING: TransferStatus.CONNECTING,
  TRANSFERRING: TransferStatus.TRANSFERRING,
  RECONNECTING: TransferStatus.RECONNECTING,
  VERIFYING: TransferStatus.VERIFYING,
  COMPLETED: TransferStatus.COMPLETED,
  FAILED: TransferStatus.FAILED,
  CANCELED: TransferStatus.CANCELED
};

const productStatus: Record<TransferStatus, TransferRecordStatus> = {
  WAITING_FOR_RECIPIENT: "WAITING_FOR_RECIPIENT",
  WAITING_FOR_SENDER: "WAITING_FOR_SENDER",
  CONNECTING: "CONNECTING",
  TRANSFERRING: "TRANSFERRING",
  RECONNECTING: "RECONNECTING",
  VERIFYING: "VERIFYING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELED: "CANCELED"
};

const dbDirection: Record<ProductTransferDirection, TransferDirection> = {
  sent: TransferDirection.SENT,
  received: TransferDirection.RECEIVED
};

const productDirection: Record<TransferDirection, ProductTransferDirection> = {
  SENT: "sent",
  RECEIVED: "received"
};

const dbSourceKind: Record<ProductTransferSourceKind, TransferSourceKind> = {
  single_file: TransferSourceKind.SINGLE_FILE,
  multiple_files: TransferSourceKind.MULTIPLE_FILES,
  folder: TransferSourceKind.FOLDER
};

const productSourceKind: Record<TransferSourceKind, ProductTransferSourceKind> = {
  SINGLE_FILE: "single_file",
  MULTIPLE_FILES: "multiple_files",
  FOLDER: "folder"
};

const dbFailure: Record<SafeFailureCategory, FailureCategory> = {
  BROWSER: FailureCategory.BROWSER,
  DESTINATION: FailureCategory.DESTINATION,
  INTEGRITY: FailureCategory.INTEGRITY,
  NETWORK: FailureCategory.NETWORK,
  SERVICE: FailureCategory.SERVICE,
  SOURCE: FailureCategory.SOURCE,
  UNKNOWN: FailureCategory.UNKNOWN
};

const productFailure: Record<FailureCategory, SafeFailureCategory> = {
  BROWSER: "BROWSER",
  DESTINATION: "DESTINATION",
  INTEGRITY: "INTEGRITY",
  NETWORK: "NETWORK",
  SERVICE: "SERVICE",
  SOURCE: "SOURCE",
  UNKNOWN: "UNKNOWN"
};

function isOpaqueAccountId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nonNegativeInteger(value: number | null, maximum = Number.MAX_SAFE_INTEGER): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= maximum);
}

function finite(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

function validActiveMetadata(value: ActiveTransferMetadata | null): boolean {
  return (
    value === null ||
    (nonNegativeInteger(value.transferredBytes) &&
      nonNegativeInteger(value.verifiedBytes) &&
      finite(value.currentPayloadSpeedBps) &&
      finite(value.etaMs))
  );
}

function validSpeedProof(value: SafeSpeedProofSummary | null): boolean {
  if (value === null) return true;
  if (
    !nonNegativeInteger(value.durationMs) ||
    !nonNegativeInteger(value.payloadBytes) ||
    !nonNegativeInteger(value.integrityRetryCount, maximumInt) ||
    !nonNegativeInteger(value.reconnectCount, maximumInt) ||
    !nonNegativeInteger(value.routeChangeCount, maximumInt) ||
    !nonNegativeInteger(value.stallCount, maximumInt) ||
    !nonNegativeInteger(value.stalledDurationMs)
  )
    return false;
  return value.routeSegments.length <= 16 && value.routeSegments.every(validRouteSegment);
}

function validRouteSegment(segment: SafeSpeedProofRouteSegment): boolean {
  return (
    (segment.route === "Direct" || segment.route === "Relayed") &&
    finite(segment.averagePayloadSpeedBps)
  );
}

/** Runtime validation keeps client input out of Prisma's arbitrary JSON and enum paths. */
export function assertPersistentLifecycleEvent(event: TransferLifecycleEvent): void {
  if (!/^p7-[a-z0-9-]{8,90}$/i.test(event.lifecycleKey))
    throw new PersistentTransfersError("TRANSFERS_INVALID_EVENT");
  if (event.peerPersonId !== null && !isOpaqueAccountId(event.peerPersonId))
    throw new PersistentTransfersError("TRANSFERS_INVALID_EVENT");
  if (
    !nonNegativeInteger(event.totalBytes) ||
    !nonNegativeInteger(event.fileCount, maximumInt) ||
    !nonNegativeInteger(event.folderCount, maximumInt) ||
    !validActiveMetadata(event.active) ||
    !validSpeedProof(event.speedProof)
  )
    throw new PersistentTransfersError("TRANSFERS_INVALID_EVENT");
  if (event.productStatus === "COMPLETED" && !event.deliveryConfirmed)
    throw new PersistentTransfersError("TRANSFERS_DELIVERY_REQUIRED");
}

function databaseMetadata(event: TransferLifecycleEvent) {
  return {
    activeMetadata: event.active === null ? Prisma.DbNull : (event.active as Prisma.InputJsonValue),
    failureCategory:
      event.productStatus === "FAILED" && event.failureCategory
        ? dbFailure[event.failureCategory]
        : null,
    speedProof:
      event.speedProof === null ? Prisma.DbNull : (event.speedProof as Prisma.InputJsonValue),
    status: dbStatus[event.productStatus]
  };
}

function terminalStatus(status: TransferStatus): boolean {
  return (
    status === TransferStatus.COMPLETED ||
    status === TransferStatus.FAILED ||
    status === TransferStatus.CANCELED
  );
}

function jsonObject(
  value: Prisma.JsonValue | null | undefined
): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

function jsonNumber(value: Prisma.JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function jsonString(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function activeDto(value: Prisma.JsonValue | null): ActiveTransferMetadata | null {
  const metadata = jsonObject(value);
  if (!metadata) return null;
  const route = jsonString(metadata.route);
  const health = jsonString(metadata.health);
  const transferredBytes = jsonNumber(metadata.transferredBytes);
  const verifiedBytes = jsonNumber(metadata.verifiedBytes);
  const currentPayloadSpeedBps = jsonNumber(metadata.currentPayloadSpeedBps);
  const etaMs = jsonNumber(metadata.etaMs);
  if (
    transferredBytes === null ||
    verifiedBytes === null ||
    (!["Direct", "Relayed"].includes(route ?? "") && route !== null) ||
    (![
      "GOOD",
      "UNSTABLE",
      "SLOWER_THAN_EXPECTED",
      "NOT_ENOUGH_INFORMATION",
      "RECONNECTING"
    ].includes(health ?? "") &&
      health !== null)
  )
    return null;
  return {
    currentPayloadSpeedBps,
    etaMs,
    health: health as ActiveTransferMetadata["health"],
    route: route as ActiveTransferMetadata["route"],
    transferredBytes,
    verifiedBytes
  };
}

function speedProofDto(value: Prisma.JsonValue | null): SafeSpeedProofSummary | null {
  const proof = jsonObject(value);
  if (!proof) return null;
  const routeSegments: SafeSpeedProofRouteSegment[] = Array.isArray(proof.routeSegments)
    ? proof.routeSegments.flatMap((segment) => {
        const record = jsonObject(segment);
        const route = record ? jsonString(record.route) : null;
        const averagePayloadSpeedBps = record ? jsonNumber(record.averagePayloadSpeedBps) : null;
        return route === "Direct" || route === "Relayed"
          ? [{ averagePayloadSpeedBps, route: route as SafeSpeedProofRouteSegment["route"] }]
          : [];
      })
    : [];
  const dominantBottleneck = jsonString(proof.dominantBottleneck);
  const bottleneckConfidence = jsonString(proof.bottleneckConfidence);
  const measurementAvailability = jsonObject(proof.measurementAvailability);
  const numeric = (name: string) => jsonNumber(proof[name]);
  if (
    !dominantBottleneck ||
    !bottleneckConfidence ||
    !measurementAvailability ||
    routeSegments.length > 16 ||
    [
      "durationMs",
      "payloadBytes",
      "integrityRetryCount",
      "reconnectCount",
      "routeChangeCount",
      "stallCount",
      "stalledDurationMs"
    ].some((field) => numeric(field) === null)
  )
    return null;
  return {
    averagePayloadSpeedBps: numeric("averagePayloadSpeedBps"),
    bottleneckConfidence: bottleneckConfidence as SafeSpeedProofSummary["bottleneckConfidence"],
    dominantBottleneck: dominantBottleneck as SafeSpeedProofSummary["dominantBottleneck"],
    durationMs: numeric("durationMs")!,
    integrityRetryCount: numeric("integrityRetryCount")!,
    measurementAvailability:
      measurementAvailability as SafeSpeedProofSummary["measurementAvailability"],
    payloadBytes: numeric("payloadBytes")!,
    peakPayloadSpeedBps: numeric("peakPayloadSpeedBps"),
    reconnectCount: numeric("reconnectCount")!,
    routeChangeCount: numeric("routeChangeCount")!,
    routeSegments,
    stallCount: numeric("stallCount")!,
    stalledDurationMs: numeric("stalledDurationMs")!
  };
}

function recordDto(record: {
  activeMetadata: Prisma.JsonValue | null;
  direction: TransferDirection;
  endedAt: Date | null;
  failureCategory: FailureCategory | null;
  fileCount: number | null;
  folderCount: number | null;
  id: string;
  peerAccountId: string | null;
  sourceKind: TransferSourceKind;
  speedProof: Prisma.JsonValue | null;
  startedAt: Date;
  status: TransferStatus;
  totalBytes: bigint | null;
}): TransferHistoryRecord {
  const totalBytes = record.totalBytes === null ? null : Number(record.totalBytes);
  return {
    active: terminalStatus(record.status) ? null : activeDto(record.activeMetadata),
    direction: productDirection[record.direction],
    endedAt: record.endedAt?.toISOString() ?? null,
    failureCategory: record.failureCategory ? productFailure[record.failureCategory] : null,
    fileCount: record.fileCount,
    folderCount: record.folderCount,
    peerPersonId: record.peerAccountId,
    productStatus: productStatus[record.status],
    recordId: record.id,
    sourceKind: productSourceKind[record.sourceKind],
    speedProof: speedProofDto(record.speedProof),
    startedAt: record.startedAt.toISOString(),
    totalBytes: Number.isSafeInteger(totalBytes) ? totalBytes : null
  };
}

/** PostgreSQL-backed P7 history repository. It has no transfer, route, or recovery authority. */
export class PersistentTransfersService {
  constructor(private readonly client: PrismaClient = databaseClient()) {}

  async get(owner: PersistentAccount, recordId: string): Promise<TransferHistoryRecord | null> {
    if (!isOpaqueAccountId(recordId)) return null;
    const record = await this.client.transferRecord.findFirst({
      where: { id: recordId, ownerAccountId: owner.id }
    });
    return record ? recordDto(record) : null;
  }

  async list(
    owner: PersistentAccount,
    requestedLimit = transferPageSize
  ): Promise<readonly TransferHistoryRecord[]> {
    const take = Math.min(Math.max(Math.trunc(requestedLimit), 1), transferPageMaximum);
    const records = await this.client.transferRecord.findMany({
      where: { ownerAccountId: owner.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take
    });
    return records.map(recordDto);
  }

  async record(
    owner: PersistentAccount,
    event: TransferLifecycleEvent
  ): Promise<TransferHistoryRecord> {
    assertPersistentLifecycleEvent(event);
    try {
      return await this.recordOnce(owner, event);
    } catch (error) {
      // The unique owner/lifecycle constraint arbitrates concurrent first observations. Retry the
      // transaction once so a terminal observation can update the row created by the other call.
      if (!isUniqueConstraint(error)) throw error;
      return this.recordOnce(owner, event);
    }
  }

  private async recordOnce(
    owner: PersistentAccount,
    event: TransferLifecycleEvent
  ): Promise<TransferHistoryRecord> {
    const metadata = databaseMetadata(event);
    const create = {
      ...metadata,
      direction: dbDirection[event.direction],
      fileCount: event.fileCount,
      folderCount: event.folderCount,
      lifecycleKey: event.lifecycleKey,
      ownerAccountId: owner.id,
      peerAccountId: event.peerPersonId,
      sourceKind: dbSourceKind[event.sourceKind],
      totalBytes: event.totalBytes === null ? null : BigInt(event.totalBytes)
    };

    const record = await this.client.$transaction(async (transaction) => {
      const existing = await transaction.transferRecord.findUnique({
        where: {
          ownerAccountId_lifecycleKey: {
            lifecycleKey: event.lifecycleKey,
            ownerAccountId: owner.id
          }
        }
      });
      if (existing && terminalStatus(existing.status)) return existing;
      if (existing)
        return transaction.transferRecord.update({
          where: { id: existing.id },
          data: {
            ...metadata,
            endedAt: isTerminalTransferRecordStatus(event.productStatus) ? new Date() : null,
            revision: { increment: 1 }
          }
        });
      return transaction.transferRecord.create({
        data: {
          ...create,
          endedAt: isTerminalTransferRecordStatus(event.productStatus) ? new Date() : null
        }
      });
    });
    return recordDto(record);
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
