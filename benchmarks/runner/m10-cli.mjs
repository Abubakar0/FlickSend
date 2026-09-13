import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, open, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const resultsRoot = resolve(root, "benchmarks/results");
const mode = process.argv[2];
const args = new Map(
  process.argv.slice(3).flatMap((argument) => {
    if (!argument.startsWith("--")) return [];
    const [key, value] = argument.slice(2).split("=", 2);
    return [[key, value ?? "true"]];
  })
);

const libraryPath = resolve(root, "packages/performance-qualification/dist/index.js");
let library;
try {
  await access(libraryPath);
  library = await import(pathToFileURL(libraryPath).href);
} catch {
  throw new Error(
    "Build the workspace before running M10 commands so its evidence validator is current."
  );
}

function option(name, fallback) {
  return args.get(name) ?? fallback;
}

function integerOption(name, fallback, minimum, maximum) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function parseBytes(value) {
  const match = /^(\d+)(KiB|MiB|GiB)$/i.exec(value ?? "");
  const units = { kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };
  if (!match) throw new Error("Use a size such as 1GiB, 512MiB, or 64KiB.");
  const bytes = Number(match[1]) * units[match[2].toLowerCase()];
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("The requested size is invalid.");
  return bytes;
}

function utcRunId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}

function resultPath(defaultName) {
  const requested = option("output", null);
  const path = requested
    ? resolve(requested)
    : resolve(
        resultsRoot,
        new Date().toISOString().slice(0, 10),
        `${defaultName}-${utcRunId()}.json`
      );
  const parent = relative(resultsRoot, path);
  if (parent.startsWith("..") || parent === "")
    throw new Error("M10 artifacts must be retained below benchmarks/results.");
  return path;
}

async function retain(path, record) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(record, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  console.log(`Retained privacy-safe M10 evidence in ${path}.`);
  return path;
}

function execText(command, commandArgs, timeout = 30_000) {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      commandArgs,
      { cwd: root, timeout, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolvePromise(stdout);
      }
    );
  });
}

async function powershellJson(script) {
  if (process.platform !== "win32") return null;
  const stdout = await execText("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script
  ]);
  return JSON.parse(stdout);
}

function speedToBits(value) {
  const match = /^(\d+(?:\.\d+)?)\s*(K|M|G|T)?bps$/i.exec(String(value ?? "").replace(/\s+/g, ""));
  if (!match) return null;
  const scale = { undefined: 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
  return Math.round(Number(match[1]) * scale[match[2]?.toUpperCase()]);
}

function interfaceClass(mediaType) {
  const normalized = String(mediaType ?? "").toUpperCase();
  if (normalized.includes("802.11") || normalized.includes("WIRELESS")) return "WIFI";
  if (normalized.includes("802.3") || normalized.includes("ETHERNET")) return "WIRED_ETHERNET";
  return "UNKNOWN";
}

function cpuSnapshot() {
  return os.cpus().map((cpu) => ({
    total: Object.values(cpu.times).reduce((sum, value) => sum + value, 0),
    idle: cpu.times.idle
  }));
}

function cpuPercent(before, after) {
  const total = after.reduce((sum, sample, index) => sum + sample.total - before[index].total, 0);
  const idle = after.reduce((sum, sample, index) => sum + sample.idle - before[index].idle, 0);
  return total > 0 ? ((total - idle) / total) * 100 : 0;
}

function pause(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function lowLoadSamples(samples = 6, intervalMs = 500) {
  const values = [];
  let before = cpuSnapshot();
  for (let index = 0; index < samples; index += 1) {
    await pause(intervalMs);
    const after = cpuSnapshot();
    values.push({
      timestampMs: Date.now(),
      memoryBytes: os.totalmem() - os.freemem(),
      cpuPercent: cpuPercent(before, after)
    });
    before = after;
  }
  return library.summarizeProcessSamples(values);
}

function browserCandidates(browser) {
  if (process.platform !== "win32") return [];
  const programFiles = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA
  ].filter(Boolean);
  const suffix =
    browser === "EDGE"
      ? "Microsoft/Edge/Application/msedge.exe"
      : browser === "FIREFOX"
        ? "Mozilla Firefox/firefox.exe"
        : "Google/Chrome/Application/chrome.exe";
  return programFiles.map((prefix) => resolve(prefix, suffix));
}

async function browserInventory(browser) {
  if (!browser) return { browser: "UNSPECIFIED", version: "UNSPECIFIED" };
  const normalized = browser.toUpperCase();
  for (const candidate of browserCandidates(normalized)) {
    try {
      await access(candidate);
      const version = (
        await execText("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-Item -LiteralPath '${candidate.replace(/'/g, "''")}').VersionInfo.ProductVersion`
        ])
      ).trim();
      return { browser: normalized, version: version || "UNKNOWN" };
    } catch {
      // The record intentionally omits executable paths and continues to the next standard location.
    }
  }
  return { browser: normalized, version: "NOT_FOUND" };
}

async function collectEnvironment(role) {
  const label = library.validatePrivacySafeLabel(
    option(
      "label",
      role === "SENDER" ? "SENDER_A" : role === "RECEIVER" ? "RECEIVER_B" : "LOCAL_PRECHECK"
    )
  );
  const lowLoad = await lowLoadSamples();
  let windows = null;
  try {
    windows = await powershellJson(`
      $adapters = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
        Where-Object Status -eq 'Up' |
        ForEach-Object { [PSCustomObject]@{ MediaType = [string]$_.MediaType; LinkSpeed = [string]$_.LinkSpeed; Model = [string]$_.InterfaceDescription } })
      $disks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue |
        ForEach-Object { [PSCustomObject]@{ MediaType = [string]$_.MediaType; BusType = [string]$_.BusType; HealthStatus = [string]$_.HealthStatus } })
      $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
      $battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
      [PSCustomObject]@{
        OsCaption = [string](Get-CimInstance Win32_OperatingSystem).Caption
        OsVersion = [string](Get-CimInstance Win32_OperatingSystem).Version
        PhysicalCores = [int]$cpu.NumberOfCores
        Adapters = $adapters
        Disks = $disks
        Power = if ($null -eq $battery) { 'AC_OR_DESKTOP' } elseif ($battery.BatteryStatus -in 6,7,8,9) { 'AC_OR_CHARGING' } elseif ($battery.BatteryStatus -in 4,5) { 'BATTERY_LOW' } else { 'BATTERY_OR_UNKNOWN' }
      } | ConvertTo-Json -Depth 4 -Compress
    `);
  } catch {
    windows = null;
  }
  const browser = await browserInventory(option("browser", "CHROME"));
  const adapters = Array.isArray(windows?.Adapters) ? windows.Adapters : [];
  const disks = Array.isArray(windows?.Disks) ? windows.Disks : [];
  return {
    schemaVersion: library.m10SchemaVersion,
    milestone: "M10",
    recordType: "ENVIRONMENT",
    capturedAt: new Date().toISOString(),
    evidenceClass: role === "SAME_HOST" ? "SAME_HOST_PHYSICAL_BROWSER" : "TWO_MACHINE_PHYSICAL",
    machine: {
      role,
      label,
      cpu: {
        model: os.cpus()[0]?.model ?? "UNKNOWN",
        physicalCores: windows?.PhysicalCores ?? null,
        logicalCores: os.availableParallelism(),
        reportedLogicalCores: os.cpus().length
      },
      memoryBytes: os.totalmem(),
      operatingSystem: {
        platform: os.platform(),
        release: os.release(),
        version: windows?.OsVersion ?? null,
        family: windows?.OsCaption ?? os.type()
      },
      browser,
      storage: {
        classes: [
          ...new Set(
            disks.map((disk) => `${disk.MediaType || "UNKNOWN"}/${disk.BusType || "UNKNOWN"}`)
          )
        ],
        health: [...new Set(disks.map((disk) => disk.HealthStatus || "UNKNOWN"))]
      },
      network: adapters.map((adapter) => ({
        interfaceClass: interfaceClass(adapter.MediaType),
        adapterModel: String(adapter.Model || "UNKNOWN"),
        nominalLinkSpeedBitsPerSecond: speedToBits(adapter.LinkSpeed)
      })),
      powerMode: windows?.Power ?? "UNKNOWN"
    },
    systemLowLoad: {
      scope: "WHOLE_SYSTEM",
      methodology: "six 500 ms OS CPU and memory samples",
      summary: lowLoad
    },
    privacy: {
      excluded: [
        "hostname",
        "username",
        "IP address",
        "MAC address",
        "Wi-Fi name",
        "filesystem path",
        "payload"
      ],
      twoMachineAttestation: role === "SAME_HOST" ? "NOT_APPLICABLE" : "OPERATOR_REQUIRED"
    }
  };
}

function iperfAvailable() {
  const executable = process.platform === "win32" ? "iperf3.exe" : "iperf3";
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? executable : null;
}

async function iperfRun(executable, peer, reverse, seconds) {
  const args = ["-c", peer, "-J", "-t", String(seconds)];
  if (reverse) args.push("-R");
  const output = await execText(executable, args, (seconds + 20) * 1000);
  const report = JSON.parse(output);
  const end = report.end ?? {};
  const sum = reverse ? (end.sum_received ?? end.sum_sent) : (end.sum_sent ?? end.sum_received);
  if (!Number.isFinite(sum?.bits_per_second) || sum.bits_per_second <= 0)
    throw new Error("iperf3 returned no positive TCP application goodput.");
  return {
    applicationGoodputBitsPerSecond: sum.bits_per_second,
    retransmits: Number.isSafeInteger(sum.retransmits) ? sum.retransmits : null,
    durationSeconds: sum.seconds ?? null
  };
}

async function collectNetworkBaseline() {
  const peer = option("peer", null);
  if (!peer)
    throw new Error("Provide --peer=<receiver-or-sender-address>; the address is not retained.");
  const executable = iperfAvailable();
  const seconds = integerOption("seconds", 10, 1, 120);
  if (!executable)
    return {
      schemaVersion: library.m10SchemaVersion,
      milestone: "M10",
      recordType: "NETWORK_BASELINE",
      capturedAt: new Date().toISOString(),
      status: "NOT_TESTED",
      reason: "iperf3 is not installed or not available on PATH.",
      privacy: { peerAddressRetained: false }
    };
  const [senderToReceiver, receiverToSender] = await Promise.all([
    iperfRun(executable, peer, false, seconds),
    iperfRun(executable, peer, true, seconds)
  ]);
  return {
    schemaVersion: library.m10SchemaVersion,
    milestone: "M10",
    recordType: "NETWORK_BASELINE",
    capturedAt: new Date().toISOString(),
    status: "OBSERVED",
    tool: "iperf3",
    transport: "TCP",
    durationSeconds: seconds,
    senderToReceiver,
    receiverToSender,
    privacy: { peerAddressRetained: false, WiFiNameRetained: false }
  };
}

async function readSequential(input) {
  const file = await open(input, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  let offset = 0;
  const startedAt = performance.now();
  const hash = createHash("sha256");
  try {
    for (;;) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
  } finally {
    await file.close();
  }
  const durationMs = performance.now() - startedAt;
  return {
    bytes: offset,
    durationMs,
    bytesPerSecond: durationMs > 0 ? (offset * 1000) / durationMs : null,
    sha256: hash.digest("hex")
  };
}

async function writeDeterministic(output, bytes) {
  const file = await open(output, "wx");
  // Reuse one bounded deterministic buffer so the disk baseline measures I/O, not JS byte synthesis.
  const buffer = Buffer.alloc(Math.min(8 * 1024 * 1024, bytes), 0xa5);
  const startedAt = performance.now();
  const hash = createHash("sha256");
  let offset = 0;
  try {
    while (offset < bytes) {
      const length = Math.min(buffer.length, bytes - offset);
      const chunk = buffer.subarray(0, length);
      await file.write(chunk, 0, length, offset);
      hash.update(chunk);
      offset += length;
    }
  } finally {
    await file.close();
  }
  const durationMs = performance.now() - startedAt;
  return {
    bytes: offset,
    durationMs,
    bytesPerSecond: durationMs > 0 ? (offset * 1000) / durationMs : null,
    sha256: hash.digest("hex")
  };
}

async function collectDiskBaseline() {
  const input = option("read-input", null);
  const output = option("write-output", null);
  if (!input && !output)
    throw new Error("Provide --read-input and/or --write-output for an explicit disk baseline.");
  const writeBytes = output ? parseBytes(option("size", "1GiB")) : 0;
  const read = input ? await readSequential(resolve(input)) : null;
  const write = output ? await writeDeterministic(resolve(output), writeBytes) : null;
  const bytes = Math.max(read?.bytes ?? 0, write?.bytes ?? 0);
  return {
    schemaVersion: library.m10SchemaVersion,
    milestone: "M10",
    recordType: "DISK_BASELINE",
    capturedAt: new Date().toISOString(),
    status: bytes < os.totalmem() ? "OBSERVED_CACHE_STATE_UNKNOWN" : "OBSERVED",
    method: "bounded 8 MiB sequential Node.js read/write with SHA-256 verification",
    cacheState: bytes < os.totalmem() ? "UNKNOWN_LIKELY_CACHED" : "UNKNOWN",
    sourceSequentialRead: read,
    destinationSequentialWrite: write,
    privacy: { inputPathRetained: false, outputPathRetained: false }
  };
}

async function processPoint(pid) {
  if (process.platform !== "win32")
    throw new Error("The current M10 process sampler supports Windows only.");
  const sample = await powershellJson(`
    $process = Get-Process -Id ${pid} -ErrorAction Stop
    [PSCustomObject]@{ CpuSeconds = [double]$process.CPU; WorkingSetBytes = [Int64]$process.WorkingSet64 } | ConvertTo-Json -Compress
  `);
  return {
    timestampMs: Date.now(),
    cpuSeconds: sample.CpuSeconds,
    memoryBytes: sample.WorkingSetBytes
  };
}

async function collectProcessSamples() {
  const pid = integerOption("pid", 0, 1, 2_147_483_647);
  const seconds = integerOption("seconds", 60, 5, 3600);
  const intervalMs = integerOption("interval-ms", 500, 100, 10_000);
  const maximumSamples = 600;
  const targetSamples = Math.min(Math.floor((seconds * 1000) / intervalMs) + 1, maximumSamples);
  const points = [];
  let previous = null;
  for (let index = 0; index < targetSamples; index += 1) {
    try {
      const current = await processPoint(pid);
      const cpuPercent = previous
        ? ((current.cpuSeconds - previous.cpuSeconds) /
            ((current.timestampMs - previous.timestampMs) / 1000) /
            os.availableParallelism()) *
          100
        : null;
      points.push({
        timestampMs: current.timestampMs,
        memoryBytes: current.memoryBytes,
        cpuPercent: cpuPercent !== null && cpuPercent >= 0 ? cpuPercent : null
      });
      previous = current;
    } catch {
      break;
    }
    if (index + 1 < targetSamples) await pause(intervalMs);
  }
  if (!points.length) throw new Error("The selected process could not be sampled.");
  return {
    schemaVersion: library.m10SchemaVersion,
    milestone: "M10",
    recordType: "PROCESS_SAMPLES",
    capturedAt: new Date().toISOString(),
    status: points.length === targetSamples ? "OBSERVED" : "PROCESS_EXITED_EARLY",
    scope: "OPERATOR_SPECIFIED_PROCESS",
    methodology: { intervalMs, maximumSamples, logicalCores: os.availableParallelism() },
    samples: points,
    summary: library.summarizeProcessSamples(points),
    privacy: { pidRetained: false, processNameRetained: false, commandLineRetained: false }
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

function extractReport(report) {
  const continuity = report?.recovery?.continuity ?? {};
  const route = String(report?.route?.routeType ?? report?.route?.type ?? "UNKNOWN").toUpperCase();
  const payloadBytes = report?.speedProof?.payloadBytes ?? report?.datasetSizeBytes ?? 0;
  return {
    transferId:
      typeof report?.recovery?.transferId === "string" ? report.recovery.transferId : null,
    delivered: report?.completionState === "DELIVERED",
    manifestRootVerified: report?.integrity?.manifestRootMatch === true,
    route: route.includes("RELAY") ? "RELAY" : route.includes("DIRECT") ? "DIRECT" : null,
    payloadBytes,
    destinationVerified:
      Number.isSafeInteger(payloadBytes) &&
      payloadBytes > 0 &&
      report?.integrity?.verifiedBytes === payloadBytes,
    speedProof: report?.speedProof ?? null,
    duplicateRetransmittedBytes: continuity.duplicateRetransmittedBytes ?? null,
    committedBlocksRetransmitted: continuity.committedBlocksRetransmitted ?? null,
    ambiguousInflightBytesRetransmitted: continuity.ambiguousInflightBytesRetransmitted ?? null,
    safeBytesBeforeDisconnect: continuity.safeBytesBeforeDisconnect ?? null,
    remainingBytesAtResume: continuity.remainingBytesAtResume ?? null,
    resumedPayloadBytes: continuity.resumedPayloadBytes ?? null
  };
}

function fixtureSizeClass(payloadBytes) {
  const knownSizes = new Map([
    [1 * 1024 ** 3, "1_GIB"],
    [10 * 1024 ** 3, "10_GIB"],
    [25 * 1024 ** 3, "25_GIB"],
    [75 * 1024 ** 3, "75_GIB"],
    [100 * 1024 ** 3, "100_GIB"]
  ]);
  return knownSizes.get(payloadBytes) ?? "OTHER_SIZE";
}

// M8 exports are local diagnostics and contain a transfer ID. Retain only M10-safe aggregates.
function summarizeSpeedProof(speedProof) {
  if (!speedProof || typeof speedProof !== "object") return null;
  const routeTypes = Array.isArray(speedProof.routeHistory)
    ? speedProof.routeHistory.map((segment) => segment?.routeType ?? "UNKNOWN")
    : [];
  return {
    schemaVersion: speedProof.schemaVersion ?? null,
    durationMs: speedProof.durationMs ?? null,
    averageThroughputBps: speedProof.averageThroughputBps ?? null,
    peakThroughputBps: speedProof.peakThroughputBps ?? null,
    averageSourceReadBps: speedProof.averageSourceReadBps ?? null,
    averageDestinationWriteBps: speedProof.averageDestinationWriteBps ?? null,
    routeTypes,
    routeChangeCount: speedProof.routeChangeCount ?? null,
    stallCount: speedProof.stallCount ?? null,
    stallDurationMs: speedProof.stallDurationMs ?? null,
    integrityRetryCount: speedProof.integrityRetryCount ?? null,
    reconnectCount: speedProof.reconnectCount ?? null,
    dominantBottleneck: speedProof.dominantBottleneck ?? null,
    bottleneckConfidence: speedProof.bottleneckConfidence ?? null,
    measurementAvailability: speedProof.measurementAvailability ?? null
  };
}

async function retainPhysicalTransfer() {
  const sender = extractReport(await readJson(option("sender-report", "")));
  const receiver = extractReport(await readJson(option("receiver-report", "")));
  const senderEnvironment = await readJson(option("sender-environment", ""));
  const receiverEnvironment = await readJson(option("receiver-environment", ""));
  const senderSample = option("sender-sample", null)
    ? await readJson(option("sender-sample", ""))
    : null;
  const receiverSample = option("receiver-sample", null)
    ? await readJson(option("receiver-sample", ""))
    : null;
  const expectedRoute = option("expected-route", "DIRECT").toUpperCase();
  if (expectedRoute !== "DIRECT" && expectedRoute !== "RELAY")
    throw new Error("--expected-route must be DIRECT or RELAY.");
  const issues = [
    ...library.validatePhysicalTransfer({
      evidenceClass: "TWO_MACHINE_PHYSICAL",
      expectedRoute,
      senderRole: senderEnvironment?.machine?.role,
      receiverRole: receiverEnvironment?.machine?.role,
      senderDelivered: sender.delivered,
      receiverDelivered: receiver.delivered,
      receiverManifestRootVerified: receiver.manifestRootVerified,
      receiverDestinationVerified: receiver.destinationVerified,
      senderTransferId: sender.transferId,
      receiverTransferId: receiver.transferId,
      selectedRoute: sender.route,
      payloadBytes: sender.payloadBytes,
      duplicateRetransmittedBytes: sender.duplicateRetransmittedBytes,
      committedBlocksRetransmitted: sender.committedBlocksRetransmitted
    }),
    ...(senderSample?.summary && receiverSample?.summary
      ? []
      : ["Both peers require external CPU and memory samples."])
  ];
  const record = {
    schemaVersion: library.m10SchemaVersion,
    milestone: "M10",
    recordType: "PHYSICAL_TRANSFER",
    capturedAt: new Date().toISOString(),
    evidenceClass: "TWO_MACHINE_PHYSICAL",
    operatorAttestation:
      "Two distinct physical machines were used; host identifiers are intentionally excluded.",
    validity: issues.length ? "INVALID" : "VALID",
    invalidReasons: issues,
    scenario: { expectedRoute, selectedRoute: sender.route, topology: "TWO_MACHINE" },
    transfer: {
      fixtureSizeClass: fixtureSizeClass(sender.payloadBytes),
      senderDelivered: sender.delivered,
      receiverDelivered: receiver.delivered,
      receiverManifestRootVerified: receiver.manifestRootVerified,
      receiverFixtureBytesVerified: receiver.destinationVerified,
      continuity: {
        safeBytesBeforeDisconnect: sender.safeBytesBeforeDisconnect,
        remainingBytesAtResume: sender.remainingBytesAtResume,
        resumedPayloadBytes: sender.resumedPayloadBytes,
        duplicateRetransmittedBytes: sender.duplicateRetransmittedBytes,
        committedBlocksRetransmitted: sender.committedBlocksRetransmitted,
        ambiguousInflightBytesRetransmitted: sender.ambiguousInflightBytesRetransmitted
      },
      senderSpeedProof: summarizeSpeedProof(sender.speedProof),
      receiverSpeedProof: summarizeSpeedProof(receiver.speedProof)
    },
    externalSystemSamples: {
      sender: senderSample?.summary ?? null,
      receiver: receiverSample?.summary ?? null
    },
    privacy: {
      transferIdRetained: false,
      reportPathRetained: false,
      hostIdentifierRetained: false,
      addressRetained: false,
      payloadRetained: false
    }
  };
  const path = await retain(
    resultPath(`m10-${expectedRoute.toLowerCase()}-physical-transfer`),
    record
  );
  if (issues.length) process.exitCode = 2;
  return path;
}

async function collectPreflight() {
  const environment = await collectEnvironment("SAME_HOST");
  const environmentPath = await retain(resultPath("m10-environment-local-precheck"), environment);
  const preflight = {
    schemaVersion: library.m10SchemaVersion,
    milestone: "M10",
    recordType: "PREFLIGHT",
    capturedAt: new Date().toISOString(),
    status: "INCOMPLETE",
    topology: "SINGLE_HOST_ONLY",
    environmentArtifact: basename(environmentPath),
    available: {
      iperf3: iperfAvailable() !== null,
      secondMachine: false,
      physicalNetworkBaseline: false
    },
    missingForCompletion: [
      "Two distinct physical machines",
      "iperf3 baseline in both TCP directions",
      "Physical 1 GiB and 10 GiB direct transfers",
      "External sender and receiver CPU/memory samples",
      "Physical interruption/resume evidence"
    ],
    claims: {
      throughput: "NOT_QUALIFIED",
      utilization: "NOT_QUALIFIED",
      disk: "NOT_QUALIFIED",
      CPU: "NOT_QUALIFIED",
      memory: "NOT_QUALIFIED"
    },
    privacy: { hostnameRetained: false, addressRetained: false, pathRetained: false }
  };
  await retain(resultPath("m10-preflight"), preflight);
  console.log("M10 preflight completed. Physical performance qualification remains INCOMPLETE.");
}

try {
  if (mode === "environment") {
    const role = option("role", "SENDER").toUpperCase();
    if (!["SENDER", "RECEIVER", "SAME_HOST"].includes(role))
      throw new Error("--role must be SENDER, RECEIVER, or SAME_HOST.");
    await retain(
      resultPath(`m10-environment-${role.toLowerCase()}`),
      await collectEnvironment(role)
    );
  } else if (mode === "network") {
    await retain(resultPath("m10-network-baseline"), await collectNetworkBaseline());
  } else if (mode === "disk") {
    await retain(resultPath("m10-disk-baseline"), await collectDiskBaseline());
  } else if (mode === "sample") {
    await retain(resultPath("m10-process-samples"), await collectProcessSamples());
  } else if (mode === "retain") {
    await retainPhysicalTransfer();
  } else if (mode === "preflight") {
    await collectPreflight();
  } else {
    throw new Error("Use environment, network, disk, sample, retain, or preflight.");
  }
} catch (error) {
  console.error(
    error instanceof Error ? `M10 runner failed: ${error.message}` : "M10 runner failed."
  );
  process.exitCode = process.exitCode || 1;
}
