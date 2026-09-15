import type { WorkerEnvironmentConfig } from "./environment.js";

const relayEligibilityProofPrefix = "flicksend:relay-eligibility:v1";
const relayEligibilityProofWindowMs = 60_000;
const minimumSecretBytes = 32;
const textEncoder = new TextEncoder();

export class BoundedRequestRateLimiter {
  private count = 0;
  private windowStartedAtMs = 0;

  constructor(
    private readonly maximumRequests: number,
    private readonly windowMs: number
  ) {}

  allow(currentMs = Date.now()): boolean {
    if (currentMs - this.windowStartedAtMs >= this.windowMs) {
      this.windowStartedAtMs = currentMs;
      this.count = 0;
    }
    if (this.count >= this.maximumRequests) return false;
    this.count += 1;
    return true;
  }
}

export function createHealthResponse(config: WorkerEnvironmentConfig): Response {
  return Response.json({
    environment: config.environment,
    status: "ok",
    version: config.version
  });
}

/** Requests without Origin are non-browser operational clients; browser origins must be exact. */
export function validateBrowserOrigin(request: Request, config: WorkerEnvironmentConfig): boolean {
  const origin = request.headers.get("Origin");
  return origin === null || config.expectedOrigins.includes(origin);
}

export function hasConfiguredBrowserOrigin(
  request: Request,
  config: WorkerEnvironmentConfig
): boolean {
  const origin = request.headers.get("Origin");
  return origin !== null && config.expectedOrigins.includes(origin);
}

export function withConfiguredCors(
  request: Request,
  response: Response,
  config: WorkerEnvironmentConfig
): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !config.expectedOrigins.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "content-type");
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}

export function safeOperationError(status: 403 | 404 | 405 | 429 | 503): Response {
  return Response.json({ code: "FS_SIGNALING_UNAVAILABLE" }, { status });
}

export async function verifyRelayEligibilityRequest(
  request: Request,
  secret: string | undefined,
  currentMs = Date.now()
): Promise<string | null> {
  if (!hasMinimumSecret(secret) || request.method !== "POST") return null;
  const capability = bearerCapability(request.headers.get("authorization"));
  const timestampMs = parseTimestamp(request.headers.get("x-flicksend-relay-timestamp"));
  const proof = decodeBase64Url(request.headers.get("x-flicksend-relay-proof"));
  if (
    !capability ||
    timestampMs === null ||
    Math.abs(currentMs - timestampMs) > relayEligibilityProofWindowMs ||
    !proof ||
    proof.byteLength !== 32
  ) {
    return null;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"]
  );
  const canonicalRequest = `${relayEligibilityProofPrefix}\n${timestampMs}\n${capability}`;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    proof,
    textEncoder.encode(canonicalRequest)
  );
  return valid ? capability : null;
}

function hasMinimumSecret(value: string | undefined): value is string {
  return typeof value === "string" && textEncoder.encode(value).byteLength >= minimumSecretBytes;
}

function bearerCapability(value: string | null): string | null {
  const match = /^Bearer (fsst1\.[A-Za-z0-9_-]{1,1024}\.[A-Za-z0-9_-]{1,128})$/.exec(value ?? "");
  return match?.[1] ?? null;
}

function parseTimestamp(value: string | null): number | null {
  if (!value || !/^\d{13}$/.test(value)) return null;
  const timestampMs = Number(value);
  return Number.isSafeInteger(timestampMs) ? timestampMs : null;
}

function decodeBase64Url(value: string | null): Uint8Array<ArrayBuffer> | null {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=";
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}
