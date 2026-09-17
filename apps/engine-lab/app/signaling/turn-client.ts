"use client";

import { parseClientIceConfiguration } from "@flicksend/config";
import {
  TurnCredentialError,
  type IceConfigurationProvider,
  type IceConfigurationRequest
} from "@flicksend/transport-webrtc";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const credentialEndpoint = "/api/persistence/signaling/turn-credentials";
const safeTurnErrors = new Set([
  "FS_TURN_AUTH_FAILED",
  "FS_TURN_RATE_LIMITED",
  "FS_TURN_CREDENTIAL_UNAVAILABLE"
]);

/**
 * Browser-side adapter for the Railway issuer. It forwards only the short-lived signaling
 * capability and translates the validated ephemeral DTO into WebRTC configuration.
 */
export class ProductionIceConfigurationProvider implements IceConfigurationProvider {
  private readonly fetcher: FetchLike;

  constructor(
    private readonly capability: string,
    fetcher?: FetchLike
  ) {
    this.fetcher = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async getConfiguration(request: IceConfigurationRequest): Promise<RTCConfiguration> {
    let response: Response;
    try {
      response = await this.fetcher(credentialEndpoint, {
        body: JSON.stringify({ capability: this.capability }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
    } catch {
      throw new TurnCredentialError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new TurnCredentialError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    }
    if (!response.ok) throw new TurnCredentialError(safeErrorCode(body));

    const configuration = parseConfiguration(body);
    if (!configuration || configuration.expiresAtMs <= Date.now())
      throw new TurnCredentialError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    return {
      iceServers: [
        ...(configuration.stunUrls.length ? [{ urls: [...configuration.stunUrls] }] : []),
        {
          credential: configuration.credential,
          urls: [...configuration.turnUrls],
          username: configuration.username
        }
      ],
      iceTransportPolicy: request.policy === "RELAY_ONLY" ? "relay" : "all"
    };
  }
}

function parseConfiguration(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (response.ok !== true || Object.keys(response).length !== 2) return null;
  return parseClientIceConfiguration(response.configuration);
}

function safeErrorCode(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "FS_TURN_CREDENTIAL_UNAVAILABLE";
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" && safeTurnErrors.has(error)
    ? error
    : "FS_TURN_CREDENTIAL_UNAVAILABLE";
}
