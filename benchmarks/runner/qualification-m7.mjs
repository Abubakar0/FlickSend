import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const compose = resolve(root, "services/turn/compose.yaml");
const environmentFile = resolve(root, "services/turn/.m7.env");
const workerEnvironmentFile = resolve(root, "apps/signaling/.dev.vars");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const docker = process.platform === "win32" ? "docker.exe" : "docker";

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    // Windows cannot launch a .cmd shim directly through child_process.spawn. Route pnpm through
    // cmd.exe while keeping Docker's native executable direct and preserving the caller environment.
    const useCommandProcessor =
      process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
    const child = spawn(
      useCommandProcessor ? (process.env.ComSpec ?? "cmd.exe") : command,
      useCommandProcessor ? ["/d", "/s", "/c", command, ...args] : args,
      { cwd: root, stdio: "inherit", ...options }
    );
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

function dockerAvailable() {
  const result = spawnSync(docker, ["version", "--format", "{{.Server.Version}}"], {
    cwd: root,
    encoding: "utf8"
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

async function waitForTcpPort(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise((resolvePromise) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolvePromise(true);
      });
      socket.once("error", () => resolvePromise(false));
      socket.setTimeout(1_000, () => {
        socket.destroy();
        resolvePromise(false);
      });
    });
    if (connected) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`coturn did not accept TCP connections on port ${port}.`);
}

async function retainEvidence() {
  const testResults = resolve(root, "test-results");
  if (!existsSync(testResults)) return;
  const date = new Date().toISOString().slice(0, 10);
  const destination = resolve(root, "benchmarks/results", date);
  const candidates = await readdir(testResults, { recursive: true });
  const evidence = candidates.filter(
    (candidate) =>
      typeof candidate === "string" &&
      (/^m7-.*\.json$/i.test(basename(candidate)) ||
        basename(candidate) === "m8-direct-to-turn-route-health.json")
  );
  if (!evidence.length) throw new Error("M7 Playwright passed without emitting raw evidence JSON.");
  await mkdir(destination, { recursive: true });
  for (const relative of evidence)
    await copyFile(resolve(testResults, relative), resolve(destination, basename(relative)));
  console.log(
    `Retained ${evidence.length} raw M7 and M8 route-health evidence files in ${destination}.`
  );
}

if (!dockerAvailable()) {
  console.error(
    "M7 qualification blocked: Docker Engine is unavailable. Install and start Docker Desktop, then rerun pnpm qualification:m7."
  );
  process.exitCode = 2;
} else if (existsSync(workerEnvironmentFile)) {
  console.error(
    "M7 qualification blocked: apps/signaling/.dev.vars already exists. Move it aside so the runner cannot overwrite credentials."
  );
  process.exitCode = 2;
} else {
  const secret = randomBytes(32).toString("base64url");
  let serviceStarted = false;
  try {
    // Workspace packages publish through dist exports. Build before the browser starts so the
    // qualification cannot accidentally exercise stale engine artifacts.
    const built = await run(pnpm, ["build"]);
    if (built !== 0) throw new Error("FlickSend build failed before M7 qualification.");
    await writeFile(
      environmentFile,
      `TURN_REALM=flicksend.local\nTURN_EXTERNAL_IP=127.0.0.1\nTURN_SHARED_SECRET=${secret}\n`,
      { mode: 0o600 }
    );
    await writeFile(
      workerEnvironmentFile,
      `TURN_DEV_MODE=true\nTURN_SHARED_SECRET=${secret}\nTURN_URLS=turn:127.0.0.1:3478?transport=udp,turn:127.0.0.1:3478?transport=tcp\nSTUN_URLS=stun:127.0.0.1:3478\nTURN_CREDENTIAL_TTL_SECONDS=1800\n`,
      { mode: 0o600 }
    );
    const started = await run(docker, [
      "compose",
      "--env-file",
      environmentFile,
      "-f",
      compose,
      "up",
      "-d"
    ]);
    if (started !== 0) throw new Error("coturn compose startup failed.");
    serviceStarted = true;
    await waitForTcpPort(3478);
    const testArguments = ["exec", "playwright", "test", "tests/e2e/m7-turn.spec.ts"];
    if (process.env.FLICKSEND_M7_TEST_GREP)
      testArguments.push("--grep", process.env.FLICKSEND_M7_TEST_GREP);
    const result = await run(pnpm, testArguments, {
      env: {
        ...process.env,
        FLICKSEND_M7_TURN_QUALIFICATION: "1",
        NEXT_PUBLIC_TURN_ENABLED: "true"
      }
    });
    if (result !== 0) process.exitCode = result;
    else await retainEvidence();
  } catch (error) {
    console.error(
      error instanceof Error
        ? `M7 qualification failed: ${error.message}`
        : "M7 qualification failed."
    );
    process.exitCode = 1;
  } finally {
    if (serviceStarted)
      await run(docker, [
        "compose",
        "--env-file",
        environmentFile,
        "-f",
        compose,
        "down",
        "--volumes",
        "--remove-orphans"
      ]);
    await rm(environmentFile, { force: true });
    await rm(workerEnvironmentFile, { force: true });
  }
}
