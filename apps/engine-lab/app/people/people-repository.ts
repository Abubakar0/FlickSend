import type { PeopleSnapshot } from "./people-types";

export type PeopleRepositoryErrorCode =
  | "PEOPLE_ALREADY_CONNECTED"
  | "PEOPLE_BLOCKED"
  | "PEOPLE_INVITE_INVALID"
  | "PEOPLE_SELF"
  | "PEOPLE_SERVICE_UNAVAILABLE";

export type PeopleRepositoryResult = {
  inviteCode?: string;
  snapshot: PeopleSnapshot;
  stale?: boolean;
};

export type PeopleOperationContext = {
  clientId: string;
  personId: string;
  revision: number;
};

export interface PeopleRepository {
  accept(context: PeopleOperationContext, targetPersonId: string): Promise<PeopleRepositoryResult>;
  block(context: PeopleOperationContext, targetPersonId: string): Promise<PeopleRepositoryResult>;
  createInvite(context: PeopleOperationContext): Promise<PeopleRepositoryResult>;
  decline(context: PeopleOperationContext, targetPersonId: string): Promise<PeopleRepositoryResult>;
  load(personId: string): Promise<PeopleRepositoryResult>;
  redeemInvite(context: PeopleOperationContext, code: string): Promise<PeopleRepositoryResult>;
  remove(context: PeopleOperationContext, targetPersonId: string): Promise<PeopleRepositoryResult>;
  resetDevelopmentStore(personId: string): Promise<PeopleRepositoryResult>;
  unblock(context: PeopleOperationContext, targetPersonId: string): Promise<PeopleRepositoryResult>;
}

export class PeopleRepositoryError extends Error {
  constructor(readonly code: PeopleRepositoryErrorCode) {
    super(code);
  }
}

type RepositoryOperation =
  | "ACCEPT"
  | "BLOCK"
  | "CREATE_INVITE"
  | "DECLINE"
  | "LOAD"
  | "REDEEM_INVITE"
  | "REMOVE"
  | "RESET"
  | "UNBLOCK";

type RepositoryResponse =
  { error: PeopleRepositoryErrorCode; ok: false } | ({ ok: true } & PeopleRepositoryResult);

/** Client adapter for the P6 DEVELOPMENT PEOPLE STORE, never a production account repository. */
export class DevelopmentPeopleRepository implements PeopleRepository {
  async accept(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    return this.execute("ACCEPT", context, { targetPersonId });
  }

  async block(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    return this.execute("BLOCK", context, { targetPersonId });
  }

  async createInvite(context: PeopleOperationContext): Promise<PeopleRepositoryResult> {
    return this.execute("CREATE_INVITE", context);
  }

  async decline(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    return this.execute("DECLINE", context, { targetPersonId });
  }

  async load(personId: string): Promise<PeopleRepositoryResult> {
    return this.execute("LOAD", { clientId: "", personId, revision: 0 });
  }

  async redeemInvite(
    context: PeopleOperationContext,
    code: string
  ): Promise<PeopleRepositoryResult> {
    return this.execute("REDEEM_INVITE", context, { code });
  }

  async remove(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    return this.execute("REMOVE", context, { targetPersonId });
  }

  async resetDevelopmentStore(personId: string): Promise<PeopleRepositoryResult> {
    return this.execute("RESET", { clientId: "", personId, revision: 0 });
  }

  async unblock(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    return this.execute("UNBLOCK", context, { targetPersonId });
  }

  private async execute(
    operation: RepositoryOperation,
    context: PeopleOperationContext,
    additional: { code?: string; targetPersonId?: string } = {}
  ): Promise<PeopleRepositoryResult> {
    let response: Response;
    try {
      response = await fetch("/api/development/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, ...context, ...additional })
      });
    } catch {
      throw new PeopleRepositoryError("PEOPLE_SERVICE_UNAVAILABLE");
    }
    let body: RepositoryResponse;
    try {
      body = (await response.json()) as RepositoryResponse;
    } catch {
      throw new PeopleRepositoryError("PEOPLE_SERVICE_UNAVAILABLE");
    }
    if (!response.ok || !body.ok)
      throw new PeopleRepositoryError(body.ok ? "PEOPLE_SERVICE_UNAVAILABLE" : body.error);
    return body;
  }
}

/** Client adapter for the P11 server-authorized PostgreSQL People repository. */
export class PersistentPeopleRepository implements PeopleRepository {
  async accept(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    void context;
    return this.operation("ACCEPT", targetPersonId);
  }

  async block(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    void context;
    return this.operation("BLOCK", targetPersonId);
  }

  async createInvite(context: PeopleOperationContext): Promise<PeopleRepositoryResult> {
    void context;
    // Production invitation creation is P12 scope. The persistent route never exposes it.
    throw new PeopleRepositoryError("PEOPLE_INVITE_INVALID");
  }

  async decline(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    void context;
    return this.operation("DECLINE", targetPersonId);
  }

  async load(personId: string): Promise<PeopleRepositoryResult> {
    void personId;
    return this.request("/api/persistence/people");
  }

  async redeemInvite(
    context: PeopleOperationContext,
    code: string
  ): Promise<PeopleRepositoryResult> {
    void context;
    void code;
    // Development pairing tokens are deliberately not sent to production persistence.
    throw new PeopleRepositoryError("PEOPLE_INVITE_INVALID");
  }

  async remove(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    void context;
    return this.operation("REMOVE", targetPersonId);
  }

  async resetDevelopmentStore(personId: string): Promise<PeopleRepositoryResult> {
    void personId;
    throw new PeopleRepositoryError("PEOPLE_SERVICE_UNAVAILABLE");
  }

  async unblock(
    context: PeopleOperationContext,
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    void context;
    return this.operation("UNBLOCK", targetPersonId);
  }

  private async operation(
    operation: "ACCEPT" | "BLOCK" | "DECLINE" | "REMOVE" | "UNBLOCK",
    targetPersonId: string
  ): Promise<PeopleRepositoryResult> {
    return this.request("/api/persistence/people", {
      body: JSON.stringify({ operation, targetPersonId }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
  }

  private async request(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<PeopleRepositoryResult> {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch {
      throw new PeopleRepositoryError("PEOPLE_SERVICE_UNAVAILABLE");
    }
    let body: RepositoryResponse;
    try {
      body = (await response.json()) as RepositoryResponse;
    } catch {
      throw new PeopleRepositoryError("PEOPLE_SERVICE_UNAVAILABLE");
    }
    if (!response.ok || !body.ok)
      throw new PeopleRepositoryError(body.ok ? "PEOPLE_SERVICE_UNAVAILABLE" : body.error);
    return body;
  }
}
