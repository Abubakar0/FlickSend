import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const composeFile = resolve(root, "services/postgres/compose.yaml");
const databaseUrl = "postgresql://postgres@127.0.0.1:54329/flicksend_p11?schema=public";
const pnpmEntrypoint = process.env.npm_execpath;

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The fixed loopback-only URL and explicit test switch prevent this runner from resetting any
// externally supplied or production database.
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== databaseUrl) {
  throw new Error("P11 qualification refuses a non-local test DATABASE_URL.");
}
if (!pnpmEntrypoint) throw new Error("P11 qualification requires a pnpm execution environment.");

run("docker", ["compose", "-f", composeFile, "down", "--volumes", "--remove-orphans"]);
run("docker", ["compose", "-f", composeFile, "up", "-d"]);
run(process.execPath, [pnpmEntrypoint, "--filter", "@flicksend/database", "run", "migrate:deploy"], {
  DATABASE_URL: databaseUrl
});
run(
  process.execPath,
  [
    pnpmEntrypoint,
    "--filter",
    "@flicksend/engine-lab",
    "exec",
    "vitest",
    "run",
    "app/persistence/persistence.integration.test.ts"
  ],
  { DATABASE_URL: databaseUrl, FLICKSEND_P11_POSTGRES_TEST: "1" }
);
