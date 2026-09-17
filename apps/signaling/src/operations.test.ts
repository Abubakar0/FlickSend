import { describe, expect, it } from "vitest";

import type { WorkerEnvironmentConfig } from "./environment.js";
import {
  BoundedRequestRateLimiter,
  createHealthResponse,
  verifyRelayEligibilityRequest,
  validateBrowserOrigin
} from "./operations.js";

const secret = "s".repeat(32);
const config: WorkerEnvironmentConfig = {
  environment: "staging",
  expectedOrigins: ["https://flicksendengine-lab-staging.up.railway.app"],
  version: "build-123"
};

describe("P13 safe Worker operations", () => {
  it("returns only safe health information", async () => {
    await expect(createHealthResponse(config).json()).resolves.toEqual({
      environment: "staging",
      status: "ok",
      version: "build-123"
    });
  });

  it("accepts configured browser origins and rejects untrusted origins", () => {
    expect(
      validateBrowserOrigin(
        new Request("https://worker.example/v2/session", {
          headers: { Origin: "https://flicksendengine-lab-staging.up.railway.app" }
        }),
        config
      )
    ).toBe(true);
    expect(
      validateBrowserOrigin(
        new Request("https://worker.example/v2/session", { headers: { Origin: "https://evil.test" } }),
        config
      )
    ).toBe(false);
  });

  it("requires a current, domain-separated Railway relay proof", async () => {
    const capability = "fsst1.payload.signature";
    const timestampMs = 1_700_000_000_000;
    const proof = await signRelayProof(capability, timestampMs);
    const request = new Request("https://worker.example/v2/relay-eligibility", {
      headers: {
        Authorization: `Bearer ${capability}`,
        "x-flicksend-relay-proof": proof,
        "x-flicksend-relay-timestamp": String(timestampMs)
      },
      method: "POST"
    });
    await expect(verifyRelayEligibilityRequest(request, secret, timestampMs)).resolves.toBe(capability);
    await expect(verifyRelayEligibilityRequest(request, secret, timestampMs + 60_001)).resolves.toBeNull();
  });

  it("uses bounded fixed-window request accounting", () => {
    const limiter = new BoundedRequestRateLimiter(2, 1_000);
    expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(1_001)).toBe(true);
    expect(limiter.allow(1_002)).toBe(false);
    expect(limiter.allow(2_000)).toBe(true);
  });
});

async function signRelayProof(capability: string, timestampMs: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const message = `flicksend:relay-eligibility:v1\n${timestampMs}\n${capability}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  );
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
