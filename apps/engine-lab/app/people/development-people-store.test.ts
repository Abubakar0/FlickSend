import { describe, expect, it } from "vitest";
import { DevelopmentPeopleError, DevelopmentPeopleStore } from "./development-people-store";

function relationshipState(store: DevelopmentPeopleStore, personId: string, otherPersonId: string) {
  return store
    .snapshot(personId)
    .relationships.find((relationship) => relationship.person.id === otherPersonId)?.state;
}

describe("P6 development People store", () => {
  it("pairs two opaque identities and exposes one connected relationship to each person", () => {
    const store = new DevelopmentPeopleStore();
    const code = store.createPairingCode("dev-sender").inviteCode!;
    store.redeemPairingCode("jordan-lee", code);
    expect(relationshipState(store, "dev-sender", "jordan-lee")).toBe("INVITED_OUTGOING");
    expect(relationshipState(store, "jordan-lee", "dev-sender")).toBe("INVITED_INCOMING");

    store.accept("jordan-lee", "dev-sender");
    expect(relationshipState(store, "dev-sender", "jordan-lee")).toBe("CONNECTED");
    expect(relationshipState(store, "jordan-lee", "dev-sender")).toBe("CONNECTED");
  });

  it("keeps repeated code creation and acceptance idempotent", () => {
    const store = new DevelopmentPeopleStore();
    const first = store.createPairingCode("dev-sender").inviteCode;
    const second = store.createPairingCode("dev-sender").inviteCode;
    expect(second).toBe(first);
    store.redeemPairingCode("jordan-lee", first!);
    store.accept("jordan-lee", "dev-sender");
    store.accept("jordan-lee", "dev-sender");
    expect(
      store
        .snapshot("jordan-lee")
        .relationships.filter((relationship) => relationship.person.id === "dev-sender")
    ).toHaveLength(1);
  });

  it("converges simultaneous cross-invites into one connection", () => {
    const store = new DevelopmentPeopleStore();
    const senderCode = store.createPairingCode("dev-sender").inviteCode!;
    const jordanCode = store.createPairingCode("jordan-lee").inviteCode!;
    store.redeemPairingCode("dev-sender", jordanCode);
    expect(relationshipState(store, "dev-sender", "jordan-lee")).toBe("INVITED_INCOMING");

    store.redeemPairingCode("jordan-lee", senderCode);
    expect(relationshipState(store, "dev-sender", "jordan-lee")).toBe("CONNECTED");
    expect(relationshipState(store, "jordan-lee", "dev-sender")).toBe("CONNECTED");
  });

  it("rejects self pairing and invalid codes without exposing relationship metadata", () => {
    const store = new DevelopmentPeopleStore();
    const code = store.createPairingCode("dev-sender").inviteCode!;
    expect(() => store.redeemPairingCode("dev-sender", code)).toThrowError(
      new DevelopmentPeopleError("PEOPLE_SELF")
    );
    expect(() => store.redeemPairingCode("jordan-lee", "fp-invalid")).toThrowError(
      new DevelopmentPeopleError("PEOPLE_INVITE_INVALID")
    );
    expect(store.snapshot("jordan-lee").relationships).toHaveLength(0);
  });

  it("expires a development pairing code without creating a relationship", () => {
    let now = new Date("2026-09-12T00:00:00.000Z");
    const store = new DevelopmentPeopleStore(() => now);
    const code = store.createPairingCode("dev-sender").inviteCode!;
    now = new Date("2026-09-12T00:16:00.000Z");
    expect(() => store.redeemPairingCode("jordan-lee", code)).toThrowError(
      new DevelopmentPeopleError("PEOPLE_INVITE_INVALID")
    );
    expect(relationshipState(store, "jordan-lee", "dev-sender")).toBeUndefined();
  });

  it("keeps decline, remove, block, and unblock distinct", () => {
    const store = new DevelopmentPeopleStore();
    const inviteCode = store.createPairingCode("dev-sender").inviteCode!;
    store.redeemPairingCode("jordan-lee", inviteCode);
    store.decline("jordan-lee", "dev-sender");
    expect(relationshipState(store, "jordan-lee", "dev-sender")).toBeUndefined();

    const connectionCode = store.createPairingCode("dev-sender").inviteCode!;
    store.redeemPairingCode("jordan-lee", connectionCode);
    store.accept("jordan-lee", "dev-sender");
    store.remove("dev-sender", "jordan-lee");
    expect(relationshipState(store, "dev-sender", "jordan-lee")).toBeUndefined();

    store.block("dev-sender", "jordan-lee");
    expect(relationshipState(store, "dev-sender", "jordan-lee")).toBe("BLOCKED");
    expect(() => store.createPairingCode("jordan-lee")).not.toThrow();
    const blockedCode = store.createPairingCode("jordan-lee").inviteCode!;
    expect(() => store.redeemPairingCode("dev-sender", blockedCode)).toThrowError(
      new DevelopmentPeopleError("PEOPLE_BLOCKED")
    );
    store.unblock("dev-sender", "jordan-lee");
    expect(relationshipState(store, "dev-sender", "jordan-lee")).toBeUndefined();
  });

  it("rejects stale client mutations before they can overwrite a later request", () => {
    const store = new DevelopmentPeopleStore();
    expect(store.acceptsClientRevision("client-a", 2)).toBe(true);
    expect(store.acceptsClientRevision("client-a", 1)).toBe(false);
    expect(store.acceptsClientRevision("client-a", 3)).toBe(true);
  });
});
