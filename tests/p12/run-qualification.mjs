import { spawnSync } from "node:child_process";
import { delimiter, dirname, resolve } from "node:path";

const root = process.cwd();
const composeFile = resolve(root, "services/postgres/compose.yaml");
const databaseUrl = "postgresql://postgres@127.0.0.1:54329/flicksend_p11?schema=public";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const nodeRuntimeEnvironment = {
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`
};

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...nodeRuntimeEnvironment, ...environment },
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runPnpm(args, environment) {
  if (process.platform !== "win32") return run(pnpmCommand, args, environment);
  return run(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", `${pnpmCommand} ${args.join(" ")}`],
    environment
  );
}

// The fixed loopback URL and explicit switches make this local fixture safe to reset without
// touching an externally supplied or production database.
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== databaseUrl)
  throw new Error("P12 qualification refuses a non-local test DATABASE_URL.");

runPnpm(["exec", "vitest", "run", "tests/p12/qualification.test.ts"]);
run("docker", ["compose", "-f", composeFile, "down", "--volumes", "--remove-orphans"]);
run("docker", ["compose", "-f", composeFile, "up", "-d", "--wait"]);
runPnpm(["--filter", "@flicksend/database", "run", "migrate:deploy"], {
  DATABASE_URL: databaseUrl
});
runPnpm(
  [
    "--filter",
    "@flicksend/engine-lab",
    "exec",
    "vitest",
    "run",
    "--no-file-parallelism",
    "--maxWorkers=1",
    "app/persistence/persistence.integration.test.ts",
    "app/persistence/invitations.integration.test.ts"
  ],
  {
    DATABASE_URL: databaseUrl,
    FLICKSEND_P11_POSTGRES_TEST: "1",
    FLICKSEND_P12_POSTGRES_TEST: "1"
  }
);
run(process.execPath, [resolve(root, "tests/p12/qualification-signaling.mjs")]);
