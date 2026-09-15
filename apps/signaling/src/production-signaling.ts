import { maxSignallingPayloadBytes, parseSignallingMessage } from "@flicksend/protocol";

const capabilityLifetimeMaximumMs = 30 * 60 * 1_000;
const capabilityMinimumSecretBytes = 32;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const capabilityTokenPattern = /^fsst1\.([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{43})$/;

export type ProductionSignallingCapability = {
  expiresAtMs: number;
  role: "receiver" | "sender";
  sessionId: string;
};

export type RelayEligibility = Readonly<{
  category: "ELIGIBLE" | "REJECTED" | "UNAVAILABLE";
  eligible: boolean;
}>;

export type RelayEligibilityRequest = Readonly<{
  expiresAtMs: number;
  role: ProductionSignallingCapability["role"];
}>;

type CapabilityClaims = {
  exp: unknown;
  jti: unknown;
  role: unknown;
  sid: unknown;
  v: unknown;
};

type SocketAttachment = {
  expiresAtMs: number;
  role: ProductionSignallingCapability["role"];
};

export async function verifyProductionSignallingCapability(
  rawCapability: string | null,
  secret: string | undefined,
  currentMs = Date.now()
): Promise<ProductionSignallingCapability | null> {
  if (
    !rawCapability ||
    !secret ||
    textEncoder.encode(secret).byteLength < capabilityMinimumSecretBytes
  )
    return null;
  const token = capabilityTokenPattern.exec(rawCapability);
  if (!token) return null;
  const payload = token[1]!;
  const signature = decodeBase64Url(token[2]!);
  const payloadBytes = decodeBase64Url(payload);
  if (!signature || signature.byteLength !== 32 || !payloadBytes || payloadBytes.byteLength > 768)
    return null;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"]
  );
  const verified = await crypto.subtle.verify("HMAC", key, signature, textEncoder.encode(payload));
  if (!verified) return null;
  let claims: CapabilityClaims;
  try {
    claims = JSON.parse(textDecoder.decode(payloadBytes)) as CapabilityClaims;
  } catch {
    return null;
  }
  if (
    claims.v !== 1 ||
    typeof claims.sid !== "string" ||
    !uuidPattern.test(claims.sid) ||
    (claims.role !== "sender" && claims.role !== "receiver") ||
    typeof claims.exp !== "number" ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= currentMs ||
    claims.exp > currentMs + capabilityLifetimeMaximumMs ||
    typeof claims.jti !== "string" ||
    !/^[A-Za-z0-9_-]{22}$/.test(claims.jti)
  )
    return null;
  return { expiresAtMs: claims.exp, role: claims.role, sessionId: claims.sid };
}

/**
 * Ephemeral two-peer control-plane room. Hibernation attachments retain only a role and expiry;
 * SDP/ICE is forwarded live and never written to Durable Object storage or application storage.
 */
export class ProductionSessionRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("x-flicksend-production-operation") === "revoke") {
      const expiresAtMs = Number(request.headers.get("x-flicksend-signalling-expiry"));
      if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= Date.now())
        return new Response("Unauthorized", { status: 401 });
      await this.state.storage.put("revoked", expiresAtMs);
      await this.state.storage.setAlarm(expiresAtMs);
      for (const { socket } of this.activeSockets()) socket.close(4403, "Session revoked");
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("x-flicksend-production-operation") === "relay-eligibility") {
      const role = request.headers.get("x-flicksend-signalling-role");
      const expiresAtMs = Number(request.headers.get("x-flicksend-signalling-expiry"));
      const result = await this.relayEligibility({
        expiresAtMs,
        role: role === "sender" || role === "receiver" ? role : "invalid"
      });
      return Response.json(result);
    }

    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    const role = request.headers.get("x-flicksend-signalling-role");
    const expiresAtMs = Number(request.headers.get("x-flicksend-signalling-expiry"));
    if (
      (role !== "sender" && role !== "receiver") ||
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs <= Date.now()
    )
      return new Response("Unauthorized", { status: 401 });

    const revokedUntil = await this.state.storage.get<number>("revoked");
    if (revokedUntil && revokedUntil > Date.now())
      return new Response("Unauthorized", { status: 401 });
    if (revokedUntil) await this.state.storage.delete("revoked");

    this.closeExpiredSockets();
    for (const socket of this.socketsForRole(role)) socket.close(4001, "Socket replaced");

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.state.acceptWebSocket(server, [role]);
    server.serializeAttachment({ expiresAtMs, role } satisfies SocketAttachment);
    await this.state.storage.setAlarm(expiresAtMs);
    this.send(server, { type: "session-ready", role: role === "sender" ? "offerer" : "answerer" });
    this.announcePeerJoined();
    return new Response(null, { status: 101, webSocket: client });
  }

  async relayEligibility(
    request: RelayEligibilityRequest | { expiresAtMs: number; role: "invalid" }
  ): Promise<RelayEligibility> {
    if (
      (request.role !== "sender" && request.role !== "receiver") ||
      !Number.isSafeInteger(request.expiresAtMs) ||
      request.expiresAtMs <= Date.now()
    ) {
      return { category: "REJECTED", eligible: false };
    }
    try {
      const revokedUntil = await this.state.storage.get<number>("revoked");
      if (revokedUntil && revokedUntil > Date.now()) return { category: "REJECTED", eligible: false };
      if (revokedUntil) await this.state.storage.delete("revoked");
      return { category: "ELIGIBLE", eligible: true };
    } catch {
      return { category: "UNAVAILABLE", eligible: false };
    }
  }

  async webSocketMessage(socket: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const sender = this.attachment(socket);
    if (!sender || sender.expiresAtMs <= Date.now()) {
      socket.close(4401, "Session expired");
      return;
    }
    this.closeExpiredSockets();
    if (
      typeof message !== "string" ||
      textEncoder.encode(message).byteLength > maxSignallingPayloadBytes
    ) {
      this.sendError(socket, "INVALID_SIGNAL");
      return;
    }
    try {
      const signal = parseSignallingMessage(JSON.parse(message) as unknown);
      if (!signal || ["session-ready", "peer-joined", "peer-left", "error"].includes(signal.type)) {
        this.sendError(socket, "INVALID_SIGNAL");
        return;
      }
      const forwarded = JSON.stringify(signal);
      for (const peer of this.activeSockets())
        if (peer.attachment.role !== sender.role) this.sendText(peer.socket, forwarded);
    } catch {
      this.sendError(socket, "INVALID_JSON");
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): void {
    void code;
    void reason;
    void wasClean;
    const closed = this.attachment(socket);
    if (!closed) return;
    const replacementExists = this.socketsForRole(closed.role).some(
      (candidate) => candidate !== socket
    );
    if (!replacementExists) this.announcePeerLeft();
  }

  webSocketError(socket: WebSocket, error: unknown): void {
    void error;
    socket.close(1011, "Socket error");
  }

  async alarm(): Promise<void> {
    for (const { socket } of this.activeSockets()) socket.close(4401, "Session expired");
    await this.state.storage.deleteAll();
  }

  private activeSockets(): { attachment: SocketAttachment; socket: WebSocket }[] {
    const result: { attachment: SocketAttachment; socket: WebSocket }[] = [];
    for (const socket of this.state.getWebSockets()) {
      const attachment = this.attachment(socket);
      if (attachment) result.push({ attachment, socket });
    }
    return result;
  }

  private attachment(socket: WebSocket): SocketAttachment | null {
    const value = socket.deserializeAttachment() as Partial<SocketAttachment> | null;
    return value &&
      (value.role === "sender" || value.role === "receiver") &&
      typeof value.expiresAtMs === "number" &&
      Number.isSafeInteger(value.expiresAtMs)
      ? { expiresAtMs: value.expiresAtMs, role: value.role }
      : null;
  }

  private socketsForRole(role: SocketAttachment["role"]): WebSocket[] {
    return this.activeSockets()
      .filter((entry) => entry.attachment.role === role)
      .map((entry) => entry.socket);
  }

  private closeExpiredSockets(): void {
    for (const { attachment, socket } of this.activeSockets())
      if (attachment.expiresAtMs <= Date.now()) socket.close(4401, "Session expired");
  }

  private announcePeerJoined(): void {
    const sender = this.socketsForRole("sender")[0];
    const receiver = this.socketsForRole("receiver")[0];
    if (sender && receiver) this.send(sender, { type: "peer-joined" });
  }

  private announcePeerLeft(): void {
    for (const { socket } of this.activeSockets()) this.send(socket, { type: "peer-left" });
  }

  private sendError(socket: WebSocket, code: "INVALID_JSON" | "INVALID_SIGNAL"): void {
    this.send(socket, { code, message: "Invalid signalling message.", type: "error" });
  }

  private send(socket: WebSocket, message: unknown): void {
    this.sendText(socket, JSON.stringify(message));
  }

  private sendText(socket: WebSocket, text: string): void {
    try {
      socket.send(text);
    } catch {
      socket.close(1011, "Socket unavailable");
    }
  }
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}
