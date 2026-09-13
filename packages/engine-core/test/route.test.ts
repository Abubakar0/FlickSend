import { describe, expect, it } from "vitest";
import { RouteCoordinator } from "../src/route.js";

const direct = {
  routeType: "DIRECT" as const,
  routeDetail: "DIRECT_HOST" as const,
  localCandidateType: "host" as const,
  remoteCandidateType: "host" as const,
  protocol: "udp" as const,
  transportProtocol: "udp" as const,
  relayProtocol: null,
  candidatePairState: "succeeded",
  rttMs: 4,
  availableOutgoingBitrate: null,
  bytesSent: 1,
  bytesReceived: 1
};

const relay = {
  ...direct,
  routeType: "RELAY" as const,
  routeDetail: "RELAY_TCP" as const,
  localCandidateType: "relay" as const,
  transportProtocol: "tcp" as const,
  protocol: "tcp" as const,
  relayProtocol: "tcp" as const
};

describe("RouteCoordinator", () => {
  it("tracks a direct to relay replacement without changing transfer-independent route generation", () => {
    const routes = new RouteCoordinator();
    const first = routes.beginTransport("AUTO", false);
    expect(routes.observeRoute(first.generation, direct)?.state).toBe("DIRECT");
    routes.markInterrupted(first.generation);
    const replacement = routes.beginTransport("RELAY_ONLY", true);
    const snapshot = routes.observeRoute(replacement.generation, relay)!;

    expect(snapshot.routeGeneration).toBe(2);
    expect(snapshot.routeChangeCount).toBe(1);
    expect(snapshot.directConnectionAttempts).toBe(1);
    expect(snapshot.relayConnectionAttempts).toBe(1);
    expect(snapshot.peerConnectionReplacementCount).toBe(1);
    expect(snapshot.state).toBe("RELAY");
    expect(snapshot.routeRecoveryMs).not.toBeNull();
  });

  it("rejects stale callbacks after a replacement route becomes authoritative", () => {
    const routes = new RouteCoordinator();
    const first = routes.beginTransport("AUTO", false);
    routes.markInterrupted(first.generation);
    const second = routes.beginTransport("RELAY_ONLY", true);

    expect(routes.observeRoute(first.generation, direct)).toBeNull();
    expect(routes.markFailure(first.generation, "FS_ROUTE_RECOVERY_FAILED")).toBeNull();
    expect(routes.observeRoute(second.generation, relay)?.routeType).toBe("RELAY");
    expect(routes.current().failureCode).toBeNull();
  });

  it("does not allow a late route callback after cancellation invalidates the generation", () => {
    const routes = new RouteCoordinator();
    const first = routes.beginTransport("RELAY_ONLY", false);
    routes.markInterrupted(first.generation);
    routes.invalidate();

    expect(routes.observeRoute(first.generation, relay)).toBeNull();
    expect(routes.current().state).toBe("UNKNOWN");
  });

  it("records an explicit bounded route exhaustion without resetting route history", () => {
    const routes = new RouteCoordinator();
    const directAttempt = routes.beginTransport("AUTO", false);
    routes.observeRoute(directAttempt.generation, direct);
    routes.markInterrupted(directAttempt.generation);
    const relayAttempt = routes.beginTransport("RELAY_ONLY", true);
    const exhausted = routes.markFailure(relayAttempt.generation, "FS_ROUTE_EXHAUSTED");

    expect(exhausted).toMatchObject({
      state: "FAILED",
      failureCode: "FS_ROUTE_EXHAUSTED",
      directConnectionAttempts: 1,
      relayConnectionAttempts: 1,
      peerConnectionReplacementCount: 1
    });
  });
});
