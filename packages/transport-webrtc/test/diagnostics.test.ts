import { describe, expect, it } from "vitest";
import {
  HttpIceConfigurationProvider,
  TurnCredentialError,
  selectedRouteDiagnostics
} from "../src/index.js";

describe("selectedRouteDiagnostics", () => {
  it("reports the selected candidate pair without exposing addresses", () => {
    const stats = new Map<string, RTCStats>([
      [
        "pair",
        {
          id: "pair",
          type: "candidate-pair",
          timestamp: 0,
          state: "succeeded",
          nominated: true,
          localCandidateId: "local",
          remoteCandidateId: "remote",
          currentRoundTripTime: 0.012
        } as RTCStats
      ],
      [
        "local",
        {
          id: "local",
          type: "local-candidate",
          timestamp: 0,
          candidateType: "host",
          protocol: "udp"
        } as RTCStats
      ],
      [
        "remote",
        { id: "remote", type: "remote-candidate", timestamp: 0, candidateType: "host" } as RTCStats
      ]
    ]) as unknown as RTCStatsReport;

    expect(selectedRouteDiagnostics(stats)).toEqual({
      routeType: "DIRECT",
      routeDetail: "DIRECT_HOST",
      localCandidateType: "host",
      remoteCandidateType: "host",
      protocol: "udp",
      transportProtocol: "udp",
      relayProtocol: null,
      candidatePairState: "succeeded",
      rttMs: 12,
      availableOutgoingBitrate: null,
      bytesSent: null,
      bytesReceived: null
    });
  });

  it("classifies selected relay candidates by relay protocol", () => {
    const stats = new Map<string, RTCStats>([
      [
        "transport",
        {
          id: "transport",
          type: "transport",
          timestamp: 0,
          selectedCandidatePairId: "pair"
        } as RTCStats
      ],
      [
        "pair",
        {
          id: "pair",
          type: "candidate-pair",
          timestamp: 0,
          state: "succeeded",
          localCandidateId: "local",
          remoteCandidateId: "remote",
          availableOutgoingBitrate: 123_456,
          bytesSent: 5,
          bytesReceived: 7
        } as RTCStats
      ],
      [
        "local",
        {
          id: "local",
          type: "local-candidate",
          timestamp: 0,
          candidateType: "relay",
          protocol: "tcp",
          relayProtocol: "tls"
        } as RTCStats
      ],
      [
        "remote",
        {
          id: "remote",
          type: "remote-candidate",
          timestamp: 0,
          candidateType: "srflx",
          protocol: "tcp"
        } as RTCStats
      ]
    ]) as unknown as RTCStatsReport;

    expect(selectedRouteDiagnostics(stats)).toMatchObject({
      routeType: "RELAY",
      routeDetail: "RELAY_TLS",
      localCandidateType: "relay",
      remoteCandidateType: "srflx",
      transportProtocol: "tcp",
      relayProtocol: "tls",
      availableOutgoingBitrate: 123_456,
      bytesSent: 5,
      bytesReceived: 7
    });
  });

  it("returns explicit unknown diagnostics when selected-pair stats are unavailable", () => {
    expect(selectedRouteDiagnostics(new Map() as unknown as RTCStatsReport)).toMatchObject({
      routeType: "UNKNOWN",
      routeDetail: "UNKNOWN",
      localCandidateType: "unknown",
      remoteCandidateType: "unknown",
      rttMs: null,
      bytesSent: null,
      bytesReceived: null
    });
  });
});

describe("HttpIceConfigurationProvider", () => {
  it("creates relay-only ICE configuration from short-lived server credentials", async () => {
    const provider = new HttpIceConfigurationProvider(
      "https://signal.test/turn-credentials",
      async () =>
        Response.json({
          stunUrls: ["stun:turn.test:3478"],
          turnUrls: ["turn:turn.test:3478?transport=udp", "turn:turn.test:3478?transport=tcp"],
          username: "123:peer",
          credential: "short-lived"
        })
    );

    await expect(
      provider.getConfiguration({
        sessionCode: "123456",
        peerId: crypto.randomUUID(),
        policy: "RELAY_ONLY"
      })
    ).resolves.toMatchObject({
      iceTransportPolicy: "relay",
      iceServers: [
        { urls: ["stun:turn.test:3478"] },
        {
          urls: ["turn:turn.test:3478?transport=udp", "turn:turn.test:3478?transport=tcp"],
          username: "123:peer",
          credential: "short-lived"
        }
      ]
    });
  });

  it("returns the server's explicit credential failure without exposing response details", async () => {
    const provider = new HttpIceConfigurationProvider(
      "https://signal.test/turn-credentials",
      async () =>
        Response.json(
          { code: "FS_TURN_AUTH_FAILED", detail: "secret-not-for-client" },
          { status: 401 }
        )
    );

    await expect(
      provider.getConfiguration({
        sessionCode: "123456",
        peerId: crypto.randomUUID(),
        policy: "AUTO"
      })
    ).rejects.toEqual(new TurnCredentialError("FS_TURN_AUTH_FAILED"));
  });

  it("requests fresh credentials for each replacement configuration", async () => {
    let requests = 0;
    const provider = new HttpIceConfigurationProvider(
      "https://signal.test/turn-credentials",
      async () => {
        requests += 1;
        return Response.json({
          stunUrls: [],
          turnUrls: ["turn:turn.test:3478?transport=udp"],
          username: `180000000${requests}:peer`,
          credential: `credential-${requests}`
        });
      }
    );
    const request = {
      sessionCode: "123456",
      peerId: crypto.randomUUID(),
      policy: "RELAY_ONLY" as const
    };

    const first = await provider.getConfiguration(request);
    const second = await provider.getConfiguration(request);
    expect(requests).toBe(2);
    expect(first.iceServers[0]?.username).not.toBe(second.iceServers[0]?.username);
  });
});
