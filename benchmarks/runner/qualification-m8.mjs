import { copyFile, mkdir, readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const commandProcessor = process.platform === "win32" && command.endsWith(".cmd");
    const child = spawn(
      commandProcessor ? (process.env.ComSpec ?? "cmd.exe") : command,
      commandProcessor ? ["/d", "/s", "/c", command, ...args] : args,
      { cwd: root, stdio: "inherit" }
    );
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

async function retainEvidence(destination) {
  const source = resolve(root, "test-results");
  const files = await readdir(source, { recursive: true }).catch(() => []);
  const evidence = files.filter(
    (file) => typeof file === "string" && /^m8-.*\.json$/i.test(basename(file))
  );
  const required = new Set([
    "m8-browser-m5-health-work-rate-v2.json",
    "m8-browser-observer-off-work-rate-v2.json",
    "m8-paced-source-limit.json",
    "m8-paced-destination-limit.json",
    "m8-paced-network-limit.json",
    "m8-unknown-bottleneck.json"
  ]);
  const found = new Set(evidence.map((file) => basename(file)));
  const missing = [...required].filter((name) => !found.has(name));
  if (missing.length)
    throw new Error(`M8 qualification did not emit required evidence: ${missing.join(", ")}.`);
  for (const file of evidence)
    await copyFile(resolve(source, file), resolve(destination, basename(file)));
  return evidence.length;
}

try {
  if ((await run(pnpm, ["build"])) !== 0)
    throw new Error("FlickSend build failed before M8 qualification.");
  if ((await run(pnpm, ["exec", "playwright", "test", "tests/e2e/m8-health.spec.ts"])) !== 0)
    throw new Error("M8 browser health qualification failed.");
  if (
    (await run(pnpm, [
      "--filter",
      "@flicksend/engine-core",
      "exec",
      "vitest",
      "run",
      "test/m8-health-qualification.test.ts"
    ])) !== 0
  )
    throw new Error("M8 paced real-engine qualification failed.");

  const date = new Date().toISOString().slice(0, 10);
  const destination = resolve(root, "benchmarks/results", date);
  await mkdir(destination, { recursive: true });
  const count = await retainEvidence(destination);
  console.log(`Retained ${count} raw M8 browser and real-engine evidence files in ${destination}.`);
} catch (error) {
  console.error(
    error instanceof Error
      ? `M8 qualification failed: ${error.message}`
      : "M8 qualification failed."
  );
  process.exitCode = 1;
}
