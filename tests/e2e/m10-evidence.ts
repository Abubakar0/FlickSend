import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";

const execFileAsync = promisify(execFile);

type BrowserTreePoint = {
  elapsedMs: number;
  cpuSeconds: number;
  memoryBytes: number;
  processCount: number;
};

type SafeRecord = Record<string, unknown>;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function recordOrNull(value: unknown): SafeRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as SafeRecord)
    : null;
}

function parseJsonOutput(value: string | null): SafeRecord | null {
  if (!value) return null;
  try {
    return recordOrNull(JSON.parse(value));
  } catch {
    return null;
  }
}

function decimal(value: string | null): number | null {
  const match = value?.match(/[0-9][0-9,]*(?:\.[0-9]+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : null;
}

function integer(value: string | null): number {
  const digits = value?.replace(/[^0-9]/g, "") ?? "";
  return digits ? Number(digits) : 0;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function browserTreePoint(workerPid: number, startedAtMs: number): Promise<BrowserTreePoint> {
  if (process.platform !== "win32")
    throw new Error("M10 browser-tree sampling currently supports Windows only.");
  const script = `
    $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $known = @(${workerPid})
    $frontier = @(${workerPid})
    while ($frontier.Count -gt 0) {
      $children = @($all | Where-Object { $frontier -contains [int]$_.ParentProcessId } | ForEach-Object { [int]$_.ProcessId })
      $children = @($children | Where-Object { $known -notcontains $_ })
      if ($children.Count -eq 0) { break }
      $known += $children
      $frontier = $children
    }
    $browser = @($all | Where-Object {
      (([string]$_.Name) -match '^(chrome|msedge|firefox)\\.exe$') -and
      (($known -contains [int]$_.ProcessId) -or (([string]$_.CommandLine) -like '*--remote-debugging-pipe*'))
    } | ForEach-Object { [int]$_.ProcessId } | Select-Object -Unique)
    $processes = @($browser | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    [PSCustomObject]@{
      CpuSeconds = [double](($processes | Measure-Object -Property CPU -Sum).Sum)
      MemoryBytes = [Int64](($processes | Measure-Object -Property WorkingSet64 -Sum).Sum)
      ProcessCount = [int]$processes.Count
    } | ConvertTo-Json -Compress
  `;
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script
  ]);
  const parsed = JSON.parse(stdout) as {
    CpuSeconds?: number;
    MemoryBytes?: number;
    ProcessCount?: number;
  };
  if (
    !Number.isFinite(parsed.CpuSeconds) ||
    !Number.isSafeInteger(parsed.MemoryBytes) ||
    !parsed.ProcessCount
  )
    throw new Error("M10 could not identify the dedicated browser process tree.");
  return {
    elapsedMs: Date.now() - startedAtMs,
    cpuSeconds: parsed.CpuSeconds,
    memoryBytes: parsed.MemoryBytes,
    processCount: parsed.ProcessCount
  };
}

export class BrowserTreeSampler {
  readonly #startedAtMs = Date.now();
  readonly #points: BrowserTreePoint[] = [];
  readonly #intervalMs = 5_000;
  readonly #maximumSamples = 1_081;
  #stopped = false;
  #running: Promise<void> | null = null;

  async start(): Promise<void> {
    await this.capture();
    this.#running = this.collect();
  }

  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    await this.#running;
    await this.capture();
  }

  async capture(): Promise<void> {
    this.#points.push(await browserTreePoint(process.pid, this.#startedAtMs));
  }

  async collect(): Promise<void> {
    while (!this.#stopped && this.#points.length < this.#maximumSamples) {
      await pause(this.#intervalMs);
      if (!this.#stopped) await this.capture();
    }
  }

  summary(): SafeRecord {
    if (!this.#points.length) throw new Error("M10 browser process samples are missing.");
    const memory = this.#points.map((point) => point.memoryBytes);
    const cpu = this.#points.flatMap((point, index) => {
      const previous = this.#points[index - 1];
      if (!previous) return [];
      const elapsed = point.elapsedMs - previous.elapsedMs;
      return elapsed > 0
        ? [
            ((point.cpuSeconds - previous.cpuSeconds) * 100_000) /
              elapsed /
              os.availableParallelism()
          ]
        : [];
    });
    const finalMemoryBytes = memory.at(-1)!;
    const initialMemoryBytes = memory[0]!;
    const monotonic = memory.every((value, index) => index === 0 || value >= memory[index - 1]!);
    return {
      scope: "SAME_HOST_SHARED_BROWSER_PROCESS_TREE",
      sampleIntervalMs: this.#intervalMs,
      sampleCount: this.#points.length,
      initialMemoryBytes,
      averageMemoryBytes: memory.reduce((total, value) => total + value, 0) / memory.length,
      peakMemoryBytes: Math.max(...memory),
      finalMemoryBytes,
      averageCpuPercent: cpu.length
        ? cpu.reduce((total, value) => total + value, 0) / cpu.length
        : null,
      peakCpuPercent: cpu.length ? Math.max(...cpu) : null,
      memoryTrend:
        memory.length >= 3 && monotonic && finalMemoryBytes > initialMemoryBytes * 1.1
          ? "MONOTONIC_GROWTH"
          : "NO_CLEAR_TREND",
      browserProcessCountRange: {
        minimum: Math.min(...this.#points.map((point) => point.processCount)),
        maximum: Math.max(...this.#points.map((point) => point.processCount))
      },
      samples: this.#points.map((point, index) => {
        const previous = this.#points[index - 1];
        const elapsed = previous ? point.elapsedMs - previous.elapsedMs : null;
        return {
          elapsedMs: point.elapsedMs,
          memoryBytes: point.memoryBytes,
          cpuPercent:
            previous && elapsed && elapsed > 0
              ? ((point.cpuSeconds - previous.cpuSeconds) * 100_000) /
                elapsed /
                os.availableParallelism()
              : null,
          browserProcessCount: point.processCount
        };
      })
    };
  }
}

export async function continuityFrom(page: Page): Promise<SafeRecord> {
  const values = await page.getByTestId("continuity-metrics").locator("dd").allTextContents();
  if (values.length !== 6) throw new Error("M10 continuity metrics are incomplete.");
  return {
    safeBytesBeforeDisconnect: integer(values[0] ?? null),
    remainingBytesAtResume: integer(values[1] ?? null),
    resumedPayloadBytes: integer(values[2] ?? null),
    duplicateRetransmittedBytes: integer(values[3] ?? null),
    committedBlocksRetransmitted: integer(values[4] ?? null),
    ambiguousInflightBytesRetransmitted: integer(values[5] ?? null)
  };
}

export async function integrityFrom(page: Page): Promise<SafeRecord> {
  const values = await page.getByTestId("m5-integrity-metrics").locator("dd").allTextContents();
  return {
    blocksVerified: integer(values[1] ?? null),
    integrityRetryCount: integer(values[2] ?? null),
    integrityMismatchCount: integer(values[3] ?? null),
    manifestRootVerified: values[4] === "verified"
  };
}

export async function healthFrom(page: Page): Promise<SafeRecord | null> {
  const health = parseJsonOutput(await page.getByTestId("m8-health-snapshot").textContent());
  if (!health) return null;
  return {
    state: stringOrNull(health.healthState),
    routeType: stringOrNull(health.routeType),
    rttMs: numberOrNull(health.rttMs),
    averageThroughputBps: numberOrNull(health.averageThroughputBps),
    peakThroughputBps: numberOrNull(health.peakThroughputBps),
    sourceReadBps: numberOrNull(health.senderReadBps),
    destinationWriteBps: numberOrNull(health.receiverWriteBps),
    senderBufferedAmountBytes: numberOrNull(health.senderBufferedAmountBytes),
    receiveQueueBytes: numberOrNull(health.receiveQueueBytes),
    availableOutgoingBitrateBps: numberOrNull(health.availableOutgoingBitrateBps),
    stallCount: numberOrNull(health.stallCount),
    bottleneck: stringOrNull(health.bottleneck),
    confidence: stringOrNull(health.confidence),
    measurementAvailability: recordOrNull(health.measurementAvailability)
  };
}

export async function speedProofFrom(page: Page): Promise<SafeRecord | null> {
  const proof = parseJsonOutput(await page.getByTestId("m8-speed-proof").textContent());
  if (!proof) return null;
  return {
    schemaVersion: numberOrNull(proof.schemaVersion),
    durationMs: numberOrNull(proof.durationMs),
    averageThroughputBps: numberOrNull(proof.averageThroughputBps),
    peakThroughputBps: numberOrNull(proof.peakThroughputBps),
    averageSourceReadBps: numberOrNull(proof.averageSourceReadBps),
    averageDestinationWriteBps: numberOrNull(proof.averageDestinationWriteBps),
    routeChangeCount: numberOrNull(proof.routeChangeCount),
    stallCount: numberOrNull(proof.stallCount),
    stallDurationMs: numberOrNull(proof.stallDurationMs),
    integrityRetryCount: numberOrNull(proof.integrityRetryCount),
    reconnectCount: numberOrNull(proof.reconnectCount),
    dominantBottleneck: stringOrNull(proof.dominantBottleneck),
    bottleneckConfidence: stringOrNull(proof.bottleneckConfidence),
    measurementAvailability: recordOrNull(proof.measurementAvailability)
  };
}

export async function recoveryTimingFrom(page: Page): Promise<number | null> {
  const value = await page.getByTestId("m4-recovery-metrics").locator("dd").nth(7).textContent();
  return decimal(value);
}

export async function writeM10Evidence(name: string, value: SafeRecord): Promise<void> {
  const root = resolve(process.cwd(), "benchmarks", "results");
  const directory = join(root, new Date().toISOString().slice(0, 10));
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${name}-${new Date().toISOString().replace(/[-:.TZ]/g, "")}.json`),
    JSON.stringify(value, null, 2) + "\n",
    { encoding: "utf8", flag: "wx" }
  );
}
