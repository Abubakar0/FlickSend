"use client";

import type { AuthorizedSignallingSession } from "@flicksend/engine-core";
import { parsePublicWorkerUrl } from "@flicksend/config";

export type IssuedProductionSignallingSession = {
  receiverPath: string;
  sender: AuthorizedSignallingSession;
};

const capabilityPattern = /^fsst1\.[A-Za-z0-9_-]{1,1024}\.[A-Za-z0-9_-]{43}$/;

function configuredWorkerUrl(): string | null {
  const configured = parsePublicWorkerUrl(process.env.NEXT_PUBLIC_PRODUCTION_SIGNALING_URL);
  return configured?.replace(/\/$/, "") ?? null;
}

export function productionWorkerUrl(): string | null {
  return configuredWorkerUrl();
}

export function receiverSignallingSession(
  rawCapability: string
): AuthorizedSignallingSession | null {
  if (!capabilityPattern.test(rawCapability)) return null;
  // The Worker is the cryptographic authority. This only bounds malformed browser input before it
  // reaches the coordinator; a guessed expiry is never treated as authorization.
  return { accessToken: rawCapability, expiresAtMs: Date.now() + 10 * 60 * 1_000 };
}

/** Server-authorized client adapter; account and connected-People checks happen in the route. */
export async function issueProductionSignallingSession(
  recipientId: string
): Promise<IssuedProductionSignallingSession> {
  if (!configuredWorkerUrl()) throw new Error("FS_SIGNALING_UNAVAILABLE");
  const response = await fetch("/api/persistence/signaling/sessions", {
    body: JSON.stringify({ recipientId }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("FS_SIGNALING_UNAVAILABLE");
  }
  if (!response.ok || !isIssuedSession(body)) throw new Error("FS_SIGNALING_UNAVAILABLE");
  return body.session;
}

function isIssuedSession(
  value: unknown
): value is { ok: true; session: IssuedProductionSignallingSession } {
  if (typeof value !== "object" || value === null) return false;
  const session = (value as { session?: unknown }).session;
  if (typeof session !== "object" || session === null) return false;
  const candidate = session as Partial<IssuedProductionSignallingSession>;
  return (
    typeof candidate.receiverPath === "string" &&
    /^\/receive\/fsst1\.[A-Za-z0-9_-]{1,1024}\.[A-Za-z0-9_-]{43}$/.test(candidate.receiverPath) &&
    typeof candidate.sender?.accessToken === "string" &&
    capabilityPattern.test(candidate.sender.accessToken) &&
    typeof candidate.sender.expiresAtMs === "number" &&
    Number.isSafeInteger(candidate.sender.expiresAtMs) &&
    candidate.sender.expiresAtMs > Date.now()
  );
}
