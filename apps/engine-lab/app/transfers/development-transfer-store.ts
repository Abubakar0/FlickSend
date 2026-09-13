import { randomUUID } from "node:crypto";
import { developmentPeople } from "../people/people-types";
import {
  isTerminalTransferRecordStatus,
  type TransferHistoryRecord,
  type TransferLifecycleEvent
} from "./transfer-types";

export const developmentTransferHistoryLimit = 100;

export type DevelopmentTransferStoreErrorCode =
  "TRANSFERS_DELIVERY_REQUIRED" | "TRANSFERS_INVALID_EVENT" | "TRANSFERS_NOT_FOUND";

export class DevelopmentTransferStoreError extends Error {
  constructor(readonly code: DevelopmentTransferStoreErrorCode) {
    super(code);
  }
}

type PrivateRecord = {
  lifecycleKey: string;
  ownerPersonId: string;
  record: TransferHistoryRecord;
};

/**
 * P7 DEVELOPMENT TRANSFER STORE. It is process-local, bounded development metadata only, and is
 * not a production transfer database or a payload/recovery store.
 */
export class DevelopmentTransferStore {
  private readonly recordsById = new Map<string, PrivateRecord>();
  private readonly recordIdByLifecycleKey = new Map<string, string>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly createRecordId: () => string = () => `tr-${randomUUID().replaceAll("-", "")}`
  ) {}

  list(ownerPersonId: string): readonly TransferHistoryRecord[] {
    this.requirePerson(ownerPersonId);
    return [...this.recordsById.values()]
      .filter((entry) => entry.ownerPersonId === ownerPersonId)
      .map((entry) => this.copy(entry.record))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  get(ownerPersonId: string, recordId: string): TransferHistoryRecord | null {
    this.requirePerson(ownerPersonId);
    const entry = this.recordsById.get(recordId);
    return entry?.ownerPersonId === ownerPersonId ? this.copy(entry.record) : null;
  }

  record(ownerPersonId: string, event: TransferLifecycleEvent): TransferHistoryRecord {
    this.requirePerson(ownerPersonId);
    this.assertEvent(event);
    const existingId = this.recordIdByLifecycleKey.get(event.lifecycleKey);
    const existing = existingId ? this.recordsById.get(existingId) : undefined;
    if (existing && existing.ownerPersonId !== ownerPersonId)
      throw new DevelopmentTransferStoreError("TRANSFERS_INVALID_EVENT");
    if (event.productStatus === "COMPLETED" && !event.deliveryConfirmed)
      throw new DevelopmentTransferStoreError("TRANSFERS_DELIVERY_REQUIRED");
    if (existing && isTerminalTransferRecordStatus(existing.record.productStatus))
      return this.copy(existing.record);

    const record = existing?.record ?? this.createRecord(event);
    record.productStatus = event.productStatus;
    record.peerPersonId = event.peerPersonId;
    record.active = isTerminalTransferRecordStatus(event.productStatus) ? null : event.active;
    record.failureCategory = event.productStatus === "FAILED" ? event.failureCategory : null;
    if (event.speedProof) record.speedProof = event.speedProof;
    if (isTerminalTransferRecordStatus(event.productStatus)) record.endedAt ??= this.timestamp();

    if (!existing) {
      this.recordsById.set(record.recordId, {
        lifecycleKey: event.lifecycleKey,
        ownerPersonId,
        record
      });
      this.recordIdByLifecycleKey.set(event.lifecycleKey, record.recordId);
    }
    this.evictOldestNonActive();
    return this.copy(record);
  }

  reset(): void {
    this.recordsById.clear();
    this.recordIdByLifecycleKey.clear();
  }

  private createRecord(event: TransferLifecycleEvent): TransferHistoryRecord {
    return {
      active: event.active,
      direction: event.direction,
      endedAt: null,
      failureCategory: null,
      fileCount: event.fileCount,
      folderCount: event.folderCount,
      peerPersonId: event.peerPersonId,
      productStatus: event.productStatus,
      recordId: this.createRecordId(),
      sourceKind: event.sourceKind,
      speedProof: event.speedProof,
      startedAt: this.timestamp(),
      totalBytes: event.totalBytes
    };
  }

  private evictOldestNonActive(): void {
    while (this.recordsById.size > developmentTransferHistoryLimit) {
      const candidate = [...this.recordsById.values()]
        .filter((entry) => isTerminalTransferRecordStatus(entry.record.productStatus))
        .sort((left, right) => left.record.startedAt.localeCompare(right.record.startedAt))[0];
      if (!candidate) return;
      this.recordsById.delete(candidate.record.recordId);
      this.recordIdByLifecycleKey.delete(candidate.lifecycleKey);
    }
  }

  private assertEvent(event: TransferLifecycleEvent): void {
    if (!event.lifecycleKey || !/^p7-[a-z0-9-]+$/i.test(event.lifecycleKey))
      throw new DevelopmentTransferStoreError("TRANSFERS_INVALID_EVENT");
    if (!event.peerPersonId && event.peerPersonId !== null)
      throw new DevelopmentTransferStoreError("TRANSFERS_INVALID_EVENT");
    for (const value of [event.totalBytes, event.fileCount, event.folderCount])
      if (value !== null && (!Number.isSafeInteger(value) || value < 0))
        throw new DevelopmentTransferStoreError("TRANSFERS_INVALID_EVENT");
  }

  private copy(record: TransferHistoryRecord): TransferHistoryRecord {
    return structuredClone(record);
  }

  private requirePerson(personId: string): void {
    if (!developmentPeople.some((person) => person.id === personId))
      throw new DevelopmentTransferStoreError("TRANSFERS_NOT_FOUND");
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

const storeKey = "__flicksendDevelopmentTransferStore";

type GlobalTransferStore = typeof globalThis & {
  [storeKey]?: DevelopmentTransferStore;
};

export function developmentTransferStore(): DevelopmentTransferStore {
  const globalStore = globalThis as GlobalTransferStore;
  globalStore[storeKey] ??= new DevelopmentTransferStore();
  return globalStore[storeKey];
}
