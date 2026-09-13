export const browserSupportTiers = [
  "FULL_SUPPORT",
  "SUPPORTED",
  "SUPPORTED_WITH_LIMITATIONS",
  "RECEIVE_ONLY",
  "UNSUPPORTED",
  "NOT_TESTED"
] as const;

export type BrowserSupportTier = (typeof browserSupportTiers)[number];

export type CapabilityAvailability = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

export type BrowserName = "CHROME" | "EDGE" | "FIREFOX" | "SAFARI" | "OTHER" | "UNKNOWN";

export type BrowserEngine = "BLINK" | "GECKO" | "WEBKIT" | "UNKNOWN";

export type OperatingSystem = "WINDOWS" | "MACOS" | "IOS" | "ANDROID" | "LINUX" | "UNKNOWN";

export type DeviceClass = "DESKTOP" | "PHONE" | "TABLET" | "UNKNOWN";

export type PersistentStorageState = "PERSISTED" | "NOT_PERSISTED" | "UNKNOWN";

export type BrowserCompatibilityReasonCode =
  | "FS_CAP_WEBRTC_UNAVAILABLE"
  | "FS_CAP_DATA_CHANNEL_UNAVAILABLE"
  | "FS_CAP_CRYPTO_UNAVAILABLE"
  | "FS_CAP_FILE_SELECTION_UNAVAILABLE"
  | "FS_CAP_DIRECTORY_SELECTION_UNAVAILABLE"
  | "FS_CAP_DIRECTORY_WRITE_UNAVAILABLE"
  | "FS_CAP_STREAMING_DESTINATION_UNAVAILABLE"
  | "FS_CAP_PERSISTENT_RECOVERY_UNAVAILABLE"
  | "FS_CAP_PERSISTENT_HANDLE_UNAVAILABLE"
  | "FS_CAP_ROUTE_STATS_UNAVAILABLE";

export type BrowserIdentity = {
  browser: BrowserName;
  browserVersion: string | null;
  engine: BrowserEngine;
  operatingSystem: OperatingSystem;
  operatingSystemVersion: string | null;
  deviceClass: DeviceClass;
  architecture: string | null;
};

export type BrowserStorageEstimate = {
  availability: CapabilityAvailability;
  quotaBytes: number | null;
  usageBytes: number | null;
};

export type BrowserSupportedTransferModes = {
  canSendFiles: CapabilityAvailability;
  canSendFolders: CapabilityAvailability;
  canReceiveSingleFiles: CapabilityAvailability;
  canReceiveFolders: CapabilityAvailability;
  canResumeInSession: CapabilityAvailability;
  canResumeAfterReload: CapabilityAvailability;
  canUseDirectDestination: CapabilityAvailability;
  canUseTurn: CapabilityAvailability;
  canShowDetailedHealth: CapabilityAvailability;
};

/**
 * A feature snapshot, not a product-support claim. Dynamic WebRTC statistics and permission
 * restoration are intentionally UNKNOWN until a real transfer has exercised them.
 */
export type BrowserCapabilitySnapshot = BrowserIdentity & {
  schemaVersion: 1;
  detectedAt: string;
  webRtcDataChannel: CapabilityAvailability;
  webRtcStats: CapabilityAvailability;
  fileSelection: CapabilityAvailability;
  directorySelection: CapabilityAvailability;
  dragDropFiles: CapabilityAvailability;
  dragDropDirectories: CapabilityAvailability;
  directFileWrite: CapabilityAvailability;
  directDirectoryWrite: CapabilityAvailability;
  opfs: CapabilityAvailability;
  persistentStorage: CapabilityAvailability;
  persistentStorageState: PersistentStorageState;
  storageEstimate: BrowserStorageEstimate;
  webCryptoSha256: CapabilityAvailability;
  webWorkers: CapabilityAvailability;
  routeStats: CapabilityAvailability;
  rttStats: CapabilityAvailability;
  availableOutgoingBitrate: CapabilityAvailability;
  wakeLock: CapabilityAvailability;
  backgroundBehavior: CapabilityAvailability;
  supportedTransferModes: BrowserSupportedTransferModes;
};

export type RuntimeCompatibilityDecision = {
  proposedSupportTier: Exclude<BrowserSupportTier, "FULL_SUPPORT" | "NOT_TESTED">;
  reasonCodes: readonly BrowserCompatibilityReasonCode[];
  requiredCapabilityMissing: boolean;
};

export type BrowserCapabilityProbe = {
  userAgent: string | null;
  platform: string | null;
  architecture: string | null;
  detectedAt: string;
  webRtcDataChannel: CapabilityAvailability;
  webRtcStats: CapabilityAvailability;
  fileSelection: CapabilityAvailability;
  directorySelection: CapabilityAvailability;
  dragDropFiles: CapabilityAvailability;
  dragDropDirectories: CapabilityAvailability;
  directFileWrite: CapabilityAvailability;
  directDirectoryWrite: CapabilityAvailability;
  opfs: CapabilityAvailability;
  persistentStorage: CapabilityAvailability;
  persistentStorageState: PersistentStorageState;
  storageEstimate: BrowserStorageEstimate;
  webCryptoSha256: CapabilityAvailability;
  webWorkers: CapabilityAvailability;
  wakeLock: CapabilityAvailability;
};

type RuntimeNavigator = {
  userAgent?: string;
  platform?: string;
  storage?: {
    getDirectory?: unknown;
    estimate?: () => Promise<{ quota?: number; usage?: number }>;
    persisted?: () => Promise<boolean>;
  };
  wakeLock?: { request?: unknown };
  userAgentData?: { architecture?: string };
};

type RuntimeGlobal = typeof globalThis & {
  navigator?: RuntimeNavigator;
  RTCPeerConnection?: { prototype?: { createDataChannel?: unknown; getStats?: unknown } };
  File?: unknown;
  HTMLInputElement?: unknown;
  DataTransfer?: unknown;
  DataTransferItem?: {
    prototype?: { getAsFileSystemHandle?: unknown; webkitGetAsEntry?: unknown };
  };
  Worker?: unknown;
  showSaveFilePicker?: unknown;
  showDirectoryPicker?: unknown;
};

function availability(value: boolean): CapabilityAvailability {
  return value ? "AVAILABLE" : "UNAVAILABLE";
}

function combine(...values: readonly CapabilityAvailability[]): CapabilityAvailability {
  if (values.some((value) => value === "UNAVAILABLE")) return "UNAVAILABLE";
  if (values.every((value) => value === "AVAILABLE")) return "AVAILABLE";
  return "UNKNOWN";
}

function version(userAgent: string, expression: RegExp): string | null {
  return userAgent.match(expression)?.[1] ?? null;
}

/**
 * User-agent parsing is used only to label qualification evidence. Capability decisions are made
 * from feature probes below and never branch on this identity.
 */
export function identifyBrowser(
  userAgent: string | null,
  platform: string | null,
  architecture: string | null = null
): BrowserIdentity {
  const ua = userAgent ?? "";
  const osPlatform = platform ?? "";
  const ios = /iPad|iPhone|iPod/.test(ua);
  const android = /Android/.test(ua);
  const mac = /Macintosh|Mac OS X/.test(ua) && !ios;
  const windows = /Windows NT/.test(ua) || /Win/.test(osPlatform);
  const linux = /Linux/.test(ua) && !android;
  const operatingSystem: OperatingSystem = ios
    ? "IOS"
    : android
      ? "ANDROID"
      : mac
        ? "MACOS"
        : windows
          ? "WINDOWS"
          : linux
            ? "LINUX"
            : "UNKNOWN";
  const operatingSystemVersion = ios
    ? (version(ua, /OS ([0-9_]+)/)?.replace(/_/g, ".") ?? null)
    : android
      ? version(ua, /Android ([0-9.]+)/)
      : mac
        ? (version(ua, /Mac OS X ([0-9_]+)/)?.replace(/_/g, ".") ?? null)
        : version(ua, /Windows NT ([0-9.]+)/);
  const deviceClass: DeviceClass = /iPad/.test(ua)
    ? "TABLET"
    : /Mobile|iPhone|iPod|Android/.test(ua)
      ? "PHONE"
      : windows || mac || linux
        ? "DESKTOP"
        : "UNKNOWN";

  if (/Edg\//.test(ua))
    return {
      browser: "EDGE",
      browserVersion: version(ua, /Edg\/([0-9.]+)/),
      engine: "BLINK",
      operatingSystem,
      operatingSystemVersion,
      deviceClass,
      architecture
    };
  if (/Firefox\//.test(ua) || /FxiOS\//.test(ua))
    return {
      browser: "FIREFOX",
      browserVersion: version(ua, /(?:Firefox|FxiOS)\/([0-9.]+)/),
      engine: "GECKO",
      operatingSystem,
      operatingSystemVersion,
      deviceClass,
      architecture
    };
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua))
    return {
      browser: "CHROME",
      browserVersion: version(ua, /(?:Chrome|CriOS)\/([0-9.]+)/),
      engine: "BLINK",
      operatingSystem,
      operatingSystemVersion,
      deviceClass,
      architecture
    };
  if (/Safari\//.test(ua) && /Version\//.test(ua))
    return {
      browser: "SAFARI",
      browserVersion: version(ua, /Version\/([0-9.]+)/),
      engine: "WEBKIT",
      operatingSystem,
      operatingSystemVersion,
      deviceClass,
      architecture
    };
  if (ua)
    return {
      browser: "OTHER",
      browserVersion: null,
      engine: "UNKNOWN",
      operatingSystem,
      operatingSystemVersion,
      deviceClass,
      architecture
    };
  return {
    browser: "UNKNOWN",
    browserVersion: null,
    engine: "UNKNOWN",
    operatingSystem,
    operatingSystemVersion,
    deviceClass,
    architecture
  };
}

function transferModes(probe: BrowserCapabilityProbe): BrowserSupportedTransferModes {
  const singleFile = combine(probe.webRtcDataChannel, probe.webCryptoSha256, probe.fileSelection);
  const singleReceive = combine(
    probe.webRtcDataChannel,
    probe.webCryptoSha256,
    probe.directFileWrite
  );
  const folderSend = combine(
    probe.webRtcDataChannel,
    probe.webCryptoSha256,
    probe.directorySelection
  );
  const folderReceive = combine(
    probe.webRtcDataChannel,
    probe.webCryptoSha256,
    probe.directDirectoryWrite
  );
  return {
    canSendFiles: singleFile,
    canSendFolders: folderSend,
    canReceiveSingleFiles: singleReceive,
    canReceiveFolders: folderReceive,
    canResumeInSession: combine(singleReceive, probe.opfs),
    // A handle API does not prove reload/restart permission restoration.
    canResumeAfterReload: "UNKNOWN",
    canUseDirectDestination: singleReceive,
    canUseTurn: combine(probe.webRtcDataChannel, probe.webRtcStats),
    canShowDetailedHealth: probe.webRtcStats
  };
}

export function snapshotFromProbe(probe: BrowserCapabilityProbe): BrowserCapabilitySnapshot {
  const identity = identifyBrowser(probe.userAgent, probe.platform, probe.architecture);
  return {
    schemaVersion: 1,
    detectedAt: probe.detectedAt,
    ...identity,
    webRtcDataChannel: probe.webRtcDataChannel,
    webRtcStats: probe.webRtcStats,
    fileSelection: probe.fileSelection,
    directorySelection: probe.directorySelection,
    dragDropFiles: probe.dragDropFiles,
    dragDropDirectories: probe.dragDropDirectories,
    directFileWrite: probe.directFileWrite,
    directDirectoryWrite: probe.directDirectoryWrite,
    opfs: probe.opfs,
    persistentStorage: probe.persistentStorage,
    persistentStorageState: probe.persistentStorageState,
    storageEstimate: probe.storageEstimate,
    webCryptoSha256: probe.webCryptoSha256,
    webWorkers: probe.webWorkers,
    routeStats: probe.webRtcStats,
    // A candidate pair must be observed on a live connection before these can be asserted.
    rttStats: "UNKNOWN",
    availableOutgoingBitrate: "UNKNOWN",
    wakeLock: probe.wakeLock,
    backgroundBehavior: "UNKNOWN",
    supportedTransferModes: transferModes(probe)
  };
}

export function runtimeCompatibility(
  snapshot: BrowserCapabilitySnapshot
): RuntimeCompatibilityDecision {
  const reasons: BrowserCompatibilityReasonCode[] = [];
  const modes = snapshot.supportedTransferModes;
  if (snapshot.webRtcDataChannel === "UNAVAILABLE") {
    reasons.push("FS_CAP_WEBRTC_UNAVAILABLE", "FS_CAP_DATA_CHANNEL_UNAVAILABLE");
  }
  if (snapshot.webCryptoSha256 === "UNAVAILABLE") reasons.push("FS_CAP_CRYPTO_UNAVAILABLE");
  if (snapshot.fileSelection === "UNAVAILABLE") reasons.push("FS_CAP_FILE_SELECTION_UNAVAILABLE");
  if (snapshot.directorySelection === "UNAVAILABLE")
    reasons.push("FS_CAP_DIRECTORY_SELECTION_UNAVAILABLE");
  if (snapshot.directFileWrite === "UNAVAILABLE")
    reasons.push("FS_CAP_STREAMING_DESTINATION_UNAVAILABLE");
  if (snapshot.directDirectoryWrite === "UNAVAILABLE")
    reasons.push("FS_CAP_DIRECTORY_WRITE_UNAVAILABLE");
  if (snapshot.opfs === "UNAVAILABLE") reasons.push("FS_CAP_PERSISTENT_RECOVERY_UNAVAILABLE");
  if (modes.canResumeAfterReload !== "AVAILABLE")
    reasons.push("FS_CAP_PERSISTENT_HANDLE_UNAVAILABLE");
  if (snapshot.routeStats === "UNAVAILABLE") reasons.push("FS_CAP_ROUTE_STATS_UNAVAILABLE");

  const requiredCapabilityMissing =
    snapshot.webRtcDataChannel === "UNAVAILABLE" || snapshot.webCryptoSha256 === "UNAVAILABLE";
  const proposedSupportTier = requiredCapabilityMissing
    ? "UNSUPPORTED"
    : modes.canSendFiles === "UNAVAILABLE" && modes.canReceiveSingleFiles === "AVAILABLE"
      ? "RECEIVE_ONLY"
      : "SUPPORTED_WITH_LIMITATIONS";
  return { proposedSupportTier, reasonCodes: reasons, requiredCapabilityMissing };
}

async function sha256Availability(global: RuntimeGlobal): Promise<CapabilityAvailability> {
  const subtle = global.crypto?.subtle;
  if (!subtle) return "UNAVAILABLE";
  try {
    await subtle.digest("SHA-256", new Uint8Array());
    return "AVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

async function storageProbe(global: RuntimeGlobal): Promise<{
  persistentStorage: CapabilityAvailability;
  persistentStorageState: PersistentStorageState;
  storageEstimate: BrowserStorageEstimate;
}> {
  const storage = global.navigator?.storage;
  const estimate = storage?.estimate;
  const persisted = storage?.persisted;
  let storageEstimate: BrowserStorageEstimate = {
    availability: availability(typeof estimate === "function"),
    quotaBytes: null,
    usageBytes: null
  };
  if (typeof estimate === "function") {
    try {
      const value = await estimate.call(storage);
      storageEstimate = {
        availability: "AVAILABLE",
        quotaBytes: Number.isFinite(value.quota) ? (value.quota ?? null) : null,
        usageBytes: Number.isFinite(value.usage) ? (value.usage ?? null) : null
      };
    } catch {
      storageEstimate = { availability: "UNKNOWN", quotaBytes: null, usageBytes: null };
    }
  }
  if (typeof persisted !== "function")
    return {
      persistentStorage: "UNAVAILABLE",
      persistentStorageState: "UNKNOWN",
      storageEstimate
    };
  try {
    return {
      persistentStorage: "AVAILABLE",
      persistentStorageState: (await persisted.call(storage)) ? "PERSISTED" : "NOT_PERSISTED",
      storageEstimate
    };
  } catch {
    return {
      persistentStorage: "UNKNOWN",
      persistentStorageState: "UNKNOWN",
      storageEstimate
    };
  }
}

/** Performs safe, permission-free browser API probes. It never opens a picker or writes payload data. */
export async function detectBrowserCapabilities(): Promise<BrowserCapabilitySnapshot> {
  const global = globalThis as RuntimeGlobal;
  const navigator = global.navigator;
  const storage = await storageProbe(global);
  const hasDataChannel =
    typeof global.RTCPeerConnection === "function" &&
    typeof global.RTCPeerConnection.prototype?.createDataChannel === "function";
  const hasStats =
    typeof global.RTCPeerConnection === "function" &&
    typeof global.RTCPeerConnection.prototype?.getStats === "function";
  return snapshotFromProbe({
    userAgent: navigator?.userAgent ?? null,
    platform: navigator?.platform ?? null,
    architecture: navigator?.userAgentData?.architecture ?? null,
    detectedAt: new Date().toISOString(),
    webRtcDataChannel: availability(hasDataChannel),
    webRtcStats: availability(hasStats),
    fileSelection: availability(
      typeof global.File === "function" && typeof global.HTMLInputElement === "function"
    ),
    directorySelection: availability(typeof global.showDirectoryPicker === "function"),
    dragDropFiles: availability(
      typeof global.DataTransfer === "function" && typeof global.DataTransferItem === "function"
    ),
    dragDropDirectories: availability(
      typeof global.DataTransferItem?.prototype?.getAsFileSystemHandle === "function" ||
        typeof global.DataTransferItem?.prototype?.webkitGetAsEntry === "function"
    ),
    directFileWrite: availability(typeof global.showSaveFilePicker === "function"),
    directDirectoryWrite: availability(typeof global.showDirectoryPicker === "function"),
    opfs: availability(typeof navigator?.storage?.getDirectory === "function"),
    persistentStorage: storage.persistentStorage,
    persistentStorageState: storage.persistentStorageState,
    storageEstimate: storage.storageEstimate,
    webCryptoSha256: await sha256Availability(global),
    webWorkers: availability(typeof global.Worker === "function"),
    wakeLock: availability(typeof navigator?.wakeLock?.request === "function")
  });
}
