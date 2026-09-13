import {
  DevelopmentPeopleRepository,
  PeopleRepositoryError,
  type PeopleOperationContext,
  type PeopleRepository
} from "./people-repository";
import type { PersonIdentity } from "./people-types";
import {
  createInitialPeopleWorkflow,
  mapPeopleProductError,
  reducePeopleWorkflow,
  type PeopleWorkflowSnapshot
} from "./people-state";

type Listener = (snapshot: PeopleWorkflowSnapshot) => void;

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `p6-${Math.random().toString(36).slice(2)}`;
}

/** Application controller for P6 relationship state. React only renders these prepared snapshots. */
export class PeopleController {
  private readonly clientId = createClientId();
  private listeners = new Set<Listener>();
  private operationRevision = 0;
  private snapshot: PeopleWorkflowSnapshot;

  constructor(
    readonly currentPerson: PersonIdentity,
    private readonly repository: PeopleRepository = new DevelopmentPeopleRepository()
  ) {
    this.snapshot = createInitialPeopleWorkflow(currentPerson);
  }

  get currentPersonId(): string {
    return this.currentPerson.id;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): PeopleWorkflowSnapshot {
    return this.snapshot;
  }

  async load(): Promise<void> {
    const revision = ++this.operationRevision;
    this.dispatch({ type: "LOAD_STARTED", revision });
    try {
      const result = await this.repository.load(this.currentPersonId);
      if (revision !== this.operationRevision) return;
      this.dispatch({
        type: "SNAPSHOT_RESOLVED",
        inviteCode: null,
        revision,
        snapshot: result.snapshot
      });
    } catch (error) {
      this.fail(revision, error);
    }
  }

  createInvite(): Promise<void> {
    return this.mutate("CREATE_INVITE", (context) => this.repository.createInvite(context));
  }

  redeemInvite(code: string): Promise<void> {
    return this.mutate("REDEEM_INVITE", (context) => this.repository.redeemInvite(context, code));
  }

  accept(personId: string): Promise<void> {
    return this.mutate("ACCEPT", (context) => this.repository.accept(context, personId));
  }

  decline(personId: string): Promise<void> {
    return this.mutate("DECLINE", (context) => this.repository.decline(context, personId));
  }

  remove(personId: string): Promise<void> {
    return this.mutate("REMOVE", (context) => this.repository.remove(context, personId));
  }

  block(personId: string): Promise<void> {
    return this.mutate("BLOCK", (context) => this.repository.block(context, personId));
  }

  unblock(personId: string): Promise<void> {
    return this.mutate("UNBLOCK", (context) => this.repository.unblock(context, personId));
  }

  async resetDevelopmentStore(): Promise<void> {
    const revision = ++this.operationRevision;
    this.dispatch({ type: "OPERATION_STARTED", operation: "RESET", revision });
    try {
      const result = await this.repository.resetDevelopmentStore(this.currentPersonId);
      if (revision !== this.operationRevision) return;
      this.dispatch({
        type: "SNAPSHOT_RESOLVED",
        revision,
        snapshot: result.snapshot,
        inviteCode: null
      });
    } catch (error) {
      this.fail(revision, error);
    }
  }

  private async mutate(
    operation: string,
    callback: (context: PeopleOperationContext) => ReturnType<PeopleRepository["createInvite"]>
  ): Promise<void> {
    const revision = ++this.operationRevision;
    this.dispatch({ type: "OPERATION_STARTED", operation, revision });
    try {
      const result = await callback({
        clientId: this.clientId,
        personId: this.currentPersonId,
        revision
      });
      if (revision !== this.operationRevision || result.stale) return;
      this.dispatch({
        type: "SNAPSHOT_RESOLVED",
        revision,
        snapshot: result.snapshot,
        inviteCode: operation === "CREATE_INVITE" ? (result.inviteCode ?? null) : null
      });
    } catch (error) {
      this.fail(revision, error);
    }
  }

  private fail(revision: number, error: unknown): void {
    if (revision !== this.operationRevision) return;
    const code = error instanceof PeopleRepositoryError ? error.code : "PEOPLE_SERVICE_UNAVAILABLE";
    this.dispatch({ type: "OPERATION_FAILED", revision, error: mapPeopleProductError(code) });
  }

  private dispatch(event: Parameters<typeof reducePeopleWorkflow>[1]): void {
    this.snapshot = reducePeopleWorkflow(this.snapshot, event);
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
