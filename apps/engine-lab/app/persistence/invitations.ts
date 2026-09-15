import { createHash, randomBytes } from "node:crypto";
import {
  InvitationStatus,
  Prisma,
  RelationshipStatus,
  databaseClient,
  type PrismaClient
} from "@flicksend/database";
import type { PersistentAccount } from "./account";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1_000;
const invitationListLimit = 50;
const invitationPrefix = "fsiv1_";
const tokenPattern = /^fsiv1_[A-Za-z0-9_-]{43}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InvitationErrorCode =
  | "INVITATION_ALREADY_CONNECTED"
  | "INVITATION_BLOCKED"
  | "INVITATION_SELF"
  | "INVITATION_UNAVAILABLE";

export class InvitationError extends Error {
  constructor(readonly code: InvitationErrorCode) {
    super(code);
  }
}

export type CreatedInvitation = {
  expiresAt: string;
  path: string;
};

export type InvitationListItem = {
  expiresAt: string;
  publicId: string;
  status: "PENDING";
};

export type PublicInvitationState = "AVAILABLE" | "UNAVAILABLE";

function pair(left: string, right: string): readonly [string, string] {
  return left < right ? [left, right] : [right, left];
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function createToken(): string {
  return `${invitationPrefix}${randomBytes(32).toString("base64url")}`;
}

function isToken(value: string): boolean {
  return tokenPattern.test(value);
}

function isPublicId(value: string): boolean {
  return uuidPattern.test(value);
}

function now(): Date {
  return new Date();
}

function expired(invitation: { expiresAt: Date }, current: Date): boolean {
  return invitation.expiresAt.getTime() <= current.getTime();
}

type Transaction = Prisma.TransactionClient;

/**
 * PostgreSQL-backed P12 invitation authority. It stores a SHA-256 token digest only; public
 * callers never receive an Account identifier, relationship identifier, or provider identifier.
 */
export class PersistentInvitationService {
  constructor(private readonly client: PrismaClient = databaseClient()) {}

  async create(account: PersistentAccount): Promise<CreatedInvitation> {
    const expiresAt = new Date(Date.now() + invitationLifetimeMs);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = createToken();
      try {
        await this.client.invitation.create({
          data: { expiresAt, inviterAccountId: account.id, tokenDigest: tokenDigest(token) }
        });
        return { expiresAt: expiresAt.toISOString(), path: `/invite/${token}` };
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error("Invitation token allocation failed.");
  }

  async list(account: PersistentAccount): Promise<readonly InvitationListItem[]> {
    await this.expireOwnedPending(account.id);
    const invitations = await this.client.invitation.findMany({
      where: { inviterAccountId: account.id, status: InvitationStatus.PENDING },
      orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
      select: { expiresAt: true, publicId: true },
      take: invitationListLimit
    });
    return invitations.map((invitation) => ({
      expiresAt: invitation.expiresAt.toISOString(),
      publicId: invitation.publicId,
      status: "PENDING"
    }));
  }

  async inspect(rawToken: string): Promise<PublicInvitationState> {
    const invitation = await this.findUsable(rawToken);
    return invitation ? "AVAILABLE" : "UNAVAILABLE";
  }

  async accept(
    account: PersistentAccount,
    rawToken: string
  ): Promise<"CONNECTED" | "ALREADY_CONNECTED"> {
    const digest = validDigest(rawToken);
    const current = now();
    const result = await this.serializable(async (transaction) => {
      const invitation = await transaction.invitation.findUnique({
        where: { tokenDigest: digest }
      });
      if (!invitation || invitation.status !== InvitationStatus.PENDING)
        throw new InvitationError("INVITATION_UNAVAILABLE");
      if (expired(invitation, current)) {
        await transaction.invitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.EXPIRED }
        });
        return "EXPIRED" as const;
      }
      if (invitation.inviterAccountId === account.id) throw new InvitationError("INVITATION_SELF");

      const [accountLowId, accountHighId] = pair(invitation.inviterAccountId, account.id);
      const relationship = await transaction.personRelationship.findUnique({
        where: { accountLowId_accountHighId: { accountLowId, accountHighId } }
      });
      if (relationship?.status === RelationshipStatus.BLOCKED)
        throw new InvitationError("INVITATION_BLOCKED");

      const acceptedAt = now();
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt,
          resolvedByAccountId: account.id,
          status: InvitationStatus.ACCEPTED
        }
      });
      if (relationship?.status === RelationshipStatus.CONNECTED) return "ALREADY_CONNECTED";

      await transaction.personRelationship.create({
        data: { accountHighId, accountLowId, status: RelationshipStatus.CONNECTED }
      });
      return "CONNECTED";
    });
    if (result === "EXPIRED") throw new InvitationError("INVITATION_UNAVAILABLE");
    return result;
  }

  async decline(account: PersistentAccount, rawToken: string): Promise<void> {
    const digest = validDigest(rawToken);
    const current = now();
    const result = await this.serializable(async (transaction) => {
      const invitation = await transaction.invitation.findUnique({
        where: { tokenDigest: digest }
      });
      if (!invitation || invitation.status !== InvitationStatus.PENDING)
        throw new InvitationError("INVITATION_UNAVAILABLE");
      if (expired(invitation, current)) {
        await transaction.invitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.EXPIRED }
        });
        return "EXPIRED" as const;
      }
      if (invitation.inviterAccountId === account.id) throw new InvitationError("INVITATION_SELF");
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: {
          declinedAt: now(),
          resolvedByAccountId: account.id,
          status: InvitationStatus.DECLINED
        }
      });
    });
    if (result === "EXPIRED") throw new InvitationError("INVITATION_UNAVAILABLE");
  }

  async revoke(account: PersistentAccount, publicId: string): Promise<void> {
    if (!isPublicId(publicId)) throw new InvitationError("INVITATION_UNAVAILABLE");
    const current = now();
    const result = await this.serializable(async (transaction) => {
      const invitation = await transaction.invitation.findFirst({
        where: { inviterAccountId: account.id, publicId }
      });
      if (!invitation || invitation.status !== InvitationStatus.PENDING)
        throw new InvitationError("INVITATION_UNAVAILABLE");
      if (expired(invitation, current)) {
        await transaction.invitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.EXPIRED }
        });
        return "EXPIRED" as const;
      }
      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { revokedAt: now(), status: InvitationStatus.REVOKED }
      });
    });
    if (result === "EXPIRED") throw new InvitationError("INVITATION_UNAVAILABLE");
  }

  private async findUsable(rawToken: string) {
    if (!isToken(rawToken)) return null;
    const invitation = await this.client.invitation.findUnique({
      where: { tokenDigest: tokenDigest(rawToken) }
    });
    if (!invitation || invitation.status !== InvitationStatus.PENDING) return null;
    if (expired(invitation, now())) {
      await this.client.invitation
        .update({ where: { id: invitation.id }, data: { status: InvitationStatus.EXPIRED } })
        .catch(() => undefined);
      return null;
    }
    return invitation;
  }

  private async expireOwnedPending(accountId: string): Promise<void> {
    await this.client.invitation.updateMany({
      where: {
        expiresAt: { lte: now() },
        inviterAccountId: accountId,
        status: InvitationStatus.PENDING
      },
      data: { status: InvitationStatus.EXPIRED }
    });
  }

  private async serializable<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (attempt < 2 && (isSerializationConflict(error) || isUniqueViolation(error))) continue;
        throw error;
      }
    }
    throw new Error("Invitation transaction retry limit reached.");
  }
}

function validDigest(rawToken: string): string {
  if (!isToken(rawToken)) throw new InvitationError("INVITATION_UNAVAILABLE");
  return tokenDigest(rawToken);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
