import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = resolve(root, "infra/turn/compose.production.yaml");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export function externalP14Status(environment = process.env) {
  if (environment.FLICKSEND_P14_EXTERNAL !== "1")
    return {
      blockedReason: "PUBLIC_TURN_INFRASTRUCTURE_QUALIFICATION_NOT_EXECUTED",
      externalStatus: "BLOCKED"
    };
  return {
    blockedReason: "PUBLIC_TURN_INFRASTRUCTURE_QUALIFICATION_REQUIRES_REVIEWED_PROVIDER_EVIDENCE",
    externalStatus: "BLOCKED"
  };
}

export function runP14Qualification() {
  const localTurnEnvironment = {
    TURN_EXTERNAL_IP: "127.0.0.1",
    TURN_REALM: "flicksend.local",
    TURN_SHARED_SECRET: randomBytes(48).toString("base64url")
  };
  const commands = [
    [pnpmCommand, ["exec", "vitest", "run", "tests/p14/coturn-artifacts.test.ts"]],
    [
      pnpmCommand,
      [
        "--filter",
        "@flicksend/engine-lab",
        "test",
        "--",
        "turn-credentials.server.test.ts",
        "turn-credentials/route.test.ts",
        "turn-client.test.ts"
      ]
    ],
    ["docker", ["compose", "-f", composeFile, "config", "--quiet"], localTurnEnvironment]
  ];
  const failed = commands.find(([command, args, environment]) => !run(command, args, environment));
  const external = externalP14Status();
  const result = {
    ...external,
    phase: "P14",
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
  runP14Qualification();
