import { detectBrowserCapabilities, runtimeCompatibility } from "@flicksend/browser-capabilities";
import { ConnectionCoordinator, type ConnectionSnapshot } from "@flicksend/engine-core";
import {
  BrowserStreamPackDestination,
  createOpfsRecoveryStore,
  destinationFromWritable,
  SmallFixtureDestination,
  SmallStreamPackFixtureDestination,
  type RandomAccessFileDestination,
  type StreamPackDestination
} from "@flicksend/filesystem-browser";
import { normalizeSessionCode } from "@flicksend/protocol";
import type { RecoveryStore } from "@flicksend/resume";
import type { ProductErrorViewModel } from "@flicksend/ui";
import {
  createInitialReceiveWorkflow,
  mapReceiveProductError,
  reduceReceiveWorkflow,
  type DestinationSummary,
  type IncomingTransferSummary,
  type ProductReceiveError,
  type ReceiveWorkflowSnapshot
} from "./receive-state";

type ReceiveCoordinator = Pick<
  ConnectionCoordinator,
  | "acceptIncomingFile"
  | "acceptIncomingFolder"
  | "cancelTransfer"
  | "disconnect"
  | "joinSession"
  | "subscribe"
>;

export type ReceiveCoordinatorFactory = (signalingUrl: string) => ReceiveCoordinator;
type Listener = (snapshot: ReceiveWorkflowSnapshot) => void;

type PreparedDestination = {
  destination: RandomAccessFileDestination | StreamPackDestination;
  identity: string;
  recoveryStore: RecoveryStore;
  summary: DestinationSummary;
  transferKind: "file" | "folder";
  abort(): Promise<void>;
};

type DestinationFactory = () => Promise<PreparedDestination>;

function browserDestinationError(error: unknown): ProductReceiveError | null {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof DOMException && error.name === "NotAllowedError")
    return mapReceiveProductError("FS_DESTINATION_PERMISSION_DENIED");
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return mapReceiveProductError("FS_DESTINATION_STORAGE_FULL");
  if (error instanceof Error && error.message.startsWith("FS_"))
    return mapReceiveProductError(error.message);
  return mapReceiveProductError("FS_PRODUCT_DESTINATION_UNAVAILABLE");
}

function safeSuggestedName(name: string): string {
  const finalSegment = name.split(/[\\/]/).pop() ?? "incoming-file";
  const safe = Array.from(finalSegment, (character) =>
    character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? "_" : character
  )
    .join("")
    .trim();
  return safe || "incoming-file";
}

function opaqueDestinationIdentity(): string {
  return `p5-destination:${crypto.randomUUID()}`;
}

function developmentSenderName(): string {
  return "Alex Morgan";
}

/**
 * Application-layer recipient adapter. It owns product workflow and browser destination choice;
 * the existing engine remains sole owner of transfer, recovery, integrity, and delivery rules.
 */
export class ReceiveSessionController {
  private coordinator?: ReceiveCoordinator;
  private coordinatorUnsubscribe?: () => void;
  private destination?: PreparedDestination;
  private destinationRevision = 0;
  private developmentDestinationFailure:
    | "FS_DESTINATION_PERMISSION_DENIED"
    | "FS_DESTINATION_STORAGE_FULL"
    | "FS_PRODUCT_DESTINATION_UNAVAILABLE"
    | undefined;
  private fileFixture?: SmallFixtureDestination;
  private folderFixture?: SmallStreamPackFixtureDestination;
  private finalizationFailure = false;
  private listeners = new Set<Listener>();
  private sessionRevision = 0;
  private snapshot = createInitialReceiveWorkflow();

  constructor(
    private readonly signalingUrl: string,
    private readonly createCoordinator: ReceiveCoordinatorFactory = (url) =>
      new ConnectionCoordinator(url)
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ReceiveWorkflowSnapshot {
    return this.snapshot;
  }

  async open(rawSession: string): Promise<void> {
    const revision = ++this.sessionRevision;
    this.destinationRevision += 1;
    this.abortDestination();
    this.closeCoordinator();
    this.dispatch({ type: "SESSION_OPENING", revision });

    const capabilities = await detectBrowserCapabilities();
    if (revision !== this.sessionRevision) return;
    this.dispatch({
      type: "CAPABILITIES_RESOLVED",
      revision,
      capabilities,
      compatibility: runtimeCompatibility(capabilities)
    });

    const session = normalizeSessionCode(rawSession);
    if (!session) {
      this.dispatch({ type: "SESSION_UNAVAILABLE", revision });
      return;
    }

    this.dispatch({ type: "SESSION_AUTHORIZING", revision });
    const coordinator = this.createCoordinator(this.signalingUrl);
    this.coordinator = coordinator;
    this.coordinatorUnsubscribe = coordinator.subscribe((engineSnapshot) =>
      this.receiveEngineSnapshot(coordinator, revision, engineSnapshot)
    );
    try {
      await coordinator.joinSession(session);
    } catch {
      if (this.coordinator !== coordinator || revision !== this.sessionRevision) return;
      this.closeCoordinator();
      this.dispatch({ type: "SESSION_UNAVAILABLE", revision });
    }
  }

  accept(): void {
    this.dispatch({ type: "ACCEPT_REQUESTED" });
  }

  decline(): void {
    if (this.snapshot.phase !== "REVIEWING") return;
    this.dispatch({ type: "DECLINED" });
    this.closeCoordinator();
  }

  async chooseDestination(): Promise<void> {
    await this.prepareDestination(() => this.createBrowserDestination());
  }

  /** Development qualification-only destination. It is never rendered in production. */
  async chooseDevelopmentFixtureDestination(): Promise<void> {
    if (process.env.NODE_ENV === "production") return;
    await this.prepareDestination(async () => {
      const transfer = this.snapshot.engine?.transfer;
      if (!transfer) throw new Error("FS_PRODUCT_DESTINATION_UNAVAILABLE");
      const recoveryStore = await createOpfsRecoveryStore();
      if (transfer.protocolVersion === 5) {
        const destination = new SmallStreamPackFixtureDestination();
        this.folderFixture = destination;
        return {
          destination,
          identity: opaqueDestinationIdentity(),
          recoveryStore,
          summary: { kind: "fixture", label: "Development test destination" },
          transferKind: "folder" as const,
          abort: () => destination.abort()
        };
      }
      const destination = new SmallFixtureDestination(64 * 1024 * 1024);
      this.fileFixture = destination;
      const receiverDestination = this.finalizationFailure
        ? failingFinalizeDestination(destination)
        : destination;
      return {
        destination: receiverDestination,
        identity: opaqueDestinationIdentity(),
        recoveryStore,
        summary: { kind: "fixture", label: "Development test destination" },
        transferKind: "file" as const,
        abort: () => receiverDestination.abort()
      };
    });
  }

  async beginReceiving(): Promise<void> {
    const coordinator = this.coordinator;
    const destination = this.destination;
    const transfer = this.snapshot.engine?.transfer;
    const activeTransferId = this.snapshot.activeTransferId;
    if (
      !coordinator ||
      !destination ||
      !transfer ||
      !activeTransferId ||
      transfer.transferId !== activeTransferId
    )
      return;
    this.dispatch({ type: "RECEIVE_REQUESTED" });
    try {
      if (destination.transferKind === "folder") {
        await coordinator.acceptIncomingFolder(
          destination.destination as StreamPackDestination,
          destination.recoveryStore,
          destination.identity
        );
      } else {
        await coordinator.acceptIncomingFile(
          destination.destination as RandomAccessFileDestination,
          destination.recoveryStore,
          destination.identity
        );
      }
    } catch (error) {
      if (this.coordinator !== coordinator || this.snapshot.activeTransferId !== activeTransferId)
        return;
      this.dispatch({
        type: "ENGINE_SNAPSHOT",
        snapshot: {
          ...(this.snapshot.engine as ConnectionSnapshot),
          state: "FAILED",
          error: error instanceof Error ? error.message : "FS_PRODUCT_DESTINATION_UNAVAILABLE"
        }
      });
    }
  }

  cancel(): void {
    if (!this.snapshot.activeTransferId) return;
    this.coordinator?.cancelTransfer();
    this.dispatch({ type: "CANCEL_REQUESTED" });
  }

  dispose(): void {
    this.destinationRevision += 1;
    this.abortDestination();
    this.closeCoordinator();
    this.listeners.clear();
  }

  /** Qualification hook used to prove a recipient-side destination mutation stops recovery. */
  mutateDevelopmentDestination(): void {
    if (process.env.NODE_ENV !== "production") this.folderFixture?.mutateFirstByte();
  }

  /** Qualification hook; production destination behavior is not altered. */
  configureDevelopmentFinalizationFailure(enabled: boolean): void {
    if (process.env.NODE_ENV !== "production") this.finalizationFailure = enabled;
  }

  /** P8 development-only destination fault seam; production destination preparation is unchanged. */
  configureDevelopmentDestinationFailure(
    code:
      | "FS_DESTINATION_PERMISSION_DENIED"
      | "FS_DESTINATION_STORAGE_FULL"
      | "FS_PRODUCT_DESTINATION_UNAVAILABLE"
      | undefined
  ): void {
    if (process.env.NODE_ENV !== "production") this.developmentDestinationFailure = code;
  }

  async developmentFixtureFileDigest(): Promise<string | null> {
    const bytes = this.fileFixture?.bytes();
    if (!bytes) return null;
    return digest(bytes);
  }

  async developmentFixtureFolderDigests(): Promise<Record<number, string> | null> {
    if (!this.folderFixture) return null;
    const result: Record<number, string> = {};
    for (let fileId = 0; fileId < 10_000; fileId += 1) {
      const bytes = this.folderFixture.bytes(fileId);
      if (bytes) result[fileId] = await digest(bytes);
    }
    return Object.keys(result).length ? result : null;
  }

  private async prepareDestination(factory: DestinationFactory): Promise<void> {
    if (!["CHOOSING_DESTINATION", "READY_TO_RECEIVE"].includes(this.snapshot.phase)) return;
    const revision = ++this.destinationRevision;
    this.abortDestination();
    this.fileFixture = undefined;
    this.folderFixture = undefined;
    this.dispatch({ type: "DESTINATION_PREPARING", revision });
    try {
      if (this.developmentDestinationFailure) throw new Error(this.developmentDestinationFailure);
      const destination = await factory();
      if (
        revision !== this.destinationRevision ||
        this.snapshot.phase !== "PREPARING_DESTINATION"
      ) {
        await destination.abort();
        return;
      }
      this.destination = destination;
      this.dispatch({ type: "DESTINATION_PREPARED", revision, destination: destination.summary });
    } catch (error) {
      if (revision !== this.destinationRevision) return;
      const mapped = browserDestinationError(error);
      if (mapped) this.dispatch({ type: "DESTINATION_FAILED", revision, error: mapped });
      else this.dispatch({ type: "DESTINATION_CANCELED", revision });
    }
  }

  private async createBrowserDestination(): Promise<PreparedDestination> {
    const transfer = this.snapshot.engine?.transfer;
    const capabilities = this.snapshot.capabilities;
    if (!transfer || !this.snapshot.incoming) throw new Error("FS_PRODUCT_DESTINATION_UNAVAILABLE");
    const recoveryStore = await createOpfsRecoveryStore();
    if (transfer.protocolVersion === 5) {
      if (capabilities?.supportedTransferModes.canReceiveFolders === "UNAVAILABLE")
        throw new Error("FS_CAP_DIRECTORY_WRITE_UNAVAILABLE");
      const picker = window as Window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      };
      if (!picker.showDirectoryPicker) throw new Error("FS_CAP_DIRECTORY_WRITE_UNAVAILABLE");
      const handle = await picker.showDirectoryPicker();
      const destination = new BrowserStreamPackDestination(handle);
      return {
        destination,
        identity: opaqueDestinationIdentity(),
        recoveryStore,
        summary: { kind: "folder", label: handle.name || "Selected folder" },
        transferKind: "folder",
        abort: () => destination.abort()
      };
    }
    if (capabilities?.supportedTransferModes.canReceiveSingleFiles === "UNAVAILABLE")
      throw new Error("FS_CAP_STREAMING_DESTINATION_UNAVAILABLE");
    const picker = window as Window & {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    };
    if (!picker.showSaveFilePicker) throw new Error("FS_CAP_STREAMING_DESTINATION_UNAVAILABLE");
    const handle = await picker.showSaveFilePicker({
      suggestedName: safeSuggestedName(this.snapshot.incoming.displayName)
    });
    const destination = destinationFromWritable(await handle.createWritable());
    return {
      destination,
      identity: opaqueDestinationIdentity(),
      recoveryStore,
      summary: { kind: "file", label: handle.name || "Selected file" },
      transferKind: "file",
      abort: () => destination.abort()
    };
  }

  private receiveEngineSnapshot(
    coordinator: ReceiveCoordinator,
    revision: number,
    engineSnapshot: ConnectionSnapshot
  ): void {
    if (this.coordinator !== coordinator || revision !== this.sessionRevision) return;
    if (!this.snapshot.activeTransferId && engineSnapshot.state === "FAILED") {
      this.closeCoordinator();
      this.dispatch({ type: "SESSION_UNAVAILABLE", revision });
      return;
    }
    const transfer = engineSnapshot.transfer;
    if (transfer.state === "READY" && transfer.transferId) {
      const incoming = incomingSummary(engineSnapshot);
      this.dispatch({ type: "OFFER_AUTHORIZED", revision, incoming, snapshot: engineSnapshot });
    } else if (!this.snapshot.incoming && engineSnapshot.state === "WAITING_FOR_PEER") {
      this.dispatch({ type: "WAITING_FOR_SENDER", revision, engine: engineSnapshot });
      return;
    }
    this.dispatch({ type: "ENGINE_SNAPSHOT", snapshot: engineSnapshot });
  }

  private abortDestination(): void {
    const current = this.destination;
    this.destination = undefined;
    if (current) void current.abort().catch(() => undefined);
  }

  private closeCoordinator(): void {
    this.coordinatorUnsubscribe?.();
    this.coordinatorUnsubscribe = undefined;
    this.coordinator?.disconnect();
    this.coordinator = undefined;
  }

  private dispatch(event: Parameters<typeof reduceReceiveWorkflow>[1]): void {
    this.snapshot = reduceReceiveWorkflow(this.snapshot, event);
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

function incomingSummary(snapshot: ConnectionSnapshot): IncomingTransferSummary {
  const transfer = snapshot.transfer;
  const streamPack = transfer.streamPack;
  return {
    displayName:
      transfer.protocolVersion === 5 ? "Shared folder" : (transfer.name ?? "Incoming file"),
    fileCount: transfer.protocolVersion === 5 ? (streamPack?.filesTotal ?? null) : 1,
    folderCount: transfer.protocolVersion === 5 ? (streamPack?.directoriesTotal ?? null) : 0,
    kind: transfer.protocolVersion === 5 ? "folder-or-files" : "single-file",
    senderName: developmentSenderName(),
    sizeBytes: transfer.bytesTotal
  };
}

function failingFinalizeDestination(
  destination: SmallFixtureDestination
): RandomAccessFileDestination {
  return {
    write: (chunk) => destination.write(chunk),
    writeAt: (offset, chunk) => destination.writeAt(offset, chunk),
    close: () => Promise.reject(new Error("FS_DESTINATION_FINALIZATION_FAILED")),
    abort: () => destination.abort()
  };
}

async function digest(bytes: Uint8Array): Promise<string> {
  // Fixture destinations allocate ordinary ArrayBuffers; avoid copying their bounded test content for DOM typing.
  const value = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type { ProductErrorViewModel };
