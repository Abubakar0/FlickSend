import type { PersonIdentity } from "../people/people-types";
import type { PersistentAccount } from "./account";

/** Product-safe projection of a persistent account; provider subjects never reach this DTO. */
export function persistentPerson(account: PersistentAccount): PersonIdentity {
  return {
    displayName: account.displayName ?? "FlickSend member",
    id: account.id,
    presence: "unknown"
  };
}
