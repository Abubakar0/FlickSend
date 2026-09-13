import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { arch, release, type } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const evidenceDirectory = resolve(root, "test-results/m9-evidence");
const requestedTarget = process.env.FLICKSEND_M9_ONLY_TARGET;
const requestedPlatform = process.env.FLICKSEND_M9_PLATFORM;

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
  },
  {
    target: "m9-firefox-windows",
    browser: "firefox",
    paths: [
      "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
      "C:\\Users\\MUHAMMAD\\AppData\\Local\\Mozilla Firefox\\firefox.exe"
    ]
  }
];

const macosTargets = [
  {
    target: "m9-chrome-macos",
    browser: "chrome",
    paths: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
  },
  {
    target: "m9-firefox-macos",
    browser: "firefox",
    paths: ["/Applications/Firefox.app/Contents/MacOS/firefox"]
  }
];

const matrixTargets = [
  { target: "m9-chrome-windows", browser: "CHROME", platform: "Windows desktop" },
  { target: "m9-edge-windows", browser: "EDGE", platform: "Windows desktop" },
  { target: "m9-firefox-windows", browser: "FIREFOX", platform: "Windows desktop" },
  { target: "m9-chrome-macos", browser: "CHROME", platform: "macOS desktop" },
  { target: "m9-firefox-macos", browser: "FIREFOX", platform: "macOS desktop" },
  { target: "m9-safari-macos", browser: "SAFARI", platform: "macOS desktop" },
  { target: "m9-chrome-android", browser: "CHROME", platform: "Android device" },
  { target: "m9-safari-ios", browser: "SAFARI", platform: "iOS/iPadOS device" }
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
      // This host does not have this actual stable browser installed.
    }
  }
  return null;
}

async function commandOutput(command, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.once("error", () => resolvePromise(null));
    child.once("exit", (code) => resolvePromise(code === 0 ? output.trim() : null));
  });
}

async function browserVersion(executablePath) {
  if (process.platform !== "win32") return commandOutput(executablePath, ["--version"]);
  // Chromium's Windows --version path can activate an existing GUI session instead of writing
  // stdout. File metadata is non-interactive and identifies the exact installed executable.
  const escapedPath = executablePath.replaceAll("'", "''");
  return commandOutput("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `(Get-Item -LiteralPath '${escapedPath}').VersionInfo.ProductVersion`
  ]);
}

async function hasCurrentRetainedEvidence(target, executablePath, evidence, destination) {
  if (
    evidence?.environment?.realBrowser !== true ||
    evidence.environment.emulated !== false ||
    evidence.environment.hostOperatingSystem !== type() ||
    evidence.environment.hostOperatingSystemVersion !== release() ||
    evidence.environment.hostArchitecture !== arch() ||
    typeof evidence.browser?.version !== "string"
  )
    return false;
  const versionOutput = await browserVersion(executablePath);
  if (!versionOutput?.includes(evidence.browser.version)) return false;
  try {
    await Promise.all(
      evidenceFilenames(target).map((filename) => access(resolve(destination, filename)))
    );
    return true;
  } catch {
    return false;
  }
}

function evidenceFilenames(target) {
  if (target.browser === "firefox")
    return [`${target.target}.json`, "m9-firefox-turn.json", "m9-firefox-route-recovery.json"];
  return [`${target.target}.json`];
}

async function removeStaleEvidence(target) {
  await Promise.all(
    evidenceFilenames(target).map((filename) =>
      rm(resolve(evidenceDirectory, filename), { force: true })
    )
  );
}

async function readEvidence(target) {
  const path = resolve(evidenceDirectory, `${target}.json`);
  return JSON.parse(await readFile(path, "utf8"));
}

async function readArtifact(filename) {
  return JSON.parse(await readFile(resolve(evidenceDirectory, filename), "utf8"));
}

async function readRetainedEvidence(destination) {
  const evidenceByTarget = new Map();
  for (const target of matrixTargets) {
    try {
      const evidence = JSON.parse(
        await readFile(resolve(destination, `${target.target}.json`), "utf8")
      );
      if (
        evidence?.schemaVersion === 1 &&
        evidence?.milestone === "M9" &&
        evidence?.target === target.target &&
        evidence?.environment?.realBrowser === true &&
        evidence?.environment?.emulated === false
      )
        evidenceByTarget.set(target.target, evidence);
    } catch {
      // Only real, schema-valid artifacts are carried into a retry matrix.
    }
  }
  return evidenceByTarget;
}

async function readRetainedMatrix(destination) {
  try {
    const matrix = JSON.parse(
      await readFile(resolve(destination, "m9-browser-matrix.json"), "utf8")
    );
    return new Map(
      Array.isArray(matrix?.records)
        ? matrix.records
            .filter((record) => typeof record?.target === "string")
            .map((record) => [record.target, record])
        : []
    );
  } catch {
    return new Map();
  }
}

async function readLifecycleArtifact(destination, target) {
  const filename = `${target.target}-lifecycle.json`;
  try {
    const artifact = JSON.parse(await readFile(resolve(destination, filename), "utf8"));
    if (
      artifact?.schemaVersion !== 1 ||
      artifact?.milestone !== "M9" ||
      artifact?.kind !== "browser-lifecycle-qualification" ||
      artifact?.target !== `${target.target}-lifecycle` ||
      artifact?.environment?.realBrowser !== true ||
      artifact?.environment?.emulated !== false
    )
      return null;
    return artifact;
  } catch {
    return null;
  }
}

function retainedSupplementaryQualification(record) {
  const result = {};
  for (const key of [
    "turnRelay",
    "routeRecovery",
    "realFilesystem",
    "assistedFilesystem",
    "backgroundLifecycle",
    "pageRefresh",
    "browserRestart",
    "permissionAfterPicker",
    "ordinaryReconnect",
    "permissionRevocation",
    "screenLockSleep"
  ])
    if (record?.qualificationResults?.[key] !== undefined)
      result[key] = record.qualificationResults[key];
  return result;
}

function currentLimitations(limitations) {
  return limitations.filter(
    (limitation) =>
      limitation !==
      "Page refresh, browser restart, backgrounding, sleep, screen lock, and permission revocation were not exercised."
  );
}

async function qualifyBrowser(target, executablePath) {
  await removeStaleEvidence(target);
  const environment = {
    ...process.env,
    FLICKSEND_M9_TARGET: target.target,
    FLICKSEND_M9_BROWSER: target.browser,
    FLICKSEND_M9_BROWSER_PATH: executablePath,
    FLICKSEND_M9_EVIDENCE_DIR: evidenceDirectory,
    FLICKSEND_M9_HOST_OS: type(),
    FLICKSEND_M9_HOST_OS_VERSION: release(),
    FLICKSEND_M9_HOST_ARCHITECTURE: arch()
  };
  const result =
    target.browser === "firefox"
      ? await run(process.execPath, ["benchmarks/runner/qualification-m9-firefox.mjs"], {
          ...environment,
          FLICKSEND_M9_FIREFOX_BUILT: "1"
        })
      : await run(
          pnpm,
          [
            "exec",
            "playwright",
            "test",
            "tests/e2e/m9-compatibility.spec.ts",
            "--config",
            "playwright.m9.config.ts"
          ],
          environment
        );
  if (result !== 0) throw new Error(`${target.target} qualification failed.`);
  return {
    core: await readEvidence(target.target),
    evidence: evidenceFilenames(target)
  };
}

async function qualifyLifecycle(target, executablePath) {
  const filename = `${target.target}-lifecycle.json`;
  await rm(resolve(evidenceDirectory, filename), { force: true });
  const result = await run(
    pnpm,
    [
      "exec",
      "playwright",
      "test",
      "tests/e2e/m9-lifecycle.spec.ts",
      "--config",
      "playwright.m9.lifecycle.config.ts"
    ],
    {
      ...process.env,
      FLICKSEND_M9_TARGET: target.target,
      FLICKSEND_M9_BROWSER_PATH: executablePath,
      FLICKSEND_M9_EVIDENCE_DIR: evidenceDirectory,
      FLICKSEND_M9_HOST_OS: type(),
      FLICKSEND_M9_HOST_OS_VERSION: release(),
      FLICKSEND_M9_HOST_ARCHITECTURE: arch()
    }
  );
  if (result !== 0) throw new Error(`${target.target} lifecycle qualification failed.`);
  const artifact = await readArtifact(filename);
  if (artifact?.environment?.realBrowser !== true || artifact?.environment?.emulated === true)
    throw new Error(`${target.target} lifecycle evidence is not real-browser evidence.`);
  return { filename, artifact };
}

function skippedRecord(target, reason) {
  return {
    target: target.target,
    browser: target.browser,
    platform: target.platform,
    supportTier: "NOT_TESTED",
    qualificationStatus: "SKIPPED",
    reason,
    evidence: []
  };
}

try {
  if ((await run(pnpm, ["build"])) !== 0)
    throw new Error("FlickSend build failed before M9 qualification.");

  const date = new Date().toISOString().slice(0, 10);
  const destination = resolve(root, "benchmarks/results", date);
  await mkdir(destination, { recursive: true });
  const evidenceByTarget = await readRetainedEvidence(destination);
  const retainedMatrix = await readRetainedMatrix(destination);
  const skippedReasons = new Map();
  const hostTargets =
    process.platform === "win32"
      ? windowsTargets
      : process.platform === "darwin"
        ? macosTargets
        : [];
  const hostPlatform =
    process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "other";
  const platformTargets =
    requestedPlatform && requestedPlatform !== hostPlatform ? [] : hostTargets;
  const selectedTargets = requestedTarget
    ? platformTargets.filter((target) => target.target === requestedTarget)
    : platformTargets;
  if (requestedTarget && !selectedTargets.length)
    throw new Error(`M9 target ${requestedTarget} is unavailable on this host.`);
  if (selectedTargets.length) {
    for (const target of selectedTargets) {
      const executable = await firstExisting(target.paths);
      if (!executable) {
        console.log(`SKIPPED — ${target.target}: actual browser executable unavailable.`);
        skippedReasons.set(
          target.target,
          "Actual stable browser executable unavailable on this host."
        );
        continue;
      }
      const retainedEvidence = evidenceByTarget.get(target.target);
      const canRetain = await hasCurrentRetainedEvidence(
        target,
        executable,
        retainedEvidence,
        destination
      );
      const qualified = canRetain
        ? {
            core: retainedEvidence,
            evidence: evidenceFilenames(target)
          }
        : await qualifyBrowser(target, executable);
      console.log(
        `${canRetain ? "RETAINING" : "QUALIFYING"} — ${target.target}: ${basename(executable)}.`
      );
      if (target.browser !== "firefox") {
        const lifecycleFilename = `${target.target}-lifecycle.json`;
        const retainedLifecycle = retainedMatrix
          .get(target.target)
          ?.evidence?.includes(lifecycleFilename);
        if (canRetain && retainedLifecycle) {
          qualified.evidence.push(lifecycleFilename);
        } else {
          const lifecycle = await qualifyLifecycle(target, executable);
          qualified.evidence.push(lifecycle.filename);
          qualified.core.qualificationResults = {
            ...qualified.core.qualificationResults,
            ...lifecycle.artifact.qualificationResults
          };
          qualified.core.limitations = [
            ...new Set([
              ...currentLimitations(qualified.core.limitations ?? []),
              ...(lifecycle.artifact.limitations ?? [])
            ])
          ];
        }
      }
      const retainedEvidenceFiles = canRetain ? new Set(evidenceFilenames(target)) : new Set();
      if (
        canRetain &&
        target.browser !== "firefox" &&
        retainedMatrix.get(target.target)?.evidence?.includes(`${target.target}-lifecycle.json`)
      )
        retainedEvidenceFiles.add(`${target.target}-lifecycle.json`);
      for (const filename of qualified.evidence) {
        if (!retainedEvidenceFiles.has(filename))
          await copyFile(resolve(evidenceDirectory, filename), resolve(destination, filename));
      }
      evidenceByTarget.set(target.target, qualified.core);
      retainedMatrix.set(target.target, {
        ...(retainedMatrix.get(target.target) ?? {}),
        evidence: [
          ...new Set([
            ...(retainedMatrix.get(target.target)?.evidence ?? []),
            ...qualified.evidence
          ])
        ]
      });
    }
  } else {
    console.log(
      requestedPlatform
        ? `SKIPPED — ${requestedPlatform} browser targets: no matching real ${requestedPlatform} host is available.`
        : "SKIPPED — desktop browser targets: current host is not Windows or macOS."
    );
  }

  const records = [];
  for (const target of matrixTargets) {
    const evidence = evidenceByTarget.get(target.target);
    if (evidence) {
      const filename = `${target.target}.json`;
      const retained = retainedMatrix.get(target.target);
      const lifecycle = await readLifecycleArtifact(destination, target);
      records.push({
        target: target.target,
        platform: target.platform,
        browser: evidence.browser,
        supportTier: evidence.supportTier,
        qualificationStatus: "PASS",
        evidence: [...new Set([filename, ...(retained?.evidence ?? [])])],
        capabilities: evidence.capabilities,
        qualificationResults: {
          ...evidence.qualificationResults,
          ...retainedSupplementaryQualification(retained),
          ...(lifecycle?.qualificationResults ?? {})
        },
        limitations: [
          ...new Set(
            currentLimitations([
              ...(evidence.limitations ?? []),
              ...(retained?.limitations ?? []),
              ...(lifecycle?.limitations ?? [])
            ])
          )
        ],
        environment: evidence.environment
      });
      continue;
    }
    records.push(
      skippedRecord(
        target,
        skippedReasons.get(target.target) ??
          (target.platform.includes("Windows")
            ? "Actual stable browser executable unavailable on this host."
            : "No matching real host or device environment is available to this qualification run.")
      )
    );
  }
  const matrix = {
    schemaVersion: 1,
    milestone: "M9",
    generatedAt: new Date().toISOString(),
    host: { operatingSystem: type(), operatingSystemVersion: release(), architecture: arch() },
    evidencePolicy: {
      realBrowserOnly: true,
      webKitIsSafari: false,
      mobileEmulationIsRealDevice: false,
      unavailableEnvironment: "SKIPPED"
    },
    records
  };
  await writeFile(
    resolve(destination, "m9-browser-matrix.json"),
    JSON.stringify(matrix, null, 2) + "\n"
  );
  console.log(
    `Retained ${evidenceByTarget.size} real browser artifact(s) and the M9 matrix in ${destination}.`
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? `M9 qualification failed: ${error.message}`
      : "M9 qualification failed."
  );
  process.exitCode = 1;
}
