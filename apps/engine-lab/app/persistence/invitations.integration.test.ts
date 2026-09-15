import {
  InvitationStatus,
  RelationshipStatus,
  createDatabaseClient,
  type PrismaClient
} from "@flicksend/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthPrincipal } from "../auth/types";
import { resolveOrProvisionAccount, type PersistentAccount } from "./account";
import { InvitationError, PersistentInvitationService } from "./invitations";
import { PersistentPeopleService } from "./people";

const qualificationUrl = "postgresql://postgres@127.0.0.1:54329/flicksend_p11?schema=public";
const enabled =
  process.env.FLICKSEND_P12_POSTGRES_TEST === "1" && process.env.DATABASE_URL === qualificationUrl;
const p12 = enabled ? describe : describe.skip;

let client: PrismaClient;

function principal(subject: string): AuthPrincipal {
  return {
    displayName: subject,
    emailVerified: true,
    primaryEmail: `${subject}@example.test`,
    principalId: subject
  };
}

async function account(subject: string): Promise<PersistentAccount> {
  return resolveOrProvisionAccount(principal(subject), client);
}

function token(path: string): string {
  return path.slice("/invite/".length);
}

function pair(left: string, right: string): readonly [string, string] {
  return left < right ? [left, right] : [right, left];
}

p12("P12 PostgreSQL invitations", () => {
  beforeEach(async () => {
    client ??= createDatabaseClient(qualificationUrl);
    await client.transferRecord.deleteMany();
    await client.personRelationship.deleteMany();
    await client.invitation.deleteMany();
    await client.account.deleteMany();
  });

  afterAll(async () => {
    await client?.$disconnect();
  });

  it("creates a strong opaque link while storing only its digest", async () => {
    const inviter = await account("inviter");
    const invitations = new PersistentInvitationService(client);
    const created = await invitations.create(inviter);
    const rawToken = token(created.path);
    const row = await client.invitation.findFirstOrThrow();

    expect(rawToken).toMatch(/^fsiv1_[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(row)).not.toContain(rawToken);
    expect(row.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(await invitations.inspect(rawToken)).toBe("AVAILABLE");
    await expect(invitations.inspect("not-an-invitation")).resolves.toBe("UNAVAILABLE");
    await expect(invitations.inspect(`fsiv1_${"B".repeat(43)}`)).resolves.toBe("UNAVAILABLE");
    expect((await invitations.list(inviter))[0]).not.toHaveProperty("tokenDigest");
  });

  it("accepts once into one canonical connected People relationship and rejects replay", async () => {
    const inviter = await account("accept-inviter");
    const recipient = await account("accept-recipient");
    const invitations = new PersistentInvitationService(client);
    const created = await invitations.create(inviter);

    await expect(invitations.accept(recipient, token(created.path))).resolves.toBe("CONNECTED");
    await expect(invitations.accept(recipient, token(created.path))).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE"
    });
    const [accountLowId, accountHighId] = pair(inviter.id, recipient.id);
    expect(
      await client.personRelationship.findUnique({
        where: { accountLowId_accountHighId: { accountLowId, accountHighId } }
      })
    ).toMatchObject({ status: RelationshipStatus.CONNECTED });
    expect(await new PersistentPeopleService(client).isConnected(inviter, recipient.id)).toBe(true);
  });

  it("handles self, decline, revoke, expiry, blocked, and cross invitations without bypassing People", async () => {
    const inviter = await account("state-inviter");
    const recipient = await account("state-recipient");
    const invitations = new PersistentInvitationService(client);
    const self = await invitations.create(inviter);
    await expect(invitations.accept(inviter, token(self.path))).rejects.toBeInstanceOf(
      InvitationError
    );

    const declined = await invitations.create(inviter);
    await invitations.decline(recipient, token(declined.path));
    await expect(invitations.accept(recipient, token(declined.path))).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE"
    });

    const revoked = await invitations.create(inviter);
    const revokeRecord = await client.invitation.findFirstOrThrow({
      where: { inviterAccountId: inviter.id },
      orderBy: { createdAt: "desc" }
    });
    await invitations.revoke(inviter, revokeRecord.publicId);
    await expect(invitations.accept(recipient, token(revoked.path))).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE"
    });

    const expiredToken = `fsiv1_${"A".repeat(43)}`;
    const expiredDigest = await digest(expiredToken);
    await client.invitation.create({
      data: {
        expiresAt: new Date(Date.now() - 1),
        inviterAccountId: inviter.id,
        tokenDigest: expiredDigest
      }
    });
    await expect(invitations.accept(recipient, expiredToken)).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE"
    });
    expect(
      await client.invitation.findFirst({ where: { tokenDigest: expiredDigest } })
    ).toMatchObject({ status: InvitationStatus.EXPIRED });

    await new PersistentPeopleService(client).block(inviter, recipient.id);
    const blocked = await invitations.create(inviter);
    await expect(invitations.accept(recipient, token(blocked.path))).rejects.toMatchObject({
      code: "INVITATION_BLOCKED"
    });
  });

  it("converges duplicate and cross invitations without duplicating a People relationship", async () => {
    const first = await account("cross-first");
    const second = await account("cross-second");
    const invitations = new PersistentInvitationService(client);
    const firstInvite = await invitations.create(first);
    const secondInvite = await invitations.create(second);
    const duplicateInvite = await invitations.create(first);

    await expect(invitations.accept(second, token(firstInvite.path))).resolves.toBe("CONNECTED");
    await expect(invitations.accept(first, token(secondInvite.path))).resolves.toBe(
      "ALREADY_CONNECTED"
    );
    await expect(invitations.accept(second, token(duplicateInvite.path))).resolves.toBe(
      "ALREADY_CONNECTED"
    );
    expect(
      await client.personRelationship.count({ where: { status: RelationshipStatus.CONNECTED } })
    ).toBe(1);
  });

  it("allows exactly one concurrent acceptance and scopes revocation to the inviter", async () => {
    const inviter = await account("concurrent-inviter");
    const first = await account("concurrent-first");
    const second = await account("concurrent-second");
    const other = await account("concurrent-other");
    const invitations = new PersistentInvitationService(client);
    const created = await invitations.create(inviter);
    const results = await Promise.allSettled([
      invitations.accept(first, token(created.path)),
      invitations.accept(second, token(created.path))
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await client.personRelationship.count({ where: { status: RelationshipStatus.CONNECTED } })
    ).toBe(1);

    const revocable = await invitations.create(inviter);
    const record = await client.invitation.findFirstOrThrow({
      where: { inviterAccountId: inviter.id, status: InvitationStatus.PENDING },
      orderBy: { createdAt: "desc" }
    });
    await expect(invitations.revoke(other, record.publicId)).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE"
    });
    await expect(invitations.revoke(inviter, record.publicId)).resolves.toBeUndefined();
    await expect(invitations.inspect(token(revocable.path))).resolves.toBe("UNAVAILABLE");
  });
});

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
