import { afterEach, describe, expect, it, vi } from "vitest";

import { issueSignalingSession } from "../../../../signaling/capabilities.server";
import { POST } from "./route";

const signalingSecret = "s".repeat(48);
const turnSharedSecret = "t".repeat(48);
const originalEnvironment = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
  vi.stubGlobal("fetch", originalFetch);
});

describe("P14 TURN credential route", () => {
  it("returns only the safe ICE DTO for a valid sender or guest receiver capability", async () => {
    configure();
    vi.stubGlobal("fetch", async () => Response.json({ category: "ELIGIBLE", eligible: true }));
    const session = issueSignalingSession();
    const response = await POST(
      new Request("https://app.example/api/persistence/signaling/turn-credentials", {
        body: JSON.stringify({ capability: session.sender.accessToken }),
        method: "POST"
      })
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { configuration?: unknown; ok?: unknown };
    expect(body.ok).toBe(true);
    expect(JSON.stringify(body.configuration)).not.toContain(turnSharedSecret);
  });

  it("rejects malformed or oversized body values without account input", async () => {
    configure();
    const response = await POST(
      new Request("https://app.example/api/persistence/signaling/turn-credentials", {
        body: JSON.stringify({ accountId: "not-authority", capability: "x".repeat(2_100) }),
        method: "POST"
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "FS_TURN_AUTH_FAILED", ok: false });
  });
});

function configure(): void {
  process.env.NEXT_PUBLIC_PRODUCTION_SIGNALING_URL = "wss://signaling.example";
  process.env.SIGNALING_CAPABILITY_SECRET = signalingSecret;
  process.env.STUN_URLS = "stun:stun.example:3478";
  process.env.TURN_CREDENTIAL_TTL_SECONDS = "1800";
  process.env.TURN_SHARED_SECRET = turnSharedSecret;
  process.env.TURN_URLS = "turn:turn.example:3478?transport=udp";
}
