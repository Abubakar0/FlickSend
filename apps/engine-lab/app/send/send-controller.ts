import {
  detectBrowserCapabilities,
  runtimeCompatibility,
  type BrowserCapabilitySnapshot
} from "@flicksend/browser-capabilities";
import {
  ConnectionCoordinator,
  type ConnectionSnapshot,
  type IntegrityFault,
  type AuthorizedSignallingSession
} from "@flicksend/engine-core";
import {
  streamPackSourceFromDirectoryHandle,
  streamPackSourceFromFiles
} from "@flicksend/filesystem-browser";
import type { StreamPackSource } from "@flicksend/stream-pack";
import {
  developmentCurrentUser,
  developmentRecipients,
  type CurrentUser,
  type SendRecipient
} from "./recipients";
import {
  createInitialSendWorkflow,
  isSendReady,
  mapProductError,
  reduceSendWorkflow,
  type PreparationProgress,
  type PreparedSendSource,
  type SendWorkflowSnapshot,
  type SourceKind
} from "./send-state";

type SendCoordinator = Pick<
  ConnectionCoordinator,
  | "cancelTransfer"
  | "configureIntegrityFault"
  | "createSession"
  | "disconnect"
  | "offerSelectedFile"
  | "offerSelectedFolder"
  | "resumeHeldTransportReconnect"
  | "selectFile"
  | "selectFolder"
  | "simulateTransportDisconnect"
  | "subscribe"
> &
  Partial<Pick<ConnectionCoordinator, "joinAuthorizedSignallingSession">>;

export type ProductionSignallingSessionIssuer = (
  recipientId: string
) => Promise<{ receiverPath: string; sender: AuthorizedSignallingSession }>;

export type SendCoordinatorFactory = (signalingUrl: string) => SendCoordinator;
type Listener = (snapshot: SendWorkflowSnapshot) => void;
type SourceLoader = (
  signal: AbortSignal,
  onProgress: (progress: PreparationProgress) => void
) => Promise<PreparedSendSource>;
type FolderPicker = () => Promise<FileSystemDirectoryHandle>;

const streamPackBlockBytes = 8 * 1024 * 1024;

function deduplicateExactFileReferences(files: readonly File[]): File[] {
  const result: File[] = [];
  const seen = new Set<File>();
  for (const file of files)
    if (!seen.has(file)) {
      seen.add(file);
      result.push(file);
    }
  return result;
}

function sourceName(files: readonly File[]): string {
  return files.length === 1 ? files[0]!.name : `${files.length} selected files`;
}

function sourceFromFiles(files: readonly File[]): SourceLoader {
  return async (signal, onProgress) => {
    const uniqueFiles = deduplicateExactFileReferences(files);
    if (!uniqueFiles.length) throw new Error("FS_SOURCE_EMPTY");
    const sizeBytes = uniqueFiles.reduce((total, file) => total + file.size, 0);
    if (uniqueFiles.length === 1) {
      const file = uniqueFiles[0]!;
      return {
        kind: "single-file",
        displayName: file.name,
        fileCount: 1,
        folderCount: 0,
        sizeBytes: file.size,
        transfer: { kind: "file", file }
      };
    }
    const source = await streamPackSourceFromFiles(uniqueFiles, "Selected files", {
      blockBytes: streamPackBlockBytes,
      signal,
      onProgress
    });
    return {
      kind: "multiple-files",
      displayName: sourceName(uniqueFiles),
      fileCount: uniqueFiles.length,
      folderCount: 0,
      sizeBytes,
      transfer: { kind: "folder", source }
    };
  };
}

function sourceFromDirectory(handle: FileSystemDirectoryHandle): SourceLoader {
  return async (signal, onProgress) => {
    const source = await streamPackSourceFromDirectoryHandle(handle, {
      blockBytes: streamPackBlockBytes,
      signal,
      onProgress
    });
    return {
      kind: "folder",
      displayName: handle.name,
      fileCount: source.manifest.entries.filter((entry) => entry.type === "FILE").length,
      folderCount: source.manifest.entries.filter((entry) => entry.type === "DIRECTORY").length,
      sizeBytes: source.manifest.totalBytes,
      transfer: { kind: "folder", source }
    };
  };
}

/**
 * Product adapter over the existing transfer engine. It owns sender orchestration only; transfer
 * correctness remains in the engine and product state is derived from its prepared snapshots.
 */
export class SendSessionController {
  private abortPreparation?: AbortController;
  private coordinator?: SendCoordinator;
  private currentCoordinatorUnsubscribe?: () => void;
  private devFault?: IntegrityFault;
  private devInterruptAfterVerifiedProgress = false;
  private listeners = new Set<Listener>();
  private offeredAttempt = 0;
  private preparationRevision = 0;
  private snapshot: SendWorkflowSnapshot;

  constructor(
    private readonly signalingUrl: string,
    private readonly createCoordinator: SendCoordinatorFactory = (url) =>
      new ConnectionCoordinator(url),
    private readonly eligibleRecipients: () => readonly SendRecipient[] = () =>
      developmentRecipients,
    currentUser: CurrentUser = developmentCurrentUser,
    private readonly issueProductionSession?: ProductionSignallingSessionIssuer
  ) {
    this.snapshot = createInitialSendWorkflow(currentUser);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SendWorkflowSnapshot {
    return this.snapshot;
  }

  async initializeCapabilities(): Promise<void> {
    const capabilities = await detectBrowserCapabilities();
    this.dispatch({
      type: "CAPABILITIES_RESOLVED",
      capabilities,
      compatibility: runtimeCompatibility(capabilities)
    });
  }

  selectRecipient(recipient: SendRecipient): void {
    if (!this.canEditSelection() || !this.isRecipientEligible(recipient.id)) return;
    this.invalidatePendingSession();
    this.dispatch({ type: "RECIPIENT_SELECTED", recipient });
  }

  async selectFiles(files: readonly File[]): Promise<void> {
    if (!this.canEditSelection()) return;
    await this.prepareSource(sourceFromFiles(files));
  }

  async selectFolder(picker: FolderPicker = defaultFolderPicker): Promise<void> {
    if (!this.canEditSelection()) return;
    const capabilities = this.snapshot.capabilities;
    if (capabilities?.supportedTransferModes.canSendFolders === "UNAVAILABLE") {
      this.reportSourceError("FS_CAP_DIRECTORY_SELECTION_UNAVAILABLE");
      return;
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await picker();
    } catch (error) {
      // User dismissal keeps the current selection. Other picker failures receive product mapping.
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.reportSourceError("FS_CAP_DIRECTORY_SELECTION_UNAVAILABLE");
      return;
    }
    await this.prepareSource(sourceFromDirectory(handle));
  }

  /** Development qualification-only selection; it is never exposed in a production UI. */
  async selectDevelopmentFolderFixture(
    kind: SourceKind,
    displayName: string,
    source: StreamPackSource
  ): Promise<void> {
    await this.prepareSource(async () => ({
      kind,
      displayName,
      fileCount: source.manifest.entries.filter((entry) => entry.type === "FILE").length,
      folderCount: source.manifest.entries.filter((entry) => entry.type === "DIRECTORY").length,
      sizeBytes: source.manifest.totalBytes,
      transfer: { kind: "folder", source }
    }));
  }

  clearSource(): void {
    if (!this.canEditSelection()) return;
    this.abortPreparation?.abort();
    this.preparationRevision += 1;
    this.invalidatePendingSession();
    this.dispatch({ type: "SOURCE_CLEARED" });
  }

  async start(): Promise<void> {
    if (!isSendReady(this.snapshot) || this.coordinator) return;
    if (!this.snapshot.recipient || !this.isRecipientEligible(this.snapshot.recipient.id)) {
      this.dispatch({ type: "START_FAILED", error: mapProductError("FS_PEOPLE_BLOCKED") });
      return;
    }
    const recipientId = this.snapshot.recipient.id;
    const sourceRevision = this.snapshot.sourceRevision;
    this.dispatch({ type: "START_REQUESTED" });
    const attempt = this.snapshot.startAttempt;
    const coordinator = this.createCoordinator(this.signalingUrl);
    this.coordinator = coordinator;
    this.currentCoordinatorUnsubscribe = coordinator.subscribe((engineSnapshot) =>
      this.receiveEngineSnapshot(coordinator, engineSnapshot)
    );
    try {
      const productionSession = this.issueProductionSession
        ? await this.issueProductionSession(recipientId)
        : null;
      if (productionSession) {
        if (!coordinator.joinAuthorizedSignallingSession)
          throw new Error("FS_SIGNALING_UNAVAILABLE");
        await coordinator.joinAuthorizedSignallingSession(productionSession.sender);
      }
      const code = productionSession ? null : await coordinator.createSession();
      if (!this.isCurrentAttempt(coordinator, attempt, recipientId, sourceRevision)) {
        coordinator.disconnect();
        return;
      }
      this.dispatch({
        type: "SESSION_CREATED",
        code,
        receiverPath: productionSession?.receiverPath ?? null
      });
    } catch (error) {
      if (this.coordinator !== coordinator) return;
      this.closeCoordinator();
      this.dispatch({
        type: "START_FAILED",
        error: mapProductError(error instanceof Error ? error.message : "FS_ICE_NEGOTIATION_FAILED")
      });
    }
  }

  cancel(): void {
    if (!this.snapshot.activeTransferId) return;
    this.coordinator?.cancelTransfer();
    this.dispatch({ type: "CANCEL_REQUESTED" });
  }

  reset(): void {
    this.abortPreparation?.abort();
    this.preparationRevision += 1;
    this.invalidatePendingSession();
    this.dispatch({ type: "RESET", retainRecipient: true });
  }

  /** P6 eligibility changes affect future sends only; active transfer correctness remains untouched. */
  reconcileRecipientEligibility(): void {
    if (
      this.snapshot.activeTransferId ||
      !this.snapshot.recipient ||
      this.isRecipientEligible(this.snapshot.recipient.id)
    )
      return;
    this.abortPreparation?.abort();
    this.preparationRevision += 1;
    this.invalidatePendingSession();
    this.dispatch({ type: "RESET", retainRecipient: false });
  }

  dispose(): void {
    this.abortPreparation?.abort();
    this.closeCoordinator();
    this.listeners.clear();
  }

  /** Development qualification hook. Production UI has no route-interruption control. */
  configureDevelopmentFault(fault: IntegrityFault | undefined): void {
    this.devFault = fault;
    this.coordinator?.configureIntegrityFault(fault);
  }

  /** Development qualification hook. It exercises the existing M4 recovery implementation. */
  async simulateDevelopmentDisconnect(): Promise<void> {
    await this.coordinator?.simulateTransportDisconnect(true);
  }

  /** Development qualification hook; interrupts at the first receiver-authoritative commit. */
  armDevelopmentInterruptAfterVerifiedProgress(): void {
    this.devInterruptAfterVerifiedProgress = true;
  }

  async resumeDevelopmentReconnect(): Promise<void> {
    await this.coordinator?.resumeHeldTransportReconnect();
  }

  /** P8 presentation qualification seam; it does not alter route-recovery policy or engine state. */
  exhaustDevelopmentRecovery(): void {
    if (
      process.env.NODE_ENV === "production" ||
      !this.snapshot.engine ||
      !this.snapshot.activeTransferId
    )
      return;
    this.dispatch({
      type: "ENGINE_SNAPSHOT",
      snapshot: {
        ...this.snapshot.engine,
        error: "FS_ROUTE_EXHAUSTED",
        state: "FAILED",
        transfer: {
          ...this.snapshot.engine.transfer,
          error: "FS_ROUTE_EXHAUSTED",
          state: "RECONNECTING"
        }
      }
    });
  }

  /** P8 presentation qualification seam; production signaling and service behavior are unchanged. */
  failDevelopmentService(): void {
    if (process.env.NODE_ENV !== "production")
      this.dispatch({ type: "START_FAILED", error: mapProductError("FS_ICE_NEGOTIATION_FAILED") });
  }

  private async prepareSource(loader: SourceLoader): Promise<void> {
    if (!this.snapshot.recipient) return;
    this.abortPreparation?.abort();
    const abort = new AbortController();
    this.abortPreparation = abort;
    const revision = ++this.preparationRevision;
    this.invalidatePendingSession();
    this.dispatch({ type: "SOURCE_PREPARING", revision });
    try {
      const source = await loader(abort.signal, (progress) => {
        if (!abort.signal.aborted && revision === this.preparationRevision)
          this.dispatch({ type: "SOURCE_PROGRESS", revision, progress });
      });
      if (abort.signal.aborted || revision !== this.preparationRevision) return;
      this.dispatch({ type: "SOURCE_PREPARED", revision, source });
    } catch (error) {
      if (abort.signal.aborted || revision !== this.preparationRevision) return;
      this.dispatch({
        type: "SOURCE_FAILED",
        revision,
        error: mapProductError(error instanceof Error ? error.message : undefined)
      });
    } finally {
      if (this.abortPreparation === abort) this.abortPreparation = undefined;
    }
  }

  private receiveEngineSnapshot(
    coordinator: SendCoordinator,
    engineSnapshot: ConnectionSnapshot
  ): void {
    if (this.coordinator !== coordinator) return;
    this.dispatch({ type: "ENGINE_SNAPSHOT", snapshot: engineSnapshot });
    if (
      this.devInterruptAfterVerifiedProgress &&
      engineSnapshot.transfer.safeBytes > 0 &&
      engineSnapshot.transfer.state === "SENDING"
    ) {
      this.devInterruptAfterVerifiedProgress = false;
      // Let the commit acknowledgement settle before taking down the test route. Interrupting
      // inside that callback would turn a valid committed block into an artificial race.
      setTimeout(() => {
        if (this.coordinator === coordinator) void coordinator.simulateTransportDisconnect(true);
      }, 0);
      return;
    }
    const state = this.snapshot;
    if (
      engineSnapshot.data !== "open" ||
      this.offeredAttempt === state.startAttempt ||
      !state.source ||
      !state.recipient ||
      !["WAITING_FOR_RECIPIENT", "CONNECTING"].includes(state.phase)
    )
      return;
    this.offeredAttempt = state.startAttempt;
    if (this.devFault) coordinator.configureIntegrityFault(this.devFault);
    if (state.source.transfer.kind === "file") {
      coordinator.selectFile(state.source.transfer.file);
      coordinator.offerSelectedFile();
    } else {
      coordinator.selectFolder(state.source.transfer.source);
      coordinator.offerSelectedFolder();
    }
  }

  private reportSourceError(code: string): void {
    const revision = ++this.preparationRevision;
    this.dispatch({ type: "SOURCE_PREPARING", revision });
    this.dispatch({ type: "SOURCE_FAILED", revision, error: mapProductError(code) });
  }

  private canEditSelection(): boolean {
    return (
      ["SELECTING_RECIPIENT", "SELECTING_SOURCE", "PREPARING_SOURCE", "READY_TO_REVIEW"].includes(
        this.snapshot.phase
      ) ||
      (this.snapshot.activeTransferId === null &&
        ["WAITING_FOR_RECIPIENT", "CONNECTING"].includes(this.snapshot.phase))
    );
  }

  private isRecipientEligible(personId: string): boolean {
    return this.eligibleRecipients().some((recipient) => recipient.id === personId);
  }

  private isCurrentAttempt(
    coordinator: SendCoordinator,
    attempt: number,
    recipientId: string | undefined,
    sourceRevision: number
  ): boolean {
    return (
      this.coordinator === coordinator &&
      this.snapshot.startAttempt === attempt &&
      this.snapshot.recipient?.id === recipientId &&
      this.snapshot.sourceRevision === sourceRevision
    );
  }

  private invalidatePendingSession(): void {
    this.devInterruptAfterVerifiedProgress = false;
    this.offeredAttempt = 0;
    this.closeCoordinator();
  }

  private closeCoordinator(): void {
    this.currentCoordinatorUnsubscribe?.();
    this.currentCoordinatorUnsubscribe = undefined;
    this.coordinator?.disconnect();
    this.coordinator = undefined;
  }

  private dispatch(event: Parameters<typeof reduceSendWorkflow>[1]): void {
    this.snapshot = reduceSendWorkflow(this.snapshot, event);
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

function defaultFolderPicker(): Promise<FileSystemDirectoryHandle> {
  const picker = window as Window & { showDirectoryPicker?: FolderPicker };
  if (!picker.showDirectoryPicker)
    return Promise.reject(new Error("FS_CAP_DIRECTORY_SELECTION_UNAVAILABLE"));
  return picker.showDirectoryPicker();
}

export type { BrowserCapabilitySnapshot };
