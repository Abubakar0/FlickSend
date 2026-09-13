import { access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { arch, release, type } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const requestedTarget = process.env.FLICKSEND_M9_TURN_TARGET;
const date = new Date().toISOString().slice(0, 10);
const destination = resolve(root, "benchmarks/results", date);

const windowsTargets = [
  {
    target: "m9-chrome-windows",
    browser: "chrome",
    paths: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Users\\MUHAMMAD\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"
    ]
  },
  {
    target: "m9-edge-windows",
    browser: "edge",
    paths: [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    ]
  }
];

function run(command, args, env = process.env) {
  return new Promise((resolvePromise, reject) => {
    const commandProcessor = process.platform === "win32" && command.endsWith(".cmd");
    const child = spawn(
      commandProcessor ? (process.env.ComSpec ?? "cmd.exe") : command,
      commandProcessor ? ["/d", "/s", "/c", command, ...args] : args,
      { cwd: root, env, stdio: "inherit" }
    );
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

async function firstExisting(paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // The browser is not installed in this normal location.
    }
  }
  return null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function continuity(raw) {
  const value = raw?.senderRecovery?.continuity;
  requireCondition(
    value && typeof value === "object",
    "M7 route evidence has no sender continuity."
  );
  requireCondition(value.duplicateRetransmittedBytes === 0, "Committed payload was duplicated.");
  requireCondition(value.committedBlocksRetransmitted === 0, "Committed blocks were resent.");
  return value;
}

function relayRoute(raw) {
  const sender = raw?.senderRoute;
  const receiver = raw?.receiverRoute;
  requireCondition(sender?.routeType === "RELAY", "Sender did not select a relay route.");
  requireCondition(receiver?.routeType === "RELAY", "Receiver did not select a relay route.");
  requireCondition(
    sender?.localCandidateType === "relay",
    "Sender did not select a relay candidate."
  );
  requireCondition(
    receiver?.remoteCandidateType === "relay",
    "Receiver did not select a relay candidate."
  );
  return {
    routeType: "RELAY",
    routeDetail: sender.routeDetail,
    protocol: sender.protocol,
    relayProtocol: sender.relayProtocol
  };
}

async function runScenario(target, executablePath, grep, artifactName) {
  const result = await run(pnpm, ["qualification:m7"], {
    ...process.env,
    FLICKSEND_M7_TEST_GREP: grep,
    FLICKSEND_QUALIFICATION_BROWSER: "chromium",
    FLICKSEND_QUALIFICATION_BROWSER_LABEL: target.target,
    FLICKSEND_QUALIFICATION_BROWSER_PATH: executablePath
  });
  if (result !== 0) throw new Error(`${target.target} ${artifactName} qualification failed.`);
  return readJson(resolve(destination, artifactName));
}

async function updateMatrix(target, filenames, qualification) {
  const matrixPath = resolve(destination, "m9-browser-matrix.json");
  const matrix = await readJson(matrixPath);
  const record = matrix.records?.find((candidate) => candidate.target === target.target);
  requireCondition(record, `M9 matrix has no ${target.target} record.`);
  requireCondition(
    record.qualificationStatus === "PASS",
    `${target.target} core evidence is required first.`
  );
  record.evidence = [...new Set([...(record.evidence ?? []), ...filenames])];
  record.qualificationResults = { ...record.qualificationResults, ...qualification };
  await writeFile(matrixPath, JSON.stringify(matrix, null, 2) + "\n");
}

async function qualify(target, executablePath) {
  const core = await readJson(resolve(destination, `${target.target}.json`));
  requireCondition(
    core?.environment?.realBrowser === true,
    `${target.target} core evidence is required.`
  );
  requireCondition(core?.environment?.emulated === false, `${target.target} must not be emulated.`);

  const forced = await runScenario(
    target,
    executablePath,
    "forced relay delivers an M5 file with a verified route",
    "m7-forced-turn-single-file.json"
  );
  requireCondition(forced.delivered === true, "Forced TURN did not deliver.");
  requireCondition(forced.manifestRootVerified === true, "Forced TURN root was not verified.");
  const forcedRoute = relayRoute(forced);
  const turnArtifact = {
    schemaVersion: 1,
    milestone: "M9",
    kind: "browser-turn-qualification",
    generatedAt: new Date().toISOString(),
    target: target.target.replace("-windows", "-turn"),
    environment: {
      realBrowser: true,
      automated: true,
      emulated: false,
      hostOperatingSystem: type(),
      hostOperatingSystemVersion: release(),
      hostArchitecture: arch()
    },
    browser: core.browser,
    qualificationResults: {
      forcedTurn: {
        ...forcedRoute,
        dataChannelOpen: true,
        delivered: true,
        manifestRootVerified: true
      },
      transferHealth: {
        ...forced.senderHealth?.measurementAvailability,
        route: "OBSERVED"
      }
    },
    limitations: [
      "This local coturn qualification proves the selected browser's relay path only; production TURN deployment remains deferred."
    ]
  };
  const turnFilename = `${turnArtifact.target}.json`;
  await writeFile(resolve(destination, turnFilename), JSON.stringify(turnArtifact, null, 2) + "\n");

  const recovery = await runScenario(
    target,
    executablePath,
    "direct to relay replacement preserves M5 transfer identity",
    "m7-direct-to-turn-resume.json"
  );
  requireCondition(recovery.routeBefore === "DIRECT", "Route recovery did not begin on direct.");
  requireCondition(recovery.routeAfter === "RELAY", "Route recovery did not finish on relay.");
  requireCondition(recovery.transferIdStable === true, "Route recovery changed transfer identity.");
  requireCondition(recovery.delivered === true, "Route recovery did not deliver.");
  requireCondition(recovery.manifestRootVerified === true, "Route recovery root was not verified.");
  const recoveryContinuity = continuity(recovery);
  const recoveryArtifact = {
    schemaVersion: 1,
    milestone: "M9",
    kind: "browser-route-recovery-qualification",
    generatedAt: new Date().toISOString(),
    target: target.target.replace("-windows", "-route-recovery"),
    environment: turnArtifact.environment,
    browser: core.browser,
    qualificationResults: {
      routeBefore: "DIRECT",
      routeAfter: "RELAY",
      transferIdStable: true,
      safeBytesBeforeDisconnect: recoveryContinuity.safeBytesBeforeDisconnect,
      remainingBytesAtResume: recoveryContinuity.remainingBytesAtResume,
      resumedPayloadBytes: recoveryContinuity.resumedPayloadBytes,
      duplicateRetransmittedBytes: 0,
      committedBlocksRetransmitted: 0,
      ambiguousInflightBytesRetransmitted: recoveryContinuity.ambiguousInflightBytesRetransmitted,
      manifestRootVerified: true,
      delivered: true,
      transferHealth: {
        ...recovery.senderHealth?.measurementAvailability,
        route: "OBSERVED"
      }
    },
    limitations: turnArtifact.limitations
  };
  const recoveryFilename = `${recoveryArtifact.target}.json`;
  await writeFile(
    resolve(destination, recoveryFilename),
    JSON.stringify(recoveryArtifact, null, 2) + "\n"
  );
  await updateMatrix(target, [turnFilename, recoveryFilename], {
    turnRelay: "PASS",
    routeRecovery: "PASS"
  });
}

try {
  if (process.platform !== "win32")
    throw new Error("M9 TURN wrapper currently requires a Windows primary-desktop target.");
  const targets = requestedTarget
    ? windowsTargets.filter((target) => target.target === requestedTarget)
    : windowsTargets;
  if (!targets.length) throw new Error(`Unknown M9 TURN target: ${requestedTarget ?? "none"}.`);
  for (const target of targets) {
    const executablePath = await firstExisting(target.paths);
    if (!executablePath) throw new Error(`${target.target} stable executable is unavailable.`);
    console.log(`QUALIFYING — ${target.target}: forced TURN and direct-to-TURN recovery.`);
    await qualify(target, executablePath);
  }
  console.log(`Retained M9 TURN evidence in ${destination}.`);
} catch (error) {
  console.error(
    error instanceof Error
      ? `M9 TURN qualification failed: ${error.message}`
      : "M9 TURN qualification failed."
  );
  process.exitCode = 1;
}
