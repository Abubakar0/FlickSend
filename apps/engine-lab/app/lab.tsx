"use client";

import {
  ConnectionCoordinator,
  initialRouteSnapshot,
  m3BenchmarkDefaults,
  type IntegrityFault,
  type ConnectionSnapshot,
  type TransferTuning,
  type IceRoutePolicy
} from "@flicksend/engine-core";
import type { StreamPackManifest } from "@flicksend/stream-pack";
import {
  createOpfsBenchmarkDestination,
  createOpfsRecoveryStore,
  BrowserStreamPackDestination,
  destinationFromWritable,
  SmallFixtureDestination,
  SmallStreamPackFixtureDestination,
  streamPackSourceFromDirectoryHandle
} from "@flicksend/filesystem-browser";
import {
  detectBrowserCapabilities,
  runtimeCompatibility,
  type BrowserCapabilitySnapshot
} from "@flicksend/browser-capabilities";
import { useEffect, useRef, useState } from "react";
import {
  createM6InterruptionFixture,
  createM9FilesystemFixture,
  createM6StructuralFixture,
  createM6MixedFixture,
  createM6MutableFixture,
  createM6TinyManyFixture,
  m6StructuralFixtureTree,
  m9FilesystemFixtureTreeByte,
  m6MixedTreeByte,
  m6TinyManyTreeByte
} from "./m6-fixture";

const initial: ConnectionSnapshot = {
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
  transfer: {
    protocolVersion: null,
    transferId: null,
    name: null,
    state: "IDLE",
    bytesTransferred: 0,
    bytesTotal: 0,
    safeBytes: 0,
    blocksCommitted: 0,
    blocksMissing: 0,
    retransmittedBytes: 0,
    integrity: {
      algorithm: null,
      blocksHashedSender: 0,
      blocksVerifiedReceiver: 0,
      integrityMismatchCount: 0,
      integrityRetryCount: 0,
      hashBytesProcessed: 0,
      senderHashingMs: 0,
      receiverHashingMs: 0,
      manifestBuildMs: 0,
      manifestVerifyMs: 0,
      manifestRootMatch: null,
      verifiedBytes: 0
    },
    continuity: {
      safeBytesBeforeDisconnect: 0,
      remainingBytesAtResume: 0,
      resumedPayloadBytes: 0,
      duplicateRetransmittedBytes: 0,
      committedBlocksRetransmitted: 0,
      ambiguousInflightBytesRetransmitted: 0
    },
    reconnectCount: 0,
    recoveryReconciliationMs: null,
    frameCount: 0,
    currentBps: 0,
    averageBps: 0,
    error: null,
    metrics: {
      bytesTotal: 0,
      effectiveFramePayloadBytes: null,
      bytesSent: 0,
      bytesReceived: 0,
      currentThroughputBps: 0,
      averageThroughputBps: 0,
      peakThroughputBps: 0,
      sourceReadBps: 0,
      destinationWriteBps: 0,
      bufferedAmountBytes: 0,
      receiveQueueBytes: 0,
      elapsedMs: 0,
      frameCount: 0,
      stalledMs: 0,
      timeToFirstByteMs: null,
      timeToFirstReadMs: null,
      timeToFirstFrameQueuedMs: null,
      timeToFirstFrameReceivedMs: null,
      timeToFirstDestinationWriteMs: null,
      samples: []
    },
    tuning: m3BenchmarkDefaults
  },
  health: null,
  speedProof: null,
  error: null
};

function formatRate(bytesPerSecond: number): string {
  return `${((bytesPerSecond * 8) / 1_000_000).toFixed(2)} Mbps / ${(bytesPerSecond / 1_000_000).toFixed(2)} MB/s`;
}

function formatOptionalRate(bytesPerSecond: number | null): string {
  return bytesPerSecond === null ? "unavailable" : formatRate(bytesPerSecond);
}

function formatEta(milliseconds: number | null): string {
  if (milliseconds === null) return "unavailable";
  return `${Math.ceil(milliseconds / 1000)} s`;
}

function formatBytes(bytes: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(bytes);
}

async function corruptFirstStreamPackFile(
  root: FileSystemDirectoryHandle,
  destination: BrowserStreamPackDestination,
  manifest: StreamPackManifest
): Promise<void> {
  await destination.settleOpenWriters();
  const entry = manifest.entries.find(
    (candidate) => candidate.type === "FILE" && (candidate.sizeBytes ?? 0) > 0
  );
  if (!entry) throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
  const parts = entry.relativePath.split("/");
  let directory = root;
  for (let index = 0; index < parts.length - 1; index += 1)
    directory = await directory.getDirectoryHandle(parts[index]!);
  const handle = await directory.getFileHandle(parts.at(-1)!);
  const file = await handle.getFile();
  const firstByte = new Uint8Array(await file.slice(0, 1).arrayBuffer())[0] ?? 0;
  const writer = await handle.createWritable({ keepExistingData: true });
  await writer.write({ type: "write", position: 0, data: Uint8Array.of(firstByte ^ 0xff) });
  await writer.close();
}

type M9Permission = PermissionState | "NOT_SUPPORTED";

type M9FileDestination = {
  handle: FileSystemFileHandle;
  permissionAtSelection: M9Permission;
  transferId: string | null;
};

type M9FolderDestination = {
  handle: FileSystemDirectoryHandle;
  destination: BrowserStreamPackDestination;
  fixture: ReturnType<typeof createM9FilesystemFixture> | null;
  permissionAtSelection: M9Permission;
  transferId: string | null;
};

type M9AssistedResults = {
  fileDestination?: Record<string, boolean | number | string | null>;
  folderDestination?: Record<string, boolean | number | string | null>;
  folderSource?: Record<string, boolean | number | string | null>;
};

type PermissionCapableFileSystemHandle = {
  queryPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

async function permissionFor(
  handle: FileSystemFileHandle | FileSystemDirectoryHandle,
  mode: "read" | "readwrite"
): Promise<M9Permission> {
  try {
    const permissionHandle = handle as typeof handle & PermissionCapableFileSystemHandle;
    return permissionHandle.queryPermission
      ? await permissionHandle.queryPermission({ mode })
      : "NOT_SUPPORTED";
  } catch {
    return "NOT_SUPPORTED";
  }
}

export function Lab() {
  const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://127.0.0.1:8787";
  const turnCredentialEndpoint =
    process.env.NEXT_PUBLIC_TURN_ENABLED === "true"
      ? signalingUrl.replace(/^ws/, "http") + "/turn-credentials"
      : undefined;
  const [engine, setEngine] = useState<ConnectionCoordinator | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [code, setCode] = useState("");
  const [tuning, setTuning] = useState<TransferTuning>(m3BenchmarkDefaults);
  const [faultKind, setFaultKind] = useState<IntegrityFault["kind"]>("payload");
  const [faultBlock, setFaultBlock] = useState(0);
  const [faultMode, setFaultMode] = useState<IntegrityFault["mode"]>("once");
  const [folderStatus, setFolderStatus] = useState("No folder selected");
  const [folderTreeCheck, setFolderTreeCheck] = useState<(() => Promise<boolean>) | null>(null);
  const [folderTreeStatus, setFolderTreeStatus] = useState("not checked");
  const [m6SourceMutation, setM6SourceMutation] = useState<(() => void) | null>(null);
  const [m6DestinationMutation, setM6DestinationMutation] = useState<(() => Promise<void>) | null>(
    null
  );
  const [routePolicy, setRoutePolicy] = useState<IceRoutePolicy>("AUTO");
  const [nextRecoveryRoutePolicy, setNextRecoveryRoutePolicy] =
    useState<IceRoutePolicy>("RELAY_ONLY");
  const [turnCredentialTestMode, setTurnCredentialTestMode] = useState<
    "valid" | "expired" | "invalid" | "unreachable"
  >("valid");
  const [browserCapabilities, setBrowserCapabilities] = useState<BrowserCapabilitySnapshot | null>(
    null
  );
  const [m9Target, setM9Target] = useState("m9-edge-windows-filesystem");
  const [m9AssistedResults, setM9AssistedResults] = useState<M9AssistedResults>({});
  const [m9FolderFixture, setM9FolderFixture] = useState<ReturnType<
    typeof createM9FilesystemFixture
  > | null>(null);
  const m9FileDestination = useRef<M9FileDestination | null>(null);
  const m9FolderDestination = useRef<M9FolderDestination | null>(null);

  useEffect(() => {
    const healthDisabled = new URLSearchParams(window.location.search).get("health") === "off";
    const coordinator = new ConnectionCoordinator(signalingUrl, {
      turnCredentialEndpoint,
      transferHealth: healthDisabled ? false : undefined
    });
    setEngine(coordinator);
    return coordinator.subscribe(setSnapshot);
  }, [signalingUrl, turnCredentialEndpoint]);

  useEffect(() => {
    let active = true;
    void detectBrowserCapabilities().then((capabilities) => {
      if (active) setBrowserCapabilities(capabilities);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (snapshot.transfer.state !== "DELIVERED" || !folderTreeCheck) return;
    setFolderTreeStatus("checking");
    void folderTreeCheck().then(
      (matches) => setFolderTreeStatus(matches ? "match" : "mismatch"),
      () => setFolderTreeStatus("mismatch")
    );
  }, [folderTreeCheck, snapshot.transfer.state]);

  useEffect(() => {
    if (snapshot.transfer.state !== "DELIVERED") return;
    const fileDestination = m9FileDestination.current;
    if (fileDestination && fileDestination.transferId === snapshot.transfer.transferId) {
      m9FileDestination.current = null;
      void (async () => {
        try {
          const file = await fileDestination.handle.getFile();
          const permissionAtCompletion = await permissionFor(fileDestination.handle, "readwrite");
          const finalDestinationMatch =
            snapshot.transfer.integrity.manifestRootMatch === true &&
            file.size === snapshot.transfer.bytesTotal;
          setM9AssistedResults((current) => ({
            ...current,
            fileDestination: {
              selectedDestination: "REAL_EXTERNAL_FILESYSTEM",
              permissionAtSelection: fileDestination.permissionAtSelection,
              permissionAtCompletion,
              boundedWrite: true,
              destinationClosed: true,
              delivered: true,
              manifestRootVerified: snapshot.transfer.integrity.manifestRootMatch === true,
              destinationBytes: file.size,
              expectedBytes: snapshot.transfer.bytesTotal,
              finalDestinationMatch
            }
          }));
        } catch {
          setM9AssistedResults((current) => ({
            ...current,
            fileDestination: {
              selectedDestination: "REAL_EXTERNAL_FILESYSTEM",
              permissionAtSelection: fileDestination.permissionAtSelection,
              boundedWrite: true,
              delivered: true,
              manifestRootVerified: snapshot.transfer.integrity.manifestRootMatch === true,
              finalDestinationMatch: false,
              verificationError: "FS_EXTERNAL_DESTINATION_UNREADABLE"
            }
          }));
        }
      })();
    }
    const folderDestination = m9FolderDestination.current;
    if (folderDestination && folderDestination.transferId === snapshot.transfer.transferId) {
      m9FolderDestination.current = null;
      void (async () => {
        const permissionAtCompletion = await permissionFor(folderDestination.handle, "readwrite");
        const finalTreeMatch = folderDestination.fixture
          ? await folderDestination.destination.hasGeneratedTree(
              folderDestination.fixture.manifest,
              m9FilesystemFixtureTreeByte()
            )
          : false;
        setM9AssistedResults((current) => ({
          ...current,
          folderDestination: {
            selectedDestination: "REAL_EXTERNAL_FILESYSTEM",
            permissionAtSelection: folderDestination.permissionAtSelection,
            permissionAtCompletion,
            boundedWrite: true,
            peakOpenDestinationHandles: folderDestination.destination.peakOpenDestinationHandles,
            delivered: true,
            manifestRootVerified: snapshot.transfer.integrity.manifestRootMatch === true,
            finalTreeMatch,
            fspkRootVerified: snapshot.transfer.integrity.manifestRootMatch === true
          }
        }));
      })();
    }
  }, [snapshot.transfer]);

  async function createSession(): Promise<void> {
    if (!engine) return;
    try {
      setCode(await engine.createSession());
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Unable to create session."
      }));
    }
  }

  async function joinSession(): Promise<void> {
    if (!engine) return;
    try {
      await engine.joinSession(code);
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Unable to join session."
      }));
    }
  }

  function applyTuning(): void {
    if (!engine) return;
    try {
      setTuning(engine.configureTransferTuning(tuning));
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Unable to apply M3 tuning."
      }));
    }
  }

  function applyRoutePolicy(): void {
    engine?.setRoutePolicy(routePolicy);
    engine?.setNextRecoveryRoutePolicy(nextRecoveryRoutePolicy);
    engine?.setTurnCredentialTestMode(
      turnCredentialTestMode === "valid" ? undefined : turnCredentialTestMode
    );
  }

  async function chooseDestination(): Promise<void> {
    if (!engine || !snapshot.transfer.name) return;
    const picker = window as Window & {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    };
    if (!picker.showSaveFilePicker) {
      setSnapshot((current) => ({
        ...current,
        error: "This browser does not support direct destination writing."
      }));
      return;
    }
    try {
      const handle = await picker.showSaveFilePicker({ suggestedName: snapshot.transfer.name });
      const permissionAtSelection = await permissionFor(handle, "readwrite");
      m9FileDestination.current = {
        handle,
        permissionAtSelection,
        transferId: snapshot.transfer.transferId
      };
      await engine.acceptIncomingFile(
        destinationFromWritable(await handle.createWritable()),
        await createOpfsRecoveryStore(),
        `chosen:${handle.name}`
      );
    } catch {
      setSnapshot((current) => ({
        ...current,
        error: "Destination selection was cancelled or denied."
      }));
    }
  }

  function downloadBenchmarkReport(): void {
    const report = {
      schemaVersion: 1,
      milestone: "M8",
      kind: "browser-transfer-health",
      createdAt: new Date().toISOString(),
      datasetId: "manual-local-file",
      datasetSizeBytes: snapshot.transfer.bytesTotal,
      configuration: snapshot.transfer.tuning,
      browser: navigator.userAgent,
      route: snapshot.route,
      transfer: snapshot.transfer.metrics,
      recovery: {
        transferId: snapshot.transfer.transferId,
        protocolVersion: snapshot.transfer.protocolVersion,
        safeBytes: snapshot.transfer.safeBytes,
        committedBlocks: snapshot.transfer.blocksCommitted,
        missingBlocks: snapshot.transfer.blocksMissing,
        reconnectCount: snapshot.transfer.reconnectCount,
        continuity: snapshot.transfer.continuity,
        legacyRetransmittedBytes: snapshot.transfer.retransmittedBytes,
        legacyRetransmittedBytesStatus: "deprecated: use continuity metrics",
        reconciliationMs: snapshot.transfer.recoveryReconciliationMs
      },
      completionState: snapshot.transfer.state,
      integrity: snapshot.transfer.integrity,
      transferHealth: snapshot.health,
      speedProof: snapshot.speedProof,
      note: "Local Engine Lab report. File name, path, and file contents are intentionally excluded."
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `flicksend-m5-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadM9AssistedEvidence(): void {
    if (!browserCapabilities) return;
    const report = {
      schemaVersion: 1,
      milestone: "M9",
      kind: "assisted-browser-filesystem",
      createdAt: new Date().toISOString(),
      target: m9Target,
      environment: {
        realBrowser: true,
        automated: false,
        emulated: false,
        evidenceMode: "ASSISTED_USER"
      },
      browser: {
        name: browserCapabilities.browser,
        version: browserCapabilities.browserVersion ?? "UNKNOWN",
        userAgentVersion: browserCapabilities.browserVersion,
        engine: browserCapabilities.engine,
        operatingSystem: browserCapabilities.operatingSystem,
        operatingSystemVersion: browserCapabilities.operatingSystemVersion,
        deviceClass: browserCapabilities.deviceClass
      },
      capabilities: browserCapabilities,
      qualificationResults: {
        realFilesystem: m9AssistedResults,
        transfer: {
          delivered: snapshot.transfer.state === "DELIVERED",
          manifestRootVerified: snapshot.transfer.integrity.manifestRootMatch === true,
          safeBytes: snapshot.transfer.safeBytes,
          totalBytes: snapshot.transfer.bytesTotal,
          duplicateRetransmittedBytes: snapshot.transfer.continuity.duplicateRetransmittedBytes,
          committedBlocksRetransmitted: snapshot.transfer.continuity.committedBlocksRetransmitted
        }
      },
      limitations: [
        "This artifact contains only aggregate assisted qualification outcomes; it excludes filenames, paths, transfer IDs, and payload content.",
        "A picker selection does not prove permission persistence, reload restoration, revocation handling, or browser restart behavior."
      ]
    };
    // Blob is used only for small diagnostic metadata, never for transfer payload.
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `flicksend-m9-assisted-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function selectFolder(): Promise<void> {
    const picker = window as unknown as {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    };
    if (!picker.showDirectoryPicker) {
      setSnapshot((current) => ({
        ...current,
        error: "Folder selection requires the File System Access API."
      }));
      return;
    }
    try {
      const handle = await picker.showDirectoryPicker();
      setFolderStatus("Scanning folder...");
      const source = await streamPackSourceFromDirectoryHandle(handle, {
        blockBytes: 8 * 1024 * 1024,
        onProgress: (progress) =>
          setFolderStatus(
            "Scanning: " +
              progress.filesDiscovered +
              " files, " +
              progress.directoriesDiscovered +
              " folders, " +
              formatBytes(progress.totalBytesDiscovered) +
              " bytes"
          )
      });
      const permissionAtSelection = await permissionFor(handle, "read");
      engine?.selectFolder(source);
      setM9FolderFixture(null);
      setM9AssistedResults((current) => ({
        ...current,
        folderSource: {
          selectedSource: "REAL_EXTERNAL_FILESYSTEM",
          permissionAtSelection,
          streamPackManifestBuilt: true,
          files: source.manifest.entries.filter((entry) => entry.type === "FILE").length,
          directories: source.manifest.entries.filter((entry) => entry.type === "DIRECTORY").length,
          canonicalNfcPaths: source.manifest.entries.every(
            (entry) => entry.relativePath === entry.relativePath.normalize("NFC")
          )
        }
      }));
      setM6SourceMutation(null);
      setM6DestinationMutation(null);
      setFolderStatus(
        "Manifest ready: " +
          source.manifest.entries.filter((entry) => entry.type === "FILE").length +
          " files, " +
          source.manifest.entries.filter((entry) => entry.type === "DIRECTORY").length +
          " folders"
      );
    } catch (error) {
      setFolderStatus(error instanceof Error ? error.message : "Folder selection was cancelled.");
    }
  }

  async function chooseFolderDestination(): Promise<void> {
    const picker = window as unknown as {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    };
    if (!picker.showDirectoryPicker) {
      setSnapshot((current) => ({
        ...current,
        error: "Folder destination requires the File System Access API."
      }));
      return;
    }
    try {
      const handle = await picker.showDirectoryPicker();
      const destination = new BrowserStreamPackDestination(handle);
      const permissionAtSelection = await permissionFor(handle, "readwrite");
      if (m9FolderFixture)
        setFolderTreeCheck(
          () => () =>
            destination.hasGeneratedTree(m9FolderFixture.manifest, m9FilesystemFixtureTreeByte())
        );
      m9FolderDestination.current = {
        handle,
        destination,
        fixture: m9FolderFixture,
        permissionAtSelection,
        transferId: snapshot.transfer.transferId
      };
      await engine?.acceptIncomingFolder(
        destination,
        await createOpfsRecoveryStore(),
        "directory:" + handle.name
      );
    } catch {
      setFolderStatus("Folder destination selection was cancelled or denied.");
    }
  }

  const transfer = snapshot.transfer;
  const metrics = transfer.metrics;
  const health = snapshot.health;
  const canPause = transfer.state === "SENDING" || transfer.state === "RECEIVING";
  const compatibility = browserCapabilities ? runtimeCompatibility(browserCapabilities) : null;

  return (
    <section className="lab" aria-labelledby="lab-title">
      <section aria-labelledby="browser-capabilities-title" data-testid="browser-capabilities">
        <h2 id="browser-capabilities-title">M9 browser capability snapshot</h2>
        <p data-testid="browser-capabilities-summary">
          {browserCapabilities
            ? `${browserCapabilities.browser} ${browserCapabilities.browserVersion ?? "unknown"} on ${browserCapabilities.operatingSystem}: ${compatibility?.proposedSupportTier ?? "UNKNOWN"}`
            : "Detecting browser capabilities."}
        </p>
        <p>
          Feature detection controls available actions; it does not claim browser qualification. A
          missing folder or streaming-destination capability is explained without browser-name
          blocking, and FlickSend never falls back to whole-file Blob accumulation.
        </p>
        <p data-testid="browser-capability-reasons">
          {compatibility?.reasonCodes.join(", ") || "No required capability blocker detected."}
        </p>
        <output data-testid="browser-capability-snapshot">
          {JSON.stringify(browserCapabilities)}
        </output>
      </section>
      <section aria-labelledby="m9-assisted-filesystem-title">
        <h3 id="m9-assisted-filesystem-title">M9 assisted filesystem evidence</h3>
        <p>
          Use this only after a real user completes a File System Access picker flow. The export is
          small diagnostic metadata, never file data, names, or paths.
        </p>
        <div className="controls">
          <label>
            Evidence target
            <select
              aria-label="M9 assisted evidence target"
              value={m9Target}
              onChange={(event) => setM9Target(event.target.value)}
            >
              <option value="m9-chrome-windows-filesystem">Chrome Windows filesystem</option>
              <option value="m9-edge-windows-filesystem">Edge Windows filesystem</option>
              <option value="m9-firefox-windows-filesystem">Firefox Windows filesystem</option>
              <option value="m9-chrome-macos-filesystem">Chrome macOS filesystem</option>
              <option value="m9-safari-macos-filesystem">Safari macOS filesystem</option>
              <option value="m9-chrome-android">Chrome Android receive</option>
              <option value="m9-safari-ios">Safari iOS/iPadOS receive</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!browserCapabilities}
            onClick={downloadM9AssistedEvidence}
          >
            Download M9 Assisted JSON
          </button>
        </div>
        <output data-testid="m9-assisted-filesystem-evidence">
          {JSON.stringify(m9AssistedResults)}
        </output>
      </section>
      <h2 id="lab-title">Connection controls</h2>
      <div className="controls">
        <button type="button" disabled={!engine} onClick={() => void createSession()}>
          Create Session
        </button>
        <label>
          Session code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="482 921"
            inputMode="numeric"
            maxLength={7}
          />
        </label>
        <button type="button" disabled={!engine} onClick={() => void joinSession()}>
          Join
        </button>
      </div>
      <div className="controls" aria-label="M7 route qualification controls">
        <label>
          Route policy
          <select
            aria-label="Route policy"
            value={routePolicy}
            onChange={(event) => setRoutePolicy(event.target.value as IceRoutePolicy)}
          >
            <option value="AUTO">Direct first (AUTO)</option>
            <option value="RELAY_ONLY">Relay only</option>
          </select>
        </label>
        <label>
          Next recovery route
          <select
            aria-label="Next recovery route"
            value={nextRecoveryRoutePolicy}
            onChange={(event) => setNextRecoveryRoutePolicy(event.target.value as IceRoutePolicy)}
          >
            <option value="AUTO">Direct first (AUTO)</option>
            <option value="RELAY_ONLY">Relay only</option>
          </select>
        </label>
        <label>
          TURN credential test mode
          <select
            aria-label="TURN credential test mode"
            value={turnCredentialTestMode}
            onChange={(event) =>
              setTurnCredentialTestMode(
                event.target.value as "valid" | "expired" | "invalid" | "unreachable"
              )
            }
          >
            <option value="valid">Valid</option>
            <option value="invalid">Invalid (dev only)</option>
            <option value="expired">Expired (dev only)</option>
            <option value="unreachable">Unreachable relay (dev only)</option>
          </select>
        </label>
        <button type="button" disabled={!engine} onClick={applyRoutePolicy}>
          Apply Route Policy
        </button>
        <button
          type="button"
          disabled={!engine}
          onClick={() => void engine?.breakCurrentTransport()}
        >
          Break Current Transport
        </button>
      </div>

      <dl className="diagnostics">
        <div>
          <dt>Session</dt>
          <dd data-testid="session-code">{snapshot.sessionCode ?? "none"}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd data-testid="connection-state">{snapshot.state}</dd>
        </div>
        <div>
          <dt>Connection error</dt>
          <dd data-testid="connection-error">{snapshot.error ?? "none"}</dd>
        </div>
        <div>
          <dt>Signalling</dt>
          <dd>{snapshot.signalling}</dd>
        </div>
        <div>
          <dt>Control</dt>
          <dd data-testid="control-state">{snapshot.control}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd data-testid="data-state">{snapshot.data}</dd>
        </div>
        <div>
          <dt>ICE route</dt>
          <dd data-testid="route">
            {snapshot.route.routeType} / {snapshot.route.routeDetail} /{" "}
            {snapshot.route.transportProtocol}
          </dd>
        </div>
        <div>
          <dt>Route generation</dt>
          <dd data-testid="route-generation">{snapshot.route.routeGeneration}</dd>
        </div>
        <div>
          <dt>Route metrics</dt>
          <dd data-testid="route-metrics">
            changes {snapshot.route.routeChangeCount}; direct attempts{" "}
            {snapshot.route.directConnectionAttempts}; relay attempts{" "}
            {snapshot.route.relayConnectionAttempts}; replacements{" "}
            {snapshot.route.peerConnectionReplacementCount}
          </dd>
        </div>
      </dl>
      <p data-testid="connection-trace" className="trace">
        {snapshot.connectionTrace.join(" | ") || "connection trace pending"}
      </p>
      <details>
        <summary>M7 safe route evidence</summary>
        <output data-testid="m7-control-plane-config">
          {JSON.stringify({
            turnCredentialEndpoint: turnCredentialEndpoint ?? null,
            credentialTestMode: turnCredentialTestMode
          })}
        </output>
        <output data-testid="m7-route-snapshot">{JSON.stringify(snapshot.route)}</output>
        <output data-testid="m7-recovery-snapshot">
          {JSON.stringify({
            transferId: snapshot.transfer.transferId,
            state: snapshot.transfer.state,
            continuity: snapshot.transfer.continuity,
            integrity: {
              manifestRootMatch: snapshot.transfer.integrity.manifestRootMatch,
              integrityRetryCount: snapshot.transfer.integrity.integrityRetryCount
            }
          })}
        </output>
      </details>

      <section className="transfer" aria-labelledby="transfer-title">
        <h2 id="transfer-title">M5 verified single-file lab</h2>
        <p>
          M3 benchmark defaults are configurable before selecting a file. They are not permanent
          protocol constants.
        </p>
        <div className="tuning-grid">
          <label>
            Frame payload
            <select
              aria-label="Frame payload"
              value={tuning.framePayloadBytes}
              onChange={(event) =>
                setTuning((current) => ({
                  ...current,
                  framePayloadBytes: Number(event.target.value)
                }))
              }
            >
              <option value={32 * 1024}>32 KiB</option>
              <option value={64 * 1024}>64 KiB</option>
              <option value={128 * 1024}>128 KiB</option>
              <option value={256 * 1024}>256 KiB</option>
            </select>
          </label>
          <label>
            Send low water MiB
            <input
              aria-label="Send low water MiB"
              type="number"
              min="0"
              value={tuning.sendLowWaterBytes / (1024 * 1024)}
              onChange={(event) =>
                setTuning((current) => ({
                  ...current,
                  sendLowWaterBytes: Number(event.target.value) * 1024 * 1024
                }))
              }
            />
          </label>
          <label>
            Send high water MiB
            <input
              aria-label="Send high water MiB"
              type="number"
              min="1"
              max="16"
              value={tuning.sendHighWaterBytes / (1024 * 1024)}
              onChange={(event) =>
                setTuning((current) => ({
                  ...current,
                  sendHighWaterBytes: Number(event.target.value) * 1024 * 1024
                }))
              }
            />
          </label>
          <label>
            Read-ahead KiB
            <input
              aria-label="Read-ahead KiB"
              type="number"
              min="32"
              value={tuning.readAheadBytes / 1024}
              onChange={(event) =>
                setTuning((current) => ({
                  ...current,
                  readAheadBytes: Number(event.target.value) * 1024
                }))
              }
            />
          </label>
          <label>
            Write batch KiB
            <input
              aria-label="Write batch KiB"
              type="number"
              min="32"
              value={tuning.writeBatchBytes / 1024}
              onChange={(event) =>
                setTuning((current) => ({
                  ...current,
                  writeBatchBytes: Number(event.target.value) * 1024
                }))
              }
            />
          </label>
          <label>
            Receive window MiB
            <input
              aria-label="Receive window MiB"
              type="number"
              min="1"
              value={tuning.receiveWindowBytes / (1024 * 1024)}
              onChange={(event) =>
                setTuning((current) => ({
                  ...current,
                  receiveWindowBytes: Number(event.target.value) * 1024 * 1024
                }))
              }
            />
          </label>
          <label>
            UI snapshot ms
            <input
              aria-label="UI snapshot ms"
              type="number"
              min="50"
              value={tuning.uiSnapshotIntervalMs}
              onChange={(event) =>
                setTuning((current) => ({
                  ...current,
                  uiSnapshotIntervalMs: Number(event.target.value)
                }))
              }
            />
          </label>
          <button type="button" disabled={!engine} onClick={applyTuning}>
            Apply M3 Tuning
          </button>
        </div>
        <label>
          Source file
          <input
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) engine?.selectFile(file);
            }}
          />
        </label>
        <section aria-labelledby="streampack-title">
          <h3 id="streampack-title">M6 StreamPack folder lab</h3>
          <p data-testid="streampack-status">{folderStatus}</p>
          <p>
            Folder manifests are validated before payload. The selected root folder is recreated at
            the chosen destination; payload stays virtual and is never archived.
          </p>
          <div className="controls">
            <button type="button" disabled={!engine} onClick={() => void selectFolder()}>
              Select Folder
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() => {
                const fixture = createM9FilesystemFixture();
                engine?.selectFolder(fixture);
                setM9FolderFixture(fixture);
                setFolderStatus("Loaded M9 external-filesystem qualification fixture");
                setFolderTreeCheck(null);
                setFolderTreeStatus("not checked");
                setM6SourceMutation(null);
                setM6DestinationMutation(null);
              }}
            >
              Load M9 Filesystem Fixture
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() => {
                engine?.selectFolder(createM6StructuralFixture());
                setM9FolderFixture(null);
                setFolderStatus("Loaded deterministic M6 structural fixture");
                setFolderTreeCheck(null);
                setFolderTreeStatus("not checked");
                setM6SourceMutation(null);
                setM6DestinationMutation(null);
              }}
            >
              Load M6 Structural Fixture
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() => {
                engine?.selectFolder(createM6TinyManyFixture());
                setM9FolderFixture(null);
                setFolderStatus("Loaded deterministic M6 10,000-file fixture");
                setFolderTreeCheck(null);
                setFolderTreeStatus("not checked");
                setM6SourceMutation(null);
                setM6DestinationMutation(null);
              }}
            >
              Load M6 10k Fixture
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() => {
                engine?.selectFolder(createM6MixedFixture());
                setM9FolderFixture(null);
                setFolderStatus("Loaded deterministic M6 mixed fixture");
                setFolderTreeCheck(null);
                setFolderTreeStatus("not checked");
                setM6SourceMutation(null);
                setM6DestinationMutation(null);
              }}
            >
              Load M6 Mixed Fixture
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() => {
                engine?.selectFolder(createM6InterruptionFixture());
                setM9FolderFixture(null);
                setFolderStatus("Loaded deterministic M6 multi-interruption fixture");
                setFolderTreeCheck(null);
                setFolderTreeStatus("not checked");
                setM6SourceMutation(null);
                setM6DestinationMutation(null);
              }}
            >
              Load M6 Interruption Fixture
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() => {
                const fixture = createM6MutableFixture();
                engine?.selectFolder(fixture.source);
                setM9FolderFixture(null);
                setFolderStatus("Loaded deterministic M6 mutable-source fixture");
                setFolderTreeCheck(null);
                setFolderTreeStatus("not checked");
                setM6SourceMutation(() => fixture.mutate);
                setM6DestinationMutation(null);
              }}
            >
              Load M6 Mutable Fixture
            </button>
            <button type="button" disabled={!engine} onClick={() => engine?.offerSelectedFolder()}>
              Offer Folder
            </button>
            <button type="button" disabled={!engine} onClick={() => void chooseFolderDestination()}>
              Choose Folder Destination
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() =>
                void (async () => {
                  const destination = new SmallStreamPackFixtureDestination();
                  const expected = m6StructuralFixtureTree();
                  setFolderTreeCheck(
                    () => async () => destination.hasExactTree(expected.manifest, expected.files)
                  );
                  await engine?.acceptIncomingFolder(
                    destination,
                    await createOpfsRecoveryStore(),
                    "m6-fixture:" + (snapshot.transfer.transferId ?? "pending")
                  );
                })()
              }
            >
              Accept M6 Structural Fixture
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() =>
                void (async () => {
                  const root = await navigator.storage.getDirectory();
                  const destination = new BrowserStreamPackDestination(root);
                  const expected = createM6TinyManyFixture();
                  setFolderTreeCheck(
                    () => () =>
                      destination.hasGeneratedTree(expected.manifest, m6TinyManyTreeByte())
                  );
                  await engine?.acceptIncomingFolder(
                    destination,
                    await createOpfsRecoveryStore(),
                    "opfs-m6-tiny-many"
                  );
                  setM6DestinationMutation(null);
                })()
              }
            >
              Accept M6 10k to OPFS
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() =>
                void (async () => {
                  const root = await navigator.storage.getDirectory();
                  const destination = new BrowserStreamPackDestination(root);
                  const expected = createM6MixedFixture();
                  setFolderTreeCheck(
                    () => () => destination.hasGeneratedTree(expected.manifest, m6MixedTreeByte())
                  );
                  await engine?.acceptIncomingFolder(
                    destination,
                    await createOpfsRecoveryStore(),
                    "opfs-m6-mixed"
                  );
                  setM6DestinationMutation(
                    () => () => corruptFirstStreamPackFile(root, destination, expected.manifest)
                  );
                })()
              }
            >
              Accept M6 Mixed to OPFS
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() =>
                void (async () => {
                  const root = await navigator.storage.getDirectory();
                  const destination = new BrowserStreamPackDestination(root);
                  const expected = createM6InterruptionFixture();
                  setFolderTreeCheck(
                    () => () => destination.hasGeneratedTree(expected.manifest, m6MixedTreeByte())
                  );
                  await engine?.acceptIncomingFolder(
                    destination,
                    await createOpfsRecoveryStore(),
                    "opfs-m6-interruptions"
                  );
                  setM6DestinationMutation(
                    () => () => corruptFirstStreamPackFile(root, destination, expected.manifest)
                  );
                })()
              }
            >
              Accept M6 Interruption to OPFS
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() =>
                void (async () => {
                  const root = await navigator.storage.getDirectory();
                  const destination = new BrowserStreamPackDestination(root);
                  const expected = createM6MutableFixture().source;
                  setFolderTreeCheck(
                    () => () => destination.hasGeneratedTree(expected.manifest, m6MixedTreeByte())
                  );
                  await engine?.acceptIncomingFolder(
                    destination,
                    await createOpfsRecoveryStore(),
                    "opfs-m6-mutable"
                  );
                  setM6DestinationMutation(
                    () => () => corruptFirstStreamPackFile(root, destination, expected.manifest)
                  );
                })()
              }
            >
              Accept M6 Mutable to OPFS
            </button>
          </div>
          <div className="controls" aria-label="M6 recovery qualification controls">
            <button
              type="button"
              disabled={!m6SourceMutation}
              onClick={() => {
                m6SourceMutation?.();
                setFolderStatus("M6 qualification source mutated");
              }}
            >
              Mutate M6 Source
            </button>
            <button
              type="button"
              disabled={!m6DestinationMutation}
              onClick={() =>
                void m6DestinationMutation?.().then(
                  () => setFolderStatus("M6 qualification destination mutated"),
                  (error: unknown) =>
                    setFolderStatus(
                      error instanceof Error ? error.message : "M6 destination mutation failed"
                    )
                )
              }
            >
              Mutate M6 Destination
            </button>
            <button
              type="button"
              disabled={!engine || !transfer.transferId}
              onClick={() => void engine?.simulateTransportDisconnect(true)}
            >
              Interrupt M6 Transport (Hold)
            </button>
            <button
              type="button"
              disabled={!engine || !transfer.transferId}
              onClick={() => void engine?.resumeHeldTransportReconnect()}
            >
              Resume Held M6 Reconnect
            </button>
          </div>
          {transfer.protocolVersion === 5 && transfer.streamPack ? (
            <dl className="diagnostics metrics" data-testid="streampack-metrics">
              <div>
                <dt>Manifest entries</dt>
                <dd>{transfer.streamPack.manifestEntries}</dd>
              </div>
              <div>
                <dt>Files / folders</dt>
                <dd>
                  {transfer.streamPack.filesTotal} / {transfer.streamPack.directoriesTotal}
                </dd>
              </div>
              <div>
                <dt>Manifest bytes</dt>
                <dd>{formatBytes(transfer.streamPack.manifestBytes)}</dd>
              </div>
              <div>
                <dt>Writer peak</dt>
                <dd>{transfer.streamPack.peakOpenDestinationHandles}</dd>
              </div>
            </dl>
          ) : null}
          {transfer.protocolVersion === 5 && transfer.streamPack ? (
            <p data-testid="streampack-protocol-trace">
              {transfer.streamPack.protocolTrace.join(" | ") || "StreamPack trace pending"}
            </p>
          ) : null}
          <p data-testid="streampack-tree-status">Folder tree: {folderTreeStatus}</p>
        </section>
        <p data-testid="transfer-status">
          {transfer.name ?? "No file selected"}: {transfer.state}{" "}
          {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.bytesTotal)} bytes
        </p>
        <dl className="diagnostics metrics" data-testid="m4-recovery-metrics">
          <div>
            <dt>Transfer ID</dt>
            <dd>{transfer.transferId ?? "pending"}</dd>
          </div>
          <div>
            <dt>Protocol</dt>
            <dd>{transfer.protocolVersion ?? "pending"}</dd>
          </div>
          <div>
            <dt>Safe</dt>
            <dd>{formatBytes(transfer.safeBytes)} bytes</dd>
          </div>
          <div>
            <dt>Committed blocks</dt>
            <dd>
              {transfer.blocksCommitted} / {transfer.blocksCommitted + transfer.blocksMissing}
            </dd>
          </div>
          <div>
            <dt>Missing blocks</dt>
            <dd>{transfer.blocksMissing}</dd>
          </div>
          <div>
            <dt>Reconnect count</dt>
            <dd>{transfer.reconnectCount}</dd>
          </div>
          <div>
            <dt>Resumed payload</dt>
            <dd>{(transfer.continuity.resumedPayloadBytes / (1024 * 1024)).toFixed(2)} MiB</dd>
          </div>
          <div>
            <dt>Reconciliation</dt>
            <dd>
              {transfer.recoveryReconciliationMs === null
                ? "pending"
                : `${transfer.recoveryReconciliationMs.toFixed(1)} ms`}
            </dd>
          </div>
        </dl>
        <dl className="diagnostics metrics" data-testid="continuity-metrics">
          <div>
            <dt>Safe before disconnect</dt>
            <dd>{formatBytes(transfer.continuity.safeBytesBeforeDisconnect)} bytes</dd>
          </div>
          <div>
            <dt>Remaining at resume</dt>
            <dd>{formatBytes(transfer.continuity.remainingBytesAtResume)} bytes</dd>
          </div>
          <div>
            <dt>Resumed payload</dt>
            <dd>{formatBytes(transfer.continuity.resumedPayloadBytes)} bytes</dd>
          </div>
          <div>
            <dt>Duplicate retransmitted</dt>
            <dd>{formatBytes(transfer.continuity.duplicateRetransmittedBytes)} bytes</dd>
          </div>
          <div>
            <dt>Committed blocks retransmitted</dt>
            <dd>{transfer.continuity.committedBlocksRetransmitted}</dd>
          </div>
          <div>
            <dt>Ambiguous in-flight retransmitted</dt>
            <dd>{formatBytes(transfer.continuity.ambiguousInflightBytesRetransmitted)} bytes</dd>
          </div>
        </dl>
        <dl className="diagnostics metrics" data-testid="m5-integrity-metrics">
          <div>
            <dt>Integrity</dt>
            <dd>{transfer.integrity.algorithm ?? "pending"}</dd>
          </div>
          <div>
            <dt>Blocks verified</dt>
            <dd>{transfer.integrity.blocksVerifiedReceiver}</dd>
          </div>
          <div>
            <dt>Integrity retries</dt>
            <dd>{transfer.integrity.integrityRetryCount}</dd>
          </div>
          <div>
            <dt>Mismatches</dt>
            <dd>{transfer.integrity.integrityMismatchCount}</dd>
          </div>
          <div>
            <dt>Manifest</dt>
            <dd>
              {transfer.integrity.manifestRootMatch === null
                ? "pending"
                : transfer.integrity.manifestRootMatch
                  ? "verified"
                  : "mismatch"}
            </dd>
          </div>
        </dl>
        {transfer.error ? (
          <p className="error" data-testid="transfer-error" role="alert">
            Transfer failed: {transfer.error}
          </p>
        ) : null}
        <dl className="diagnostics metrics" data-testid="m3-metrics">
          <div>
            <dt>Current speed</dt>
            <dd>{formatRate(metrics.currentThroughputBps)}</dd>
          </div>
          <div>
            <dt>Average speed</dt>
            <dd>{formatRate(metrics.averageThroughputBps)}</dd>
          </div>
          <div>
            <dt>Peak speed</dt>
            <dd>{formatRate(metrics.peakThroughputBps)}</dd>
          </div>
          <div>
            <dt>Source read</dt>
            <dd>{formatRate(metrics.sourceReadBps)}</dd>
          </div>
          <div>
            <dt>Destination write</dt>
            <dd>{formatRate(metrics.destinationWriteBps)}</dd>
          </div>
          <div>
            <dt>DataChannel queue</dt>
            <dd>{formatBytes(metrics.bufferedAmountBytes)} bytes</dd>
          </div>
          <div>
            <dt>Receive queue</dt>
            <dd>{formatBytes(metrics.receiveQueueBytes)} bytes</dd>
          </div>
          <div>
            <dt>First destination write</dt>
            <dd>{metrics.timeToFirstDestinationWriteMs?.toFixed(1) ?? "pending"} ms</dd>
          </div>
        </dl>
        <p>
          Frames: {transfer.frameCount}; elapsed: {(metrics.elapsedMs / 1000).toFixed(2)} s;
          DataChannel backpressure wait: {metrics.stalledMs.toFixed(1)} ms.
        </p>
        <p>
          M3 config: {transfer.tuning.framePayloadBytes / 1024} KiB requested /{" "}
          {metrics.effectiveFramePayloadBytes === null
            ? "pending"
            : `${metrics.effectiveFramePayloadBytes / 1024} KiB effective`}{" "}
          frames; {transfer.tuning.sendLowWaterBytes / (1024 * 1024)} /{" "}
          {transfer.tuning.sendHighWaterBytes / (1024 * 1024)} MiB low/high water;{" "}
          {transfer.tuning.channelCount} reliable ordered data channel; {transfer.tuning.workerMode}
          .
        </p>
        <section
          className="transfer-health"
          aria-labelledby="transfer-health-title"
          data-testid="transfer-health"
        >
          <h3 id="transfer-health-title">M8 transfer health</h3>
          <p>
            Engine Lab diagnostics only. Read/write values are bounded local adapter work rates, not
            physical storage throughput; browser bandwidth is an estimate and unavailable fields are
            never shown as zero.
          </p>
          <dl className="diagnostics metrics">
            <div>
              <dt>Health</dt>
              <dd>{health?.healthState ?? "disabled"}</dd>
            </div>
            <div>
              <dt>Current / rolling</dt>
              <dd>
                {formatOptionalRate(health?.currentThroughputBps ?? null)} /{" "}
                {formatOptionalRate(health?.rollingThroughputBps ?? null)}
              </dd>
            </div>
            <div>
              <dt>Average / peak</dt>
              <dd>
                {formatOptionalRate(health?.averageThroughputBps ?? null)} /{" "}
                {formatOptionalRate(health?.peakThroughputBps ?? null)}
              </dd>
            </div>
            <div>
              <dt>Source / destination work</dt>
              <dd>
                {formatOptionalRate(health?.senderReadBps ?? null)} /{" "}
                {formatOptionalRate(health?.receiverWriteBps ?? null)}
              </dd>
            </div>
            <div>
              <dt>Route / RTT</dt>
              <dd>
                {health ? `${health.routeType} / ${health.routeDetail}` : "disabled"} /{" "}
                {health?.rttMs === null || health?.rttMs === undefined
                  ? "unavailable"
                  : `${health.rttMs.toFixed(1)} ms`}
              </dd>
            </div>
            <div>
              <dt>Browser bitrate estimate</dt>
              <dd>{formatOptionalRate(health?.availableOutgoingBitrateBps ?? null)}</dd>
            </div>
            <div>
              <dt>Send / receive queue</dt>
              <dd>
                {health?.senderBufferedAmountBytes === null ||
                health?.senderBufferedAmountBytes === undefined
                  ? "unavailable"
                  : `${formatBytes(health.senderBufferedAmountBytes)} bytes`}{" "}
                /{" "}
                {health?.receiveQueueBytes === null || health?.receiveQueueBytes === undefined
                  ? "unavailable"
                  : `${formatBytes(health.receiveQueueBytes)} bytes`}
              </dd>
            </div>
            <div>
              <dt>Bottleneck / confidence</dt>
              <dd>
                {health?.bottleneck ?? "disabled"} / {health?.confidence ?? "n/a"}
              </dd>
            </div>
            <div>
              <dt>ETA / stalls</dt>
              <dd>
                {formatEta(health?.etaMs ?? null)} / {health?.stallCount ?? 0}
              </dd>
            </div>
          </dl>
          <p className="health-reasons" data-testid="transfer-health-reasons">
            {health?.reasons.map((reason) => `${reason.code}: ${reason.detail}`).join(" | ") ??
              "Transfer Health disabled for this comparison run."}
          </p>
          <output data-testid="m8-health-snapshot">{JSON.stringify(health)}</output>
          <output data-testid="m8-speed-proof">{JSON.stringify(snapshot.speedProof)}</output>
        </section>
        <div className="controls">
          <button type="button" disabled={!engine} onClick={() => engine?.offerSelectedFile()}>
            Offer File
          </button>
          <button type="button" disabled={!engine} onClick={() => void chooseDestination()}>
            Choose Destination and Accept
          </button>
          <button
            type="button"
            disabled={!engine || transfer.bytesTotal > 10 * 1024 * 1024}
            onClick={() =>
              void (async () =>
                engine?.acceptIncomingFile(
                  new SmallFixtureDestination(),
                  await createOpfsRecoveryStore(),
                  `fixture:${snapshot.transfer.transferId}`
                ))()
            }
          >
            Accept Small Test Fixture
          </button>
          <button
            type="button"
            disabled={!engine || !transfer.name}
            onClick={() =>
              void createOpfsBenchmarkDestination(transfer.name ?? "flicksend-benchmark.bin").then(
                async (destination) =>
                  engine?.acceptIncomingFile(
                    destination,
                    await createOpfsRecoveryStore(),
                    `opfs:${transfer.name}`
                  )
              )
            }
          >
            Accept to OPFS Benchmark Storage
          </button>
          <button
            type="button"
            disabled={!engine || !canPause}
            onClick={() => engine?.pauseTransfer()}
          >
            Pause
          </button>
          <button
            type="button"
            disabled={!engine || transfer.state !== "PAUSED"}
            onClick={() => engine?.resumeTransfer()}
          >
            Resume
          </button>
          <button type="button" disabled={!engine} onClick={() => engine?.cancelTransfer()}>
            Cancel Transfer
          </button>
          <button type="button" disabled={!transfer.transferId} onClick={downloadBenchmarkReport}>
            Download M8 JSON
          </button>
        </div>
        <section aria-labelledby="integrity-fault-title">
          <h3 id="integrity-fault-title">Development-only corruption injection</h3>
          <div className="controls">
            <label>
              Fault
              <select
                aria-label="Integrity fault"
                value={faultKind}
                onChange={(event) => setFaultKind(event.target.value as IntegrityFault["kind"])}
              >
                <option value="payload">Payload byte</option>
                <option value="expectedDigest">Expected digest</option>
                <option value="storedReceiverDigest">Stored receiver digest</option>
                <option value="manifestRoot">Manifest root</option>
              </select>
            </label>
            <label>
              Block
              <input
                aria-label="Integrity fault block"
                type="number"
                min="0"
                value={faultBlock}
                onChange={(event) => setFaultBlock(Number(event.target.value))}
              />
            </label>
            <label>
              Mode
              <select
                aria-label="Integrity fault mode"
                value={faultMode}
                onChange={(event) => setFaultMode(event.target.value as IntegrityFault["mode"])}
              >
                <option value="once">Once</option>
                <option value="always">Always</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!engine}
              onClick={() =>
                engine?.configureIntegrityFault({
                  kind: faultKind,
                  blockIndex: faultKind === "manifestRoot" ? undefined : faultBlock,
                  mode: faultMode
                })
              }
            >
              Apply Integrity Fault
            </button>
            <button
              type="button"
              disabled={!engine}
              onClick={() => engine?.configureIntegrityFault(undefined)}
            >
              Clear Integrity Fault
            </button>
          </div>
        </section>
      </section>

      <p data-testid="proof-status">
        {snapshot.helloReceived ? "HELLO received" : "HELLO pending"}
        {snapshot.binaryResult ? ": " + snapshot.binaryResult : ""}
      </p>
      {snapshot.error ? (
        <p className="error" role="alert">
          {snapshot.error}
        </p>
      ) : null}

      <div className="controls">
        <button type="button" disabled={!engine} onClick={() => engine?.sendHello()}>
          Send HELLO
        </button>
        <button type="button" disabled={!engine} onClick={() => engine?.sendBinaryProof()}>
          Send Binary Test
        </button>
        <button type="button" disabled={!engine} onClick={() => void engine?.restartIce()}>
          Restart ICE
        </button>
        <button
          type="button"
          disabled={!engine || !transfer.transferId}
          onClick={() => void engine?.simulateTransportDisconnect()}
        >
          Simulate Transport Disconnect
        </button>
        <button type="button" disabled={!engine} onClick={() => void engine?.refreshDiagnostics()}>
          Refresh Diagnostics
        </button>
        <button type="button" disabled={!engine} onClick={() => engine?.disconnect()}>
          Disconnect
        </button>
      </div>
    </section>
  );
}
