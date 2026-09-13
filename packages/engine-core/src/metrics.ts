import type { TransferTuning } from "./tuning.js";

export type TransferMetrics = {
  bytesTotal: number;
  effectiveFramePayloadBytes: number | null;
  bytesSent: number;
  bytesReceived: number;
  currentThroughputBps: number;
  averageThroughputBps: number;
  peakThroughputBps: number;
  /** Bounded local source-read work rate; never present this as physical storage throughput. */
  sourceReadBps: number;
  /** Bounded local destination-write work rate; never present this as physical storage throughput. */
  destinationWriteBps: number;
  bufferedAmountBytes: number;
  receiveQueueBytes: number;
  elapsedMs: number;
  frameCount: number;
  stalledMs: number;
  timeToFirstByteMs: number | null;
  timeToFirstReadMs: number | null;
  timeToFirstFrameQueuedMs: number | null;
  timeToFirstFrameReceivedMs: number | null;
  timeToFirstDestinationWriteMs: number | null;
  samples: readonly TransferMetricSample[];
};

export type TransferMetricSample = {
  elapsedMs: number;
  bytesSent: number;
  bytesReceived: number;
  bufferedAmountBytes: number;
  receiveQueueBytes: number;
  throughputBps: number;
  sourceReadBps: number;
  destinationWriteBps: number;
};

export const initialTransferMetrics: TransferMetrics = {
  bytesTotal: 0,
  effectiveFramePayloadBytes: null,
  bytesSent: 0,
  bytesReceived: 0,
  currentThroughputBps: 0,
  averageThroughputBps: 0,
  peakThroughputBps: 0,
  sourceReadBps: 0,
  destinationWriteBps: 0,
  bufferedAmountBytes: 0,
  receiveQueueBytes: 0,
  elapsedMs: 0,
  frameCount: 0,
  stalledMs: 0,
  timeToFirstByteMs: null,
  timeToFirstReadMs: null,
  timeToFirstFrameQueuedMs: null,
  timeToFirstFrameReceivedMs: null,
  timeToFirstDestinationWriteMs: null,
  samples: []
};

type TimedBytes = { at: number; bytes: number; workMs?: number };

export class TransferMetricTracker {
  private readonly samples: TimedBytes[] = [];
  private startedAt = 0;
  private bytes = 0;
  private peak = 0;
  private workElapsedMs = 0;

  constructor(private readonly tuning: TransferTuning) {}

  start(now = performance.now()): void {
    this.startedAt = now;
  }

  record(
    bytes: number,
    now = performance.now()
  ): { currentBps: number; averageBps: number; peakBps: number } {
    this.bytes += bytes;
    this.samples.push({ at: now, bytes });
    const windowStart = Math.max(this.startedAt, now - this.tuning.throughputWindowMs);
    while (this.samples.length > 1 && this.samples[0]!.at <= windowStart) this.samples.shift();
    const windowBytes = this.samples.reduce((total, sample) => total + sample.bytes, 0);
    const windowMs = Math.max(now - windowStart, 1);
    // A single frame measured in a sub-millisecond interval is not a throughput measurement.
    const hasStableWindow = now - this.startedAt >= 250;
    const currentBps = hasStableWindow ? (windowBytes * 1000) / windowMs : 0;
    if (hasStableWindow) this.peak = Math.max(this.peak, currentBps);
    return {
      currentBps,
      averageBps: (this.bytes * 1000) / Math.max(now - this.startedAt, 1),
      peakBps: this.peak
    };
  }

  /**
   * Measures bounded adapter work by its own elapsed time. This is not physical device throughput:
   * a memory-backed browser adapter can complete one bounded operation much faster than storage.
   */
  recordWork(
    bytes: number,
    startedAt: number,
    now = performance.now()
  ): { currentBps: number; averageBps: number; peakBps: number } {
    const workMs = Math.max(now - startedAt, 0.1);
    this.bytes += bytes;
    this.workElapsedMs += workMs;
    this.samples.push({ at: now, bytes, workMs });
    const windowStart = Math.max(this.startedAt, now - this.tuning.throughputWindowMs);
    while (this.samples.length > 1 && this.samples[0]!.at <= windowStart) this.samples.shift();
    const windowBytes = this.samples.reduce((total, sample) => total + sample.bytes, 0);
    const windowWorkMs = this.samples.reduce((total, sample) => total + (sample.workMs ?? 0), 0);
    const currentBps = (windowBytes * 1000) / Math.max(windowWorkMs, 0.1);
    const averageBps = (this.bytes * 1000) / Math.max(this.workElapsedMs, 0.1);
    this.peak = Math.max(this.peak, currentBps);
    return { currentBps, averageBps, peakBps: this.peak };
  }

  elapsed(now = performance.now()): number {
    return this.startedAt === 0 ? 0 : Math.max(now - this.startedAt, 0);
  }
}
