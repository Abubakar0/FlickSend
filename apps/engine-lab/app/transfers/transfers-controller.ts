import {
  DevelopmentTransfersRepository,
  type TransfersRepository,
  type TransfersRepositoryErrorCode
} from "./transfers-repository";
import type { TransferHistoryRecord, TransferLifecycleEvent } from "./transfer-types";

export type TransferListFilter = "ALL" | "RECEIVED" | "SENT";

export type TransfersSnapshot = {
  error: TransfersRepositoryErrorCode | null;
  filter: TransferListFilter;
  isLoading: boolean;
  records: readonly TransferHistoryRecord[];
};

type Listener = (snapshot: TransfersSnapshot) => void;

function initialSnapshot(): TransfersSnapshot {
  return { error: null, filter: "ALL", isLoading: true, records: [] };
}

/**
 * P7 application controller. It coordinates only safe lifecycle record persistence and list state;
 * it has no authority over transfer correctness or engine actions.
 */
export class TransfersController {
  private listeners = new Set<Listener>();
  private loadRevision = 0;
  private recordQueue = Promise.resolve();
  private snapshot = initialSnapshot();

  constructor(
    readonly currentPersonId: string,
    private readonly repository: TransfersRepository = new DevelopmentTransfersRepository()
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): TransfersSnapshot {
    return this.snapshot;
  }

  async load(): Promise<void> {
    const revision = ++this.loadRevision;
    this.update({ ...this.snapshot, error: null, isLoading: true });
    try {
      const records = await this.repository.list(this.currentPersonId);
      if (revision !== this.loadRevision) return;
      this.update({ ...this.snapshot, error: null, isLoading: false, records });
    } catch (error) {
      if (revision !== this.loadRevision) return;
      this.update({
        ...this.snapshot,
        error: errorCode(error),
        isLoading: false
      });
    }
  }

  async get(recordId: string): Promise<TransferHistoryRecord | null> {
    try {
      return await this.repository.get(this.currentPersonId, recordId);
    } catch (error) {
      this.update({ ...this.snapshot, error: errorCode(error), isLoading: false });
      return null;
    }
  }

  record(event: TransferLifecycleEvent): void {
    this.recordQueue = this.recordQueue
      .then(() => this.repository.record(this.currentPersonId, event))
      .then(() => undefined)
      .catch((error) => {
        this.update({ ...this.snapshot, error: errorCode(error), isLoading: false });
      });
  }

  setFilter(filter: TransferListFilter): void {
    this.update({ ...this.snapshot, filter });
  }

  async resetDevelopmentStore(): Promise<void> {
    try {
      await this.repository.resetDevelopmentStore();
      await this.load();
    } catch (error) {
      this.update({ ...this.snapshot, error: errorCode(error), isLoading: false });
    }
  }

  private update(snapshot: TransfersSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

function errorCode(error: unknown): TransfersRepositoryErrorCode {
  return error instanceof Error && "code" in error
    ? (error as { code: TransfersRepositoryErrorCode }).code
    : "TRANSFERS_SERVICE_UNAVAILABLE";
}
