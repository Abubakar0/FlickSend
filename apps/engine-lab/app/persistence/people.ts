import {
  RelationshipStatus,
  databaseClient,
  type Prisma,
  type PrismaClient
} from "@flicksend/database";
import type {
  PeopleSnapshot,
  PersonIdentity,
  PersonRelationship,
  RelationshipState
} from "../people/people-types";
import type { PersistentAccount } from "./account";

export type PersistentPeopleErrorCode =
  | "PEOPLE_ALREADY_CONNECTED"
  | "PEOPLE_BLOCKED"
  | "PEOPLE_INVITE_INVALID"
  | "PEOPLE_SELF";

export class PersistentPeopleError extends Error {
  constructor(readonly code: PersistentPeopleErrorCode) {
    super(code);
  }
}

const peoplePageLimit = 100;

function person(account: { displayName: string | null; id: string }): PersonIdentity {
  return {
    displayName: account.displayName ?? "FlickSend member",
    id: account.id,
    presence: "unknown"
  };
}

function pair(left: string, right: string): readonly [string, string] {
  return left < right ? [left, right] : [right, left];
}

function isOpaqueAccountId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function relationshipState(
  relationship: {
    accountHighId: string;
    accountLowId: string;
    initiatedByAccountId: string | null;
    status: RelationshipStatus;
  },
  accountId: string
): Exclude<RelationshipState, "UNCONNECTED"> {
  if (relationship.status === RelationshipStatus.CONNECTED) return "CONNECTED";
  if (relationship.status === RelationshipStatus.BLOCKED) return "BLOCKED";
  return relationship.initiatedByAccountId === accountId ? "INVITED_OUTGOING" : "INVITED_INCOMING";
}

type RelationshipWithAccounts = Prisma.PersonRelationshipGetPayload<{
  include: { accountHigh: true; accountLow: true };
}>;

function relationshipDto(
  relationship: RelationshipWithAccounts,
  accountId: string
): PersonRelationship {
  const other = relationship.accountLowId === accountId ? relationship.accountHigh : relationship.accountLow;
  return {
    person: person(other),
    state: relationshipState(relationship, accountId),
    updatedAt: relationship.updatedAt.toISOString()
  };
}

/** PostgreSQL-backed P6 relationship repository. It only receives the server-resolved account. */
export class PersistentPeopleService {
  constructor(private readonly client: PrismaClient = databaseClient()) {}

  async load(account: PersistentAccount): Promise<PeopleSnapshot> {
    const relationships = await this.client.personRelationship.findMany({
      where: {
        OR: [{ accountHighId: account.id }, { accountLowId: account.id }]
      },
      include: { accountHigh: true, accountLow: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: peoplePageLimit
    });
    return {
      currentPerson: person(account),
      relationships: relationships.map((relationship) => relationshipDto(relationship, account.id))
    };
  }

  async accept(account: PersistentAccount, otherAccountId: string): Promise<PeopleSnapshot> {
    await this.updatePair(account.id, otherAccountId, async (transaction, relationship) => {
      if (!relationship || relationship.status !== RelationshipStatus.INVITED)
        throw new PersistentPeopleError("PEOPLE_INVITE_INVALID");
      if (relationship.initiatedByAccountId === account.id)
        throw new PersistentPeopleError("PEOPLE_INVITE_INVALID");
      await transaction.personRelationship.update({
        where: { id: relationship.id },
        data: {
          blockedByAccountId: null,
          initiatedByAccountId: null,
          status: RelationshipStatus.CONNECTED
        }
      });
    });
    return this.load(account);
  }

  async block(account: PersistentAccount, otherAccountId: string): Promise<PeopleSnapshot> {
    await this.requireOtherAccount(account.id, otherAccountId);
    const [accountLowId, accountHighId] = pair(account.id, otherAccountId);
    await this.client.$transaction(async (transaction) => {
      const relationship = await transaction.personRelationship.findUnique({
        where: { accountLowId_accountHighId: { accountLowId, accountHighId } }
      });
      if (relationship?.status === RelationshipStatus.BLOCKED) {
        if (relationship.blockedByAccountId !== account.id)
          throw new PersistentPeopleError("PEOPLE_BLOCKED");
        return;
      }
      if (!relationship) {
        await transaction.personRelationship.create({
          data: {
            accountHighId,
            accountLowId,
            blockedByAccountId: account.id,
            status: RelationshipStatus.BLOCKED
          }
        });
        return;
      }
      await transaction.personRelationship.update({
        where: { id: relationship.id },
        data: {
          blockedByAccountId: account.id,
          initiatedByAccountId: null,
          status: RelationshipStatus.BLOCKED
        }
      });
    });
    return this.load(account);
  }

  async decline(account: PersistentAccount, otherAccountId: string): Promise<PeopleSnapshot> {
    await this.updatePair(account.id, otherAccountId, async (transaction, relationship) => {
      if (relationship?.status === RelationshipStatus.INVITED && relationship.initiatedByAccountId !== account.id)
        await transaction.personRelationship.delete({ where: { id: relationship.id } });
    });
    return this.load(account);
  }

  async remove(account: PersistentAccount, otherAccountId: string): Promise<PeopleSnapshot> {
    await this.updatePair(account.id, otherAccountId, async (transaction, relationship) => {
      if (relationship?.status === RelationshipStatus.CONNECTED)
        await transaction.personRelationship.delete({ where: { id: relationship.id } });
    });
    return this.load(account);
  }

  async unblock(account: PersistentAccount, otherAccountId: string): Promise<PeopleSnapshot> {
    await this.updatePair(account.id, otherAccountId, async (transaction, relationship) => {
      if (
        relationship?.status === RelationshipStatus.BLOCKED &&
        relationship.blockedByAccountId === account.id
      )
        await transaction.personRelationship.delete({ where: { id: relationship.id } });
    });
    return this.load(account);
  }

  async connected(account: PersistentAccount): Promise<readonly PersonRelationship[]> {
    const snapshot = await this.load(account);
    return snapshot.relationships.filter((relationship) => relationship.state === "CONNECTED");
  }

  private async requireOtherAccount(accountId: string, otherAccountId: string): Promise<void> {
    if (!isOpaqueAccountId(otherAccountId)) throw new PersistentPeopleError("PEOPLE_INVITE_INVALID");
    if (accountId === otherAccountId) throw new PersistentPeopleError("PEOPLE_SELF");
    const target = await this.client.account.findUnique({ where: { id: otherAccountId } });
    if (!target) throw new PersistentPeopleError("PEOPLE_INVITE_INVALID");
  }

  private async updatePair(
    accountId: string,
    otherAccountId: string,
    update: (
      transaction: Prisma.TransactionClient,
      relationship: Awaited<ReturnType<Prisma.TransactionClient["personRelationship"]["findUnique"]>>
    ) => Promise<void>
  ): Promise<void> {
    await this.requireOtherAccount(accountId, otherAccountId);
    const [accountLowId, accountHighId] = pair(accountId, otherAccountId);
    await this.client.$transaction(async (transaction) => {
      const relationship = await transaction.personRelationship.findUnique({
        where: { accountLowId_accountHighId: { accountLowId, accountHighId } }
      });
      await update(transaction, relationship);
    });
  }
}
