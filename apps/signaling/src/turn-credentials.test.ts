import { describe, expect, it } from "vitest";
import {
  boundedTurnTtl,
  createTurnCredential,
  parseStunUrls,
  parseTurnUrls
} from "./turn-credentials.js";

describe("TURN credential helpers", () => {
  it("mints deterministic, time-limited coturn REST credentials", async () => {
    const credential = await createTurnCredential(
      { sharedSecret: "0123456789abcdef0123456789abcdef", ttlSeconds: 600 },
      "7de2ac16-5e8e-4bf9-8cd0-38ac3f5e5028",
      1_700_000_000_000
    );
    expect(credential.username).toBe("1700000600:7de2ac16-5e8e-4bf9-8cd0-38ac3f5e5028");
    expect(credential.credential).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it("accepts only bounded TURN and STUN URL lists", () => {
    expect(
      parseTurnUrls("turn:relay.test:3478?transport=udp, turns:relay.test:5349?transport=tcp")
    ).toEqual(["turn:relay.test:3478?transport=udp", "turns:relay.test:5349?transport=tcp"]);
    expect(parseTurnUrls("https://relay.test")).toBeNull();
    expect(parseStunUrls("stun:stun.test:3478")).toEqual(["stun:stun.test:3478"]);
    expect(parseStunUrls("stun:stun.test/path")).toBeNull();
  });

  it("keeps credential TTL within the documented 10 to 60 minute window", () => {
    expect(boundedTurnTtl("600")).toBe(600);
    expect(boundedTurnTtl("3600")).toBe(3600);
    expect(boundedTurnTtl("1")).toBe(1800);
    expect(boundedTurnTtl("not-a-number")).toBe(1800);
  });
});
