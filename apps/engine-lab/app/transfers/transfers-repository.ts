import type { TransferHistoryRecord, TransferLifecycleEvent } from "./transfer-types";

export type TransfersRepositoryErrorCode =
  | "TRANSFERS_DELIVERY_REQUIRED"
  | "TRANSFERS_INVALID_EVENT"
  | "TRANSFERS_NOT_FOUND"
  | "TRANSFERS_SERVICE_UNAVAILABLE";

export class TransfersRepositoryError extends Error {
  constructor(readonly code: TransfersRepositoryErrorCode) {
    super(code);
  }
}

export interface TransfersRepository {
  get(ownerPersonId: string, recordId: string): Promise<TransferHistoryRecord | null>;
  list(ownerPersonId: string): Promise<readonly TransferHistoryRecord[]>;
  record(ownerPersonId: string, event: TransferLifecycleEvent): Promise<TransferHistoryRecord>;
  resetDevelopmentStore(): Promise<void>;
}

type RepositoryResponse =
  | { error: TransfersRepositoryErrorCode; ok: false }
  | { ok: true; record?: TransferHistoryRecord | null; records?: readonly TransferHistoryRecord[] };

type SuccessfulRepositoryResponse = Extract<RepositoryResponse, { ok: true }>;

/** Client adapter for the P7 DEVELOPMENT TRANSFER STORE, never a production history database. */
export class DevelopmentTransfersRepository implements TransfersRepository {
  async get(ownerPersonId: string, recordId: string): Promise<TransferHistoryRecord | null> {
    const search = new URLSearchParams({ person: ownerPersonId, record: recordId });
    const response = await this.request(`/api/development/transfers?${search.toString()}`);
    return response.record ?? null;
  }

  async list(ownerPersonId: string): Promise<readonly TransferHistoryRecord[]> {
    const search = new URLSearchParams({ person: ownerPersonId });
    const response = await this.request(`/api/development/transfers?${search.toString()}`);
    return response.records ?? [];
  }

  async record(
    ownerPersonId: string,
    event: TransferLifecycleEvent
  ): Promise<TransferHistoryRecord> {
    const response = await this.request("/api/development/transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, operation: "RECORD", person: ownerPersonId })
    });
    if (!response.record) throw new TransfersRepositoryError("TRANSFERS_SERVICE_UNAVAILABLE");
    return response.record;
  }

  async resetDevelopmentStore(): Promise<void> {
    await this.request("/api/development/transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "RESET" })
    });
  }

  private async request(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<SuccessfulRepositoryResponse> {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch {
      throw new TransfersRepositoryError("TRANSFERS_SERVICE_UNAVAILABLE");
    }
    let body: RepositoryResponse;
    try {
      body = (await response.json()) as RepositoryResponse;
    } catch {
      throw new TransfersRepositoryError("TRANSFERS_SERVICE_UNAVAILABLE");
    }
    if (!response.ok || !body.ok)
      throw new TransfersRepositoryError(body.ok ? "TRANSFERS_SERVICE_UNAVAILABLE" : body.error);
    return body;
  }
}

/** Client adapter for P11 owner-authorized PostgreSQL transfer history. */
export class PersistentTransfersRepository implements TransfersRepository {
  async get(ownerPersonId: string, recordId: string): Promise<TransferHistoryRecord | null> {
    void ownerPersonId;
    const search = new URLSearchParams({ record: recordId });
    const response = await this.request(`/api/persistence/transfers?${search.toString()}`);
    return response.record ?? null;
  }

  async list(ownerPersonId: string): Promise<readonly TransferHistoryRecord[]> {
    void ownerPersonId;
    const response = await this.request("/api/persistence/transfers");
    return response.records ?? [];
  }

  async record(
    ownerPersonId: string,
    event: TransferLifecycleEvent
  ): Promise<TransferHistoryRecord> {
    void ownerPersonId;
    const response = await this.request("/api/persistence/transfers", {
      body: JSON.stringify({ event, operation: "RECORD" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    if (!response.record) throw new TransfersRepositoryError("TRANSFERS_SERVICE_UNAVAILABLE");
    return response.record;
  }

  async resetDevelopmentStore(): Promise<void> {
    throw new TransfersRepositoryError("TRANSFERS_SERVICE_UNAVAILABLE");
  }

  private async request(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<SuccessfulRepositoryResponse> {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch {
      throw new TransfersRepositoryError("TRANSFERS_SERVICE_UNAVAILABLE");
    }
    let body: RepositoryResponse;
    try {
      body = (await response.json()) as RepositoryResponse;
    } catch {
      throw new TransfersRepositoryError("TRANSFERS_SERVICE_UNAVAILABLE");
    }
    if (!response.ok || !body.ok)
      throw new TransfersRepositoryError(body.ok ? "TRANSFERS_SERVICE_UNAVAILABLE" : body.error);
    return body;
  }
}
