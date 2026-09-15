import { createHmac } from "node:crypto";
import { parseIceUrls, parseTurnCredentialTtl, type ClientIceConfiguration } from "@flicksend/config";
import {
  createRelayEligibilityProof,
  relayEligibilityUrl,
  verifyIssuedSignalingCapability
} from "./capabilities.server";

const defaultTurnCredentialTtlSeconds = 1_800;
const minimumTurnSharedSecretBytes = 32;
const issuanceWindowMs = 60_000;
const maximumTrackedCapabilities = 256;

type RelayEligibility = { category: "ELIGIBLE" | "REJECTED" | "UNAVAILABLE"; eligible: boolean };

export type TurnCredentialIssueInput = Readonly<{
  capability: string;
  renewal?: boolean;
}>;

export type TurnCredentialServiceOptions = Readonly<{
  fetchImpl?: typeof fetch;
  maxIssuesPerWindow?: number;
  now?: () => number;
}>;

export class TurnCredentialServiceError extends Error {
  constructor(
    readonly code:
      | "FS_TURN_AUTH_FAILED"
      | "FS_TURN_CREDENTIAL_UNAVAILABLE"
      | "FS_TURN_RATE_LIMITED"
  ) {
    super(code);
  }
}

/**
 * Railway-only coturn REST credential issuer. It retains no raw capability, account identifier,
 * TURN credential, or shared secret; bounded process-local accounting uses only the opaque token ID.
 */
export class TurnCredentialService {
  private readonly issuedByToken = new Map<string, { count: number; windowStartedAtMs: number }>();
  private readonly fetchImpl: typeof fetch;
  private readonly maxIssuesPerWindow: number;
  private readonly now: () => number;

  constructor(options: TurnCredentialServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxIssuesPerWindow = options.maxIssuesPerWindow ?? 3;
    this.now = options.now ?? Date.now;
  }

  async issue(input: TurnCredentialIssueInput): Promise<ClientIceConfiguration> {
    const currentMs = this.now();
    const capability = verifyIssuedSignalingCapability(input.capability, currentMs);
    if (!capability) throw new TurnCredentialServiceError("FS_TURN_AUTH_FAILED");
    if (!this.allowIssue(capability.tokenId, currentMs))
      throw new TurnCredentialServiceError("FS_TURN_RATE_LIMITED");

    const eligibility = await this.confirmRelayEligibility(input.capability, currentMs);
    if (!eligibility.eligible || eligibility.category !== "ELIGIBLE")
      throw new TurnCredentialServiceError("FS_TURN_AUTH_FAILED");

    const configuration = readTurnConfiguration();
    if (!configuration) throw new TurnCredentialServiceError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    const expiresAtMs = currentMs + configuration.ttlSeconds * 1_000;
    const username = `${Math.floor(expiresAtMs / 1_000)}:${capability.tokenId}`;
    const credential = createHmac("sha1", configuration.sharedSecret)
      .update(username, "utf8")
      .digest("base64");
    return {
      credential,
      expiresAtMs,
      stunUrls: configuration.stunUrls,
      turnUrls: configuration.turnUrls,
      username
    };
  }

  private async confirmRelayEligibility(
    capability: string,
    currentMs: number
  ): Promise<RelayEligibility> {
    let response: Response;
    try {
      response = await this.fetchImpl(relayEligibilityUrl(), {
        headers: {
          authorization: `Bearer ${capability}`,
          "x-flicksend-relay-proof": createRelayEligibilityProof(capability, currentMs),
          "x-flicksend-relay-timestamp": String(currentMs)
        },
        method: "POST"
      });
    } catch {
      throw new TurnCredentialServiceError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    }
    if (!response.ok) throw new TurnCredentialServiceError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    try {
      const value = (await response.json()) as unknown;
      return parseRelayEligibility(value) ?? { category: "UNAVAILABLE", eligible: false };
    } catch {
      throw new TurnCredentialServiceError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    }
  }

  private allowIssue(tokenId: string, currentMs: number): boolean {
    for (const [candidate, record] of this.issuedByToken)
      if (currentMs - record.windowStartedAtMs >= issuanceWindowMs) this.issuedByToken.delete(candidate);
    const existing = this.issuedByToken.get(tokenId);
    if (existing) {
      if (existing.count >= this.maxIssuesPerWindow) return false;
      existing.count += 1;
      return true;
    }
    if (this.issuedByToken.size >= maximumTrackedCapabilities) {
      const oldest = this.issuedByToken.keys().next().value;
      if (oldest) this.issuedByToken.delete(oldest);
    }
    this.issuedByToken.set(tokenId, { count: 1, windowStartedAtMs: currentMs });
    return true;
  }
}

function readTurnConfiguration(): {
  sharedSecret: string;
  stunUrls: readonly string[];
  ttlSeconds: number;
  turnUrls: readonly string[];
} | null {
  const sharedSecret = process.env.TURN_SHARED_SECRET;
  const turnUrls = parseUrls(process.env.TURN_URLS, "turn", false);
  const stunUrls = parseUrls(process.env.STUN_URLS, "stun", true);
  const ttlSeconds =
    process.env.TURN_CREDENTIAL_TTL_SECONDS === undefined
      ? defaultTurnCredentialTtlSeconds
      : parseTurnCredentialTtl(process.env.TURN_CREDENTIAL_TTL_SECONDS);
  if (
    !sharedSecret ||
    Buffer.byteLength(sharedSecret, "utf8") < minimumTurnSharedSecretBytes ||
    !turnUrls ||
    !stunUrls ||
    ttlSeconds === null
  ) {
    return null;
  }
  return { sharedSecret, stunUrls, ttlSeconds, turnUrls };
}

function parseUrls(
  value: string | undefined,
  requiredKind: "stun" | "turn",
  optional: boolean
): readonly string[] | null {
  if (value === undefined && optional) return [];
  const urls = parseIceUrls(value);
  if (!urls || (urls.length === 0 && !optional)) return null;
  return urls.every((url) => url.toLowerCase().startsWith(requiredKind)) ? urls : null;
}

function parseRelayEligibility(value: unknown): RelayEligibility | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (
    typeof result.eligible !== "boolean" ||
    (result.category !== "ELIGIBLE" && result.category !== "REJECTED" && result.category !== "UNAVAILABLE") ||
    (result.category === "ELIGIBLE") !== result.eligible
  ) {
    return null;
  }
  return { category: result.category, eligible: result.eligible };
}
