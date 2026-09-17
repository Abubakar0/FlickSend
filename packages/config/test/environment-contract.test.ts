import { describe, expect, it } from "vitest";

import {
  parseClientIceConfiguration,
  parseEnvironmentClass,
  parseExpectedOrigins,
  parseIceUrls,
  parsePublicWorkerUrl,
  parseTurnCredentialTtl
} from "../src/index.js";

describe("P13/P14 environment contract", () => {
  it("accepts only the three explicit environment classes", () => {
    expect(parseEnvironmentClass("development")).toBe("development");
    expect(parseEnvironmentClass("staging")).toBe("staging");
    expect(parseEnvironmentClass("production")).toBe("production");
    expect(parseEnvironmentClass("preview")).toBeNull();
  });

  it("accepts only a credential-free public wss Worker URL", () => {
    expect(parsePublicWorkerUrl("wss://signaling.example")).toBe("wss://signaling.example/");
    expect(parsePublicWorkerUrl("https://signaling.example")).toBeNull();
    expect(parsePublicWorkerUrl("wss://user:password@signaling.example")).toBeNull();
    expect(parsePublicWorkerUrl("wss://signaling.example?capability=secret")).toBeNull();
  });

  it("requires a bounded, unique list of exact browser origins", () => {
    expect(parseExpectedOrigins("https://app.example,https://staging.example")).toEqual([
      "https://app.example",
      "https://staging.example"
    ]);
    expect(parseExpectedOrigins("https://app.example,https://app.example")).toBeNull();
    expect(parseExpectedOrigins("https://*.example")).toBeNull();
    expect(parseExpectedOrigins("https://app.example/send")).toBeNull();
  });

  it("validates bounded public STUN/TURN URL lists", () => {
    expect(parseIceUrls("stun:stun.example:3478,turn:turn.example:3478?transport=udp")).toEqual([
      "stun:stun.example:3478",
      "turn:turn.example:3478?transport=udp"
    ]);
    expect(parseIceUrls("https://not-turn.example")).toBeNull();
    expect(parseIceUrls("turn://user:password@turn.example")).toBeNull();
  });

  it("bounds TURN credential TTL inclusively", () => {
    expect(parseTurnCredentialTtl("600")).toBe(600);
    expect(parseTurnCredentialTtl("1800")).toBe(1800);
    expect(parseTurnCredentialTtl("3600")).toBe(3600);
    expect(parseTurnCredentialTtl("59")).toBeNull();
    expect(parseTurnCredentialTtl("3601")).toBeNull();
  });

  it("accepts only the exact browser-safe ICE DTO", () => {
    const configuration = {
      stunUrls: ["stun:stun.example:3478"],
      turnUrls: ["turn:turn.example:3478?transport=udp"],
      username: "1700000000:participant",
      credential: "ephemeral-credential",
      expiresAtMs: 1_700_000_000_000
    };
    expect(parseClientIceConfiguration(configuration)).toEqual(configuration);
    expect(parseClientIceConfiguration({ ...configuration, sharedSecret: "never-public" })).toBeNull();
  });
});
