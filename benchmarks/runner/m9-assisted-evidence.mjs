import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inputIndex = process.argv.indexOf("--input");
const input = inputIndex === -1 ? undefined : process.argv[inputIndex + 1];

const expectedBrowsers = new Map([
  ["m9-safari-macos", { browser: "SAFARI", operatingSystem: "MACOS", platform: "macOS desktop" }],
  ["m9-chrome-macos", { browser: "CHROME", operatingSystem: "MACOS", platform: "macOS desktop" }],
  ["m9-firefox-macos", { browser: "FIREFOX", operatingSystem: "MACOS", platform: "macOS desktop" }],
  [
    "m9-firefox-windows",
    { browser: "FIREFOX", operatingSystem: "WINDOWS", platform: "Windows desktop" }
  ],
  [
    "m9-chrome-android",
    { browser: "CHROME", operatingSystem: "ANDROID", platform: "Android device" }
  ],
  ["m9-safari-ios", { browser: "SAFARI", operatingSystem: "IOS", platform: "iOS/iPadOS device" }],
  [
    "m9-chrome-windows-filesystem",
    {
      browser: "CHROME",
      operatingSystem: "WINDOWS",
      platform: "Windows desktop",
      matrixTarget: "m9-chrome-windows"
    }
  ],
  [
    "m9-edge-windows-filesystem",
    {
      browser: "EDGE",
      operatingSystem: "WINDOWS",
      platform: "Windows desktop",
      matrixTarget: "m9-edge-windows"
    }
  ],
  [
    "m9-firefox-windows-filesystem",
    {
      browser: "FIREFOX",
      operatingSystem: "WINDOWS",
      platform: "Windows desktop",
      matrixTarget: "m9-firefox-windows"
    }
  ],
  [
    "m9-chrome-macos-filesystem",
    {
      browser: "CHROME",
      operatingSystem: "MACOS",
      platform: "macOS desktop",
      matrixTarget: "m9-chrome-macos"
    }
  ],
  [
    "m9-safari-macos-filesystem",
    {
      browser: "SAFARI",
      operatingSystem: "MACOS",
      platform: "macOS desktop",
      matrixTarget: "m9-safari-macos"
    }
  ]
]);

function fail(message) {
  throw new Error(`Invalid assisted M9 evidence: ${message}`);
}

try {
  if (!input) fail("provide --input <real-browser-artifact.json>.");
  const artifact = JSON.parse(await readFile(resolve(input), "utf8"));
  if (artifact?.schemaVersion !== 1 || artifact?.milestone !== "M9")
    fail("schemaVersion 1 and milestone M9 are required.");
  const expected = expectedBrowsers.get(artifact.target);
  if (!expected) fail("target is not a supported assisted M9 qualification target.");
  if (artifact?.environment?.realBrowser !== true || artifact?.environment?.emulated === true)
    fail("the record must identify a real browser and must not be emulated.");
  if (
    artifact?.browser?.name !== expected.browser ||
    artifact?.browser?.operatingSystem !== expected.operatingSystem
  )
    fail("browser and operating system do not match the target.");
  if (
    typeof artifact?.browser?.version !== "string" ||
    !artifact.browser.version ||
    artifact.browser.version === "UNKNOWN"
  )
    fail("the browser version or user-agent-reduced version is required.");
  if (!artifact?.qualificationResults || !Array.isArray(artifact?.limitations))
    fail("qualificationResults and limitations are required.");

  const date = new Date().toISOString().slice(0, 10);
  const destination = resolve(root, "benchmarks/results", date);
  await mkdir(destination, { recursive: true });
  const matrixPath = resolve(destination, "m9-browser-matrix.json");
  const matrix = JSON.parse(await readFile(matrixPath, "utf8"));
  const matrixTarget = expected.matrixTarget ?? artifact.target;
  const index = matrix.records.findIndex((candidate) => candidate.target === matrixTarget);
  if (index === -1) fail("the current M9 matrix does not contain the assisted target.");
  const existing = matrix.records[index];
  if (expected.matrixTarget && existing.qualificationStatus !== "PASS")
    fail("a real core qualification is required before adding filesystem evidence.");
  const filename = `${artifact.target}.json`;
  await writeFile(resolve(destination, filename), JSON.stringify(artifact, null, 2) + "\n");

  if (expected.matrixTarget) {
    const filesystem = artifact.qualificationResults.realFilesystem;
    if (!filesystem || typeof filesystem !== "object")
      fail("filesystem artifacts require realFilesystem aggregate results.");
    const filePass = filesystem.fileDestination?.finalDestinationMatch === true;
    const folderPass = filesystem.folderDestination?.finalTreeMatch === true;
    const sourcePass = filesystem.folderSource?.streamPackManifestBuilt === true;
    const filesystemStatus = filePass && folderPass && sourcePass ? "PASS" : "PARTIAL";
    matrix.records[index] = {
      ...existing,
      evidence: [...new Set([...(existing.evidence ?? []), filename])],
      qualificationResults: {
        ...existing.qualificationResults,
        realFilesystem: filesystemStatus,
        assistedFilesystem: filesystem
      },
      limitations: [...new Set([...(existing.limitations ?? []), ...artifact.limitations])]
    };
    await writeFile(matrixPath, JSON.stringify(matrix, null, 2) + "\n");
    console.log(`Retained validated assisted M9 filesystem evidence in ${destination}.`);
    process.exit(0);
  }

  const record = {
    target: artifact.target,
    platform: expected.platform,
    browser: artifact.browser,
    supportTier: artifact.supportTier,
    qualificationStatus: "PASS",
    evidence: [filename],
    capabilities: artifact.capabilities,
    qualificationResults: artifact.qualificationResults,
    limitations: artifact.limitations,
    environment: artifact.environment
  };
  matrix.records[index] = record;
  await writeFile(matrixPath, JSON.stringify(matrix, null, 2) + "\n");
  console.log(`Retained validated assisted M9 evidence in ${destination}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to retain assisted M9 evidence.");
  process.exitCode = 1;
}
