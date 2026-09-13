import { z } from "zod";

export * from "./transfer.js";

export const fstpProtocolVersion = 1;
export const controlChannelLabel = "fs-control-v1";
export const dataChannelLabel = "fs-data-v1";
export const maxSignallingPayloadBytes = 16_384;
export const maxSessionCodeLength = 6;
export const binaryProofBytes = 1024 * 1024;
export const binaryProofChunkBytes = 16 * 1024;

export const connectionStates = [
  "IDLE",
  "SIGNALLING_CONNECTING",
  "WAITING_FOR_PEER",
  "NEGOTIATING",
  "CONNECTING",
  "CONNECTED",
  "DISCONNECTED",
  "RECONNECTING",
  "FAILED",
  "CLOSED"
] as const;
export type ConnectionState = (typeof connectionStates)[number];

export const connectionTransitions: Record<ConnectionState, readonly ConnectionState[]> = {
  IDLE: ["SIGNALLING_CONNECTING", "CLOSED"],
  SIGNALLING_CONNECTING: ["WAITING_FOR_PEER", "RECONNECTING", "DISCONNECTED", "FAILED", "CLOSED"],
  WAITING_FOR_PEER: [
    "NEGOTIATING",
    "CONNECTING",
    "DISCONNECTED",
    "RECONNECTING",
    "FAILED",
    "CLOSED"
  ],
  NEGOTIATING: ["CONNECTING", "CONNECTED", "DISCONNECTED", "RECONNECTING", "FAILED", "CLOSED"],
  CONNECTING: ["CONNECTED", "DISCONNECTED", "RECONNECTING", "FAILED", "CLOSED"],
  CONNECTED: ["CONNECTING", "DISCONNECTED", "RECONNECTING", "FAILED", "CLOSED"],
  DISCONNECTED: [
    "SIGNALLING_CONNECTING",
    "WAITING_FOR_PEER",
    "NEGOTIATING",
    "RECONNECTING",
    "FAILED",
    "CLOSED"
  ],
  RECONNECTING: ["CONNECTED", "DISCONNECTED", "FAILED", "CLOSED"],
  FAILED: ["SIGNALLING_CONNECTING", "CLOSED"],
  CLOSED: ["IDLE", "SIGNALLING_CONNECTING"]
};

export function canTransitionConnectionState(
  current: ConnectionState,
  next: ConnectionState
): boolean {
  return current === next || connectionTransitions[current].includes(next);
}

const candidateSchema = z.object({
  candidate: z.string().max(maxSignallingPayloadBytes),
  sdpMid: z.string().max(64).nullable(),
  sdpMLineIndex: z.number().int().min(0).max(16).nullable(),
  usernameFragment: z.string().max(256).optional()
});

const routeGenerationSchema = z.number().int().positive().max(2_147_483_647).optional();

export const signallingMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session-ready"), role: z.enum(["offerer", "answerer"]) }),
  z.object({ type: z.literal("peer-joined") }),
  z.object({ type: z.literal("peer-left") }),
  z.object({
    type: z.literal("offer"),
    sdp: z.string().min(1).max(maxSignallingPayloadBytes),
    routeGeneration: routeGenerationSchema
  }),
  z.object({
    type: z.literal("answer"),
    sdp: z.string().min(1).max(maxSignallingPayloadBytes),
    routeGeneration: routeGenerationSchema
  }),
  z.object({
    type: z.literal("ice-candidate"),
    candidate: candidateSchema,
    routeGeneration: routeGenerationSchema
  }),
  z.object({ type: z.literal("error"), code: z.string().max(64), message: z.string().max(256) })
]);
export type SignallingMessage = z.infer<typeof signallingMessageSchema>;

export const helloMessageSchema = z.object({
  type: z.literal("HELLO"),
  protocolVersion: z.literal(fstpProtocolVersion),
  peerId: z.string().uuid(),
  browserCapabilities: z.object({ dataChannel: z.boolean(), webRtc: z.boolean() }),
  timestamp: z.number().int().positive()
});
export type HelloMessage = z.infer<typeof helloMessageSchema>;

export function normalizeSessionCode(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function formatSessionCode(value: string): string | null {
  const normalized = normalizeSessionCode(value);
  return normalized ? `${normalized.slice(0, 3)} ${normalized.slice(3)}` : null;
}

export function parseSignallingMessage(value: unknown): SignallingMessage | null {
  return signallingMessageSchema.safeParse(value).data ?? null;
}

export function parseHelloMessage(value: unknown): HelloMessage | null {
  return helloMessageSchema.safeParse(value).data ?? null;
}

export function makeTestPayload(size = binaryProofBytes, offset = 0): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    payload[index] = ((offset + index) * 31 + 17) % 251;
  }
  return payload;
}

export function verifyTestPayload(value: ArrayBuffer, offset = 0): boolean {
  const expected = makeTestPayload(value.byteLength, offset);
  const actual = new Uint8Array(value);
  return actual.every((byte, index) => byte === expected[index]);
}
