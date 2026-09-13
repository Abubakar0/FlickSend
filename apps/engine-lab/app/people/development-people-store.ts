import { randomUUID } from "node:crypto";
import {
  developmentPeople,
  developmentPeopleSnapshot,
  type PeopleSnapshot,
  type PersonIdentity,
  type PersonRelationship
} from "./people-types";

export type DevelopmentPeopleErrorCode =
  | "PEOPLE_ALREADY_CONNECTED"
  | "PEOPLE_BLOCKED"
  | "PEOPLE_INVITE_INVALID"
  | "PEOPLE_SELF"
  | "PEOPLE_SERVICE_UNAVAILABLE";

export class DevelopmentPeopleError extends Error {
  constructor(readonly code: DevelopmentPeopleErrorCode) {
    super(code);
  }
}

type RelationshipRecord = {
  blockedBy?: string;
  invitedBy?: string;
  people: readonly [string, string];
  state: "INVITED" | "CONNECTED" | "BLOCKED";
  updatedAt: string;
};

type PairingInvite = {
  code: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
};

export type DevelopmentPeopleMutationResult = {
  inviteCode?: string;
  snapshot: PeopleSnapshot;
  stale?: boolean;
};

const pairingLifetimeMs = 15 * 60 * 1000;

/**
 * P6 DEVELOPMENT PEOPLE STORE. This process-local fixture is intentionally not production account or
 * database persistence. It holds relationship metadata only, never transfer or payload data.
 */
export class DevelopmentPeopleStore {
  private activePairingByCreator = new Map<string, string>();
  private invites = new Map<string, PairingInvite>();
  private relationships = new Map<string, RelationshipRecord>();
  private latestClientRevision = new Map<string, number>();

  constructor(private readonly now: () => Date = () => new Date()) {
    this.reset();
  }

  reset(): void {
    this.activePairingByCreator.clear();
    this.invites.clear();
    this.relationships.clear();
    this.latestClientRevision.clear();
    this.relationships.set(this.pairKey("dev-sender", "alex-morgan"), {
      people: this.sortedPair("dev-sender", "alex-morgan"),
      state: "CONNECTED",
      updatedAt: this.timestamp()
    });
  }

  snapshot(personId: string): PeopleSnapshot {
    const currentPerson = this.requirePerson(personId);
    const relationships: PersonRelationship[] = [];
    for (const record of this.relationships.values()) {
      if (!record.people.includes(personId)) continue;
      const otherId = record.people[0] === personId ? record.people[1] : record.people[0];
      const other = this.requirePerson(otherId);
      if (record.state === "BLOCKED" && record.blockedBy !== personId) continue;
      relationships.push({
        person: other,
        state:
          record.state === "CONNECTED"
            ? "CONNECTED"
            : record.state === "BLOCKED"
              ? "BLOCKED"
              : record.invitedBy === personId
                ? "INVITED_OUTGOING"
                : "INVITED_INCOMING",
        updatedAt: record.updatedAt
      });
    }
    relationships.sort((left, right) =>
      left.person.displayName.localeCompare(right.person.displayName)
    );
    return { currentPerson, relationships };
  }

  createPairingCode(personId: string): DevelopmentPeopleMutationResult {
    this.requirePerson(personId);
    this.clearExpiredInvites();
    const existingCode = this.activePairingByCreator.get(personId);
    const existing = existingCode ? this.invites.get(existingCode) : undefined;
    if (existing) return { snapshot: this.snapshot(personId), inviteCode: existing.code };
    const code = `fp-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const createdAt = this.timestamp();
    const expiresAt = new Date(this.now().getTime() + pairingLifetimeMs).toISOString();
    this.invites.set(code, { code, createdAt, createdBy: personId, expiresAt });
    this.activePairingByCreator.set(personId, code);
    return { snapshot: this.snapshot(personId), inviteCode: code };
  }

  redeemPairingCode(personId: string, code: string): DevelopmentPeopleMutationResult {
    this.requirePerson(personId);
    this.clearExpiredInvites();
    const invite = this.invites.get(code.trim());
    if (!invite) throw new DevelopmentPeopleError("PEOPLE_INVITE_INVALID");
    if (invite.createdBy === personId) throw new DevelopmentPeopleError("PEOPLE_SELF");

    const key = this.pairKey(invite.createdBy, personId);
    const existing = this.relationships.get(key);
    if (existing?.state === "BLOCKED") {
      if (existing.blockedBy === personId) throw new DevelopmentPeopleError("PEOPLE_BLOCKED");
      throw new DevelopmentPeopleError("PEOPLE_INVITE_INVALID");
    }
    if (existing?.state === "CONNECTED") {
      this.consumeInvite(invite);
      throw new DevelopmentPeopleError("PEOPLE_ALREADY_CONNECTED");
    }
    if (existing?.state === "INVITED") {
      this.consumeInvite(invite);
      if (existing.invitedBy === invite.createdBy) return { snapshot: this.snapshot(personId) };
      // The other person already invited the code owner. Redeeming this inverse code is mutual
      // intent, so one logical relationship deterministically converges to CONNECTED.
      existing.state = "CONNECTED";
      existing.invitedBy = undefined;
      existing.updatedAt = this.timestamp();
      this.consumePairingForCreator(personId);
      return { snapshot: this.snapshot(personId) };
    }

    this.consumeInvite(invite);
    this.relationships.set(key, {
      people: this.sortedPair(invite.createdBy, personId),
      state: "INVITED",
      invitedBy: invite.createdBy,
      updatedAt: this.timestamp()
    });
    return { snapshot: this.snapshot(personId) };
  }

  accept(personId: string, otherPersonId: string): DevelopmentPeopleMutationResult {
    const record = this.requireRelationship(personId, otherPersonId);
    if (record.state === "BLOCKED") throw new DevelopmentPeopleError("PEOPLE_BLOCKED");
    if (record.state === "CONNECTED") return { snapshot: this.snapshot(personId) };
    if (record.invitedBy === personId) throw new DevelopmentPeopleError("PEOPLE_INVITE_INVALID");
    record.state = "CONNECTED";
    record.invitedBy = undefined;
    record.updatedAt = this.timestamp();
    return { snapshot: this.snapshot(personId) };
  }

  decline(personId: string, otherPersonId: string): DevelopmentPeopleMutationResult {
    const key = this.pairKey(personId, otherPersonId);
    const record = this.relationships.get(key);
    if (record?.state === "INVITED" && record.invitedBy !== personId)
      this.relationships.delete(key);
    return { snapshot: this.snapshot(personId) };
  }

  remove(personId: string, otherPersonId: string): DevelopmentPeopleMutationResult {
    const key = this.pairKey(personId, otherPersonId);
    if (this.relationships.get(key)?.state === "CONNECTED") this.relationships.delete(key);
    return { snapshot: this.snapshot(personId) };
  }

  block(personId: string, otherPersonId: string): DevelopmentPeopleMutationResult {
    if (personId === otherPersonId) throw new DevelopmentPeopleError("PEOPLE_SELF");
    this.requirePerson(personId);
    this.requirePerson(otherPersonId);
    const key = this.pairKey(personId, otherPersonId);
    const existing = this.relationships.get(key);
    if (existing?.state === "BLOCKED") return { snapshot: this.snapshot(personId) };
    this.relationships.set(key, {
      people: this.sortedPair(personId, otherPersonId),
      state: "BLOCKED",
      blockedBy: personId,
      updatedAt: this.timestamp()
    });
    this.consumePairingForCreator(personId);
    return { snapshot: this.snapshot(personId) };
  }

  unblock(personId: string, otherPersonId: string): DevelopmentPeopleMutationResult {
    const key = this.pairKey(personId, otherPersonId);
    const record = this.relationships.get(key);
    if (record?.state === "BLOCKED" && record.blockedBy === personId)
      this.relationships.delete(key);
    return { snapshot: this.snapshot(personId) };
  }

  acceptsClientRevision(clientId: string, revision: number): boolean {
    const latest = this.latestClientRevision.get(clientId) ?? 0;
    if (revision <= latest) return false;
    this.latestClientRevision.set(clientId, revision);
    return true;
  }

  initialSnapshot(personId: string): PeopleSnapshot {
    return developmentPeopleSnapshot(personId);
  }

  private clearExpiredInvites(): void {
    const now = this.now().getTime();
    for (const invite of this.invites.values())
      if (Date.parse(invite.expiresAt) <= now) this.consumeInvite(invite);
  }

  private consumeInvite(invite: PairingInvite): void {
    this.invites.delete(invite.code);
    if (this.activePairingByCreator.get(invite.createdBy) === invite.code)
      this.activePairingByCreator.delete(invite.createdBy);
  }

  private consumePairingForCreator(personId: string): void {
    const code = this.activePairingByCreator.get(personId);
    if (!code) return;
    const invite = this.invites.get(code);
    if (invite) this.consumeInvite(invite);
  }

  private pairKey(left: string, right: string): string {
    return this.sortedPair(left, right).join(":");
  }

  private requirePerson(personId: string): PersonIdentity {
    const person = developmentPeople.find((candidate) => candidate.id === personId);
    if (!person) throw new DevelopmentPeopleError("PEOPLE_INVITE_INVALID");
    return person;
  }

  private requireRelationship(personId: string, otherPersonId: string): RelationshipRecord {
    if (personId === otherPersonId) throw new DevelopmentPeopleError("PEOPLE_SELF");
    this.requirePerson(personId);
    this.requirePerson(otherPersonId);
    const record = this.relationships.get(this.pairKey(personId, otherPersonId));
    if (!record) throw new DevelopmentPeopleError("PEOPLE_INVITE_INVALID");
    return record;
  }

  private sortedPair(left: string, right: string): readonly [string, string] {
    return left < right ? [left, right] : [right, left];
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

const storeKey = "__flicksendDevelopmentPeopleStore";

type GlobalPeopleStore = typeof globalThis & {
  [storeKey]?: DevelopmentPeopleStore;
};

export function developmentPeopleStore(): DevelopmentPeopleStore {
  const globalStore = globalThis as GlobalPeopleStore;
  globalStore[storeKey] ??= new DevelopmentPeopleStore();
  return globalStore[storeKey];
}
