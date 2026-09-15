import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AuthorizedSignallingSession } from "@flicksend/engine-core";

const capabilityVersion = 1;
const capabilityLifetimeMs = 10 * 60 * 1_000;
const minimumSecretBytes = 32;

type CapabilityClaims = {
  exp: number;
  jti: string;
  role: "sender" | "receiver";
  sid: string;
  v: number;
};

export class SignalingInfrastructureUnavailableError extends Error {
  constructor() {
    super("SIGNALING_INFRASTRUCTURE_UNAVAILABLE");
  }
}

export type IssuedSignalingSession = {
  expiresAt: string;
  receiverPath: string;
  sender: AuthorizedSignallingSession;
};

function capabilitySecret(): string {
  const secret = process.env.SIGNALING_CAPABILITY_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < minimumSecretBytes)
    throw new SignalingInfrastructureUnavailableError();
  return secret;
}

/** A configured public Worker origin is required before the application mints a usable capability. */
function requirePublicWorkerOrigin(): void {
  const raw = process.env.NEXT_PUBLIC_PRODUCTION_SIGNALING_URL;
  try {
    const url = raw ? new URL(raw) : null;
    if (!url || !["ws:", "wss:"].includes(url.protocol) || url.username || url.password)
      throw new Error("invalid public Worker URL");
  } catch {
    throw new SignalingInfrastructureUnavailableError();
  }
}

function encodeClaims(claims: CapabilityClaims): string {
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function mint(secret: string, claims: CapabilityClaims): string {
  const payload = encodeClaims(claims);
  return `fsst1.${payload}.${sign(secret, payload)}`;
}

/**
 * Creates two short-lived bearer capabilities for one ephemeral signaling session. The session
 * identifier is not a transfer identifier and no capability is written to PostgreSQL.
 */
export function issueSignalingSession(): IssuedSignalingSession {
  requirePublicWorkerOrigin();
  const secret = capabilitySecret();
  const expiresAtMs = Date.now() + capabilityLifetimeMs;
  const sessionId = randomUUID();
  const sender = mint(secret, {
    exp: expiresAtMs,
    jti: randomBytes(16).toString("base64url"),
    role: "sender",
    sid: sessionId,
    v: capabilityVersion
  });
  const receiver = mint(secret, {
    exp: expiresAtMs,
    jti: randomBytes(16).toString("base64url"),
    role: "receiver",
    sid: sessionId,
    v: capabilityVersion
  });
  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    receiverPath: `/receive/${receiver}`,
    sender: { accessToken: sender, expiresAtMs }
  };
}
