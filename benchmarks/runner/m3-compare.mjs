import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "benchmarks/results");

async function readReports(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const reports = [];
  for (const entry of entries) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) reports.push(...(await readReports(child)));
    if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        const value = JSON.parse(await readFile(child, "utf8"));
        if (value.milestone === "M3" && value.kind !== "benchmark-plan") reports.push(value);
      } catch {
        // Invalid external reports are intentionally excluded from the comparison.
      }
    }
  }
  return reports;
}

const reports = await readReports(directory);
const completed = reports.filter(
  (report) => report.completionState === "COMPLETED" && report.integrity === "VERIFIED"
);

if (completed.length === 0) {
  process.stdout.write("No verified M3 measurement reports found. No configuration selected.\n");
  process.exit(0);
}

const ranked = completed
  .map((report) => ({
    dataset: report.datasetId,
    frameKiB: report.configuration?.framePayloadBytes / 1024,
    highMiB: report.configuration?.sendHighWaterBytes / (1024 * 1024),
    averageMbps: ((report.transfer?.averageThroughputBps ?? 0) * 8) / 1_000_000,
    peakMbps: ((report.transfer?.peakThroughputBps ?? 0) * 8) / 1_000_000,
    queueMiB: (report.transfer?.receiveQueueBytes ?? 0) / (1024 * 1024),
    stalledMs: report.transfer?.stalledMs ?? 0
  }))
  .sort((left, right) => right.averageMbps - left.averageMbps);

console.table(ranked);
process.stdout.write(
  "Ranked by average throughput only. Review memory, CPU, and stability before selecting a default.\n"
);
