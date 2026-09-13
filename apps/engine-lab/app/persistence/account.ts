import {
  AuthProvider,
  databaseClient,
  DatabaseUnavailableError,
  type PrismaClient
} from "@flicksend/database";
import type { AuthPrincipal, AuthSession } from "../auth/types";

export class PersistenceUnavailableError extends Error {
  constructor() {
    super("PERSISTENCE_UNAVAILABLE");
  }
}

export class PersistenceAccessDeniedError extends Error {
  constructor() {
    super("PERSISTENCE_ACCESS_DENIED");
  }
}

export type PersistentAccount = {
  displayName: string | null;
  id: string;
};

function presentationName(value: string | null): string | null {
  if (!value) return null;
  // Keep the cache bounded and Unicode-safe without making it an account authority.
  return Array.from(value.trim()).slice(0, 120).join("") || null;
}

function safeAccount(account: { displayName: string | null; id: string }): PersistentAccount {
  return { displayName: account.displayName, id: account.id };
}

/**
 * Maps a provider-authenticated principal to one durable FlickSend account. The provider subject
 * is used only in this server-side unique mapping and is never included in the return value.
 */
export async function resolveOrProvisionAccount(
  principal: AuthPrincipal,
  client: PrismaClient = databaseClient()
): Promise<PersistentAccount> {
  const displayName = presentationName(principal.displayName);
  const where = {
    authProvider_providerSubject: {
      authProvider: AuthProvider.CLERK,
      providerSubject: principal.principalId
    }
  };

  try {
    const account = await client.account.upsert({
      where,
      create: {
        authProvider: AuthProvider.CLERK,
        providerSubject: principal.principalId,
        displayName
      },
      update: { displayName }
    });
    return safeAccount(account);
  } catch {
    // A concurrent first request can race a unique insert on some deployments. The database
    // constraint remains the authority; re-read the only permissible mapping before failing.
    try {
      const account = await client.account.findUnique({ where });
      if (account) return safeAccount(account);
    } catch {
      // Provider subjects and database details never leave this boundary.
    }
    throw new PersistenceUnavailableError();
  }
}

/** Resolves the current real provider session before any persistent operation is authorized. */
export async function requirePersistentAccount(session: AuthSession): Promise<PersistentAccount> {
  if (session.state !== "SIGNED_IN" || session.source !== "clerk" || !session.principal)
    throw new PersistenceAccessDeniedError();
  try {
    return await resolveOrProvisionAccount(session.principal);
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof PersistenceUnavailableError)
      throw new PersistenceUnavailableError();
    throw new PersistenceUnavailableError();
  }
}
