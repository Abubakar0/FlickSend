import { describe, expect, it } from "vitest";
import {
  ProductionSessionRoom,
  verifyProductionSignallingCapability
} from "./production-signaling.js";

const textEncoder = new TextEncoder();
const secret = base64Url(randomBytes(48));

async function capability(
  overrides: Partial<{
    exp: number;
    jti: string;
    role: "receiver" | "sender";
    sid: string;
    v: number;
  }> = {}
): Promise<string> {
  const payload = base64Url(
    textEncoder.encode(
      JSON.stringify({
        exp: Date.now() + 60_000,
        jti: base64Url(randomBytes(16)),
        role: "sender",
        sid: crypto.randomUUID(),
        v: 1,
        ...overrides
      })
    )
  );
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = base64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload)))
  );
  return `fsst1.${payload}.${signature}`;
}

describe("P12 signaling capability verification", () => {
  it("accepts a current, correctly signed sender or receiver capability", async () => {
    await expect(
      verifyProductionSignallingCapability(await capability(), secret)
    ).resolves.toMatchObject({
      role: "sender"
    });
    await expect(
      verifyProductionSignallingCapability(await capability({ role: "receiver" }), secret)
    ).resolves.toMatchObject({ role: "receiver" });
  });

  it("rejects malformed, expired, overlong, wrong-version, and tampered capabilities", async () => {
    const valid = await capability();
    // The final unpadded Base64url character carries unused bits, so alter the preceding character
    // to ensure the decoded HMAC bytes differ.
    const penultimate = valid.at(-2)!;
    const tampered = `${valid.slice(0, -2)}${penultimate === "a" ? "b" : "a"}${valid.at(-1)!}`;
    await expect(verifyProductionSignallingCapability(tampered, secret)).resolves.toBeNull();
    await expect(
      verifyProductionSignallingCapability(await capability({ exp: Date.now() - 1 }), secret)
    ).resolves.toBeNull();
    await expect(
      verifyProductionSignallingCapability(await capability({ v: 2 }), secret)
    ).resolves.toBeNull();
    await expect(verifyProductionSignallingCapability("fsst1.x.y", secret)).resolves.toBeNull();
    await expect(
      verifyProductionSignallingCapability(await capability(), "short")
    ).resolves.toBeNull();
  });

  it("returns only a safe room eligibility category", async () => {
    const storage = new Map<string, number>();
    const room = new ProductionSessionRoom({
      getWebSockets: () => [],
      storage: {
        get: async <T>(key: string) => storage.get(key) as T | undefined
      }
    } as unknown as DurableObjectState);
    const request = { expiresAtMs: Date.now() + 60_000, role: "sender" as const };
    await expect(room.relayEligibility(request)).resolves.toEqual({
      category: "ELIGIBLE",
      eligible: true
    });
    storage.set("revoked", Date.now() + 60_000);
    await expect(room.relayEligibility(request)).resolves.toEqual({
      category: "REJECTED",
      eligible: false
    });
  });

  it("retains hibernatable sockets reconstructed from persisted attachments", () => {
    const sender = {
      deserializeAttachment: () => ({ expiresAtMs: Date.now() + 60_000, role: "sender" })
    } as unknown as WebSocket;
    const receiver = {
      deserializeAttachment: () => ({ expiresAtMs: Date.now() + 60_000, role: "receiver" })
    } as unknown as WebSocket;
    let enumerations = 0;
    const room = new ProductionSessionRoom({
      getWebSockets: () => {
        enumerations += 1;
        return enumerations === 1 ? [sender, receiver] : [];
      }
    } as unknown as DurableObjectState);

    const registry = room as unknown as { activeSockets: () => { socket: WebSocket }[] };
    expect(registry.activeSockets().map((entry) => entry.socket)).toEqual([sender, receiver]);
    expect(registry.activeSockets().map((entry) => entry.socket)).toEqual([sender, receiver]);
    expect(enumerations).toBe(1);
  });
});

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
