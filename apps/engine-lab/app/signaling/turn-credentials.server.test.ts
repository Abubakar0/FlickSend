import { afterEach, describe, expect, it, vi } from "vitest";

import { issueSignalingSession } from "./capabilities.server";
import {
  TurnCredentialService,
  TurnCredentialServiceError
} from "./turn-credentials.server";

const signalingSecret = "s".repeat(48);
const turnSharedSecret = "t".repeat(48);
const originalEnvironment = { ...process.env };
const issuedAtMs = Date.now();

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe("P14 TURN credential issuer", () => {
  it("returns a bounded, ephemeral client ICE DTO without the TURN shared secret", async () => {
    configure();
    const capability = issueSignalingSession().sender.accessToken;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://signaling.example/v2/relay-eligibility");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${capability}`);
      return Response.json({ category: "ELIGIBLE", eligible: true });
    });
    const service = new TurnCredentialService({ fetchImpl, now: () => issuedAtMs });

    const configuration = await service.issue({ capability });

    expect(configuration).toEqual({
      credential: expect.any(String),
      expiresAtMs: issuedAtMs + 1_800_000,
      stunUrls: ["stun:stun.example:3478"],
      turnUrls: ["turn:turn.example:3478?transport=udp"],
      username: expect.stringMatching(/^\d+:[A-Za-z0-9_-]{22}$/)
    });
    expect(JSON.stringify(configuration)).not.toContain(turnSharedSecret);
  });

  it("rejects expired capability and receiver state rejected by the Worker", async () => {
    configure();
    const session = issueSignalingSession();
    const expired = new TurnCredentialService({ now: () => Date.now() + 11 * 60_000 });
    await expect(expired.issue({ capability: session.sender.accessToken })).rejects.toMatchObject({
      code: "FS_TURN_AUTH_FAILED"
    });

    const receiverCapability = session.receiverPath.slice("/receive/".length);
    const rejected = new TurnCredentialService({
      fetchImpl: async () => Response.json({ category: "REJECTED", eligible: false })
    });
    await expect(rejected.issue({ capability: receiverCapability })).rejects.toMatchObject({
      code: "FS_TURN_AUTH_FAILED"
    });
  });

  it("enforces bounded issuance and maps only safe errors", async () => {
    configure();
    const capability = issueSignalingSession().sender.accessToken;
    const service = new TurnCredentialService({
      fetchImpl: async () => Response.json({ category: "ELIGIBLE", eligible: true }),
      maxIssuesPerWindow: 1,
      now: () => issuedAtMs
    });
    await expect(service.issue({ capability })).resolves.toMatchObject({ expiresAtMs: expect.any(Number) });
    await expect(service.issue({ capability })).rejects.toMatchObject({
      code: new TurnCredentialServiceError("FS_TURN_RATE_LIMITED").code
    });
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
