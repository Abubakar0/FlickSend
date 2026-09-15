import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { parsePublicWorkerUrl } from "@flicksend/config";
import type { AuthorizedSignallingSession } from "@flicksend/engine-core";

const capabilityVersion = 1;
const capabilityLifetimeMs = 10 * 60 * 1_000;
const capabilityLifetimeMaximumMs = 30 * 60 * 1_000;
const minimumSecretBytes = 32;
const relayEligibilityProofPrefix = "flicksend:relay-eligibility:v1";
const capabilityPattern = /^fsst1\.([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{43})$/;
const tokenIdPattern = /^[A-Za-z0-9_-]{22}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CapabilityClaims = {
  exp: number;
  jti: string;
  role: "sender" | "receiver";
  sid: string;
  v: number;
};

export type VerifiedSignalingCapability = Readonly<{
  expiresAtMs: number;
  role: "receiver" | "sender";
  sessionId: string;
  tokenId: string;
}>;

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
  if (!parsePublicWorkerUrl(process.env.NEXT_PUBLIC_PRODUCTION_SIGNALING_URL))
    throw new SignalingInfrastructureUnavailableError();
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
 * Validates the short-lived P12 bearer capability only on the Railway server. The opaque token
 * identifier is returned solely for bounded in-memory issuance control and is never serialized.
 */
export function verifyIssuedSignalingCapability(
  rawCapability: unknown,
  currentMs = Date.now()
): VerifiedSignalingCapability | null {
  if (typeof rawCapability !== "string") return null;
  let secret: string;
  try {
    secret = capabilitySecret();
  } catch {
    return null;
  }
  const token = capabilityPattern.exec(rawCapability);
  if (!token) return null;
  const payload = token[1]!;
  const signature = token[2]!;
  const expectedSignature = sign(secret, payload);
  const expectedBytes = Buffer.from(expectedSignature, "base64url");
  const actualBytes = Buffer.from(signature, "base64url");
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;

  let claims: CapabilityClaims;
  try {
    const payloadBytes = Buffer.from(payload, "base64url");
    if (payloadBytes.byteLength > 768) return null;
    claims = JSON.parse(payloadBytes.toString("utf8")) as CapabilityClaims;
  } catch {
    return null;
  }
  if (
    claims.v !== capabilityVersion ||
    typeof claims.exp !== "number" ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= currentMs ||
    claims.exp > currentMs + capabilityLifetimeMaximumMs ||
    (claims.role !== "sender" && claims.role !== "receiver") ||
    typeof claims.sid !== "string" ||
    !uuidPattern.test(claims.sid) ||
    typeof claims.jti !== "string" ||
    !tokenIdPattern.test(claims.jti)
  ) {
    return null;
  }
  return {
    expiresAtMs: claims.exp,
    role: claims.role,
    sessionId: claims.sid,
    tokenId: claims.jti
  };
}

/** Domain-separated request proof for Railway-to-Worker relay eligibility only. */
export function createRelayEligibilityProof(capability: string, timestampMs: number): string {
  return createHmac("sha256", capabilitySecret())
    .update(`${relayEligibilityProofPrefix}\n${timestampMs}\n${capability}`, "utf8")
    .digest("base64url");
}

/** Converts the validated public WebSocket origin to its deterministic server-only HTTPS operation URL. */
export function relayEligibilityUrl(): string {
  const workerUrl = parsePublicWorkerUrl(process.env.NEXT_PUBLIC_PRODUCTION_SIGNALING_URL);
  if (!workerUrl) throw new SignalingInfrastructureUnavailableError();
  const url = new URL(workerUrl);
  url.protocol = "https:";
  url.pathname = "/v2/relay-eligibility";
  return url.toString();
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
