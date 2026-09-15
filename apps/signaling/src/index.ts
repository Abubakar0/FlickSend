import {
  maxSignallingPayloadBytes,
  normalizeSessionCode,
  parseSignallingMessage
} from "@flicksend/protocol";
import {
  boundedTurnTtl,
  createTurnCredential,
  parseStunUrls,
  parseTurnUrls
} from "./turn-credentials.js";
import {
  ProductionSessionRoom,
  verifyProductionSignallingCapability
} from "./production-signaling.js";

export interface Env {
  SESSION_DIRECTORY: DurableObjectNamespace;
  SESSION_ROOM: DurableObjectNamespace;
  PRODUCTION_SESSION_ROOM: DurableObjectNamespace;
  SIGNALING_CAPABILITY_SECRET?: string;
  STUN_URLS?: string;
  TURN_CREDENTIAL_TTL_SECONDS?: string;
  TURN_DEV_MODE?: string;
  TURN_SHARED_SECRET?: string;
  TURN_URLS?: string;
}

type Session = { id: string; expiresAt: number };
type Role = "offerer" | "answerer";
type RoomMember = { role: Role; expiresAt: number };

const sessionLifetimeMs = 30 * 60_000;
const textEncoder = new TextEncoder();

export class SessionDirectory {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/create" && request.method === "POST") {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const random = crypto.getRandomValues(new Uint32Array(1));
        const code = String(random[0]! % 1_000_000).padStart(6, "0");
        const existing = await this.state.storage.get<Session>(code);
        if (existing && existing.expiresAt > Date.now()) continue;
        const session = { id: crypto.randomUUID(), expiresAt: Date.now() + sessionLifetimeMs };
        await this.state.storage.put({ [code]: session, ["session:" + session.id]: session });
        return Response.json({ code });
      }
      return new Response("Unable to allocate a session code", { status: 503 });
    }

    const code = normalizeSessionCode(url.searchParams.get("code") ?? "");
    if (url.pathname === "/register" && request.method === "POST")
      return this.registerMember(
        url.searchParams.get("sessionId") ?? "",
        url.searchParams.get("peerId") ?? ""
      );
    if (url.pathname === "/authorize" && request.method === "POST")
      return this.authorizeMember(
        url.searchParams.get("sessionId") ?? "",
        url.searchParams.get("peerId") ?? ""
      );
    const session = code ? await this.state.storage.get<Session>(code) : undefined;
    if (!session || session.expiresAt <= Date.now())
      return new Response("Session not found", { status: 404 });
    return Response.json(session);
  }

  private async registerMember(sessionId: string, peerId: string): Promise<Response> {
    const session = await this.state.storage.get<Session>("session:" + sessionId);
    if (!isUuid(sessionId) || !isUuid(peerId) || !session || session.expiresAt <= Date.now())
      return Response.json({ code: "FS_TURN_AUTH_FAILED" }, { status: 401 });
    await this.state.storage.put("session-member:" + sessionId + ":" + peerId, {
      expiresAt: session.expiresAt
    });
    return Response.json({ registered: true });
  }

  private async authorizeMember(sessionId: string, peerId: string): Promise<Response> {
    const session = await this.state.storage.get<Session>("session:" + sessionId);
    const member = await this.state.storage.get<{ expiresAt: number }>(
      "session-member:" + sessionId + ":" + peerId
    );
    if (
      !isUuid(sessionId) ||
      !isUuid(peerId) ||
      !session ||
      !member ||
      session.expiresAt <= Date.now() ||
      member.expiresAt <= Date.now()
    )
      return Response.json({ code: "FS_TURN_AUTH_FAILED" }, { status: 401 });
    const rateKey = "turn-issued:" + sessionId + ":" + peerId;
    const lastIssuedAt = await this.state.storage.get<number>(rateKey);
    if (lastIssuedAt && Date.now() - lastIssuedAt < 250)
      return Response.json({ code: "FS_TURN_RATE_LIMITED" }, { status: 429 });
    await this.state.storage.put(rateKey, Date.now());
    return Response.json({ authorized: true });
  }
}

export class SessionRoom {
  private readonly peers = new Map<WebSocket, string>();

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("WebSocket required", { status: 426 });

    const peerId = requestUrl(request).searchParams.get("peerId");
    if (!peerId || !isUuid(peerId)) return new Response("Invalid peer identity", { status: 400 });
    if (this.peers.size >= 2 && ![...this.peers.values()].includes(peerId)) {
      return new Response("Session is full", { status: 409 });
    }

    const memberKey = "member:" + peerId;
    let member = await this.state.storage.get<RoomMember>(memberKey);
    if (!member || member.expiresAt <= Date.now()) {
      const existingMembers = await this.state.storage.list<RoomMember>({ prefix: "member:" });
      const activeMembers = [...existingMembers.entries()].filter(
        ([, value]) => value.expiresAt > Date.now()
      );
      if (activeMembers.length >= 2) return new Response("Session is full", { status: 409 });
      member = {
        role: activeMembers.length === 0 ? "offerer" : "answerer",
        expiresAt: Date.now() + sessionLifetimeMs
      };
      await this.state.storage.put(memberKey, member);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.peers.set(server, peerId);
    this.send(server, { type: "session-ready", role: member.role });
    if (this.peers.size === 2) this.broadcast({ type: "peer-joined" });
    server.addEventListener("message", ({ data }) => this.forward(server, data));
    server.addEventListener("close", () => {
      this.peers.delete(server);
      this.broadcast({ type: "peer-left" });
    });
    server.addEventListener("error", () => this.peers.delete(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  private forward(sender: WebSocket, raw: unknown): void {
    if (typeof raw !== "string" || textEncoder.encode(raw).byteLength > maxSignallingPayloadBytes) {
      this.sendError(sender, "INVALID_SIGNAL", "Signalling messages must be bounded JSON text.");
      return;
    }

    try {
      const message = parseSignallingMessage(JSON.parse(raw) as unknown);
      if (
        !message ||
        ["session-ready", "peer-joined", "peer-left", "error"].includes(message.type)
      ) {
        this.sendError(sender, "INVALID_SIGNAL", "Unsupported signalling message.");
        return;
      }
      for (const peer of this.peers.keys())
        if (peer !== sender) this.sendText(peer, JSON.stringify(message));
    } catch {
      this.sendError(sender, "INVALID_JSON", "Signalling messages must be valid JSON.");
    }
  }

  private broadcast(message: unknown): void {
    for (const peer of this.peers.keys()) this.send(peer, message);
  }

  private sendError(peer: WebSocket, code: string, message: string): void {
    this.send(peer, { type: "error", code, message });
  }

  private send(peer: WebSocket, message: unknown): void {
    this.sendText(peer, JSON.stringify(message));
  }

  private sendText(peer: WebSocket, text: string): void {
    try {
      peer.send(text);
    } catch {
      // A peer can close between event dispatch and send. It is no longer a room member.
      this.peers.delete(peer);
    }
  }
}

function requestUrl(request: Request): URL {
  return new URL(request.url);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * The Worker verifies the raw bearer capability. The Durable Object receives only the derived
 * role and expiry and never gets the capability in its URL, headers, or persistent state.
 */
function productionRoomRequest(request: Request, headers: Headers): Request {
  headers.delete("authorization");
  headers.delete("cookie");
  return new Request("https://flicksend-production-room.internal/session", {
    headers,
    method: request.method
  });
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "content-type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = requestUrl(request);
    if (request.method === "OPTIONS") return withCors(request, new Response(null, { status: 204 }));
    if (url.pathname === "/health") return withCors(request, Response.json({ ok: true }));
    const directory = env.SESSION_DIRECTORY.get(env.SESSION_DIRECTORY.idFromName("directory"));
    if (url.pathname === "/sessions" && request.method === "POST") {
      return withCors(
        request,
        await directory.fetch("https://directory/create", { method: "POST" })
      );
    }
    if (url.pathname === "/turn-credentials" && request.method === "POST") {
      return withCors(request, await issueTurnCredentials(request, env, directory));
    }
    if (url.pathname === "/v2/session") {
      const capability = await verifyProductionSignallingCapability(
        url.searchParams.get("cap"),
        env.SIGNALING_CAPABILITY_SECRET
      );
      if (!capability) return new Response("Unauthorized", { status: 401 });
      const headers = new Headers(request.headers);
      headers.set("x-flicksend-signalling-role", capability.role);
      headers.set("x-flicksend-signalling-expiry", String(capability.expiresAtMs));
      return env.PRODUCTION_SESSION_ROOM.get(
        env.PRODUCTION_SESSION_ROOM.idFromName(`p12:${capability.sessionId}`)
      ).fetch(productionRoomRequest(request, headers));
    }
    if (url.pathname === "/v2/revoke" && request.method === "POST") {
      const capability = await verifyProductionSignallingCapability(
        url.searchParams.get("cap"),
        env.SIGNALING_CAPABILITY_SECRET
      );
      if (!capability) return new Response("Unauthorized", { status: 401 });
      const headers = new Headers();
      headers.set("x-flicksend-production-operation", "revoke");
      headers.set("x-flicksend-signalling-expiry", String(capability.expiresAtMs));
      return env.PRODUCTION_SESSION_ROOM.get(
        env.PRODUCTION_SESSION_ROOM.idFromName(`p12:${capability.sessionId}`)
      ).fetch(
        new Request("https://flicksend-production-room.internal/revoke", {
          headers,
          method: "POST"
        })
      );
    }
    if (url.pathname === "/session") {
      const lookup = await directory.fetch(
        "https://directory/lookup?code=" + (url.searchParams.get("code") ?? "")
      );
      if (!lookup.ok) return lookup;
      const session = (await lookup.json()) as Session;
      const registration = await directory.fetch(
        `https://directory/register?sessionId=${encodeURIComponent(session.id)}&peerId=${encodeURIComponent(url.searchParams.get("peerId") ?? "")}`,
        { method: "POST" }
      );
      if (!registration.ok)
        return Response.json({ code: "FS_TURN_AUTH_FAILED" }, { status: registration.status });
      return env.SESSION_ROOM.get(env.SESSION_ROOM.idFromName(session.id)).fetch(request);
    }
    return new Response("Not found", { status: 404 });
  }
};

export { ProductionSessionRoom };

type TurnRequest = {
  sessionCode: string;
  peerId: string;
  credentialTestMode?: "expired" | "invalid" | "unreachable";
};

async function issueTurnCredentials(
  request: Request,
  env: Env,
  directory: DurableObjectStub
): Promise<Response> {
  const parsed = await parseTurnRequest(request);
  if (!parsed) return Response.json({ code: "FS_TURN_AUTH_FAILED" }, { status: 400 });
  if (parsed.credentialTestMode && env.TURN_DEV_MODE !== "true")
    return Response.json({ code: "FS_TURN_AUTH_FAILED" }, { status: 403 });
  // The explicit endpoint failure exercises the browser's non-leaking credential error path. The
  // separate expired mode creates a real coturn allocation rejection without exposing a secret.
  if (parsed.credentialTestMode === "invalid")
    return Response.json({ code: "FS_TURN_AUTH_FAILED" }, { status: 401 });
  if (!env.TURN_SHARED_SECRET || env.TURN_SHARED_SECRET.length < 32)
    return Response.json({ code: "FS_TURN_CREDENTIAL_UNAVAILABLE" }, { status: 503 });
  const turnUrls =
    parseTurnUrls(env.TURN_URLS) ??
    (env.TURN_DEV_MODE === "true"
      ? ["turn:127.0.0.1:3478?transport=udp", "turn:127.0.0.1:3478?transport=tcp"]
      : null);
  const stunUrls =
    parseStunUrls(env.STUN_URLS) ?? (env.TURN_DEV_MODE === "true" ? ["stun:127.0.0.1:3478"] : null);
  if (!turnUrls || !stunUrls)
    return Response.json({ code: "FS_TURN_CREDENTIAL_UNAVAILABLE" }, { status: 503 });

  const lookup = await directory.fetch(
    "https://directory/lookup?code=" + encodeURIComponent(parsed.sessionCode)
  );
  if (!lookup.ok) return Response.json({ code: "FS_TURN_AUTH_FAILED" }, { status: 401 });
  const session = (await lookup.json()) as Session;
  const authorization = await directory.fetch(
    `https://directory/authorize?sessionId=${encodeURIComponent(session.id)}&peerId=${encodeURIComponent(parsed.peerId)}`,
    { method: "POST" }
  );
  if (!authorization.ok) {
    const body = (await authorization.json().catch(() => null)) as { code?: string } | null;
    return Response.json(
      { code: body?.code ?? "FS_TURN_AUTH_FAILED" },
      { status: authorization.status }
    );
  }

  const credential = await createTurnCredential(
    {
      sharedSecret: env.TURN_SHARED_SECRET,
      ttlSeconds: boundedTurnTtl(env.TURN_CREDENTIAL_TTL_SECONDS)
    },
    parsed.peerId,
    parsed.credentialTestMode === "expired"
      ? Date.now() - boundedTurnTtl(env.TURN_CREDENTIAL_TTL_SECONDS) * 2_000
      : Date.now()
  );
  return Response.json({
    stunUrls,
    turnUrls:
      parsed.credentialTestMode === "unreachable" ? ["turn:127.0.0.1:9?transport=udp"] : turnUrls,
    username: credential.username,
    credential: credential.credential
  });
}

async function parseTurnRequest(request: Request): Promise<TurnRequest | null> {
  const body = await request.text();
  if (textEncoder.encode(body).byteLength > 1_024) return null;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  const sessionCode =
    typeof input.sessionCode === "string" ? normalizeSessionCode(input.sessionCode) : null;
  if (!sessionCode || typeof input.peerId !== "string" || !isUuid(input.peerId)) return null;
  if (
    input.credentialTestMode !== undefined &&
    input.credentialTestMode !== "invalid" &&
    input.credentialTestMode !== "expired" &&
    input.credentialTestMode !== "unreachable"
  )
    return null;
  return {
    sessionCode,
    peerId: input.peerId,
    credentialTestMode: input.credentialTestMode as
      "expired" | "invalid" | "unreachable" | undefined
  };
}
