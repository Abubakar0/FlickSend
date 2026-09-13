import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const mib = 1024 * 1024;
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((argument) => argument !== "--")
    .map((argument) => {
      const [key, value] = argument.replace(/^--/, "").split("=", 2);
      return [key, value];
    })
);

const number = (name, fallback) => {
  const value = Number(args[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid --${name}.`);
  return value;
};

const framePayloadBytes = number("frame-kib", 64) * 1024;
if (![32 * 1024, 64 * 1024, 128 * 1024, 256 * 1024].includes(framePayloadBytes))
  throw new Error("--frame-kib must be 32, 64, 128, or 256.");

const plan = {
  schemaVersion: 1,
  milestone: "M3",
  kind: "benchmark-plan",
  createdAt: new Date().toISOString(),
  datasetId: args.dataset ?? "generated-dataset",
  datasetSizeBytes: number("size-gib", 1) * 1024 * 1024 * 1024,
  configuration: {
    framePayloadBytes,
    readAheadBytes: number("read-ahead-kib", 256) * 1024,
    sendLowWaterBytes: number("low-mib", 2) * mib,
    sendHighWaterBytes: number("high-mib", 8) * mib,
    receiveWindowBytes: number("receive-window-mib", 8) * mib,
    writeBatchBytes: number("write-batch-kib", 256) * 1024,
    uiSnapshotIntervalMs: number("ui-ms", 125),
    throughputWindowMs: 1000,
    channelCount: 1,
    workerMode: "main-thread"
  },
  requiredMeasurements: [
    "averageThroughputBps",
    "peakThroughputBps",
    "sourceReadBps",
    "destinationWriteBps",
    "bufferedAmountBytes",
    "receiveQueueBytes",
    "timeToFirstByteMs",
    "memory",
    "cpu",
    "integrity"
  ],
  status: "PLANNED",
  privacy: "Dataset identifier and size only. Never record source paths, filenames, or file bytes."
};

const day = new Date().toISOString().slice(0, 10);
const outputDirectory = resolve("benchmarks", "results", day);
await mkdir(outputDirectory, { recursive: true });
const output = resolve(outputDirectory, `m3-plan-${plan.datasetId}.json`);
await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`);
process.stdout.write(`${output}\n`);
