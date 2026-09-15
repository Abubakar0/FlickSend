import { describe, expect, it } from "vitest";

import worker, { type Env } from "./index.js";

const unavailableNamespace = {
  get: () => {
    throw new Error("Durable Object access is not allowed for this request.");
  },
  idFromName: () => {
    throw new Error("Durable Object access is not allowed for this request.");
  }
} as unknown as DurableObjectNamespace;

const env: Env = {
  ENVIRONMENT: "staging",
  EXPECTED_ORIGINS: "https://flicksendengine-lab-staging.up.railway.app",
  PRODUCTION_SESSION_ROOM: unavailableNamespace,
  SESSION_DIRECTORY: unavailableNamespace,
  SESSION_ROOM: unavailableNamespace,
  SIGNALING_CAPABILITY_SECRET: "s".repeat(32)
};

describe("P13 Worker request boundary", () => {
  it("serves health without obtaining a Durable Object stub", async () => {
    const response = await worker.fetch(new Request("https://worker.example/health"), env);
    await expect(response.json()).resolves.toEqual({
      environment: "staging",
      status: "ok",
      version: "unknown"
    });
  });

  it("rejects an untrusted browser origin before Durable Object access", async () => {
    const response = await worker.fetch(
      new Request("https://worker.example/v2/session", {
        headers: { Origin: "https://evil.test" }
      }),
      env
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "FS_SIGNALING_UNAVAILABLE" });
  });

  it("returns a bounded configured preflight response and generic unknown-route error", async () => {
    const preflight = await worker.fetch(
      new Request("https://worker.example/v2/session", {
        headers: { Origin: "https://flicksendengine-lab-staging.up.railway.app" },
        method: "OPTIONS"
      }),
      env
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://flicksendengine-lab-staging.up.railway.app"
    );

    const unknown = await worker.fetch(new Request("https://worker.example/unknown"), env);
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toEqual({ code: "FS_SIGNALING_UNAVAILABLE" });
  });
});
