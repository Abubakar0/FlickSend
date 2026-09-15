import { afterEach, describe, expect, it } from "vitest";

import {
  createRelayEligibilityProof,
  issueSignalingSession,
  verifyIssuedSignalingCapability
} from "./capabilities.server";

const secret = "s".repeat(48);
const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe("P14 signaling capability server boundary", () => {
  it("verifies only a current capability minted with the configured server secret", () => {
    configure();
    const capability = issueSignalingSession().sender.accessToken;
    expect(verifyIssuedSignalingCapability(capability)).toMatchObject({ role: "sender" });
    expect(verifyIssuedSignalingCapability(`${capability}x`)).toBeNull();
    expect(verifyIssuedSignalingCapability(capability, Date.now() + 11 * 60_000)).toBeNull();
  });

  it("uses a relay-proof domain distinct from the capability signature", () => {
    configure();
    const capability = issueSignalingSession().sender.accessToken;
    expect(createRelayEligibilityProof(capability, 1_700_000_000_000)).not.toMatch(/^fsst1\./);
  });
});

function configure(): void {
  process.env.NEXT_PUBLIC_PRODUCTION_SIGNALING_URL = "wss://signaling.example";
  process.env.SIGNALING_CAPABILITY_SECRET = secret;
}
