import { describe, expect, it, vi } from "vitest";
import { TurnCredentialError } from "@flicksend/transport-webrtc";
import { ProductionIceConfigurationProvider } from "./turn-client";

const capability = `fsst1.${"a".repeat(32)}.${"b".repeat(43)}`;

describe("P14 browser ICE adapter", () => {
  it("sends only the capability to the Railway credential route and returns ephemeral ICE", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        ok: true,
        configuration: {
          credential: "ephemeral",
          expiresAtMs: Date.now() + 60_000,
          stunUrls: ["stun:stun.example:3478"],
          turnUrls: ["turn:turn.example:3478?transport=udp"],
          username: "1800000000:opaque-token-id"
        }
      })
    );
    const provider = new ProductionIceConfigurationProvider(capability, fetcher);

    await expect(
      provider.getConfiguration({ peerId: "peer-id", policy: "RELAY_ONLY" } as never)
    ).resolves.toEqual({
      iceServers: [
        { urls: ["stun:stun.example:3478"] },
        {
          credential: "ephemeral",
          urls: ["turn:turn.example:3478?transport=udp"],
          username: "1800000000:opaque-token-id"
        }
      ],
      iceTransportPolicy: "relay"
    });
    expect(fetcher).toHaveBeenCalledWith("/api/persistence/signaling/turn-credentials", {
      body: JSON.stringify({ capability }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
  });

  it("maps safe route errors and rejects malformed or expired configuration", async () => {
    const unauthorized = new ProductionIceConfigurationProvider(capability, async () =>
      Response.json({ error: "FS_TURN_AUTH_FAILED" }, { status: 401 })
    );
    await expect(
      unauthorized.getConfiguration({ peerId: "peer-id", policy: "AUTO" } as never)
    ).rejects.toEqual(new TurnCredentialError("FS_TURN_AUTH_FAILED"));

    const expired = new ProductionIceConfigurationProvider(capability, async () =>
      Response.json({
        ok: true,
        configuration: {
          credential: "ephemeral",
          expiresAtMs: Date.now() - 1,
          stunUrls: [],
          turnUrls: ["turn:turn.example:3478?transport=tcp"],
          username: "1800000000:opaque-token-id"
        }
      })
    );
    await expect(
      expired.getConfiguration({ peerId: "peer-id", policy: "AUTO" } as never)
    ).rejects.toEqual(new TurnCredentialError("FS_TURN_CREDENTIAL_UNAVAILABLE"));
  });
});
