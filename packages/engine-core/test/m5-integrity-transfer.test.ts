import { describe, expect, it } from "vitest";
import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import type { RecoveryRecord, RecoveryStore } from "@flicksend/resume";
import {
  M5IntegritySingleFileTransfer,
  type IntegrityFault
} from "../src/m5-integrity-transfer.js";
import type { TransferSnapshot, TransferTransport } from "../src/transfer.js";

const blockBytes = 8 * 1024 * 1024;
const totalBytes = blockBytes * 3 + 123;

class MemoryDestination implements RandomAccessFileDestination {
  readonly bytes = new Uint8Array(totalBytes);
  closed = false;
  constructor(private readonly failClose = false) {}
  async write(): Promise<void> {}
  async writeAt(offset: number, chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    this.bytes.set(chunk, offset);
  }
  async close(): Promise<void> {
    if (this.failClose) throw new Error("close failed");
    this.closed = true;
  }
  async abort(): Promise<void> {}
}

class LinkedTransport implements TransferTransport {
  peer?: M5IntegritySingleFileTransfer;
  bufferedAmount = 0;
  maximumDataMessageBytes = 256 * 1024;
  enabled = true;
  dropControl?: (raw: string) => boolean;
  dropData?: () => boolean;
  sendControl(raw: string): boolean {
    if (!this.enabled) return false;
    if (this.dropControl?.(raw)) return true;
    queueMicrotask(() => void this.peer?.handleControl(raw));
    return true;
  }
  sendData(frame: ArrayBuffer): boolean {
    if (!this.enabled) return false;
    if (this.dropData?.()) return true;
    queueMicrotask(() => void this.peer?.handleData(frame));
    return true;
  }
  async waitForBufferedAmountLow(): Promise<number> {
    return 0;
  }
}

function store(): RecoveryStore {
  const records = new Map<string, RecoveryRecord>();
  return {
    load: async (id) => records.get(id) ?? null,
    save: async (record) => void records.set(record.transferId, record),
    remove: async (id) => void records.delete(id)
  };
}

function source(bytes: Uint8Array): FileSource {
  return {
    name: "integrity.bin",
    size: bytes.byteLength,
    type: "application/octet-stream",
    sourceIdentity: "integrity-fixture-v1",
    read: async (offset, length) => bytes.slice(offset, offset + length).buffer
  };
}

function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (condition()) return resolve();
      if (Date.now() > deadline) return reject(new Error("Timed out waiting for M5 transfer."));
      setTimeout(check, 5);
    };
    check();
  });
}

function pair(): {
  sender: M5IntegritySingleFileTransfer;
  receiver: M5IntegritySingleFileTransfer;
  senderSnapshots: TransferSnapshot[];
  receiverSnapshots: TransferSnapshot[];
  senderTransport: LinkedTransport;
} {
  const senderSnapshots: TransferSnapshot[] = [];
  const receiverSnapshots: TransferSnapshot[] = [];
  const senderTransport = new LinkedTransport();
  const receiverTransport = new LinkedTransport();
  const sender = new M5IntegritySingleFileTransfer(
    senderTransport,
    (snapshot) => senderSnapshots.push(snapshot),
    {
      framePayloadBytes: 64 * 1024,
      sendHighWaterBytes: 1024 * 1024,
      sendLowWaterBytes: 0,
      readAheadBytes: 64 * 1024,
      writeBatchBytes: 64 * 1024,
      receiveWindowBytes: 1024 * 1024,
      channelCount: 1,
      workerMode: "main-thread",
      uiSnapshotIntervalMs: 50
    }
  );
  const receiver = new M5IntegritySingleFileTransfer(receiverTransport, (snapshot) =>
    receiverSnapshots.push(snapshot)
  );
  senderTransport.peer = receiver;
  receiverTransport.peer = sender;
  return { sender, receiver, senderSnapshots, receiverSnapshots, senderTransport };
}

async function start(
  transferPair: ReturnType<typeof pair>,
  destination = new MemoryDestination(),
  senderFault?: IntegrityFault,
  receiverFault?: IntegrityFault
): Promise<MemoryDestination> {
  const bytes = new Uint8Array(totalBytes);
  bytes.forEach((_, index) => (bytes[index] = index % 251));
  if (senderFault) transferPair.sender.configureFault(senderFault);
  if (receiverFault) transferPair.receiver.configureFault(receiverFault);
  transferPair.sender.select(source(bytes));
  transferPair.sender.offer();
  await waitFor(() => transferPair.receiverSnapshots.at(-1)?.state === "READY");
  await transferPair.receiver.accept({
    destination,
    recoveryStore: store(),
    destinationIdentity: "memory-v1"
  });
  return destination;
}

describe("M5 FSTP v4 verified delivery", () => {
  it("preserves verified recovery state on route exhaustion without reviving a cancelled transfer", () => {
    const transferPair = pair();
    transferPair.sender.select(source(new Uint8Array(totalBytes)));
    transferPair.sender.transportInterrupted();
    transferPair.sender.routeRecoveryFailed("FS_ROUTE_EXHAUSTED");
    expect(transferPair.senderSnapshots.at(-1)).toMatchObject({
      state: "RECONNECTING",
      error: "FS_ROUTE_EXHAUSTED"
    });

    transferPair.sender.cancel();
    const replacement = new LinkedTransport();
    transferPair.sender.replaceTransport(replacement);
    expect(transferPair.senderSnapshots.at(-1)).toMatchObject({ state: "CANCELLED" });
  });

  it("delivers only after every block and the canonical root verify", async () => {
    const transferPair = pair();
    const destination = await start(transferPair);
    await waitFor(() => transferPair.senderSnapshots.at(-1)?.state === "DELIVERED");
    expect(destination.closed).toBe(true);
    expect(transferPair.receiverSnapshots.at(-1)?.integrity.blocksVerifiedReceiver).toBe(4);
    expect(transferPair.receiverSnapshots.at(-1)?.integrity.manifestRootMatch).toBe(true);
    expect(transferPair.senderSnapshots.at(-1)?.state).toBe("DELIVERED");
  });

  it("retries a corrupted payload without committing its first attempt", async () => {
    const transferPair = pair();
    await start(transferPair, new MemoryDestination(), {
      kind: "payload",
      blockIndex: 1,
      mode: "once"
    });
    await waitFor(() => transferPair.senderSnapshots.at(-1)?.state === "DELIVERED");
    const snapshots = transferPair.receiverSnapshots.filter(
      (snapshot) => snapshot.blocksCommitted === 1
    );
    expect(snapshots.some((snapshot) => snapshot.safeBytes === blockBytes)).toBe(true);
    expect(transferPair.senderSnapshots.at(-1)?.integrity.integrityMismatchCount).toBe(1);
    expect(transferPair.senderSnapshots.at(-1)?.integrity.integrityRetryCount).toBe(1);
  });

  it("fails explicitly after the bounded permanent-corruption retry budget", async () => {
    const transferPair = pair();
    await start(transferPair, new MemoryDestination(), {
      kind: "payload",
      blockIndex: 0,
      mode: "always"
    });
    await waitFor(() => transferPair.senderSnapshots.at(-1)?.state === "INTEGRITY_FAILED");
    expect(transferPair.senderSnapshots.at(-1)?.error).toBe("FS_BLOCK_INTEGRITY_FAILED");
    expect(transferPair.senderSnapshots.at(-1)?.state).not.toBe("DELIVERED");
  });

  it("rejects a root mismatch even when every block passed independently", async () => {
    const transferPair = pair();
    await start(transferPair, new MemoryDestination(), { kind: "manifestRoot", mode: "once" });
    await waitFor(() => transferPair.receiverSnapshots.at(-1)?.state === "INTEGRITY_FAILED");
    expect(transferPair.receiverSnapshots.at(-1)?.integrity.blocksVerifiedReceiver).toBe(4);
    expect(transferPair.receiverSnapshots.at(-1)?.error).toBe("FS_MANIFEST_INTEGRITY_FAILED");
  });

  it("does not deliver when destination finalization fails", async () => {
    const transferPair = pair();
    await start(transferPair, new MemoryDestination(true));
    await waitFor(() => transferPair.receiverSnapshots.at(-1)?.state === "FAILED");
    expect(transferPair.receiverSnapshots.at(-1)?.error).toBe("DESTINATION_FINALIZATION_FAILED");
  });

  it("never delivers while a logical block is missing or unverified", async () => {
    const transferPair = pair();
    transferPair.senderTransport.dropData = () => true;
    await start(transferPair);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(transferPair.senderSnapshots.some((snapshot) => snapshot.state === "DELIVERED")).toBe(
      false
    );
    expect(transferPair.receiverSnapshots.some((snapshot) => snapshot.state === "DELIVERED")).toBe(
      false
    );
  });

  it("never delivers when the required manifest root is absent", async () => {
    const transferPair = pair();
    transferPair.senderTransport.dropControl = (raw) => raw.includes("TRANSFER_MANIFEST_ROOT");
    await start(transferPair);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(transferPair.senderSnapshots.some((snapshot) => snapshot.state === "DELIVERED")).toBe(
      false
    );
    expect(transferPair.receiverSnapshots.some((snapshot) => snapshot.state === "DELIVERED")).toBe(
      false
    );
  });

  it("rejects a legacy M4 checkpoint instead of treating it as verified", async () => {
    const transferPair = pair();
    const legacyStore: RecoveryStore = {
      load: async () => ({ schemaVersion: 2 }) as unknown as RecoveryRecord,
      save: async () => undefined,
      remove: async () => undefined
    };
    const bytes = new Uint8Array(totalBytes);
    transferPair.sender.select(source(bytes));
    transferPair.sender.offer();
    await waitFor(() => transferPair.receiverSnapshots.at(-1)?.state === "READY");
    await transferPair.receiver.accept({
      destination: new MemoryDestination(),
      recoveryStore: legacyStore,
      destinationIdentity: "legacy-target"
    });
    await waitFor(() => transferPair.receiverSnapshots.at(-1)?.state === "FAILED");
    expect(transferPair.receiverSnapshots.at(-1)?.error).toBe("Unsupported recovery schema.");
  });
});
