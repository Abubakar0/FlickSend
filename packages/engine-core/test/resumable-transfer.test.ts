import { describe, expect, it } from "vitest";
import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import type { RecoveryRecord, RecoveryStore } from "@flicksend/resume";
import { ResumableSingleFileTransfer } from "../src/resumable-transfer.js";
import type { TransferSnapshot, TransferTransport } from "../src/transfer.js";

const blockBytes = 8 * 1024 * 1024;
const totalBytes = 3 * blockBytes;

class MemoryDestination implements RandomAccessFileDestination {
  readonly bytes = new Uint8Array(totalBytes);
  async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.writeAt(0, chunk);
  }
  async writeAt(offset: number, chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    this.bytes.set(chunk, offset);
  }
  async close(): Promise<void> {}
  async abort(): Promise<void> {}
}

class LinkedTransport implements TransferTransport {
  peer?: ResumableSingleFileTransfer;
  enabled = true;
  bufferedAmount = 0;
  maximumDataMessageBytes = 256 * 1024;
  onControl?: (raw: string) => void;
  shouldDropControl?: (raw: string) => boolean;

  sendControl(raw: string): boolean {
    if (!this.enabled) return false;
    this.onControl?.(raw);
    if (this.shouldDropControl?.(raw)) return true;
    queueMicrotask(() => void this.peer?.handleControl(raw));
    return true;
  }
  sendData(frame: ArrayBuffer): boolean {
    if (!this.enabled) return false;
    queueMicrotask(() => void this.peer?.handleData(frame));
    return true;
  }
  async waitForBufferedAmountLow(): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return 0;
  }
}

function createStore(): RecoveryStore {
  const records = new Map<string, RecoveryRecord>();
  return {
    load: async (id) => records.get(id) ?? null,
    save: async (record) => void records.set(record.transferId, record),
    remove: async (id) => void records.delete(id)
  };
}

function source(bytes: Uint8Array, reads: number[], sourceIdentity = "fixture-v1"): FileSource {
  return {
    name: "fixture.bin",
    size: bytes.byteLength,
    type: "application/octet-stream",
    sourceIdentity,
    read: async (offset, length) => {
      reads.push(offset);
      return bytes.slice(offset, offset + length).buffer;
    }
  };
}

function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (condition()) return resolve();
      if (Date.now() >= deadline) return reject(new Error("Timed out waiting for M4B transfer."));
      setTimeout(check, 5);
    };
    check();
  });
}

function transferPair(): {
  sender: ResumableSingleFileTransfer;
  receiver: ResumableSingleFileTransfer;
  senderSnapshots: TransferSnapshot[];
  receiverSnapshots: TransferSnapshot[];
  senderTransport: LinkedTransport;
  receiverTransport: LinkedTransport;
} {
  const senderSnapshots: TransferSnapshot[] = [];
  const receiverSnapshots: TransferSnapshot[] = [];
  const senderTransport = new LinkedTransport();
  const receiverTransport = new LinkedTransport();
  const sender = new ResumableSingleFileTransfer(senderTransport, (value) =>
    senderSnapshots.push(value)
  );
  const receiver = new ResumableSingleFileTransfer(receiverTransport, (value) =>
    receiverSnapshots.push(value)
  );
  senderTransport.peer = receiver;
  receiverTransport.peer = sender;
  return {
    sender,
    receiver,
    senderSnapshots,
    receiverSnapshots,
    senderTransport,
    receiverTransport
  };
}

describe("M4B active resumable coordinator", () => {
  it("reattaches the same transfer to a replacement transport and omits persisted blocks", async () => {
    const bytes = new Uint8Array(totalBytes);
    bytes.forEach((_, index) => (bytes[index] = index % 251));
    const initialReads: number[] = [];
    const resumedReads: number[] = [];
    let resuming = false;
    const store = createStore();
    const destination = new MemoryDestination();
    const pair = transferPair();
    let interrupted = false;
    pair.receiverTransport.onControl = (raw) => {
      if (raw.includes("TRANSFER_BLOCK_COMMITTED") && !interrupted) {
        interrupted = true;
        pair.senderTransport.enabled = false;
      }
    };

    pair.sender.select({
      ...source(bytes, initialReads),
      read: async (offset, length) => {
        (resuming ? resumedReads : initialReads).push(offset);
        return bytes.slice(offset, offset + length).buffer;
      }
    });
    pair.sender.offer();
    await waitFor(() => pair.receiverSnapshots.at(-1)?.state === "READY");
    await pair.receiver.accept({
      destination,
      recoveryStore: store,
      destinationIdentity: "memory-destination-v1"
    });
    await waitFor(() => pair.senderSnapshots.at(-1)?.state === "RECONNECTING");

    const transferId = pair.senderSnapshots.at(-1)?.transferId;
    resuming = true;
    const senderTransport = new LinkedTransport();
    const receiverTransport = new LinkedTransport();
    senderTransport.peer = pair.receiver;
    receiverTransport.peer = pair.sender;
    pair.sender.replaceTransport(senderTransport);
    pair.receiver.replaceTransport(receiverTransport);
    pair.sender.offer();
    await waitFor(() => pair.senderSnapshots.at(-1)?.state === "TRANSFER_BYTES_COMPLETE");

    expect(pair.senderSnapshots.at(-1)?.transferId).toBe(transferId);
    expect(pair.senderSnapshots.at(-1)?.safeBytes).toBe(totalBytes);
    expect(pair.senderSnapshots.at(-1)?.blocksMissing).toBe(0);
    expect(pair.senderSnapshots.at(-1)?.retransmittedBytes).toBeGreaterThan(0);
    expect(pair.senderSnapshots.at(-1)?.continuity).toMatchObject({
      safeBytesBeforeDisconnect: blockBytes,
      remainingBytesAtResume: 2 * blockBytes,
      resumedPayloadBytes: 2 * blockBytes,
      duplicateRetransmittedBytes: 0,
      committedBlocksRetransmitted: 0,
      ambiguousInflightBytesRetransmitted: 0
    });
    expect(
      (pair.senderSnapshots.at(-1)?.continuity.safeBytesBeforeDisconnect ?? 0) +
        (pair.senderSnapshots.at(-1)?.continuity.remainingBytesAtResume ?? 0)
    ).toBe(totalBytes);
    expect(destination.bytes.every((value, index) => value === bytes[index])).toBe(true);
    expect(initialReads).toContain(0);
    expect(resumedReads.every((offset) => offset >= blockBytes)).toBe(true);
  });

  it("refuses a changed source identity for an existing receiver recovery record", async () => {
    const pair = transferPair();
    const recordId = "fs_tr_00000000-0000-4000-8000-000000000001";
    await pair.receiver.handleControl(
      JSON.stringify({
        type: "TRANSFER_RESUME_OFFER",
        protocolVersion: 3,
        transferId: recordId,
        transferReference: 1,
        name: "fixture.bin",
        manifestIdentity: "00000000-0000-4000-8000-000000000002",
        sourceIdentity: "source-v1",
        totalBytes: blockBytes,
        resumeBlockBytes: blockBytes,
        blockCount: 1
      })
    );
    await pair.receiver.handleControl(
      JSON.stringify({
        type: "TRANSFER_RESUME_OFFER",
        protocolVersion: 3,
        transferId: recordId,
        transferReference: 1,
        name: "fixture.bin",
        manifestIdentity: "00000000-0000-4000-8000-000000000002",
        sourceIdentity: "source-v2",
        totalBytes: blockBytes,
        resumeBlockBytes: blockBytes,
        blockCount: 1
      })
    );
    expect(pair.receiverSnapshots.at(-1)?.error).toBe("FS_SOURCE_CHANGED");
  });

  it("accepts receiver completion when the final block acknowledgement was lost in a reconnect", async () => {
    const bytes = new Uint8Array(totalBytes);
    const reads: number[] = [];
    const store = createStore();
    const destination = new MemoryDestination();
    const pair = transferPair();
    let finalAcknowledgementDropped = false;
    pair.receiverTransport.shouldDropControl = (raw) => {
      const message = JSON.parse(raw) as { type?: string; blockIndex?: number };
      if (message.type !== "TRANSFER_BLOCK_COMMITTED" || message.blockIndex !== 2) return false;
      finalAcknowledgementDropped = true;
      return true;
    };

    pair.sender.select(source(bytes, reads));
    pair.sender.offer();
    await waitFor(() => pair.receiverSnapshots.at(-1)?.state === "READY");
    await pair.receiver.accept({
      destination,
      recoveryStore: store,
      destinationIdentity: "memory-destination-v1"
    });
    await waitFor(() => pair.senderSnapshots.at(-1)?.state === "TRANSFER_BYTES_COMPLETE");

    expect(finalAcknowledgementDropped).toBe(true);
    expect(pair.senderSnapshots.at(-1)?.safeBytes).toBe(totalBytes);
    expect(pair.senderSnapshots.at(-1)?.blocksMissing).toBe(0);
    expect(pair.senderSnapshots.at(-1)?.error).toBeNull();
  });
});
