import { describe, expect, it } from "vitest";

import { resolveWorkerEnvironment } from "./environment.js";

const secret = "s".repeat(32);

describe("P13 Worker environment resolution", () => {
  it("returns only safe configuration for an explicit environment", () => {
    expect(
      resolveWorkerEnvironment({
        BUILD_VERSION: "build-123",
        ENVIRONMENT: "staging",
        EXPECTED_ORIGINS: "https://flicksendengine-lab-staging.up.railway.app",
        SIGNALING_CAPABILITY_SECRET: secret
      })
    ).toEqual({
      environment: "staging",
      expectedOrigins: ["https://flicksendengine-lab-staging.up.railway.app"],
      version: "build-123"
    });
  });

  it("fails closed for a missing, invalid, or weak environment contract", () => {
    expect(resolveWorkerEnvironment({ ENVIRONMENT: "preview", SIGNALING_CAPABILITY_SECRET: secret })).toBeNull();
    expect(
      resolveWorkerEnvironment({
        ENVIRONMENT: "production",
        EXPECTED_ORIGINS: "https://app.example",
        SIGNALING_CAPABILITY_SECRET: "short"
      })
    ).toBeNull();
    expect(
      resolveWorkerEnvironment({
        ENVIRONMENT: "production",
        EXPECTED_ORIGINS: "https://*.example",
        SIGNALING_CAPABILITY_SECRET: secret
      })
    ).toBeNull();
  });
});
