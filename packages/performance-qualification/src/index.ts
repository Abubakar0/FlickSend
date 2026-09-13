export const m10SchemaVersion = 1;

export type M10Role = "SENDER" | "RECEIVER" | "SAME_HOST";
export type M10EvidenceClass = "SAME_HOST_PHYSICAL_BROWSER" | "TWO_MACHINE_PHYSICAL";
export type M10Route = "DIRECT" | "RELAY";

export type ProcessSample = {
  timestampMs: number;
  memoryBytes: number;
  cpuPercent: number | null;
};

export type ProcessSummary = {
  sampleCount: number;
  initialMemoryBytes: number;
  averageMemoryBytes: number;
  peakMemoryBytes: number;
  finalMemoryBytes: number;
  averageCpuPercent: number | null;
  peakCpuPercent: number | null;
  memoryTrend: "NO_CLEAR_TREND" | "MONOTONIC_GROWTH";
};

export type M10TransferValidationInput = {
  evidenceClass: M10EvidenceClass;
  expectedRoute: M10Route;
  senderRole: M10Role;
  receiverRole: M10Role;
  senderDelivered: boolean;
  receiverDelivered: boolean;
  receiverManifestRootVerified: boolean;
  receiverDestinationVerified: boolean;
  senderTransferId: string | null;
  receiverTransferId: string | null;
  selectedRoute: M10Route | null;
  payloadBytes: number;
  duplicateRetransmittedBytes: number;
  committedBlocksRetransmitted: number;
};

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be a finite non-negative number.`);
}

/** Summarizes bounded sidecar samples without inferring a hardware bottleneck. */
export function summarizeProcessSamples(samples: readonly ProcessSample[]): ProcessSummary {
  if (!samples.length) throw new Error("At least one process sample is required.");
  let previousTimestamp = -1;
  let previousMemory = -1;
  let monotonicMemory = true;
  for (const sample of samples) {
    assertFiniteNonNegative(sample.timestampMs, "timestampMs");
    assertFiniteNonNegative(sample.memoryBytes, "memoryBytes");
    if (sample.cpuPercent !== null) assertFiniteNonNegative(sample.cpuPercent, "cpuPercent");
    if (sample.timestampMs <= previousTimestamp)
      throw new Error("Process sample timestamps must increase.");
    if (previousMemory > sample.memoryBytes) monotonicMemory = false;
    previousTimestamp = sample.timestampMs;
    previousMemory = sample.memoryBytes;
  }
  const memory = samples.map((sample) => sample.memoryBytes);
  const cpu = samples.flatMap((sample) => (sample.cpuPercent === null ? [] : [sample.cpuPercent]));
  const initialMemoryBytes = memory[0]!;
  const finalMemoryBytes = memory.at(-1)!;
  return {
    sampleCount: samples.length,
    initialMemoryBytes,
    averageMemoryBytes: mean(memory),
    peakMemoryBytes: Math.max(...memory),
    finalMemoryBytes,
    averageCpuPercent: cpu.length ? mean(cpu) : null,
    peakCpuPercent: cpu.length ? Math.max(...cpu) : null,
    memoryTrend:
      samples.length >= 3 && monotonicMemory && finalMemoryBytes > initialMemoryBytes * 1.1
        ? "MONOTONIC_GROWTH"
        : "NO_CLEAR_TREND"
  };
}

/** A utilization ratio is valid only against a measured application-layer baseline. */
export function deriveNetworkUtilization(
  applicationPayloadBytesPerSecond: number | null,
  iperfGoodputBitsPerSecond: number | null
): number | null {
  if (
    applicationPayloadBytesPerSecond === null ||
    iperfGoodputBitsPerSecond === null ||
    !Number.isFinite(applicationPayloadBytesPerSecond) ||
    !Number.isFinite(iperfGoodputBitsPerSecond) ||
    applicationPayloadBytesPerSecond < 0 ||
    iperfGoodputBitsPerSecond <= 0
  )
    return null;
  return (applicationPayloadBytesPerSecond * 8) / iperfGoodputBitsPerSecond;
}

/** Returns every reason a retained transfer is not valid physical M10 evidence. */
export function validatePhysicalTransfer(input: M10TransferValidationInput): readonly string[] {
  const issues: string[] = [];
  if (input.evidenceClass !== "TWO_MACHINE_PHYSICAL")
    issues.push("M10 completion requires two-machine physical evidence.");
  if (input.senderRole !== "SENDER" || input.receiverRole !== "RECEIVER")
    issues.push("Sender and receiver environment roles must be distinct.");
  if (!input.senderTransferId || input.senderTransferId !== input.receiverTransferId)
    issues.push("Sender and receiver must report the same transfer identity.");
  if (!input.senderDelivered || !input.receiverDelivered)
    issues.push("Both peers must report DELIVERED.");
  if (!input.receiverManifestRootVerified)
    issues.push("The receiver must verify the canonical manifest root.");
  if (!input.receiverDestinationVerified)
    issues.push("The receiver must verify every fixture byte before M10 retention.");
  if (input.selectedRoute !== input.expectedRoute)
    issues.push("The selected route does not match the requested M10 scenario.");
  if (!Number.isSafeInteger(input.payloadBytes) || input.payloadBytes <= 0)
    issues.push("Payload bytes must be a positive safe integer.");
  if (input.duplicateRetransmittedBytes !== 0)
    issues.push("Already verified payload was retransmitted.");
  if (input.committedBlocksRetransmitted !== 0)
    issues.push("Receiver-committed blocks were retransmitted.");
  return issues;
}

/** Rejects labels that could accidentally carry hostnames, paths, addresses, or user identifiers. */
export function validatePrivacySafeLabel(value: string): string {
  if (!/^[A-Z][A-Z0-9_-]{1,31}$/.test(value))
    throw new Error("Use an uppercase role label containing only A-Z, 0-9, _ or -.");
  if (/\d{1,3}(?:\.\d{1,3}){3}/.test(value) || value.includes("--"))
    throw new Error("The label must not contain an address-like value.");
  return value;
}
