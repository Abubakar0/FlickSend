import {
  canTransitionConnectionState,
  decodeDataFrame,
  formatSessionCode,
  m5IntegrityProtocolVersion,
  m6StreamPackProtocolVersion,
  normalizeSessionCode,
  parseSignallingMessage,
  type ConnectionState,
  type SignallingMessage
} from "@flicksend/protocol";
import {
  sourceFromFile,
  type RandomAccessFileDestination,
  type StreamPackDestination
} from "@flicksend/filesystem-browser";
import type { RecoveryStore } from "@flicksend/resume";
import type { StreamPackSource } from "@flicksend/stream-pack";
import {
  createInitialTransferHealthSnapshot,
  TransferHealthAnalyzer,
  type RawTransferMetrics,
  type SpeedProofRecord,
  type TransferHealthConfig,
  type TransferHealthSnapshot
} from "@flicksend/transfer-health";
import {
  HttpIceConfigurationProvider,
  TurnCredentialError,
  WebRtcTransport,
  type IceConfigurationProvider,
  type IceRoutePolicy
} from "@flicksend/transport-webrtc";
import { initialTransferSnapshot, type TransferSnapshot } from "./transfer.js";
import { M5IntegritySingleFileTransfer, type IntegrityFault } from "./m5-integrity-transfer.js";
import { M6StreamPackTransfer } from "./m6-stream-pack-transfer.js";
import { RouteCoordinator, initialRouteSnapshot, type RouteSnapshot } from "./route.js";
import { mergeTransferTuning, m3BenchmarkDefaults, type TransferTuning } from "./tuning.js";

export {
  m3BenchmarkDefaults,
  mergeTransferTuning,
  validateTransferTuning,
  type TransferTuning
} from "./tuning.js";
export type { TransferMetrics } from "./metrics.js";
export {
  commitBlockAndCreateAcknowledgement,
  createHaveBlocksPages,
  createResumeOffer,
  ReceiverRecoveryCheckpoint,
  RecoveryReconciler
} from "./recovery.js";
export {
  m4DefaultCopyBlockBytes,
  m4DefaultCopyFrameBytes,
  ResumableBlockCopy,
  type ResumableCopyOptions
} from "./resumable-copy.js";
export { M4ResumableReceiver, M4ResumableSender, type M4FrameSender } from "./m4-transfer.js";
export { ResumableSingleFileTransfer, type ResumableAcceptOptions } from "./resumable-transfer.js";
export {
  M5IntegritySingleFileTransfer,
  type IntegrityFault,
  type M5ResumableAcceptOptions
} from "./m5-integrity-transfer.js";
export { M6StreamPackTransfer, type M6AcceptOptions } from "./m6-stream-pack-transfer.js";
export { RouteCoordinator, initialRouteSnapshot, type RouteSnapshot } from "./route.js";
export type { IceRoutePolicy } from "@flicksend/transport-webrtc";
export {
  createInitialTransferHealthSnapshot,
  defaultTransferHealthConfig,
  TransferHealthAnalyzer
} from "@flicksend/transfer-health";
export type {
  RawTransferMetrics,
  SpeedProofRecord,
  TransferBottleneck,
  TransferHealthConfig,
  TransferHealthSnapshot
} from "@flicksend/transfer-health";

export type RouteRecoveryOptions = {
  disconnectedGraceMs: number;
  iceRestartTimeoutMs: number;
  replacementConnectionTimeoutMs: number;
  maxReplacementAttempts: number;
  retryBackoffMs: number;
};

export const defaultRouteRecoveryOptions: RouteRecoveryOptions = {
  disconnectedGraceMs: 2_000,
  iceRestartTimeoutMs: 8_000,
  replacementConnectionTimeoutMs: 15_000,
  maxReplacementAttempts: 2,
  retryBackoffMs: 500
};

export type ConnectionCoordinatorOptions = {
  iceServers?: RTCIceServer[];
  iceConfigurationProvider?: IceConfigurationProvider;
  /** Browser-safe URL for a server-side short-lived TURN credential endpoint. */
  turnCredentialEndpoint?: string;
  routeRecovery?: Partial<RouteRecoveryOptions>;
  tuning?: TransferTuning;
  /** Set false only for controlled diagnostics-overhead comparison. Transfer semantics never change. */
  transferHealth?: false | Partial<TransferHealthConfig>;
};

/**
 * An application-issued bearer capability for the P12 signaling control plane. It intentionally
 * has no transfer identity, account identifier, source metadata, or payload authority.
 */
export type AuthorizedSignallingSession = {
  accessToken: string;
  expiresAtMs: number;
};

export type ConnectionSnapshot = {
  state: ConnectionState;
  sessionCode: string | null;
  signalling: string;
  peer: string;
  ice: string;
  control: string;
  data: string;
  route: RouteSnapshot;
  helloReceived: boolean;
  binaryResult: string | null;
  /** Bounded connection-stage trace for Engine Lab diagnosis; it excludes payload and paths. */
  connectionTrace: readonly string[];
  transfer: TransferSnapshot;
  /** Aggregate transfer diagnostics. It contains no filenames, paths, payload, or credentials. */
  health: TransferHealthSnapshot | null;
  /** Frozen terminal diagnostics record for a completed transfer. */
  speedProof: SpeedProofRecord | null;
  error: string | null;
};

export class ConnectionCoordinator {
  private socket?: WebSocket;
  private transport?: WebRtcTransport;
  private pendingTransport?: Promise<WebRtcTransport | undefined>;
  private fileTransfer?: M5IntegritySingleFileTransfer;
  private folderTransfer?: M6StreamPackTransfer;
  private role?: "offerer" | "answerer";
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private routeRecoveryTimer?: ReturnType<typeof setTimeout>;
  private routeConnectionTimer?: ReturnType<typeof setTimeout>;
  private routeDiagnosticsTimer?: ReturnType<typeof setTimeout>;
  private healthSamplingTimer?: ReturnType<typeof setTimeout>;
  private closedByUser = false;
  private simulatedReconnectHeld = false;
  private reconnectAttempts = 0;
  private routeRecoveryAttempts = 0;
  private sessionCode?: string;
  private signallingAccessToken?: string;
  private routePolicy: IceRoutePolicy = "AUTO";
  private nextRecoveryPolicy?: IceRoutePolicy;
  private credentialTestMode?: "expired" | "invalid" | "unreachable";
  private currentPeerState: RTCPeerConnectionState = "new";
  private remoteRouteGeneration = 0;
  private readonly routeCoordinator = new RouteCoordinator();
  private transferTuning: TransferTuning;
  private readonly iceServers: RTCIceServer[];
  private readonly iceConfigurationProvider?: IceConfigurationProvider;
  private readonly routeRecovery: RouteRecoveryOptions;
  private readonly healthAnalyzer?: TransferHealthAnalyzer;
  private readonly peerId = crypto.randomUUID();
  private readonly listeners = new Set<(snapshot: ConnectionSnapshot) => void>();
  private snapshot: ConnectionSnapshot = {
    state: "IDLE",
    sessionCode: null,
    signalling: "disconnected",
    peer: "waiting",
    ice: "new",
    control: "closed",
    data: "closed",
    route: { ...initialRouteSnapshot },
    helloReceived: false,
    binaryResult: null,
    connectionTrace: [],
    transfer: initialTransferSnapshot,
    health: createInitialTransferHealthSnapshot(),
    speedProof: null,
    error: null
  };

  constructor(
    private readonly signalingUrl: string,
    options: ConnectionCoordinatorOptions | RTCIceServer[] = {},
    legacyTuning: TransferTuning = m3BenchmarkDefaults
  ) {
    const normalized = Array.isArray(options)
      ? { iceServers: options, tuning: legacyTuning }
      : options;
    this.iceServers = normalized.iceServers ?? [];
    this.iceConfigurationProvider =
      normalized.iceConfigurationProvider ??
      (normalized.turnCredentialEndpoint
        ? new HttpIceConfigurationProvider(normalized.turnCredentialEndpoint)
        : undefined);
    this.routeRecovery = { ...defaultRouteRecoveryOptions, ...normalized.routeRecovery };
    this.transferTuning = mergeTransferTuning(normalized.tuning ?? legacyTuning);
    this.healthAnalyzer =
      normalized.transferHealth === false
        ? undefined
        : new TransferHealthAnalyzer(normalized.transferHealth ?? {});
    this.snapshot = {
      ...this.snapshot,
      health: this.healthAnalyzer?.current() ?? null
    };
  }

  subscribe(listener: (snapshot: ConnectionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async createSession(): Promise<string> {
    const response = await fetch(this.signalingUrl.replace(/^ws/, "http") + "/sessions", {
      method: "POST"
    });
    if (!response.ok) throw new Error("Unable to create session.");
    const body = (await response.json()) as { code: string };
    await this.joinSession(body.code);
    return formatSessionCode(body.code) ?? body.code;
  }

  async joinSession(code: string): Promise<void> {
    const normalized = normalizeSessionCode(code);
    if (!normalized) throw new Error("Enter a six-digit session code.");

    this.closedByUser = false;
    this.sessionCode = normalized;
    this.signallingAccessToken = undefined;
    this.simulatedReconnectHeld = false;
    this.reconnectAttempts = 0;
    this.routeRecoveryAttempts = 0;
    this.remoteRouteGeneration = 0;
    this.clearReconnectTimer();
    this.clearRouteRecoveryTimers();
    this.routeCoordinator.invalidate();
    this.fileTransfer?.dispose();
    this.folderTransfer?.dispose();
    this.fileTransfer = undefined;
    this.folderTransfer = undefined;
    this.transport?.close();
    this.transport = undefined;
    this.role = undefined;
    const previousSocket = this.socket;
    this.socket = undefined;
    previousSocket?.close();
    this.update({
      state: "SIGNALLING_CONNECTING",
      sessionCode: formatSessionCode(normalized),
      control: "closed",
      data: "closed",
      helloReceived: false,
      binaryResult: null,
      route: this.routeCoordinator.current(),
      error: null
    });
    this.connect();
  }

  /**
   * Joins a server-authorized P12 signaling session. This replaces only the WebSocket admission
   * path; FSTP, WebRTC, integrity, recovery, and transfer identity remain unchanged.
   */
  async joinAuthorizedSignallingSession(session: AuthorizedSignallingSession): Promise<void> {
    if (!isAuthorizedSignallingSession(session)) throw new Error("Invalid signalling session.");

    this.closedByUser = false;
    this.sessionCode = undefined;
    this.signallingAccessToken = session.accessToken;
    this.simulatedReconnectHeld = false;
    this.reconnectAttempts = 0;
    this.routeRecoveryAttempts = 0;
    this.remoteRouteGeneration = 0;
    this.clearReconnectTimer();
    this.clearRouteRecoveryTimers();
    this.routeCoordinator.invalidate();
    this.fileTransfer?.dispose();
    this.folderTransfer?.dispose();
    this.fileTransfer = undefined;
    this.folderTransfer = undefined;
    this.transport?.close();
    this.transport = undefined;
    this.role = undefined;
    const previousSocket = this.socket;
    this.socket = undefined;
    previousSocket?.close();
    this.update({
      state: "SIGNALLING_CONNECTING",
      sessionCode: null,
      control: "closed",
      data: "closed",
      helloReceived: false,
      binaryResult: null,
      route: this.routeCoordinator.current(),
      error: null
    });
    this.connect();
  }

  sendHello(): void {
    this.transport?.sendHello(this.peerId);
  }

  sendBinaryProof(): void {
    this.transport?.sendBinaryProof();
  }

  selectFile(file: File): void {
    this.fileTransfer?.select(sourceFromFile(file));
    this.startHealthSamplingForCurrentTransport();
  }

  offerSelectedFile(): void {
    this.fileTransfer?.offer();
  }

  selectFolder(source: StreamPackSource): void {
    this.folderTransfer?.select(source);
    this.startHealthSamplingForCurrentTransport();
  }

  offerSelectedFolder(): void {
    this.folderTransfer?.offer();
  }

  async acceptIncomingFile(
    destination: RandomAccessFileDestination,
    recoveryStore: RecoveryStore,
    destinationIdentity: string
  ): Promise<void> {
    await this.fileTransfer?.accept({ destination, recoveryStore, destinationIdentity });
  }

  async acceptIncomingFolder(
    destination: StreamPackDestination,
    recoveryStore: RecoveryStore,
    destinationIdentity: string
  ): Promise<void> {
    await this.folderTransfer?.accept({ destination, recoveryStore, destinationIdentity });
  }

  cancelTransfer(): void {
    this.fileTransfer?.cancel();
    this.folderTransfer?.cancel();
    this.stopHealthSampling();
  }

  pauseTransfer(): void {
    this.fileTransfer?.pause();
  }

  resumeTransfer(): void {
    this.fileTransfer?.resume();
  }

  configureIntegrityFault(fault: IntegrityFault | undefined): void {
    this.fileTransfer?.configureFault(fault);
    this.folderTransfer?.configureFault(fault);
  }

  setRoutePolicy(policy: IceRoutePolicy): void {
    this.routePolicy = policy;
    this.update({ route: { ...this.routeCoordinator.current(), policy } });
  }

  /** Qualification-only route choice for the next replacement PeerConnection. */
  setNextRecoveryRoutePolicy(policy: IceRoutePolicy | undefined): void {
    this.nextRecoveryPolicy = policy;
  }

  /** Development qualification hook. The signaling service rejects this outside its dev configuration. */
  setTurnCredentialTestMode(mode: "expired" | "invalid" | "unreachable" | undefined): void {
    this.credentialTestMode = mode;
  }

  configureTransferTuning(update: Partial<TransferTuning>): TransferTuning {
    if (this.snapshot.transfer.state !== "IDLE")
      throw new Error("Apply M3 tuning before selecting or receiving a file.");
    this.transferTuning = mergeTransferTuning(update);
    if (this.transport) this.createFileTransfer();
    this.update({ transfer: { ...initialTransferSnapshot, tuning: this.transferTuning } });
    return this.transferTuning;
  }

  async restartIce(): Promise<void> {
    if (!this.transport || this.role !== "offerer") {
      this.update({ error: "Only the session creator can initiate the M1 ICE restart." });
      return;
    }
    const generation = this.routeCoordinator.current().routeGeneration;
    const route = this.routeCoordinator.markIceRestart(generation);
    this.update({
      state: "RECONNECTING",
      route: route ?? this.routeCoordinator.current(),
      error: null
    });
    try {
      await this.transport.createOffer(true);
      this.watchRouteConnection(this.transport, generation, this.routeRecovery.iceRestartTimeoutMs);
    } catch {
      this.update({ state: "FAILED", error: "ICE restart negotiation failed." });
    }
  }

  async simulateTransportDisconnect(holdReconnect = false): Promise<void> {
    if (!this.transport || (!this.fileTransfer && !this.folderTransfer)) return;
    this.fileTransfer?.transportInterrupted();
    this.folderTransfer?.transportInterrupted();
    const generation = this.routeCoordinator.current().routeGeneration;
    const route = this.routeCoordinator.markInterrupted(generation);
    this.update({ state: "RECONNECTING", route: route ?? this.routeCoordinator.current() });
    this.transport.close();
    if (this.role !== "offerer") return;
    this.transport = undefined;
    if (holdReconnect) {
      this.simulatedReconnectHeld = true;
      return;
    }
    await this.startSimulatedTransportReconnect();
  }

  /** Development qualification hook: resume a previously held real WebRTC reconnect. */
  async resumeHeldTransportReconnect(): Promise<void> {
    if (!this.simulatedReconnectHeld) return;
    this.simulatedReconnectHeld = false;
    await this.startSimulatedTransportReconnect();
  }

  private async startSimulatedTransportReconnect(): Promise<void> {
    if (this.role !== "offerer" || this.transport) return;
    const replacement = await this.ensureTransport(true);
    if (!replacement) return;
    try {
      replacement.createOfferChannels();
      await replacement.createOffer();
    } catch {
      this.update({ state: "FAILED", error: "Controlled transport reconnect failed." });
    }
  }

  async refreshDiagnostics(): Promise<void> {
    if (!this.transport) return;
    await this.refreshDiagnosticsFor(
      this.transport,
      this.routeCoordinator.current().routeGeneration,
      0
    );
  }

  /** Replaces the active route without replacing transfer identity or verified recovery state. */
  async replacePeerConnection(policy = this.nextRecoveryPolicy ?? this.routePolicy): Promise<void> {
    if (!this.transport || this.role !== "offerer") {
      this.update({ error: "Only the session creator can replace the active route." });
      return;
    }
    // Explicit replacement detaches the old PeerConnection before its close callback can run.
    // Preserve transfer continuity before that detach so the new control channel reconciles it.
    this.fileTransfer?.transportInterrupted();
    this.folderTransfer?.transportInterrupted();
    const generation = this.routeCoordinator.current().routeGeneration;
    const route = this.routeCoordinator.markInterrupted(generation);
    this.update({
      state: "RECONNECTING",
      route: route ?? this.routeCoordinator.current(),
      error: null
    });
    await this.startRouteReplacement(generation, policy);
  }

  /** Development qualification hook that performs the same bounded route replacement used on failure. */
  async breakCurrentTransport(): Promise<void> {
    await this.replacePeerConnection();
  }

  disconnect(): void {
    this.closedByUser = true;
    this.simulatedReconnectHeld = false;
    this.clearReconnectTimer();
    this.clearRouteRecoveryTimers();
    this.stopHealthSampling();
    this.routeCoordinator.invalidate();
    this.fileTransfer?.cancel("CONNECTION_CLOSED");
    this.fileTransfer?.dispose();
    this.folderTransfer?.cancel("CONNECTION_CLOSED");
    this.folderTransfer?.dispose();
    this.transport?.close();
    this.socket?.close();
    this.update({
      state: "CLOSED",
      signalling: "disconnected",
      route: this.routeCoordinator.current()
    });
  }

  private connect(): void {
    const accessToken = this.signallingAccessToken;
    const url = new URL(this.signalingUrl + (accessToken ? "/v2/session" : "/session"));
    if (accessToken) url.searchParams.set("cap", accessToken);
    else {
      if (!this.sessionCode) {
        this.update({ state: "FAILED", error: "Signalling session is unavailable." });
        return;
      }
      url.searchParams.set("code", this.sessionCode);
      url.searchParams.set("peerId", this.peerId);
    }
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => {
      this.trace("signaling:open");
      this.reconnectAttempts = 0;
      this.update({
        signalling: "connected",
        state: this.transport ? "CONNECTED" : "WAITING_FOR_PEER"
      });
    };
    socket.onclose = () => {
      this.trace("signaling:close");
      if (this.socket !== socket) return;
      this.update({ signalling: "disconnected" });
      if (this.closedByUser || (!this.sessionCode && !this.signallingAccessToken)) {
        this.update({ state: this.closedByUser ? "CLOSED" : "DISCONNECTED" });
        return;
      }
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      this.trace("signaling:error");
      this.update({ error: "Signalling connection failed." });
    };
    socket.onmessage = ({ data }) => this.handle(data);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= 3) {
      this.update({ state: "FAILED", error: "Signalling reconnect failed after three attempts." });
      return;
    }
    this.reconnectAttempts += 1;
    this.update({ state: "RECONNECTING" });
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectAttempts * 500);
  }

  private handle(raw: unknown): void {
    if (typeof raw !== "string") {
      this.update({ error: "Received a non-text signalling message." });
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.update({ error: "Received malformed signalling JSON." });
      return;
    }
    const message = parseSignallingMessage(value);
    if (!message) {
      this.update({ error: "Received an invalid signalling message." });
      return;
    }
    this.trace("signal:received:" + message.type);

    if (message.type === "session-ready") {
      this.trace("session:ready:" + message.role);
      this.role = message.role;
      if (!this.transport) void this.ensureTransport();
      return;
    }
    if (message.type === "peer-joined" && this.role === "offerer") {
      this.trace("session:peer-joined");
      void this.startOffer();
      return;
    }
    if (message.type === "peer-left") {
      this.trace("session:peer-left");
      this.update({ peer: "waiting", state: "DISCONNECTED" });
      return;
    }
    if (message.type === "error") {
      this.update({ state: "FAILED", error: message.message });
      return;
    }
    if (message.type === "offer" && this.role === "answerer") {
      const remoteGeneration = message.routeGeneration ?? 0;
      if (remoteGeneration < this.remoteRouteGeneration) {
        this.trace("signal:ignored-stale-offer");
        return;
      }
      const replacement =
        Boolean(this.transport) &&
        (remoteGeneration > this.remoteRouteGeneration ||
          this.snapshot.transfer.state === "RECONNECTING");
      this.remoteRouteGeneration = remoteGeneration;
      if (replacement) {
        this.trace("signal:replacement-offer");
        // A fresh remote route generation is authoritative even if the old PeerConnection has not
        // emitted its disconnected callback yet. This prevents old channels/candidates surviving a
        // direct-to-relay replacement.
        this.transport?.close();
        this.transport = undefined;
        void this.acceptReplacementOffer(message);
        return;
      }
    }
    if (
      (message.type === "answer" || message.type === "ice-candidate") &&
      message.routeGeneration !== undefined &&
      ((this.role === "offerer" &&
        message.routeGeneration !== this.routeCoordinator.current().routeGeneration) ||
        (this.role === "answerer" && message.routeGeneration !== this.remoteRouteGeneration))
    ) {
      this.trace("signal:ignored-stale-route-message");
      return;
    }
    void this.acceptTransportSignal(message);
  }

  private async startOffer(): Promise<void> {
    // A queued replacement owns the next offer and its route generation. Starting another offer
    // here would invalidate that generation before its bounded retry can run.
    if (this.routeRecoveryTimer) return;
    const transport = await this.ensureTransport();
    if (!transport || this.role !== "offerer" || this.transport !== transport) return;
    try {
      transport.createOfferChannels();
      await transport.createOffer();
      if (this.transport !== transport) return;
      this.update({ peer: "connected", state: "NEGOTIATING" });
      this.watchRouteConnection(transport, this.routeCoordinator.current().routeGeneration);
    } catch {
      this.failRouteAttempt(
        this.routeCoordinator.current().routeGeneration,
        "FS_ICE_NEGOTIATION_FAILED"
      );
    }
  }

  private async acceptReplacementOffer(message: SignallingMessage): Promise<void> {
    const transport = await this.ensureTransport(true);
    if (!transport) return;
    await this.acceptSignalForTransport(transport, message);
  }

  private async acceptTransportSignal(message: SignallingMessage): Promise<void> {
    const transport = this.transport ?? (await this.ensureTransport());
    if (!transport) return;
    await this.acceptSignalForTransport(transport, message);
  }

  private async acceptSignalForTransport(
    transport: WebRtcTransport,
    message: SignallingMessage
  ): Promise<void> {
    try {
      await transport.acceptSignal(message);
    } catch {
      this.failRouteAttempt(
        this.routeCoordinator.current().routeGeneration,
        "FS_ICE_NEGOTIATION_FAILED"
      );
    }
  }

  private async ensureTransport(
    replacing = false,
    policy: IceRoutePolicy = this.routePolicy
  ): Promise<WebRtcTransport | undefined> {
    if (!replacing && this.transport) return this.transport;
    if (!replacing && this.pendingTransport) return this.pendingTransport;

    const { generation, snapshot } = this.routeCoordinator.beginTransport(policy, replacing);
    this.update({ route: snapshot });
    const task = this.createTransportForRoute(generation, replacing, policy);
    this.pendingTransport = task;
    void task.finally(() => {
      if (this.pendingTransport === task) this.pendingTransport = undefined;
    });
    return task;
  }

  private async createTransportForRoute(
    generation: number,
    replacing: boolean,
    policy: IceRoutePolicy
  ): Promise<WebRtcTransport | undefined> {
    try {
      const configuration = await this.resolveIceConfiguration(policy);
      if (this.closedByUser || !this.routeCoordinator.isCurrent(generation)) return undefined;
      const transport = new WebRtcTransport(
        {
          signal: (message: SignallingMessage) => {
            this.trace("signal:sent:" + message.type);
            const routeGeneration =
              this.role === "answerer" && message.type !== "offer"
                ? this.remoteRouteGeneration
                : generation;
            const routedMessage =
              routeGeneration > 0 &&
              (message.type === "offer" ||
                message.type === "answer" ||
                message.type === "ice-candidate")
                ? { ...message, routeGeneration }
                : message;
            if (
              this.transport === transport &&
              this.routeCoordinator.isCurrent(generation) &&
              this.socket?.readyState === WebSocket.OPEN
            )
              this.socket.send(JSON.stringify(routedMessage));
          },
          state: (peer) => {
            if (this.transport !== transport || !this.routeCoordinator.isCurrent(generation))
              return;
            this.trace("peer:" + peer);
            this.currentPeerState = peer;
            const state = peer === "connected" ? "CONNECTED" : "CONNECTING";
            if (peer === "connected") {
              this.clearRouteRecoveryTimers();
              this.routeRecoveryAttempts = 0;
              this.update({ peer, state, error: null });
              void this.refreshDiagnosticsFor(transport, generation, 0);
              this.startHealthSampling(transport, generation);
              return;
            }
            if (peer === "failed" || peer === "disconnected" || peer === "closed") {
              this.stopHealthSampling();
              this.fileTransfer?.transportInterrupted();
              this.folderTransfer?.transportInterrupted();
              const route = this.routeCoordinator.markInterrupted(generation);
              this.update({
                peer,
                state: "RECONNECTING",
                route: route ?? this.routeCoordinator.current()
              });
              if (this.role === "offerer" && !this.closedByUser)
                this.scheduleRouteRecovery(
                  generation,
                  peer === "disconnected" ? this.routeRecovery.disconnectedGraceMs : 0
                );
              return;
            }
            this.update({ peer, state });
          },
          ice: (ice) => {
            this.trace("ice:" + ice);
            if (this.transport === transport && this.routeCoordinator.isCurrent(generation)) {
              this.update({ ice });
              if (ice === "connected" && this.snapshot.state === "RECONNECTING") {
                this.clearRouteRecoveryTimers();
                this.update({ state: "CONNECTED", error: null });
                void this.refreshDiagnosticsFor(transport, generation, 0);
              }
            }
          },
          channel: (label, state) => {
            if (this.transport !== transport || !this.routeCoordinator.isCurrent(generation))
              return;
            this.trace("channel:" + label + ":" + state);
            this.update(label === "fs-control-v1" ? { control: state } : { data: state });
            if (
              label === "fs-control-v1" &&
              state === "open" &&
              this.role === "offerer" &&
              this.snapshot.transfer.state === "RECONNECTING"
            ) {
              this.fileTransfer?.offer();
              this.folderTransfer?.offer();
            }
          },
          hello: () => {
            if (this.transport === transport && this.routeCoordinator.isCurrent(generation))
              this.update({ helloReceived: true });
          },
          control: (raw) => {
            if (this.transport !== transport || !this.routeCoordinator.isCurrent(generation))
              return;
            let protocolVersion: unknown;
            try {
              protocolVersion = (JSON.parse(raw) as { protocolVersion?: unknown }).protocolVersion;
            } catch {
              this.update({ error: "Received malformed transfer control JSON." });
              return;
            }
            if (protocolVersion === m5IntegrityProtocolVersion) {
              void this.fileTransfer?.handleControl(raw);
              return;
            }
            if (protocolVersion === m6StreamPackProtocolVersion) {
              void this.folderTransfer?.handleControl(raw);
              return;
            }
            this.update({ error: "Received an unsupported transfer control protocol." });
          },
          data: (frame) => {
            if (this.transport !== transport || !this.routeCoordinator.isCurrent(generation))
              return;
            const decoded = decodeDataFrame(frame);
            if (!decoded) {
              this.update({ error: "Received an invalid transfer data frame." });
              return;
            }
            if (decoded.protocolVersion === m5IntegrityProtocolVersion) {
              void this.fileTransfer?.handleData(frame);
              return;
            }
            if (decoded.protocolVersion === m6StreamPackProtocolVersion) {
              void this.folderTransfer?.handleData(frame);
              return;
            }
            this.update({ error: "Received data for an unsupported transfer protocol." });
          },
          binary: (valid, bytes) =>
            this.transport === transport &&
            this.routeCoordinator.isCurrent(generation) &&
            this.update({
              binaryResult: valid ? "verified " + bytes + " bytes" : "verification failed"
            }),
          dataSent: () => {
            if (this.transport !== transport || !this.routeCoordinator.isCurrent(generation))
              return;
            const route = this.routeCoordinator.markFirstResumedPayload(generation);
            if (route) this.update({ route });
          },
          error: (error) => {
            if (this.transport === transport && this.routeCoordinator.isCurrent(generation))
              this.update({ error });
          }
        },
        configuration
      );
      if (this.closedByUser || !this.routeCoordinator.isCurrent(generation)) {
        transport.close();
        return undefined;
      }
      this.transport = transport;
      this.currentPeerState = "new";
      if (replacing) {
        this.fileTransfer?.replaceTransport(transport);
        this.folderTransfer?.replaceTransport(transport);
      } else this.createFileTransfer();
      return transport;
    } catch (error) {
      const code =
        error instanceof TurnCredentialError
          ? error.code
          : policy === "RELAY_ONLY"
            ? "FS_TURN_CREDENTIAL_UNAVAILABLE"
            : "FS_ICE_NEGOTIATION_FAILED";
      this.trace("route:configuration-failed:" + code);
      this.failRouteAttempt(generation, code);
      return undefined;
    }
  }

  private async resolveIceConfiguration(policy: IceRoutePolicy): Promise<RTCConfiguration> {
    if (!this.iceConfigurationProvider)
      return {
        iceServers: this.iceServers,
        iceTransportPolicy: policy === "RELAY_ONLY" ? "relay" : "all"
      };
    if (!this.sessionCode && !this.signallingAccessToken) {
      this.trace("route:credential-missing-session");
      throw new TurnCredentialError("FS_TURN_CREDENTIAL_UNAVAILABLE");
    }
    this.trace("route:credential-request");
    const configuration = await this.iceConfigurationProvider.getConfiguration({
      sessionCode: this.sessionCode,
      peerId: this.peerId,
      policy,
      credentialTestMode: this.credentialTestMode
    });
    this.trace("route:credential-ready");
    return configuration;
  }

  private scheduleRouteRecovery(generation: number, delayMs: number): void {
    if (
      !this.routeCoordinator.isCurrent(generation) ||
      this.closedByUser ||
      this.routeRecoveryTimer ||
      this.simulatedReconnectHeld
    )
      return;
    if (this.routeRecoveryAttempts >= this.routeRecovery.maxReplacementAttempts) {
      this.failRouteAttempt(generation, "FS_ROUTE_EXHAUSTED");
      return;
    }
    this.routeRecoveryTimer = setTimeout(
      () => {
        this.routeRecoveryTimer = undefined;
        void this.startRouteReplacement(generation);
      },
      Math.max(0, delayMs)
    );
  }

  private async startRouteReplacement(
    interruptedGeneration: number,
    requestedPolicy = this.nextRecoveryPolicy ?? this.routePolicy
  ): Promise<void> {
    if (
      !this.routeCoordinator.isCurrent(interruptedGeneration) ||
      this.closedByUser ||
      this.role !== "offerer"
    )
      return;
    if (this.routeRecoveryAttempts >= this.routeRecovery.maxReplacementAttempts) {
      this.failRouteAttempt(interruptedGeneration, "FS_ROUTE_EXHAUSTED");
      return;
    }
    this.routeRecoveryAttempts += 1;
    this.nextRecoveryPolicy = undefined;
    const oldTransport = this.transport;
    this.stopHealthSampling();
    this.transport = undefined;
    oldTransport?.close();
    const replacement = await this.ensureTransport(true, requestedPolicy);
    if (!replacement) return;
    try {
      replacement.createOfferChannels();
      await replacement.createOffer();
      if (this.transport !== replacement) return;
      this.watchRouteConnection(replacement, this.routeCoordinator.current().routeGeneration);
    } catch {
      this.failRouteAttempt(
        this.routeCoordinator.current().routeGeneration,
        "FS_ICE_NEGOTIATION_FAILED"
      );
    }
  }

  private watchRouteConnection(
    transport: WebRtcTransport,
    generation: number,
    timeoutMs = this.routeRecovery.replacementConnectionTimeoutMs
  ): void {
    if (this.routeConnectionTimer) clearTimeout(this.routeConnectionTimer);
    this.routeConnectionTimer = setTimeout(() => {
      this.routeConnectionTimer = undefined;
      if (
        this.transport !== transport ||
        !this.routeCoordinator.isCurrent(generation) ||
        this.currentPeerState === "connected"
      )
        return;
      this.failRouteAttempt(
        generation,
        this.routeCoordinator.current().policy === "RELAY_ONLY"
          ? "FS_TURN_UNREACHABLE"
          : "FS_ICE_NEGOTIATION_FAILED"
      );
    }, timeoutMs);
  }

  private failRouteAttempt(generation: number, code: string): void {
    if (!this.routeCoordinator.isCurrent(generation) || this.closedByUser) return;
    if (this.routeConnectionTimer) clearTimeout(this.routeConnectionTimer);
    this.routeConnectionTimer = undefined;
    const current = this.transport;
    this.stopHealthSampling();
    this.transport = undefined;
    current?.close();
    if (
      this.routeRecoveryAttempts < this.routeRecovery.maxReplacementAttempts &&
      this.role === "offerer"
    ) {
      this.scheduleRouteRecovery(
        generation,
        this.routeRecovery.retryBackoffMs * (this.routeRecoveryAttempts + 1)
      );
      return;
    }
    const route = this.routeCoordinator.markFailure(
      generation,
      code === "FS_TURN_AUTH_FAILED" ? code : "FS_ROUTE_EXHAUSTED"
    );
    this.fileTransfer?.routeRecoveryFailed(code);
    this.folderTransfer?.routeRecoveryFailed(code);
    this.update({
      state: "FAILED",
      route: route ?? this.routeCoordinator.current(),
      error: code
    });
  }

  private async refreshDiagnosticsFor(
    transport: WebRtcTransport,
    generation: number,
    retryAttempt: number
  ): Promise<void> {
    try {
      const diagnostics = await transport.diagnostics();
      if (this.transport !== transport || !this.routeCoordinator.isCurrent(generation)) return;
      const route = this.routeCoordinator.observeRoute(generation, diagnostics);
      if (route) this.update({ route });
      if (diagnostics.routeType === "UNKNOWN" && retryAttempt < 5) {
        if (this.routeDiagnosticsTimer) clearTimeout(this.routeDiagnosticsTimer);
        this.routeDiagnosticsTimer = setTimeout(() => {
          this.routeDiagnosticsTimer = undefined;
          void this.refreshDiagnosticsFor(transport, generation, retryAttempt + 1);
        }, 250);
      }
    } catch {
      if (this.transport === transport && this.routeCoordinator.isCurrent(generation))
        this.trace("route:diagnostics-unavailable");
    }
  }

  private startHealthSamplingForCurrentTransport(): void {
    if (!this.transport || !this.healthAnalyzer) return;
    this.startHealthSampling(this.transport, this.routeCoordinator.current().routeGeneration);
  }

  private startHealthSampling(transport: WebRtcTransport, generation: number): void {
    if (!this.healthAnalyzer) return;
    this.stopHealthSampling();
    const sample = () => {
      void this.refreshDiagnosticsFor(transport, generation, 0).finally(() => {
        if (this.transport !== transport || !this.routeCoordinator.isCurrent(generation)) return;
        this.healthSamplingTimer = setTimeout(sample, 500);
      });
    };
    sample();
  }

  private stopHealthSampling(): void {
    if (this.healthSamplingTimer) clearTimeout(this.healthSamplingTimer);
    this.healthSamplingTimer = undefined;
  }

  private createFileTransfer(): void {
    if (!this.transport) return;
    this.fileTransfer = new M5IntegritySingleFileTransfer(
      this.transport,
      (transfer) => this.update({ transfer }),
      this.transferTuning
    );
    this.folderTransfer = new M6StreamPackTransfer(
      this.transport,
      (transfer) => this.update({ transfer }),
      this.transferTuning
    );
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private clearRouteRecoveryTimers(): void {
    if (this.routeRecoveryTimer) clearTimeout(this.routeRecoveryTimer);
    if (this.routeConnectionTimer) clearTimeout(this.routeConnectionTimer);
    if (this.routeDiagnosticsTimer) clearTimeout(this.routeDiagnosticsTimer);
    this.routeRecoveryTimer = undefined;
    this.routeConnectionTimer = undefined;
    this.routeDiagnosticsTimer = undefined;
  }

  private update(change: Partial<ConnectionSnapshot>): void {
    if (change.state && !canTransitionConnectionState(this.snapshot.state, change.state)) {
      change = { ...change, state: "FAILED", error: "Invalid connection state transition." };
    }
    this.snapshot = { ...this.snapshot, ...change };
    this.observeTransferHealth();
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private observeTransferHealth(): void {
    if (!this.healthAnalyzer) return;
    const transfer = this.snapshot.transfer;
    const metric = transfer.metrics;
    const metricOrUnavailable = (value: number): number | null => (value > 0 ? value : null);
    const raw: RawTransferMetrics = {
      timestampMs: performance.now(),
      transferId: transfer.transferId,
      transferState: transfer.state,
      routeType: this.snapshot.route.routeType,
      routeDetail: this.snapshot.route.routeDetail,
      routeGeneration: this.snapshot.route.routeGeneration,
      routeChangeCount: this.snapshot.route.routeChangeCount,
      applicationPayloadBytes: transfer.bytesTransferred,
      totalBytes: transfer.bytesTotal,
      sourceReadBps: metricOrUnavailable(metric.sourceReadBps),
      destinationWriteBps: metricOrUnavailable(metric.destinationWriteBps),
      senderBufferedAmountBytes: this.transport ? this.transport.bufferedAmount : null,
      receiveQueueBytes: transfer.transferId ? metric.receiveQueueBytes : null,
      rttMs: this.snapshot.route.rttMs,
      availableOutgoingBitrateBps: this.snapshot.route.availableOutgoingBitrate,
      webRtcBytesSent: this.snapshot.route.bytesSent,
      webRtcBytesReceived: this.snapshot.route.bytesReceived,
      safeBytes: transfer.safeBytes,
      routeRecoveryCount: transfer.reconnectCount,
      integrityRetryCount: transfer.integrity.integrityRetryCount,
      senderHighWaterBytes: transfer.transferId ? transfer.tuning.sendHighWaterBytes : null,
      receiveQueueLimitBytes: transfer.transferId ? transfer.tuning.receiveWindowBytes : null
    };
    const health = this.healthAnalyzer.observe(raw);
    const previousProof = this.snapshot.speedProof;
    const speedProof =
      transfer.state === "DELIVERED" && previousProof?.transferId !== transfer.transferId
        ? this.healthAnalyzer.finalize()
        : previousProof?.transferId !== transfer.transferId
          ? null
          : previousProof;
    this.snapshot = { ...this.snapshot, health, speedProof };
  }

  private trace(stage: string): void {
    const connectionTrace = [...this.snapshot.connectionTrace, stage].slice(-40);
    this.snapshot = { ...this.snapshot, connectionTrace };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export const engineCoreBoundary =
  "Framework-independent connection coordinator; React, Next.js, auth, database, and UI imports are prohibited.";

function isAuthorizedSignallingSession(value: AuthorizedSignallingSession): boolean {
  return (
    typeof value.accessToken === "string" &&
    /^fsst1\.[A-Za-z0-9_-]{1,1024}\.[A-Za-z0-9_-]{43}$/.test(value.accessToken) &&
    Number.isSafeInteger(value.expiresAtMs) &&
    value.expiresAtMs > Date.now()
  );
}
