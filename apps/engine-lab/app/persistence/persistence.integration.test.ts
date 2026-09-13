import {
  DatabaseUnavailableError,
  RelationshipStatus,
  createDatabaseClient,
  type PrismaClient
} from "@flicksend/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthPrincipal } from "../auth/types";
import { resolveOrProvisionAccount, type PersistentAccount } from "./account";
import { PersistentPeopleService } from "./people";
import { PersistentTransfersError, PersistentTransfersService } from "./transfers";
import type { TransferLifecycleEvent } from "../transfers/transfer-types";

const qualificationUrl = "postgresql://postgres@127.0.0.1:54329/flicksend_p11?schema=public";
const enabled =
  process.env.FLICKSEND_P11_POSTGRES_TEST === "1" && process.env.DATABASE_URL === qualificationUrl;
const p11 = enabled ? describe : describe.skip;

let client: PrismaClient;

function principal(subject: string, displayName = "Test member"): AuthPrincipal {
  return {
    displayName,
    emailVerified: true,
    primaryEmail: `${subject}@example.test`,
    principalId: subject
  };
}

function lifecycleEvent(
  lifecycleKey: string,
  overrides: Partial<TransferLifecycleEvent> = {}
): TransferLifecycleEvent {
  return {
    active: {
      currentPayloadSpeedBps: 240_000,
      etaMs: 4_000,
      health: "GOOD",
      route: "Direct",
      transferredBytes: 256,
      verifiedBytes: 128
    },
    deliveryConfirmed: false,
    direction: "sent",
    failureCategory: null,
    fileCount: 1,
    folderCount: 0,
    lifecycleKey,
    peerPersonId: null,
    productStatus: "TRANSFERRING",
    sourceKind: "single_file",
    speedProof: null,
    totalBytes: 512,
    ...overrides
  };
}

function pair(left: string, right: string): readonly [string, string] {
  return left < right ? [left, right] : [right, left];
}

async function connect(left: PersistentAccount, right: PersistentAccount): Promise<void> {
  const [accountLowId, accountHighId] = pair(left.id, right.id);
  await client.personRelationship.create({
    data: { accountHighId, accountLowId, status: RelationshipStatus.CONNECTED }
  });
}

p11("P11 PostgreSQL persistence", () => {
  beforeEach(async () => {
    client ??= createDatabaseClient(qualificationUrl);
    // This reset is only reachable through the exact loopback qualification database guard above.
    await client.transferRecord.deleteMany();
    await client.personRelationship.deleteMany();
    await client.account.deleteMany();
  });

  afterAll(async () => {
    await client?.$disconnect();
  });

  it("provisions exactly one account per concurrent provider subject without email authority", async () => {
    const first = principal("provider-subject-a", "A name");
    const accounts = await Promise.all(
      Array.from({ length: 12 }, () => resolveOrProvisionAccount(first, client))
    );
    expect(new Set(accounts.map((account) => account.id))).toHaveLength(1);
    expect(await client.account.count()).toBe(1);

    const renamed = await resolveOrProvisionAccount(principal("provider-subject-a", "Renamed"), client);
    const changedEmail = await resolveOrProvisionAccount(
      { ...principal("provider-subject-a", "Renamed"), primaryEmail: "changed@example.test" },
      client
    );
    const second = await resolveOrProvisionAccount(principal("provider-subject-b", "B name"), client);

    expect(renamed.id).toBe(accounts[0]!.id);
    expect(changedEmail.id).toBe(accounts[0]!.id);
    expect(second.id).not.toBe(accounts[0]!.id);
    expect(await client.account.count()).toBe(2);
    expect(JSON.stringify(renamed)).not.toContain("provider-subject-a");
    expect(JSON.stringify(renamed)).not.toContain("changed@example.test");
  });

  it("persists canonical People relationships and scopes mutations to the current account", async () => {
    const accountA = await resolveOrProvisionAccount(principal("people-a", "A"), client);
    const accountB = await resolveOrProvisionAccount(principal("people-b", "B"), client);
    const accountC = await resolveOrProvisionAccount(principal("people-c", "C"), client);
    const [accountLowId, accountHighId] = pair(accountA.id, accountB.id);
    const writes = await Promise.allSettled([
      client.personRelationship.create({
        data: { accountHighId, accountLowId, status: RelationshipStatus.CONNECTED }
      }),
      client.personRelationship.create({
        data: { accountHighId, accountLowId, status: RelationshipStatus.CONNECTED }
      })
    ]);
    expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await client.personRelationship.count()).toBe(1);

    const peopleA = new PersistentPeopleService(client);
    const peopleC = new PersistentPeopleService(client);
    expect((await peopleA.connected(accountA)).map((relationship) => relationship.person.id)).toEqual([
      accountB.id
    ]);

    // C can only create/change C<->B. It cannot mutate the existing A<->B relationship.
    await peopleC.block(accountC, accountB.id);
    expect((await peopleA.connected(accountA)).map((relationship) => relationship.person.id)).toEqual([
      accountB.id
    ]);

    await peopleA.block(accountA, accountB.id);
    expect(await peopleA.connected(accountA)).toHaveLength(0);
    await peopleA.unblock(accountA, accountB.id);
    expect(await peopleA.connected(accountA)).toHaveLength(0);

    await expect(
      client.personRelationship.create({
        data: {
          accountHighId: accountA.id,
          accountLowId: accountA.id,
          status: RelationshipStatus.CONNECTED
        }
      })
    ).rejects.toBeDefined();
  });

  it("keeps history owner-scoped, metadata-only, terminal, and stable through recovery", async () => {
    const owner = await resolveOrProvisionAccount(principal("history-owner", "Owner"), client);
    const peer = await resolveOrProvisionAccount(principal("history-peer", "Peer"), client);
    const other = await resolveOrProvisionAccount(principal("history-other", "Other"), client);
    const transfers = new PersistentTransfersService(client);
    const key = "p7-89b3a619-2459-4e46-b19d-57e6553a8b8b";

    const active = await transfers.record(owner, lifecycleEvent(key, { peerPersonId: peer.id }));
    const recovery = await transfers.record(
      owner,
      lifecycleEvent(key, {
        active: { ...lifecycleEvent(key).active!, health: "RECONNECTING", route: "Relayed" },
        peerPersonId: peer.id,
        productStatus: "RECONNECTING"
      })
    );
    await expect(
      transfers.record(
        owner,
        lifecycleEvent(key, { active: null, peerPersonId: peer.id, productStatus: "COMPLETED" })
      )
    ).rejects.toBeInstanceOf(PersistentTransfersError);
    const completed = await transfers.record(
      owner,
      lifecycleEvent(key, {
        active: null,
        deliveryConfirmed: true,
        peerPersonId: peer.id,
        productStatus: "COMPLETED"
      })
    );
    const stale = await transfers.record(owner, lifecycleEvent(key, { peerPersonId: peer.id }));

    expect(recovery.recordId).toBe(active.recordId);
    expect(completed.recordId).toBe(active.recordId);
    expect(completed.productStatus).toBe("COMPLETED");
    expect(stale.productStatus).toBe("COMPLETED");
    expect(await transfers.get(other, active.recordId)).toBeNull();

    const failed = await transfers.record(
      owner,
      lifecycleEvent("p7-5ec24938-6678-48fc-ae15-2a89cbdde9fe", {
        active: null,
        failureCategory: "INTEGRITY",
        peerPersonId: peer.id,
        productStatus: "FAILED"
      })
    );
    const canceled = await transfers.record(
      owner,
      lifecycleEvent("p7-38f0f2b8-77cf-4722-8af2-366269f8f4fd", {
        active: null,
        peerPersonId: peer.id,
        productStatus: "CANCELED"
      })
    );
    const retry = await transfers.record(
      owner,
      lifecycleEvent("p7-80e12918-4cb1-4f07-b100-5301061d6d3e", { peerPersonId: peer.id })
    );
    expect(failed.productStatus).toBe("FAILED");
    expect(canceled.productStatus).toBe("CANCELED");
    expect(retry.recordId).not.toBe(failed.recordId);

    const raw = await client.transferRecord.findUniqueOrThrow({ where: { id: active.recordId } });
    const serialized = JSON.stringify(raw, (_, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value
    );
    expect(serialized).not.toContain("PRIVATE-HISTORY-NAME-MUST-NOT-PERSIST.mov");
    expect(serialized).not.toContain("C:\\Users\\private");
    expect(serialized).not.toContain("engine-transfer-private");
    expect(serialized).not.toContain("signaling-session-private");
    expect(serialized).not.toContain("provider-subject");
  });

  it("retains rows across a client restart and bounds owner list queries", async () => {
    const owner = await resolveOrProvisionAccount(principal("restart-owner", "Owner"), client);
    const peer = await resolveOrProvisionAccount(principal("restart-peer", "Peer"), client);
    await connect(owner, peer);
    const transfers = new PersistentTransfersService(client);
    const initial = await transfers.record(
      owner,
      lifecycleEvent("p7-3211c976-ceef-4479-9f4a-1caee1de8b70", { peerPersonId: peer.id })
    );

    await client.$disconnect();
    client = createDatabaseClient(qualificationUrl);
    const restartedPeople = new PersistentPeopleService(client);
    const restartedTransfers = new PersistentTransfersService(client);
    expect((await restartedPeople.connected(owner)).map((relationship) => relationship.person.id)).toEqual([
      peer.id
    ]);
    expect((await restartedTransfers.get(owner, initial.recordId))?.recordId).toBe(initial.recordId);

    for (let index = 0; index < 55; index += 1)
      await restartedTransfers.record(
        owner,
        lifecycleEvent(`p7-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, {
          peerPersonId: peer.id
        })
      );
    expect(await restartedTransfers.list(owner)).toHaveLength(50);
  });

  it("fails safely without a configured database client", () => {
    expect(() => createDatabaseClient("")).toThrow(DatabaseUnavailableError);
  });
});
