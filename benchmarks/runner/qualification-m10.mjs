import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const useCommandProcessor = process.platform === "win32" && command.endsWith(".cmd");
    const child = spawn(
      useCommandProcessor ? (process.env.ComSpec ?? "cmd.exe") : command,
      useCommandProcessor ? ["/d", "/s", "/c", command, ...args] : args,
      { cwd: root, stdio: "inherit" }
    );
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

try {
  if ((await run(pnpm, ["build"])) !== 0)
    throw new Error("FlickSend build failed before M10 preflight.");
  if ((await run(process.execPath, ["benchmarks/runner/m10-cli.mjs", "preflight"])) !== 0)
    throw new Error("M10 preflight collection failed.");
  console.log("M10 preflight runner passed. It does not claim physical qualification completion.");
} catch (error) {
  console.error(
    error instanceof Error
      ? `M10 qualification failed: ${error.message}`
      : "M10 qualification failed."
  );
  process.exitCode = 1;
}
