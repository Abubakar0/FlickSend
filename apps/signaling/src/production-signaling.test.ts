import { describe, expect, it } from "vitest";
import { verifyProductionSignallingCapability } from "./production-signaling.js";

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
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`;
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
});

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
