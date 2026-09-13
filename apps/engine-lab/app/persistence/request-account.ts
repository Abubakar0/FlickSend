import { getOptionalAuthenticatedPrincipal } from "../auth/provider.server";
import { requirePersistentAccount, type PersistentAccount } from "./account";

/** Resolves account authority exclusively from the server-side Clerk session. */
export async function currentPersistentAccount(): Promise<PersistentAccount> {
  return requirePersistentAccount(await getOptionalAuthenticatedPrincipal());
}
