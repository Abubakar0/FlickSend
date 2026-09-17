export const flickSendEnvironments = ["development", "staging", "production"] as const;
export type FlickSendEnvironment = (typeof flickSendEnvironments)[number];

export type ClientIceConfiguration = Readonly<{
  stunUrls: readonly string[];
  turnUrls: readonly string[];
  username: string;
  credential: string;
  expiresAtMs: number;
}>;

const maxIceUrls = 8;
const maxValueLength = 512;
const minTurnCredentialTtlSeconds = 600;
const maxTurnCredentialTtlSeconds = 3_600;

export function parseEnvironmentClass(value: unknown): FlickSendEnvironment | null {
  return typeof value === "string" && flickSendEnvironments.includes(value as FlickSendEnvironment)
    ? (value as FlickSendEnvironment)
    : null;
}

export function parsePublicWorkerUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxValueLength) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "wss:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseExpectedOrigins(value: unknown): readonly string[] | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxValueLength) return null;

  const values = value.split(",").map((origin) => origin.trim());
  if (values.length === 0 || values.length > maxIceUrls || values.some((origin) => origin.length === 0)) {
    return null;
  }

  const origins: string[] = [];
  for (const value of values) {
    try {
      const url = new URL(value);
      const localDevelopmentOrigin =
        url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
      if (
        (url.protocol !== "https:" && !localDevelopmentOrigin) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        url.hostname.includes("*") ||
        url.origin !== value
      ) {
        return null;
      }
      if (origins.includes(url.origin)) return null;
      origins.push(url.origin);
    } catch {
      return null;
    }
  }
  return origins;
}

export function parseIceUrls(value: unknown): readonly string[] | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxValueLength) return null;
  const urls = value.split(",").map((url) => url.trim());
  return parseIceUrlList(urls);
}

export function parseTurnCredentialTtl(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const ttlSeconds = Number(value);
  return Number.isSafeInteger(ttlSeconds) &&
    ttlSeconds >= minTurnCredentialTtlSeconds &&
    ttlSeconds <= maxTurnCredentialTtlSeconds
    ? ttlSeconds
    : null;
}

export function parseClientIceConfiguration(value: unknown): ClientIceConfiguration | null {
  if (!isRecord(value) || Object.keys(value).length !== 5) return null;
  const stunUrls = parseIceUrlList(value.stunUrls, "stun");
  const turnUrls = parseIceUrlList(value.turnUrls, "turn");
  if (
    !stunUrls ||
    !turnUrls ||
    turnUrls.length === 0 ||
    typeof value.username !== "string" ||
    value.username.length === 0 ||
    value.username.length > maxValueLength ||
    typeof value.credential !== "string" ||
    value.credential.length === 0 ||
    value.credential.length > maxValueLength ||
    typeof value.expiresAtMs !== "number" ||
    !Number.isSafeInteger(value.expiresAtMs) ||
    value.expiresAtMs <= 0
  ) {
    return null;
  }
  return {
    stunUrls,
    turnUrls,
    username: value.username,
    credential: value.credential,
    expiresAtMs: value.expiresAtMs
  };
}

function parseIceUrlList(value: unknown, requiredKind?: "stun" | "turn"): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maxIceUrls) return null;
  const urls: string[] = [];
  for (const url of value) {
    if (typeof url !== "string" || url.length === 0 || url.length > maxValueLength || !isIceUrl(url, requiredKind)) {
      return null;
    }
    if (urls.includes(url)) return null;
    urls.push(url);
  }
  return urls;
}

function isIceUrl(value: string, requiredKind?: "stun" | "turn"): boolean {
  const match = /^(stuns?|turns?):([^\s/?#:]+)(?::(\d{1,5}))?(?:\?transport=(udp|tcp))?$/i.exec(value);
  if (!match) return false;
  const scheme = match[1]?.toLowerCase();
  const port = match[3] ? Number(match[3]) : undefined;
  if ((port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65_535)) || !scheme) return false;
  if (requiredKind === "stun") return scheme === "stun" || scheme === "stuns";
  if (requiredKind === "turn") return scheme === "turn" || scheme === "turns";
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
