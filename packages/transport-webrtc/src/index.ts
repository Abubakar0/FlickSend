import {
  binaryProofBytes,
  binaryProofChunkBytes,
  controlChannelLabel,
  dataChannelLabel,
  makeTestPayload,
  m4RecoveryProtocolVersion,
  m5IntegrityProtocolVersion,
  m6StreamPackProtocolVersion,
  transferProtocolVersion,
  maximumFramePayloadBytes,
  parseHelloMessage,
  type HelloMessage,
  type SignallingMessage,
  verifyTestPayload
} from "@flicksend/protocol";

export type IceRoutePolicy = "AUTO" | "RELAY_ONLY";
export type RouteType = "UNKNOWN" | "DIRECT" | "RELAY";
export type RouteDetail =
  "UNKNOWN" | "DIRECT_HOST" | "DIRECT_SRFLX" | "RELAY_UDP" | "RELAY_TCP" | "RELAY_TLS";
export type IceCandidateType = "host" | "prflx" | "relay" | "srflx" | "unknown";
export type IceTransportProtocol = "tcp" | "tls" | "udp" | "unknown";

/** Safe selected-pair telemetry. Candidate addresses, credentials, SDP, and candidate strings stay private. */
export type RouteDiagnostics = {
  routeType: RouteType;
  routeDetail: RouteDetail;
  localCandidateType: IceCandidateType;
  remoteCandidateType: IceCandidateType;
  /** @deprecated Use transportProtocol. Retained for existing Engine Lab diagnostics. */
  protocol: IceTransportProtocol;
  transportProtocol: IceTransportProtocol;
  relayProtocol: IceTransportProtocol | null;
  candidatePairState: string | null;
  rttMs: number | null;
  availableOutgoingBitrate: number | null;
  bytesSent: number | null;
  bytesReceived: number | null;
};

export type IceConfigurationRequest = {
  sessionCode: string;
  peerId: string;
  policy: IceRoutePolicy;
  /** Development-only negative qualification hook; production callers must omit it. */
  credentialTestMode?: "expired" | "invalid" | "unreachable";
};

export interface IceConfigurationProvider {
  getConfiguration(request: IceConfigurationRequest): Promise<RTCConfiguration>;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class TurnCredentialError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TurnCredentialError";
  }
}

/** Fetches short-lived TURN credentials. The coturn shared secret never enters browser code. */
export class HttpIceConfigurationProvider implements IceConfigurationProvider {
  private readonly fetcher: FetchLike;

  constructor(
    private readonly endpoint: string,
    fetcher?: FetchLike
  ) {
    this.fetcher = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async getConfiguration(request: IceConfigurationRequest): Promise<RTCConfiguration> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
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
    if (!response.ok) {
      const code =
        typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
          ? body.code
          : "FS_TURN_CREDENTIAL_UNAVAILABLE";
      throw new TurnCredentialError(code);
    }
    const credential = parseTurnCredentialResponse(body);
    if (!credential) throw new TurnCredentialError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    return {
      iceServers: [
        ...(credential.stunUrls.length ? [{ urls: credential.stunUrls }] : []),
        {
          urls: credential.turnUrls,
          username: credential.username,
          credential: credential.credential
        }
      ],
      iceTransportPolicy: request.policy === "RELAY_ONLY" ? "relay" : "all"
    };
  }
}

type TurnCredentialResponse = {
  stunUrls: string[];
  turnUrls: string[];
  username: string;
  credential: string;
};

function parseTurnCredentialResponse(value: unknown): TurnCredentialResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  const stunUrls = parseIceUrls(input.stunUrls, "stun");
  const turnUrls = parseIceUrls(input.turnUrls, "turn");
  if (!stunUrls || !turnUrls || !turnUrls.length) return null;
  if (
    typeof input.username !== "string" ||
    !input.username.length ||
    input.username.length > 512 ||
    typeof input.credential !== "string" ||
    !input.credential.length ||
    input.credential.length > 512
  )
    return null;
  return { stunUrls, turnUrls, username: input.username, credential: input.credential };
}

function parseIceUrls(value: unknown, expectedScheme: "stun" | "turn"): string[] | null {
  if (!Array.isArray(value) || value.length > 8) return null;
  const urls: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || candidate.length > 512) return null;
    const pattern = expectedScheme === "stun" ? /^stuns?:/i : /^turns?:/i;
    if (!pattern.test(candidate)) return null;
    urls.push(candidate);
  }
  return urls;
}

export type WebRtcEvents = {
  signal(message: SignallingMessage): void;
  state(state: RTCPeerConnectionState): void;
  ice(state: RTCIceConnectionState): void;
  channel(label: string, state: RTCDataChannelState): void;
  hello(message: HelloMessage): void;
  control(raw: string): void;
  data(frame: ArrayBuffer): void;
  dataSent?(bytes: number): void;
  binary(valid: boolean, bytes: number): void;
  error(message: string): void;
};

const unknownRoute: RouteDiagnostics = {
  routeType: "UNKNOWN",
  routeDetail: "UNKNOWN",
  localCandidateType: "unknown",
  remoteCandidateType: "unknown",
  protocol: "unknown",
  transportProtocol: "unknown",
  relayProtocol: null,
  candidatePairState: null,
  rttMs: null,
  availableOutgoingBitrate: null,
  bytesSent: null,
  bytesReceived: null
};

type CandidatePairStats = RTCStats & {
  availableOutgoingBitrate?: number;
  bytesReceived?: number;
  bytesSent?: number;
  currentRoundTripTime?: number;
  localCandidateId?: string;
  nominated?: boolean;
  remoteCandidateId?: string;
  selected?: boolean;
  state?: string;
};

type CandidateStats = RTCStats & {
  candidateType?: string;
  protocol?: string;
  relayProtocol?: string;
};

type TransportStats = RTCStats & { selectedCandidatePairId?: string };

export function selectedRouteDiagnostics(stats: RTCStatsReport): RouteDiagnostics {
  let pair: CandidatePairStats | undefined;
  let selectedPairId: string | undefined;
  stats.forEach((value) => {
    if (
      value.type === "transport" &&
      typeof (value as TransportStats).selectedCandidatePairId === "string"
    )
      selectedPairId = (value as TransportStats).selectedCandidatePairId;
  });
  if (selectedPairId) {
    const selected = stats.get(selectedPairId) as CandidatePairStats | undefined;
    if (selected?.type === "candidate-pair") pair = selected;
  }
  stats.forEach((value) => {
    if (
      !pair &&
      value.type === "candidate-pair" &&
      value.state === "succeeded" &&
      (value.nominated === true || value.selected === true)
    ) {
      pair = value as CandidatePairStats;
    }
  });

  if (!pair) return unknownRoute;

  const local = stats.get(pair.localCandidateId ?? "") as CandidateStats | undefined;
  const remote = stats.get(pair.remoteCandidateId ?? "") as CandidateStats | undefined;
  const localCandidateType = normalizeCandidateType(local?.candidateType);
  const remoteCandidateType = normalizeCandidateType(remote?.candidateType);
  const transportProtocol = normalizeTransportProtocol(local?.protocol ?? remote?.protocol);
  const relayProtocol =
    localCandidateType === "relay" || remoteCandidateType === "relay"
      ? normalizeTransportProtocol(local?.relayProtocol ?? remote?.relayProtocol ?? local?.protocol)
      : null;
  const route = classifyRoute(
    localCandidateType,
    remoteCandidateType,
    transportProtocol,
    relayProtocol
  );
  return {
    routeType: route.type,
    routeDetail: route.detail,
    localCandidateType,
    remoteCandidateType,
    protocol: transportProtocol,
    transportProtocol,
    relayProtocol,
    candidatePairState: typeof pair.state === "string" ? pair.state : null,
    rttMs: finiteMetric(pair.currentRoundTripTime, 1000),
    availableOutgoingBitrate: finiteMetric(pair.availableOutgoingBitrate),
    bytesSent: finiteMetric(pair.bytesSent),
    bytesReceived: finiteMetric(pair.bytesReceived)
  };
}

function normalizeCandidateType(value: unknown): IceCandidateType {
  return value === "host" || value === "prflx" || value === "relay" || value === "srflx"
    ? value
    : "unknown";
}

function normalizeTransportProtocol(value: unknown): IceTransportProtocol {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return normalized === "udp" || normalized === "tcp" || normalized === "tls"
    ? normalized
    : "unknown";
}

function finiteMetric(value: unknown, multiplier = 1): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value * multiplier
    : null;
}

function classifyRoute(
  localCandidateType: IceCandidateType,
  remoteCandidateType: IceCandidateType,
  transportProtocol: IceTransportProtocol,
  relayProtocol: IceTransportProtocol | null
): { type: RouteType; detail: RouteDetail } {
  if (localCandidateType === "relay" || remoteCandidateType === "relay") {
    const protocol = relayProtocol ?? transportProtocol;
    return {
      type: "RELAY",
      detail: protocol === "tls" ? "RELAY_TLS" : protocol === "tcp" ? "RELAY_TCP" : "RELAY_UDP"
    };
  }
  if (localCandidateType === "unknown" || remoteCandidateType === "unknown")
    return { type: "UNKNOWN", detail: "UNKNOWN" };
  return {
    type: "DIRECT",
    detail:
      localCandidateType === "host" && remoteCandidateType === "host"
        ? "DIRECT_HOST"
        : "DIRECT_SRFLX"
  };
}

type BufferedAmountChannel = Pick<
  RTCDataChannel,
  | "addEventListener"
  | "bufferedAmount"
  | "bufferedAmountLowThreshold"
  | "readyState"
  | "removeEventListener"
>;

export async function waitForDataChannelBufferedAmountLow(
  channel: BufferedAmountChannel,
  highWater: number,
  lowWater: number
): Promise<number> {
  if (channel.readyState !== "open") throw new Error("The data channel is not open.");
  if (channel.bufferedAmount < highWater) return 0;
  channel.bufferedAmountLowThreshold = lowWater;
  const startedAt = performance.now();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(poll);
      channel.removeEventListener("bufferedamountlow", onLow);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      fail(new Error("Data channel backpressure timed out."));
    }, 30_000);
    const onLow = () => finish();
    channel.addEventListener("bufferedamountlow", onLow, { once: true });
    // Chromium can drain below the threshold without dispatching an event after a long sequence of
    // small ordered writes. Polling remains bounded and keeps the same low-water gate intact.
    const poll = setInterval(() => {
      if (channel.readyState !== "open")
        return fail(new Error("The data channel closed while waiting for backpressure."));
      if (channel.bufferedAmount <= lowWater) finish();
    }, 100);
    // The event may fire between the initial high-water check and listener registration.
    if (channel.bufferedAmount <= lowWater) finish();
  });
  return performance.now() - startedAt;
}

export class WebRtcTransport {
  readonly peerConnection: RTCPeerConnection;
  private controlChannel?: RTCDataChannel;
  private dataChannel?: RTCDataChannel;
  private offerChannelsCreated = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private operations = Promise.resolve();
  private receivedProofBytes = 0;

  constructor(
    private readonly events: WebRtcEvents,
    configuration: RTCConfiguration = {}
  ) {
    this.peerConnection = new RTCPeerConnection(configuration);
    this.peerConnection.onicecandidate = ({ candidate }) => {
      const value = candidate?.toJSON();
      const candidateValue = value?.candidate;
      if (!candidateValue) return;
      this.events.signal({
        type: "ice-candidate",
        candidate: {
          candidate: candidateValue,
          sdpMid: value.sdpMid ?? null,
          sdpMLineIndex: value.sdpMLineIndex ?? null,
          usernameFragment: value.usernameFragment ?? undefined
        }
      });
    };
    this.peerConnection.onconnectionstatechange = () =>
      this.events.state(this.peerConnection.connectionState);
    this.peerConnection.oniceconnectionstatechange = () =>
      this.events.ice(this.peerConnection.iceConnectionState);
    this.peerConnection.ondatachannel = ({ channel }) => this.attachChannel(channel);
  }

  createOfferChannels(): void {
    if (this.offerChannelsCreated) return;
    this.offerChannelsCreated = true;
    this.attachChannel(
      this.peerConnection.createDataChannel(controlChannelLabel, { ordered: true })
    );
    this.attachChannel(this.peerConnection.createDataChannel(dataChannelLabel, { ordered: true }));
  }

  async createOffer(iceRestart = false): Promise<void> {
    const offer = await this.peerConnection.createOffer({ iceRestart });
    await this.peerConnection.setLocalDescription(offer);
    if (!offer.sdp) throw new Error("WebRTC produced an offer without SDP.");
    this.events.signal({ type: "offer", sdp: offer.sdp });
  }

  acceptSignal(message: SignallingMessage): Promise<void> {
    this.operations = this.operations.then(async () => {
      if (message.type === "offer") {
        await this.peerConnection.setRemoteDescription({ type: "offer", sdp: message.sdp });
        await this.applyPendingCandidates();
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        if (!answer.sdp) throw new Error("WebRTC produced an answer without SDP.");
        this.events.signal({ type: "answer", sdp: answer.sdp });
        return;
      }

      if (message.type === "answer") {
        await this.peerConnection.setRemoteDescription({ type: "answer", sdp: message.sdp });
        await this.applyPendingCandidates();
        return;
      }

      if (message.type === "ice-candidate") {
        if (!this.peerConnection.remoteDescription) {
          this.pendingCandidates.push(message.candidate);
        } else {
          await this.peerConnection.addIceCandidate(message.candidate);
        }
      }
    });
    return this.operations;
  }

  sendHello(peerId: string): void {
    if (this.controlChannel?.readyState !== "open") {
      this.events.error("The control channel is not open.");
      return;
    }
    this.controlChannel.send(
      JSON.stringify({
        type: "HELLO",
        protocolVersion: 1,
        peerId,
        browserCapabilities: { dataChannel: true, webRtc: true },
        timestamp: Date.now()
      })
    );
  }

  sendBinaryProof(): void {
    if (this.dataChannel?.readyState !== "open") {
      this.events.error("The data channel is not open.");
      return;
    }
    for (let offset = 0; offset < binaryProofBytes; offset += binaryProofChunkBytes) {
      const payload = makeTestPayload(
        Math.min(binaryProofChunkBytes, binaryProofBytes - offset),
        offset
      );
      const frame = new Uint8Array(4 + payload.byteLength);
      new DataView(frame.buffer).setUint32(0, offset);
      frame.set(payload, 4);
      this.dataChannel.send(frame.buffer);
    }
  }

  sendControl(raw: string): boolean {
    if (this.controlChannel?.readyState !== "open") return false;
    this.controlChannel.send(raw);
    return true;
  }

  sendData(frame: ArrayBuffer): boolean {
    if (this.dataChannel?.readyState !== "open") return false;
    this.dataChannel.send(frame);
    this.events.dataSent?.(frame.byteLength);
    return true;
  }

  get bufferedAmount(): number {
    return this.dataChannel?.bufferedAmount ?? 0;
  }

  get maximumDataMessageBytes(): number {
    // Chromium reported a 262,160-byte SCTP maximum but rejected a 262,160-byte ArrayBuffer.
    // Keep the whole wire frame at or below the conservative 256 KiB interoperability ceiling.
    return Math.min(this.peerConnection.sctp?.maxMessageSize || 65_535, maximumFramePayloadBytes);
  }

  async waitForBufferedAmountLow(highWater: number, lowWater: number): Promise<number> {
    const channel = this.dataChannel;
    if (!channel || channel.readyState !== "open") throw new Error("The data channel is not open.");
    return waitForDataChannelBufferedAmountLow(channel, highWater, lowWater);
  }

  async diagnostics(): Promise<RouteDiagnostics> {
    return selectedRouteDiagnostics(await this.peerConnection.getStats());
  }

  close(): void {
    this.controlChannel?.close();
    this.dataChannel?.close();
    this.peerConnection.close();
  }

  private async applyPendingCandidates(): Promise<void> {
    for (const candidate of this.pendingCandidates)
      await this.peerConnection.addIceCandidate(candidate);
    this.pendingCandidates = [];
  }

  private attachChannel(channel: RTCDataChannel): void {
    if (channel.label === controlChannelLabel) this.controlChannel = channel;
    if (channel.label === dataChannelLabel) this.dataChannel = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => this.events.channel(channel.label, channel.readyState);
    channel.onclose = () => this.events.channel(channel.label, channel.readyState);
    channel.onmessage = ({ data }) => {
      if (channel.label === controlChannelLabel && typeof data === "string") {
        try {
          const hello = parseHelloMessage(JSON.parse(data) as unknown);
          if (hello) this.events.hello(hello);
          else this.events.control(data);
        } catch {
          this.events.error("Received malformed control JSON.");
        }
      }
      if (channel.label === dataChannelLabel && data instanceof ArrayBuffer) {
        // FSTP frames can be smaller than the legacy proof chunks. Dispatch every
        // supported version by its versioned prefix before considering that fixture.
        const version = data.byteLength >= 2 ? new DataView(data).getUint8(0) : 0;
        if (
          (version === transferProtocolVersion ||
            version === m4RecoveryProtocolVersion ||
            version === m5IntegrityProtocolVersion ||
            version === m6StreamPackProtocolVersion) &&
          data.byteLength >= 20
        )
          this.events.data(data);
        else if (data.byteLength <= binaryProofChunkBytes + 4) this.receiveProofChunk(data);
        else this.events.data(data);
      }
    };
  }

  private receiveProofChunk(frame: ArrayBuffer): void {
    if (frame.byteLength < 5 || frame.byteLength > binaryProofChunkBytes + 4) {
      this.events.binary(false, frame.byteLength);
      return;
    }

    const offset = new DataView(frame).getUint32(0);
    const payload = frame.slice(4);
    if (offset !== this.receivedProofBytes || !verifyTestPayload(payload, offset)) {
      this.events.binary(false, this.receivedProofBytes + payload.byteLength);
      this.receivedProofBytes = 0;
      return;
    }

    this.receivedProofBytes += payload.byteLength;
    if (this.receivedProofBytes === binaryProofBytes) {
      this.events.binary(true, this.receivedProofBytes);
      this.receivedProofBytes = 0;
    }
  }
}
