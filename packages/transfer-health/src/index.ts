/**
 * Transfer Health is deliberately an observer: it accepts aggregate measurements and emits
 * diagnostics. It never receives payload bytes and cannot change transfer correctness.
 */
export type HealthMetricReliability = "OBSERVED" | "ESTIMATED" | "UNAVAILABLE";

export type TransferHealthState =
  "STARTING" | "GOOD" | "DEGRADED" | "RECOVERING" | "STALLED" | "PAUSED" | "UNKNOWN";

export type TransferBottleneck =
  | "NONE_DETECTED"
  | "LIKELY_SOURCE_READ_LIMIT"
  | "LIKELY_DESTINATION_WRITE_LIMIT"
  | "LIKELY_NETWORK_LIMIT"
  | "LIKELY_RELAY_LIMIT"
  | "BACKPRESSURE_LIMIT"
  | "RECOVERING"
  | "INSUFFICIENT_DATA";

export type TransferHealthConfidence = "LOW" | "MEDIUM" | "HIGH";

export type TransferHealthReasonCode =
  | "WARMUP"
  | "RECOVERING"
  | "PAUSED"
  | "NO_PROGRESS"
  | "SOURCE_TRACKS_PAYLOAD"
  | "DESTINATION_TRACKS_PAYLOAD"
  | "SOURCE_HAS_HEADROOM"
  | "DESTINATION_HAS_HEADROOM"
  | "BUFFER_DRAINS"
  | "BUFFER_PRESSURE"
  | "RECEIVE_QUEUE_PRESSURE"
  | "BROWSER_BITRATE_ESTIMATE"
  | "RELAY_DIRECT_BASELINE"
  | "MISSING_MEASUREMENTS";

export type TransferHealthReason = {
  code: TransferHealthReasonCode;
  detail: string;
};

export type TransferHealthMetricAvailability = {
  applicationPayload: HealthMetricReliability;
  sourceRead: HealthMetricReliability;
  destinationWrite: HealthMetricReliability;
  senderBufferedAmount: HealthMetricReliability;
  receiveQueue: HealthMetricReliability;
  rtt: HealthMetricReliability;
  availableOutgoingBitrate: HealthMetricReliability;
  webRtcBytes: HealthMetricReliability;
  route: HealthMetricReliability;
};

/**
 * Raw aggregate measurements owned by the engine/transport adapters. Null means unavailable,
 * never a measured zero. Byte counters are monotonic within one transfer identity.
 */
export type RawTransferMetrics = {
  timestampMs: number;
  transferId: string | null;
  transferState: string;
  routeType: "DIRECT" | "RELAY" | "UNKNOWN";
  routeDetail: string;
  routeGeneration: number;
  routeChangeCount: number;
  applicationPayloadBytes: number;
  totalBytes: number;
  sourceReadBps: number | null;
  destinationWriteBps: number | null;
  senderBufferedAmountBytes: number | null;
  receiveQueueBytes: number | null;
  rttMs: number | null;
  availableOutgoingBitrateBps: number | null;
  webRtcBytesSent: number | null;
  webRtcBytesReceived: number | null;
  safeBytes: number;
  routeRecoveryCount: number;
  integrityRetryCount: number;
  senderHighWaterBytes: number | null;
  receiveQueueLimitBytes: number | null;
};

export type TransferHealthRouteSegment = {
  routeType: RawTransferMetrics["routeType"];
  routeDetail: string;
  startedAtMs: number;
  endedAtMs: number | null;
  averageThroughputBps: number | null;
};

export type TransferHealthEvent = {
  atMs: number;
  type:
    | "HEALTH_GOOD"
    | "HEALTH_DEGRADED"
    | "BOTTLENECK_CHANGED"
    | "STALL_STARTED"
    | "STALL_ENDED"
    | "ROUTE_CHANGED";
  detail: string;
};

export type TransferHealthSnapshot = {
  timestampMs: number;
  transferState: string;
  routeType: RawTransferMetrics["routeType"];
  routeDetail: string;
  currentThroughputBps: number | null;
  rollingThroughputBps: number | null;
  averageThroughputBps: number | null;
  peakThroughputBps: number | null;
  /** Bounded local source-read work rate, not a physical storage throughput claim. */
  senderReadBps: number | null;
  /** Bounded local destination-write work rate, not a physical storage throughput claim. */
  receiverWriteBps: number | null;
  senderBufferedAmountBytes: number | null;
  rollingAverageBufferedAmountBytes: number | null;
  peakBufferedAmountBytes: number | null;
  percentTimeAboveHighWater: number | null;
  percentTimeBelowLowWater: number | null;
  receiveQueueBytes: number | null;
  peakReceiveQueueBytes: number | null;
  percentTimeQueueNearLimit: number | null;
  rttMs: number | null;
  availableOutgoingBitrateBps: number | null;
  safeBytes: number;
  totalBytes: number;
  routeRecoveryCount: number;
  integrityRetryCount: number;
  routeChangeCount: number;
  timeSinceLastRouteChangeMs: number | null;
  stallDurationMs: number;
  stallCount: number;
  etaMs: number | null;
  healthState: TransferHealthState;
  bottleneck: TransferBottleneck;
  confidence: TransferHealthConfidence;
  reasons: readonly TransferHealthReason[];
  measurementAvailability: TransferHealthMetricAvailability;
  routeHistory: readonly TransferHealthRouteSegment[];
  events: readonly TransferHealthEvent[];
};

export type SpeedProofRecord = {
  schemaVersion: 1;
  transferId: string | null;
  durationMs: number;
  payloadBytes: number;
  averageThroughputBps: number | null;
  peakThroughputBps: number | null;
  averageSourceReadBps: number | null;
  averageDestinationWriteBps: number | null;
  routeHistory: readonly TransferHealthRouteSegment[];
  routeChangeCount: number;
  stallCount: number;
  stallDurationMs: number;
  integrityRetryCount: number;
  reconnectCount: number;
  dominantBottleneck: TransferBottleneck;
  bottleneckConfidence: TransferHealthConfidence;
  measurementAvailability: TransferHealthMetricAvailability;
};

export type TransferHealthConfig = {
  sampleIntervalMs: number;
  currentWindowMs: number;
  rollingWindowMs: number;
  warmupMs: number;
  minimumObservedBytes: number;
  maxSamples: number;
  maxEvents: number;
  maxRouteSegments: number;
  similarityRatio: number;
  headroomRatio: number;
  queueNearLimitRatio: number;
  highWaterRatio: number;
  lowWaterRatio: number;
  stallThresholdMs: number;
  hysteresisSamples: number;
  etaSmoothing: number;
};

export const defaultTransferHealthConfig: TransferHealthConfig = {
  sampleIntervalMs: 500,
  currentWindowMs: 1_000,
  rollingWindowMs: 5_000,
  warmupMs: 3_000,
  minimumObservedBytes: 256 * 1024,
  maxSamples: 120,
  maxEvents: 64,
  maxRouteSegments: 16,
  similarityRatio: 0.85,
  headroomRatio: 1.25,
  queueNearLimitRatio: 0.8,
  highWaterRatio: 0.8,
  lowWaterRatio: 0.2,
  stallThresholdMs: 3_000,
  hysteresisSamples: 3,
  etaSmoothing: 0.35
};

type Sample = RawTransferMetrics & { payloadBps: number | null };

const activeStates = new Set(["SENDING", "RECEIVING", "TRANSFER_BYTES_COMPLETE", "VERIFYING"]);

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function mean(values: readonly (number | null)[]): number | null {
  const available = values.filter((value): value is number => value !== null);
  if (!available.length) return null;
  return available.reduce((total, value) => total + value, 0) / available.length;
}

function peak(values: readonly (number | null)[]): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? Math.max(...available) : null;
}

function rate(samples: readonly Sample[], now: number, windowMs: number): number | null {
  if (samples.length < 2) return null;
  const first = samples.find((sample) => sample.timestampMs >= now - windowMs) ?? samples[0]!;
  const last = samples.at(-1)!;
  const elapsed = last.timestampMs - first.timestampMs;
  if (elapsed <= 0 || last.applicationPayloadBytes < first.applicationPayloadBytes) return null;
  return ((last.applicationPayloadBytes - first.applicationPayloadBytes) * 1000) / elapsed;
}

function confidenceFor(score: number): TransferHealthConfidence {
  return score >= 4 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW";
}

function isClose(value: number | null, target: number | null, ratio: number): boolean {
  if (value === null || target === null || target <= 0) return false;
  return value >= target * ratio && value <= target / ratio;
}

function hasHeadroom(value: number | null, target: number | null, ratio: number): boolean {
  return value !== null && target !== null && target > 0 && value >= target * ratio;
}

function availability(raw: RawTransferMetrics): TransferHealthMetricAvailability {
  return {
    applicationPayload: "OBSERVED",
    sourceRead: raw.sourceReadBps === null ? "UNAVAILABLE" : "OBSERVED",
    destinationWrite: raw.destinationWriteBps === null ? "UNAVAILABLE" : "OBSERVED",
    senderBufferedAmount: raw.senderBufferedAmountBytes === null ? "UNAVAILABLE" : "OBSERVED",
    receiveQueue: raw.receiveQueueBytes === null ? "UNAVAILABLE" : "OBSERVED",
    rtt: raw.rttMs === null ? "UNAVAILABLE" : "OBSERVED",
    availableOutgoingBitrate:
      raw.availableOutgoingBitrateBps === null ? "UNAVAILABLE" : "ESTIMATED",
    webRtcBytes:
      raw.webRtcBytesSent === null && raw.webRtcBytesReceived === null ? "UNAVAILABLE" : "OBSERVED",
    route: raw.routeType === "UNKNOWN" ? "UNAVAILABLE" : "OBSERVED"
  };
}

function initialSnapshot(timestampMs = 0): TransferHealthSnapshot {
  return {
    timestampMs,
    transferState: "IDLE",
    routeType: "UNKNOWN",
    routeDetail: "UNKNOWN",
    currentThroughputBps: null,
    rollingThroughputBps: null,
    averageThroughputBps: null,
    peakThroughputBps: null,
    senderReadBps: null,
    receiverWriteBps: null,
    senderBufferedAmountBytes: null,
    rollingAverageBufferedAmountBytes: null,
    peakBufferedAmountBytes: null,
    percentTimeAboveHighWater: null,
    percentTimeBelowLowWater: null,
    receiveQueueBytes: null,
    peakReceiveQueueBytes: null,
    percentTimeQueueNearLimit: null,
    rttMs: null,
    availableOutgoingBitrateBps: null,
    safeBytes: 0,
    totalBytes: 0,
    routeRecoveryCount: 0,
    integrityRetryCount: 0,
    routeChangeCount: 0,
    timeSinceLastRouteChangeMs: null,
    stallDurationMs: 0,
    stallCount: 0,
    etaMs: null,
    healthState: "UNKNOWN",
    bottleneck: "INSUFFICIENT_DATA",
    confidence: "LOW",
    reasons: [{ code: "MISSING_MEASUREMENTS", detail: "No active transfer measurements." }],
    measurementAvailability: {
      applicationPayload: "UNAVAILABLE",
      sourceRead: "UNAVAILABLE",
      destinationWrite: "UNAVAILABLE",
      senderBufferedAmount: "UNAVAILABLE",
      receiveQueue: "UNAVAILABLE",
      rtt: "UNAVAILABLE",
      availableOutgoingBitrate: "UNAVAILABLE",
      webRtcBytes: "UNAVAILABLE",
      route: "UNAVAILABLE"
    },
    routeHistory: [],
    events: []
  };
}

export class TransferHealthAnalyzer {
  private readonly config: TransferHealthConfig;
  private samples: Sample[] = [];
  private events: TransferHealthEvent[] = [];
  private routeHistory: TransferHealthRouteSegment[] = [];
  private transferId: string | null = null;
  private startedAtMs = 0;
  private inferenceStartedAtMs = 0;
  private startingPayloadBytes = 0;
  private lastProgressAtMs = 0;
  private stallStartedAtMs: number | null = null;
  private stallCount = 0;
  private totalStallMs = 0;
  private peakThroughputBps: number | null = null;
  private peakBufferedAmountBytes: number | null = null;
  private peakReceiveQueueBytes: number | null = null;
  private candidate: TransferBottleneck = "INSUFFICIENT_DATA";
  private candidateSamples = 0;
  private selected: TransferBottleneck = "INSUFFICIENT_DATA";
  private lastMeaningfulBottleneck: TransferBottleneck = "INSUFFICIENT_DATA";
  private lastMeaningfulConfidence: TransferHealthConfidence = "LOW";
  private smoothedEtaMs: number | null = null;
  private lastRouteChangedAtMs: number | null = null;
  private directBaselineBps: number | null = null;
  private snapshot = initialSnapshot();

  constructor(config: Partial<TransferHealthConfig> = {}) {
    this.config = { ...defaultTransferHealthConfig, ...config };
    if (
      this.config.maxSamples < 2 ||
      this.config.currentWindowMs < 100 ||
      this.config.rollingWindowMs < this.config.currentWindowMs ||
      this.config.hysteresisSamples < 1
    )
      throw new Error("Invalid Transfer Health configuration.");
  }

  current(): TransferHealthSnapshot {
    return this.snapshot;
  }

  /** Test-only visibility into the bounded sample ring; it exposes no transfer contents. */
  debugSampleCount(): number {
    return this.samples.length;
  }

  observe(input: RawTransferMetrics): TransferHealthSnapshot {
    const raw = this.normalize(input);
    if (this.transferId !== raw.transferId) this.reset(raw);
    const last = this.samples.at(-1);
    if (last && raw.timestampMs < last.timestampMs) return this.snapshot;

    if (last && (last.routeGeneration !== raw.routeGeneration || last.routeType !== raw.routeType))
      this.changeRoute(raw, last);

    if (last?.transferState === "PAUSED" && raw.transferState !== "PAUSED")
      this.restartInferenceWarmup(raw.timestampMs);

    const previousPayload = last?.applicationPayloadBytes ?? raw.applicationPayloadBytes;
    if (raw.applicationPayloadBytes > previousPayload) {
      this.lastProgressAtMs = raw.timestampMs;
      if (this.stallStartedAtMs !== null) {
        this.totalStallMs += raw.timestampMs - this.stallStartedAtMs;
        this.event(raw.timestampMs, "STALL_ENDED", "Payload progress resumed.");
        this.stallStartedAtMs = null;
      }
    }

    const sample: Sample = { ...raw, payloadBps: null };
    this.samples.push(sample);
    while (this.samples.length > this.config.maxSamples) this.samples.shift();
    sample.payloadBps = rate(this.samples, raw.timestampMs, this.config.currentWindowMs);

    const current = rate(this.samples, raw.timestampMs, this.config.currentWindowMs);
    const rolling = rate(this.samples, raw.timestampMs, this.config.rollingWindowMs);
    const elapsed = Math.max(raw.timestampMs - this.startedAtMs, 0);
    const inferenceElapsed = Math.max(raw.timestampMs - this.inferenceStartedAtMs, 0);
    const average =
      elapsed > 0
        ? ((raw.applicationPayloadBytes - this.startingPayloadBytes) * 1000) / elapsed
        : null;
    if (current !== null) this.peakThroughputBps = Math.max(this.peakThroughputBps ?? 0, current);

    const window = this.samples.filter(
      (entry) => entry.timestampMs >= raw.timestampMs - this.config.rollingWindowMs
    );
    const averageBuffered = mean(window.map((entry) => entry.senderBufferedAmountBytes));
    const peakBuffered = peak(window.map((entry) => entry.senderBufferedAmountBytes));
    const peakQueue = peak(window.map((entry) => entry.receiveQueueBytes));
    this.peakBufferedAmountBytes =
      Math.max(this.peakBufferedAmountBytes ?? 0, peakBuffered ?? 0) || null;
    this.peakReceiveQueueBytes = Math.max(this.peakReceiveQueueBytes ?? 0, peakQueue ?? 0) || null;
    const high = raw.senderHighWaterBytes;
    const queueLimit = raw.receiveQueueLimitBytes;
    const bufferedSamples = window.filter((entry) => entry.senderBufferedAmountBytes !== null);
    const queueSamples = window.filter((entry) => entry.receiveQueueBytes !== null);
    const aboveHigh =
      high === null || !bufferedSamples.length
        ? null
        : bufferedSamples.filter(
            (entry) => entry.senderBufferedAmountBytes! >= high * this.config.highWaterRatio
          ).length / bufferedSamples.length;
    const belowLow =
      high === null || !bufferedSamples.length
        ? null
        : bufferedSamples.filter(
            (entry) => entry.senderBufferedAmountBytes! <= high * this.config.lowWaterRatio
          ).length / bufferedSamples.length;
    const queueNearLimit =
      queueLimit === null || !queueSamples.length
        ? null
        : queueSamples.filter(
            (entry) => entry.receiveQueueBytes! >= queueLimit * this.config.queueNearLimitRatio
          ).length / queueSamples.length;

    const active = activeStates.has(raw.transferState);
    if (
      active &&
      inferenceElapsed >= this.config.warmupMs &&
      raw.applicationPayloadBytes >= this.config.minimumObservedBytes &&
      raw.timestampMs - this.lastProgressAtMs >= this.config.stallThresholdMs &&
      this.stallStartedAtMs === null
    ) {
      this.stallStartedAtMs = this.lastProgressAtMs;
      this.stallCount += 1;
      this.event(raw.timestampMs, "STALL_STARTED", "No payload progress during active transfer.");
    }

    const diagnosis = this.diagnose({
      raw,
      inferenceElapsed,
      current,
      rolling,
      average,
      averageBuffered,
      aboveHigh,
      belowLow,
      queueNearLimit,
      active
    });
    const bottleneck = this.applyHysteresis(diagnosis.bottleneck);
    const healthState = this.healthState(raw, diagnosis, bottleneck);
    if (
      active &&
      bottleneck !== "INSUFFICIENT_DATA" &&
      bottleneck !== "RECOVERING" &&
      bottleneck !== "NONE_DETECTED" &&
      healthState !== "STALLED"
    ) {
      this.lastMeaningfulBottleneck = bottleneck;
      this.lastMeaningfulConfidence = diagnosis.confidence;
    }
    const etaMs = this.estimateEta(raw, rolling, healthState);
    const finalStallDuration =
      this.stallStartedAtMs === null ? 0 : Math.max(raw.timestampMs - this.stallStartedAtMs, 0);

    this.snapshot = {
      timestampMs: raw.timestampMs,
      transferState: raw.transferState,
      routeType: raw.routeType,
      routeDetail: raw.routeDetail,
      currentThroughputBps: current,
      rollingThroughputBps: rolling,
      averageThroughputBps: average,
      peakThroughputBps: this.peakThroughputBps,
      senderReadBps: mean(window.map((entry) => entry.sourceReadBps)),
      receiverWriteBps: mean(window.map((entry) => entry.destinationWriteBps)),
      senderBufferedAmountBytes: raw.senderBufferedAmountBytes,
      rollingAverageBufferedAmountBytes: averageBuffered,
      peakBufferedAmountBytes: this.peakBufferedAmountBytes,
      percentTimeAboveHighWater: aboveHigh,
      percentTimeBelowLowWater: belowLow,
      receiveQueueBytes: raw.receiveQueueBytes,
      peakReceiveQueueBytes: this.peakReceiveQueueBytes,
      percentTimeQueueNearLimit: queueNearLimit,
      rttMs: raw.rttMs,
      availableOutgoingBitrateBps: raw.availableOutgoingBitrateBps,
      safeBytes: raw.safeBytes,
      totalBytes: raw.totalBytes,
      routeRecoveryCount: raw.routeRecoveryCount,
      integrityRetryCount: raw.integrityRetryCount,
      routeChangeCount: raw.routeChangeCount,
      timeSinceLastRouteChangeMs:
        this.lastRouteChangedAtMs === null ? null : raw.timestampMs - this.lastRouteChangedAtMs,
      stallDurationMs: finalStallDuration,
      stallCount: this.stallCount,
      etaMs,
      healthState,
      bottleneck,
      confidence: diagnosis.confidence,
      reasons: diagnosis.reasons,
      measurementAvailability: availability(raw),
      routeHistory: this.routeHistory.map((segment) => ({ ...segment })),
      events: this.events.map((event) => ({ ...event }))
    };
    return this.snapshot;
  }

  finalize(): SpeedProofRecord {
    const snapshot = this.snapshot;
    const last = this.samples.at(-1);
    const durationMs = last ? Math.max(last.timestampMs - this.startedAtMs, 0) : 0;
    return {
      schemaVersion: 1,
      transferId: this.transferId,
      durationMs,
      payloadBytes: last ? last.applicationPayloadBytes - this.startingPayloadBytes : 0,
      averageThroughputBps: snapshot.averageThroughputBps,
      peakThroughputBps: snapshot.peakThroughputBps,
      averageSourceReadBps: mean(this.samples.map((sample) => sample.sourceReadBps)),
      averageDestinationWriteBps: mean(this.samples.map((sample) => sample.destinationWriteBps)),
      routeHistory: this.finalizedRouteHistory(last),
      routeChangeCount: snapshot.routeChangeCount,
      stallCount: snapshot.stallCount,
      stallDurationMs: this.totalStallMs + snapshot.stallDurationMs,
      integrityRetryCount: snapshot.integrityRetryCount,
      reconnectCount: snapshot.routeRecoveryCount,
      dominantBottleneck: this.lastMeaningfulBottleneck,
      bottleneckConfidence: this.lastMeaningfulConfidence,
      measurementAvailability: snapshot.measurementAvailability
    };
  }

  private normalize(raw: RawTransferMetrics): RawTransferMetrics {
    if (!Number.isFinite(raw.timestampMs) || raw.timestampMs < 0)
      throw new Error("Transfer Health timestamp must be finite.");
    if (!Number.isSafeInteger(raw.applicationPayloadBytes) || raw.applicationPayloadBytes < 0)
      throw new Error("Transfer Health payload counter must be a safe non-negative integer.");
    if (!Number.isSafeInteger(raw.totalBytes) || raw.totalBytes < 0)
      throw new Error("Transfer Health total bytes must be a safe non-negative integer.");
    return {
      ...raw,
      sourceReadBps: finite(raw.sourceReadBps),
      destinationWriteBps: finite(raw.destinationWriteBps),
      senderBufferedAmountBytes: finite(raw.senderBufferedAmountBytes),
      receiveQueueBytes: finite(raw.receiveQueueBytes),
      rttMs: finite(raw.rttMs),
      availableOutgoingBitrateBps: finite(raw.availableOutgoingBitrateBps),
      webRtcBytesSent: finite(raw.webRtcBytesSent),
      webRtcBytesReceived: finite(raw.webRtcBytesReceived),
      senderHighWaterBytes: finite(raw.senderHighWaterBytes),
      receiveQueueLimitBytes: finite(raw.receiveQueueLimitBytes)
    };
  }

  private reset(raw: RawTransferMetrics): void {
    this.samples = [];
    this.events = [];
    this.routeHistory = [];
    this.transferId = raw.transferId;
    this.startedAtMs = raw.timestampMs;
    this.inferenceStartedAtMs = raw.timestampMs;
    this.startingPayloadBytes = raw.applicationPayloadBytes;
    this.lastProgressAtMs = raw.timestampMs;
    this.stallStartedAtMs = null;
    this.stallCount = 0;
    this.totalStallMs = 0;
    this.peakThroughputBps = null;
    this.peakBufferedAmountBytes = null;
    this.peakReceiveQueueBytes = null;
    this.candidate = "INSUFFICIENT_DATA";
    this.candidateSamples = 0;
    this.selected = "INSUFFICIENT_DATA";
    this.lastMeaningfulBottleneck = "INSUFFICIENT_DATA";
    this.lastMeaningfulConfidence = "LOW";
    this.smoothedEtaMs = null;
    this.lastRouteChangedAtMs = raw.timestampMs;
    this.directBaselineBps = null;
    this.routeHistory = [
      {
        routeType: raw.routeType,
        routeDetail: raw.routeDetail,
        startedAtMs: raw.timestampMs,
        endedAtMs: null,
        averageThroughputBps: null
      }
    ];
  }

  private changeRoute(raw: RawTransferMetrics, previous: Sample): void {
    const current = this.routeHistory.at(-1);
    if (current) {
      current.endedAtMs = raw.timestampMs;
      const routeSamples = this.samples.filter(
        (sample) =>
          sample.timestampMs >= current.startedAtMs && sample.timestampMs <= raw.timestampMs
      );
      current.averageThroughputBps = rate(routeSamples, raw.timestampMs, Number.MAX_SAFE_INTEGER);
      if (current.routeType === "DIRECT" && current.averageThroughputBps !== null)
        this.directBaselineBps = current.averageThroughputBps;
    }
    this.routeHistory.push({
      routeType: raw.routeType,
      routeDetail: raw.routeDetail,
      startedAtMs: raw.timestampMs,
      endedAtMs: null,
      averageThroughputBps: null
    });
    while (this.routeHistory.length > this.config.maxRouteSegments) this.routeHistory.shift();
    this.lastRouteChangedAtMs = raw.timestampMs;
    // Route conditions are incomparable across an ICE replacement. Retain whole-transfer totals but
    // restart short-window inference on the new path.
    this.samples = this.samples.filter((sample) => sample.timestampMs >= raw.timestampMs - 1);
    this.restartInferenceWarmup(raw.timestampMs);
    this.event(raw.timestampMs, "ROUTE_CHANGED", `${previous.routeType} to ${raw.routeType}`);
  }

  private restartInferenceWarmup(timestampMs: number): void {
    this.inferenceStartedAtMs = timestampMs;
    this.lastProgressAtMs = timestampMs;
    this.stallStartedAtMs = null;
    this.candidate = "INSUFFICIENT_DATA";
    this.candidateSamples = 0;
    this.selected = "INSUFFICIENT_DATA";
    this.smoothedEtaMs = null;
  }

  private finalizedRouteHistory(last: Sample | undefined): readonly TransferHealthRouteSegment[] {
    return this.routeHistory.map((segment, index) => {
      if (index !== this.routeHistory.length - 1 || !last || segment.endedAtMs !== null)
        return { ...segment };
      const routeSamples = this.samples.filter(
        (sample) => sample.timestampMs >= segment.startedAtMs
      );
      return {
        ...segment,
        averageThroughputBps: rate(routeSamples, last.timestampMs, Number.MAX_SAFE_INTEGER)
      };
    });
  }

  private diagnose(context: {
    raw: RawTransferMetrics;
    inferenceElapsed: number;
    current: number | null;
    rolling: number | null;
    average: number | null;
    averageBuffered: number | null;
    aboveHigh: number | null;
    belowLow: number | null;
    queueNearLimit: number | null;
    active: boolean;
  }): {
    bottleneck: TransferBottleneck;
    confidence: TransferHealthConfidence;
    reasons: TransferHealthReason[];
  } {
    const {
      raw,
      inferenceElapsed,
      current,
      rolling,
      averageBuffered,
      aboveHigh,
      belowLow,
      queueNearLimit,
      active
    } = context;
    const throughput = rolling ?? current;
    if (raw.transferState === "RECONNECTING")
      return {
        bottleneck: "RECOVERING",
        confidence: "HIGH",
        reasons: [
          { code: "RECOVERING", detail: "Route recovery is active; throughput is not diagnosed." }
        ]
      };
    if (raw.transferState === "PAUSED")
      return {
        bottleneck: "INSUFFICIENT_DATA",
        confidence: "HIGH",
        reasons: [
          {
            code: "PAUSED",
            detail:
              "Transfer is intentionally paused; stall and bottleneck inference are suppressed."
          }
        ]
      };
    if (!active)
      return {
        bottleneck: "INSUFFICIENT_DATA",
        confidence: "LOW",
        reasons: [
          { code: "MISSING_MEASUREMENTS", detail: "Transfer is not actively moving payload." }
        ]
      };
    if (
      inferenceElapsed < this.config.warmupMs ||
      raw.applicationPayloadBytes < this.config.minimumObservedBytes
    )
      return {
        bottleneck: "INSUFFICIENT_DATA",
        confidence: "LOW",
        reasons: [
          {
            code: "WARMUP",
            detail: "Waiting for the configured observation period and payload minimum."
          }
        ]
      };
    if (this.stallStartedAtMs !== null)
      return {
        bottleneck: "INSUFFICIENT_DATA",
        confidence: "MEDIUM",
        reasons: [
          {
            code: "NO_PROGRESS",
            detail: "No payload progress occurred during the stall threshold."
          }
        ]
      };
    if (throughput === null || throughput <= 0)
      return {
        bottleneck: "INSUFFICIENT_DATA",
        confidence: "LOW",
        reasons: [
          {
            code: "MISSING_MEASUREMENTS",
            detail: "A stable payload throughput window is unavailable."
          }
        ]
      };

    const sourceTracks = isClose(raw.sourceReadBps, throughput, this.config.similarityRatio);
    const destinationTracks = isClose(
      raw.destinationWriteBps,
      throughput,
      this.config.similarityRatio
    );
    const sourceHeadroom = hasHeadroom(raw.sourceReadBps, throughput, this.config.headroomRatio);
    const destinationHeadroom = hasHeadroom(
      raw.destinationWriteBps,
      throughput,
      this.config.headroomRatio
    );
    const bufferDrains = belowLow !== null && belowLow >= 0.6;
    const bufferPressure = aboveHigh !== null && aboveHigh >= 0.6;
    const queuePressure = queueNearLimit !== null && queueNearLimit >= 0.5;
    const reasons: TransferHealthReason[] = [];

    if (
      raw.routeType === "RELAY" &&
      this.directBaselineBps !== null &&
      throughput < this.directBaselineBps * 0.75
    ) {
      reasons.push({
        code: "RELAY_DIRECT_BASELINE",
        detail: "The relay segment is materially below this transfer's direct segment."
      });
      return { bottleneck: "LIKELY_RELAY_LIMIT", confidence: "MEDIUM", reasons };
    }
    if (sourceTracks && destinationHeadroom && bufferDrains) {
      reasons.push(
        {
          code: "SOURCE_TRACKS_PAYLOAD",
          detail: "Observed source read rate closely tracks payload throughput."
        },
        {
          code: "DESTINATION_HAS_HEADROOM",
          detail: "Destination writes are materially above payload throughput."
        },
        {
          code: "BUFFER_DRAINS",
          detail: "The sender queue frequently drains below its low-water band."
        }
      );
      if (hasHeadroom(raw.availableOutgoingBitrateBps, throughput, this.config.headroomRatio))
        reasons.push({
          code: "BROWSER_BITRATE_ESTIMATE",
          detail: "The browser estimate is above payload throughput."
        });
      return {
        bottleneck: "LIKELY_SOURCE_READ_LIMIT",
        confidence: confidenceFor(reasons.length),
        reasons
      };
    }
    if (destinationTracks && sourceHeadroom && queuePressure) {
      reasons.push(
        {
          code: "DESTINATION_TRACKS_PAYLOAD",
          detail: "Completed destination writes closely track payload throughput."
        },
        {
          code: "SOURCE_HAS_HEADROOM",
          detail: "Observed source production is materially above payload throughput."
        },
        {
          code: "RECEIVE_QUEUE_PRESSURE",
          detail: "The receiver backlog frequently approaches its bounded limit."
        }
      );
      return {
        bottleneck: "LIKELY_DESTINATION_WRITE_LIMIT",
        confidence: confidenceFor(reasons.length),
        reasons
      };
    }
    if (sourceHeadroom && destinationHeadroom && bufferPressure) {
      reasons.push(
        {
          code: "SOURCE_HAS_HEADROOM",
          detail: "Observed source production is materially above payload throughput."
        },
        {
          code: "DESTINATION_HAS_HEADROOM",
          detail: "Completed destination writes are materially above payload throughput."
        },
        {
          code: "BUFFER_PRESSURE",
          detail: "The sender DataChannel queue frequently approaches high water."
        }
      );
      if (raw.availableOutgoingBitrateBps !== null)
        reasons.push({
          code: "BROWSER_BITRATE_ESTIMATE",
          detail: "A browser-provided capacity estimate is available for this route."
        });
      return {
        bottleneck: "LIKELY_NETWORK_LIMIT",
        confidence: confidenceFor(reasons.length),
        reasons
      };
    }
    if (
      bufferPressure ||
      (averageBuffered !== null &&
        raw.senderHighWaterBytes !== null &&
        averageBuffered >= raw.senderHighWaterBytes * this.config.highWaterRatio)
    ) {
      return {
        bottleneck: "BACKPRESSURE_LIMIT",
        confidence: "MEDIUM",
        reasons: [
          {
            code: "BUFFER_PRESSURE",
            detail: "The bounded sender queue is sustaining high-water pressure."
          }
        ]
      };
    }
    return {
      bottleneck: "NONE_DETECTED",
      confidence: "LOW",
      reasons: [
        {
          code: "MISSING_MEASUREMENTS",
          detail: "No supported bottleneck rule has enough agreeing evidence."
        }
      ]
    };
  }

  private applyHysteresis(candidate: TransferBottleneck): TransferBottleneck {
    if (candidate === "RECOVERING" || candidate === "INSUFFICIENT_DATA") {
      this.candidate = candidate;
      this.candidateSamples = this.config.hysteresisSamples;
      this.selected = candidate;
      return this.selected;
    }
    if (candidate === this.candidate) this.candidateSamples += 1;
    else {
      this.candidate = candidate;
      this.candidateSamples = 1;
    }
    if (this.candidateSamples >= this.config.hysteresisSamples && candidate !== this.selected) {
      this.selected = candidate;
      this.event(this.samples.at(-1)?.timestampMs ?? 0, "BOTTLENECK_CHANGED", candidate);
    }
    return this.selected;
  }

  private healthState(
    raw: RawTransferMetrics,
    diagnosis: { bottleneck: TransferBottleneck },
    bottleneck: TransferBottleneck
  ): TransferHealthState {
    if (raw.transferState === "RECONNECTING" || diagnosis.bottleneck === "RECOVERING")
      return "RECOVERING";
    if (raw.transferState === "PAUSED") return "PAUSED";
    if (this.stallStartedAtMs !== null) return "STALLED";
    if (diagnosis.bottleneck === "INSUFFICIENT_DATA")
      return activeStates.has(raw.transferState) ? "STARTING" : "UNKNOWN";
    const state = bottleneck === "NONE_DETECTED" ? "GOOD" : "DEGRADED";
    if (state !== this.snapshot.healthState) {
      this.event(raw.timestampMs, state === "GOOD" ? "HEALTH_GOOD" : "HEALTH_DEGRADED", state);
    }
    return state;
  }

  private estimateEta(
    raw: RawTransferMetrics,
    throughput: number | null,
    state: TransferHealthState
  ): number | null {
    if ((state !== "GOOD" && state !== "DEGRADED") || throughput === null || throughput <= 0) {
      this.smoothedEtaMs = null;
      return null;
    }
    const remaining = Math.max(raw.totalBytes - raw.applicationPayloadBytes, 0);
    const rawEta = (remaining * 1000) / throughput;
    this.smoothedEtaMs =
      this.smoothedEtaMs === null
        ? rawEta
        : this.smoothedEtaMs * (1 - this.config.etaSmoothing) + rawEta * this.config.etaSmoothing;
    return this.smoothedEtaMs;
  }

  private event(atMs: number, type: TransferHealthEvent["type"], detail: string): void {
    this.events.push({ atMs, type, detail });
    while (this.events.length > this.config.maxEvents) this.events.shift();
  }
}

export function createInitialTransferHealthSnapshot(): TransferHealthSnapshot {
  return initialSnapshot();
}
