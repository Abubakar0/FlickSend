import { describe, expect, it } from "vitest";
import { PeopleController } from "./people-controller";
import type { PeopleRepository, PeopleRepositoryResult } from "./people-repository";
import { connectedPeople, mapPeopleProductError } from "./people-state";
import { developmentPeopleSnapshot, developmentPersonById, isSendEligible } from "./people-types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function result(personId: string, connectedId?: string): PeopleRepositoryResult {
  const snapshot = developmentPeopleSnapshot(personId);
  return {
    snapshot: connectedId
      ? {
          ...snapshot,
          relationships: snapshot.relationships.filter(
            (relationship) => relationship.person.id === connectedId
          )
        }
      : snapshot
  };
}

describe("P6 People controller", () => {
  it("ignores an older pairing result when a newer pairing operation completes first", async () => {
    const first = deferred<PeopleRepositoryResult>();
    const second = deferred<PeopleRepositoryResult>();
    let calls = 0;
    const repository: PeopleRepository = {
      load: async () => result("dev-sender", "alex-morgan"),
      createInvite: async () => result("dev-sender"),
      redeemInvite: async () => (calls++ === 0 ? first.promise : second.promise),
      accept: async () => result("dev-sender"),
      block: async () => result("dev-sender"),
      decline: async () => result("dev-sender"),
      remove: async () => result("dev-sender"),
      resetDevelopmentStore: async () => result("dev-sender"),
      unblock: async () => result("dev-sender")
    };
    const controller = new PeopleController(developmentPersonById("dev-sender"), repository);
    const inviteA = controller.redeemInvite("fp-a");
    const inviteB = controller.redeemInvite("fp-b");
    second.resolve(result("dev-sender", "alex-morgan"));
    await inviteB;
    first.resolve(result("dev-sender", "jordan-lee"));
    await inviteA;

    expect(
      controller.getSnapshot().relationships.map((relationship) => relationship.person.id)
    ).toEqual(["alex-morgan"]);
  });

  it("uses opaque IDs for Send eligibility rather than display names", () => {
    const snapshot = developmentPeopleSnapshot("dev-sender");
    const alex = snapshot.relationships[0]!;
    expect(
      connectedPeople({
        ...snapshot,
        error: null,
        inviteCode: null,
        isLoading: false,
        operation: null,
        operationRevision: 0
      })
    ).toHaveLength(1);
    expect(isSendEligible(alex)).toBe(true);
    expect(alex.person.id).toBe("alex-morgan");
    expect(alex.person.displayName).toBe("Alex Morgan");
  });

  it("maps pairing errors to stable, privacy-safe product errors", () => {
    expect(mapPeopleProductError("PEOPLE_INVITE_INVALID").code).toBe(
      "FS-PRODUCT-PEOPLE-INVITE-INVALID"
    );
    expect(mapPeopleProductError("PEOPLE_SELF").title).toBe("You can't connect with yourself");
    expect(mapPeopleProductError("PEOPLE_BLOCKED").code).toBe("FS-PRODUCT-PEOPLE-BLOCKED");
  });
});
