const encoder = new TextEncoder();

export type TurnCredential = {
  username: string;
  credential: string;
};

export type TurnCredentialConfig = {
  sharedSecret: string;
  ttlSeconds: number;
};

export function parseTurnUrls(value: string | undefined): string[] | null {
  if (!value) return null;
  const urls = value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (!urls.length || urls.length > 8) return null;
  for (const url of urls) {
    if (
      url.length > 512 ||
      !/^turns?:[^\s/?#:]+(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/i.test(url)
    )
      return null;
  }
  return urls;
}

export function parseStunUrls(value: string | undefined): string[] | null {
  if (!value) return [];
  const urls = value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length > 8) return null;
  for (const url of urls) {
    if (url.length > 512 || !/^stuns?:[^\s/?#:]+(?::\d{1,5})?$/i.test(url)) return null;
  }
  return urls;
}

export function boundedTurnTtl(value: string | undefined): number {
  const parsed = Number(value ?? "1800");
  if (!Number.isInteger(parsed) || parsed < 600 || parsed > 3_600) return 1_800;
  return parsed;
}

/** coturn REST authentication: base64(HMAC-SHA1("expiry:peer-id", sharedSecret)). */
export async function createTurnCredential(
  config: TurnCredentialConfig,
  peerId: string,
  nowMs = Date.now()
): Promise<TurnCredential> {
  if (!/^[0-9a-f-]{36}$/i.test(peerId)) throw new Error("Invalid peer identity.");
  const expiresAt = Math.floor(nowMs / 1000) + config.ttlSeconds;
  const username = `${expiresAt}:${peerId}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(config.sharedSecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(username));
  return { username, credential: base64(new Uint8Array(signature)) };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
