import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("DATABASE_UNAVAILABLE");
  }
}

type DatabaseGlobal = typeof globalThis & {
  __flicksendDatabaseClient?: PrismaClient;
  __flicksendDatabaseUrl?: string;
};

/** Creates a PostgreSQL-only Prisma 7 client with its required driver adapter. */
export function createDatabaseClient(databaseUrl: string): PrismaClient {
  if (!databaseUrl) throw new DatabaseUnavailableError();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/**
 * Shares the server-side client across Next development reloads. The URL is never logged or
 * serialized, and query logging remains disabled by Prisma's default configuration.
 */
export function databaseClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new DatabaseUnavailableError();
  const globalDatabase = globalThis as DatabaseGlobal;
  if (
    !globalDatabase.__flicksendDatabaseClient ||
    globalDatabase.__flicksendDatabaseUrl !== databaseUrl
  ) {
    globalDatabase.__flicksendDatabaseClient = createDatabaseClient(databaseUrl);
    globalDatabase.__flicksendDatabaseUrl = databaseUrl;
  }
  return globalDatabase.__flicksendDatabaseClient;
}
