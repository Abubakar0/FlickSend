import { describe, expect, it } from "vitest";
import {
  canTransitionConnectionState,
  formatSessionCode,
  makeTestPayload,
  normalizeSessionCode,
  parseHelloMessage,
  parseSignallingMessage,
  verifyTestPayload
} from "../src/index.js";

describe("M1 protocol boundaries", () => {
  it("normalizes only six-digit session codes", () => {
    expect(normalizeSessionCode("482 921")).toBe("482921");
    expect(formatSessionCode("482921")).toBe("482 921");
    expect(normalizeSessionCode("123")).toBeNull();
  });

  it("validates HELLO messages", () => {
    expect(
      parseHelloMessage({
        type: "HELLO",
        protocolVersion: 1,
        peerId: crypto.randomUUID(),
        browserCapabilities: { dataChannel: true, webRtc: true },
        timestamp: Date.now()
      })
    ).not.toBeNull();
  });

  it("rejects malformed protocol messages and illegal state transitions", () => {
    expect(parseSignallingMessage({ type: "offer", sdp: "" })).toBeNull();
    expect(parseHelloMessage({ type: "HELLO", protocolVersion: 2 })).toBeNull();
    expect(canTransitionConnectionState("IDLE", "SIGNALLING_CONNECTING")).toBe(true);
    expect(canTransitionConnectionState("CLOSED", "CONNECTED")).toBe(false);
  });

  it("accepts only a positive bounded route generation on route-scoped signals", () => {
    expect(parseSignallingMessage({ type: "offer", sdp: "v=0", routeGeneration: 4 })).toMatchObject(
      {
        type: "offer",
        routeGeneration: 4
      }
    );
    expect(parseSignallingMessage({ type: "answer", sdp: "v=0", routeGeneration: 0 })).toBeNull();
    expect(
      parseSignallingMessage({
        type: "ice-candidate",
        candidate: { candidate: "x", sdpMid: null, sdpMLineIndex: null },
        routeGeneration: -1
      })
    ).toBeNull();
  });

  it("verifies its deterministic binary proof", () => {
    const payload = makeTestPayload();
    expect(verifyTestPayload(payload.buffer)).toBe(true);
  });
});
