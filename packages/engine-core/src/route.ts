import type { IceRoutePolicy, RouteDiagnostics, RouteType } from "@flicksend/transport-webrtc";

export type RouteState = "CONNECTING" | "DIRECT" | "FAILED" | "RELAY" | "UNKNOWN" | "RECOVERING";

export type RouteSnapshot = RouteDiagnostics & {
  policy: IceRoutePolicy;
  state: RouteState;
  routeGeneration: number;
  routeChangeCount: number;
  directConnectionAttempts: number;
  relayConnectionAttempts: number;
  iceRestartCount: number;
  peerConnectionReplacementCount: number;
  routeRecoveryMs: number | null;
  routeRecoveryToFirstPayloadMs: number | null;
  failureCode: string | null;
};

const unknownDiagnostics: RouteDiagnostics = {
  routeType: "UNKNOWN",
  routeDetail: "UNKNOWN",
  localCandidateType: "unknown",
  remoteCandidateType: "unknown",
  protocol: "unknown",
  transportProtocol: "unknown",
  relayProtocol: null,
  candidatePairState: null,
  rttMs: null,
  availableOutgoingBitrate: null,
  bytesSent: null,
  bytesReceived: null
};

export const initialRouteSnapshot: RouteSnapshot = {
  ...unknownDiagnostics,
  policy: "AUTO",
  state: "UNKNOWN",
  routeGeneration: 0,
  routeChangeCount: 0,
  directConnectionAttempts: 0,
  relayConnectionAttempts: 0,
  iceRestartCount: 0,
  peerConnectionReplacementCount: 0,
  routeRecoveryMs: null,
  routeRecoveryToFirstPayloadMs: null,
  failureCode: null
};

/**
 * Owns route generations and timing independently from transfer state. A replacement network path
 * can become authoritative only for its current generation; stale callbacks are ignored.
 */
export class RouteCoordinator {
  private snapshot: RouteSnapshot = { ...initialRouteSnapshot };
  private latestKnownRoute: RouteType = "UNKNOWN";
  private recoveryStartedAt: number | null = null;
  private recoveryConnectedAt: number | null = null;

  current(): RouteSnapshot {
    return this.snapshot;
  }

  beginTransport(
    policy: IceRoutePolicy,
    replacing: boolean
  ): { generation: number; snapshot: RouteSnapshot } {
    const routeGeneration = this.snapshot.routeGeneration + 1;
    this.snapshot = {
      ...this.snapshot,
      ...unknownDiagnostics,
      policy,
      state: this.recoveryStartedAt === null ? "CONNECTING" : "RECOVERING",
      routeGeneration,
      directConnectionAttempts:
        this.snapshot.directConnectionAttempts + (policy === "AUTO" ? 1 : 0),
      relayConnectionAttempts:
        this.snapshot.relayConnectionAttempts + (policy === "RELAY_ONLY" ? 1 : 0),
      peerConnectionReplacementCount:
        this.snapshot.peerConnectionReplacementCount + (replacing ? 1 : 0),
      failureCode: null
    };
    return { generation: routeGeneration, snapshot: this.snapshot };
  }

  isCurrent(generation: number): boolean {
    return generation === this.snapshot.routeGeneration;
  }

  markInterrupted(generation: number): RouteSnapshot | null {
    if (!this.isCurrent(generation)) return null;
    if (this.recoveryStartedAt === null) this.recoveryStartedAt = performance.now();
    this.recoveryConnectedAt = null;
    this.snapshot = { ...this.snapshot, state: "RECOVERING", failureCode: null };
    return this.snapshot;
  }

  observeRoute(generation: number, diagnostics: RouteDiagnostics): RouteSnapshot | null {
    if (!this.isCurrent(generation)) return null;
    const routeType = diagnostics.routeType;
    const routeChangeCount =
      routeType !== "UNKNOWN" &&
      this.latestKnownRoute !== "UNKNOWN" &&
      this.latestKnownRoute !== routeType
        ? this.snapshot.routeChangeCount + 1
        : this.snapshot.routeChangeCount;
    if (routeType !== "UNKNOWN") this.latestKnownRoute = routeType;
    if (routeType !== "UNKNOWN" && this.recoveryStartedAt !== null) {
      this.recoveryConnectedAt = performance.now();
    }
    this.snapshot = {
      ...this.snapshot,
      ...diagnostics,
      state:
        routeType === "DIRECT" ? "DIRECT" : routeType === "RELAY" ? "RELAY" : this.snapshot.state,
      routeChangeCount,
      routeRecoveryMs:
        routeType !== "UNKNOWN" && this.recoveryStartedAt !== null
          ? performance.now() - this.recoveryStartedAt
          : this.snapshot.routeRecoveryMs,
      failureCode: null
    };
    return this.snapshot;
  }

  markFirstResumedPayload(generation: number): RouteSnapshot | null {
    if (!this.isCurrent(generation) || this.recoveryConnectedAt === null) return null;
    this.snapshot = {
      ...this.snapshot,
      routeRecoveryToFirstPayloadMs: performance.now() - this.recoveryConnectedAt
    };
    this.recoveryStartedAt = null;
    this.recoveryConnectedAt = null;
    return this.snapshot;
  }

  markIceRestart(generation: number): RouteSnapshot | null {
    if (!this.isCurrent(generation)) return null;
    this.snapshot = { ...this.snapshot, iceRestartCount: this.snapshot.iceRestartCount + 1 };
    return this.snapshot;
  }

  markFailure(generation: number, code: string): RouteSnapshot | null {
    if (!this.isCurrent(generation)) return null;
    this.snapshot = { ...this.snapshot, state: "FAILED", failureCode: code };
    return this.snapshot;
  }

  invalidate(): RouteSnapshot {
    this.snapshot = {
      ...this.snapshot,
      routeGeneration: this.snapshot.routeGeneration + 1,
      state: "UNKNOWN",
      failureCode: null
    };
    this.recoveryStartedAt = null;
    this.recoveryConnectedAt = null;
    return this.snapshot;
  }
}
