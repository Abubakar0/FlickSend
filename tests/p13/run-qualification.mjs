import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export function externalP13Status(environment = process.env) {
  if (environment.FLICKSEND_P13_EXTERNAL !== "1")
    return {
      blockedReason: "PERSISTENT_CLOUDFLARE_STAGING_QUALIFICATION_NOT_EXECUTED",
      externalStatus: "BLOCKED"
    };
  return {
    blockedReason:
      "PERSISTENT_CLOUDFLARE_STAGING_QUALIFICATION_REQUIRES_REVIEWED_PROVIDER_EVIDENCE",
    externalStatus: "BLOCKED"
  };
}

export function runP13Qualification() {
  const commands = [
    [pnpmCommand, ["--filter", "@flicksend/config", "test", "--", "environment-contract.test.ts"]],
    [pnpmCommand, ["--filter", "@flicksend/signaling", "test"]],
    [pnpmCommand, ["--filter", "@flicksend/signaling", "typecheck"]],
    [
      pnpmCommand,
      [
        "--filter",
        "@flicksend/signaling",
        "exec",
        "wrangler",
        "deploy",
        "--dry-run",
        "--env",
        "staging",
        "--outdir",
        "dist-staging"
      ]
    ]
  ];
  const failed = commands.find(([command, args]) => !run(command, args));
  const external = externalP13Status();
  const result = {
    ...external,
    phase: "P13",
    repositoryStatus: failed ? "FAIL" : "PASS"
  };
  console.log(JSON.stringify(result));
  if (failed) process.exitCode = 1;
  return result;
}

function run(command, args, environment = {}) {
  const nodePath = `${dirname(process.execPath)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`;
  const result =
    process.platform === "win32" && command.endsWith(".cmd")
      ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command, ...args], {
          cwd: root,
          env: { ...process.env, PATH: nodePath, ...environment },
          stdio: "inherit"
        })
      : spawnSync(command, args, {
          cwd: root,
          env: { ...process.env, PATH: nodePath, ...environment },
          stdio: "inherit"
        });
  return !result.error && result.status === 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runP13Qualification();
