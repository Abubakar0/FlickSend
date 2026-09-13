import { describe, expect, it } from "vitest";
import type { FileDestination, FileSource } from "@flicksend/filesystem-browser";
import { decodeDataFrame } from "@flicksend/protocol";
import {
  SingleFileTransfer,
  type TransferSnapshot,
  type TransferTransport
} from "../src/transfer.js";
import { mergeTransferTuning } from "../src/tuning.js";

const transferId = "fs_tr_00000000-0000-4000-8000-000000000001";

class MemoryDestination implements FileDestination {
  readonly writes: Uint8Array<ArrayBuffer>[] = [];
  closed = false;
  aborted = false;

  constructor(private readonly delayMs = 0) {}

  async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.writes.push(chunk.slice());
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.writes.length = 0;
  }
}

class LinkedTransport implements TransferTransport {
  peer?: SingleFileTransfer;
  bufferedAmount = 0;
  maximumDataMessageBytes = 512 * 1024;
  sentFrames = 0;

  sendControl(raw: string): boolean {
    queueMicrotask(() => void this.peer?.handleControl(raw));
    return true;
  }

  sendData(frame: ArrayBuffer): boolean {
    this.sentFrames += 1;
    queueMicrotask(() => this.peer?.handleData(frame));
    return true;
  }

  async waitForBufferedAmountLow(): Promise<number> {
    return 0;
  }
}

function sourceFromBytes(bytes: Uint8Array): FileSource {
  return {
    name: "fixture.bin",
    size: bytes.byteLength,
    type: "application/octet-stream",
    read: async (offset, length) => bytes.slice(offset, offset + length).buffer
  };
}

function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (condition()) return resolve();
      if (Date.now() >= deadline) return reject(new Error("Timed out waiting for transfer."));
      setTimeout(check, 2);
    };
    check();
  });
}

function createPair(tuning = mergeTransferTuning({})): {
  sender: SingleFileTransfer;
  receiver: SingleFileTransfer;
  senderTransport: LinkedTransport;
  receiverTransport: LinkedTransport;
  senderSnapshots: TransferSnapshot[];
  receiverSnapshots: TransferSnapshot[];
} {
  const senderTransport = new LinkedTransport();
  const receiverTransport = new LinkedTransport();
  const senderSnapshots: TransferSnapshot[] = [];
  const receiverSnapshots: TransferSnapshot[] = [];
  const sender = new SingleFileTransfer(
    senderTransport,
    (snapshot) => senderSnapshots.push(snapshot),
    tuning
  );
  const receiver = new SingleFileTransfer(
    receiverTransport,
    (snapshot) => receiverSnapshots.push(snapshot),
    tuning
  );
  senderTransport.peer = receiver;
  receiverTransport.peer = sender;
  return {
    sender,
    receiver,
    senderTransport,
    receiverTransport,
    senderSnapshots,
    receiverSnapshots
  };
}

describe("M3 transfer scheduler", () => {
  it("rejects a sender watermark beyond the portable DataChannel queue ceiling", () => {
    expect(() => mergeTransferTuning({ sendHighWaterBytes: 32 * 1024 * 1024 })).toThrow(
      "DataChannel watermarks are invalid."
    );
  });

  it("streams a single file through a bounded receiver window and verifies it", async () => {
    const tuning = mergeTransferTuning({
      framePayloadBytes: 32 * 1024,
      readAheadBytes: 64 * 1024,
      receiveWindowBytes: 64 * 1024,
      writeBatchBytes: 32 * 1024,
      uiSnapshotIntervalMs: 50
    });
    const pair = createPair(tuning);
    const destination = new MemoryDestination(2);
    const data = new Uint8Array(256 * 1024);
    data.forEach((_, index) => (data[index] = index % 251));

    pair.sender.select(sourceFromBytes(data));
    pair.sender.offer();
    await waitFor(() => pair.receiverSnapshots.at(-1)?.state === "READY");
    await pair.receiver.accept(destination);

    await waitFor(() => pair.senderSnapshots.at(-1)?.state === "COMPLETED");
    expect(pair.receiverSnapshots.at(-1)?.state).toBe("COMPLETED");
    expect(destination.closed).toBe(true);
    expect(destination.writes.flatMap((chunk) => [...chunk])).toEqual([...data]);
    expect(
      Math.max(...pair.receiverSnapshots.map((snapshot) => snapshot.metrics.receiveQueueBytes))
    ).toBeLessThanOrEqual(tuning.receiveWindowBytes);
    expect(pair.senderSnapshots.at(-1)?.metrics.samples.length).toBeGreaterThan(0);
    expect(pair.senderTransport.sentFrames).toBe(8);
  });

  it("rejects a frame that exceeds the receiver-owned window", async () => {
    const tuning = mergeTransferTuning({
      framePayloadBytes: 32 * 1024,
      receiveWindowBytes: 32 * 1024,
      writeBatchBytes: 32 * 1024
    });
    const snapshots: TransferSnapshot[] = [];
    const receiver = new SingleFileTransfer(
      new LinkedTransport(),
      (snapshot) => snapshots.push(snapshot),
      tuning
    );
    await receiver.handleControl(
      JSON.stringify({
        type: "TRANSFER_OFFER",
        protocolVersion: 2,
        transferId,
        transferReference: 7,
        name: "fixture.bin",
        size: 64 * 1024
      })
    );
    await receiver.accept(new MemoryDestination(20));
    const oversized = new Uint8Array(64 * 1024);
    receiver.handleData(
      new Uint8Array(
        (() => {
          const frame = new ArrayBuffer(20 + oversized.byteLength);
          const view = new DataView(frame);
          view.setUint8(0, 2);
          view.setUint8(1, 1);
          view.setUint32(4, 7);
          view.setBigUint64(8, 0n);
          view.setUint32(16, oversized.byteLength);
          return frame;
        })()
      ).buffer
    );
    expect(snapshots.at(-1)?.error).toBe("RECEIVE_WINDOW_EXCEEDED");
  });

  it("stops bounded source production while paused and resumes the same transfer", async () => {
    const tuning = mergeTransferTuning({
      framePayloadBytes: 32 * 1024,
      readAheadBytes: 64 * 1024,
      receiveWindowBytes: 64 * 1024,
      writeBatchBytes: 32 * 1024,
      uiSnapshotIntervalMs: 50
    });
    const pair = createPair(tuning);
    const releases: Array<() => void> = [];
    let activeReads = 0;
    let peakActiveReads = 0;
    let blockReads = true;
    const source: FileSource = {
      name: "paused.bin",
      size: 128 * 1024,
      type: "application/octet-stream",
      read: async (_offset, length) => {
        if (!blockReads) return new Uint8Array(length).buffer;
        return new Promise<ArrayBuffer>((resolve) => {
          activeReads += 1;
          peakActiveReads = Math.max(peakActiveReads, activeReads);
          releases.push(() => {
            activeReads -= 1;
            resolve(new Uint8Array(length).buffer);
          });
        });
      }
    };

    pair.sender.select(source);
    pair.sender.offer();
    await waitFor(() => pair.receiverSnapshots.at(-1)?.state === "READY");
    await pair.receiver.accept(new MemoryDestination());
    await waitFor(() => releases.length === 2);
    pair.sender.pause();
    blockReads = false;
    for (const release of releases) release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pair.senderSnapshots.at(-1)?.state).toBe("PAUSED");
    expect(pair.senderTransport.sentFrames).toBe(0);
    expect(peakActiveReads).toBeLessThanOrEqual(2);

    pair.sender.resume();
    await waitFor(() => pair.senderSnapshots.at(-1)?.state === "COMPLETED");
    expect(pair.receiverSnapshots.at(-1)?.state).toBe("COMPLETED");
  });

  it("cancels both peers without retaining the receiver queue", async () => {
    const tuning = mergeTransferTuning({
      framePayloadBytes: 32 * 1024,
      readAheadBytes: 64 * 1024,
      receiveWindowBytes: 64 * 1024,
      writeBatchBytes: 32 * 1024
    });
    const pair = createPair(tuning);
    const destination = new MemoryDestination(30);

    pair.sender.select(sourceFromBytes(new Uint8Array(256 * 1024)));
    pair.sender.offer();
    await waitFor(() => pair.receiverSnapshots.at(-1)?.state === "READY");
    await pair.receiver.accept(destination);
    await waitFor(() => pair.senderTransport.sentFrames > 0);
    pair.sender.cancel();
    await waitFor(() => pair.receiverSnapshots.at(-1)?.state === "CANCELLED");

    expect(pair.senderSnapshots.at(-1)?.state).toBe("CANCELLED");
    expect(destination.aborted).toBe(true);
    expect(pair.receiverSnapshots.at(-1)?.metrics.receiveQueueBytes).toBe(0);
  });

  it("keeps payload decoding as a view over the received frame", () => {
    const frame = new Uint8Array(24).buffer;
    const view = new DataView(frame);
    view.setUint8(0, 2);
    view.setUint8(1, 1);
    view.setUint32(4, 1);
    view.setUint32(16, 4);
    const decoded = decodeDataFrame(frame);
    expect(decoded?.payload.buffer).toBe(frame);
  });

  it("reserves data-frame header space within the negotiated message ceiling", async () => {
    const tuning = mergeTransferTuning({
      framePayloadBytes: 256 * 1024,
      readAheadBytes: 256 * 1024,
      receiveWindowBytes: 256 * 1024,
      writeBatchBytes: 256 * 1024
    });
    const pair = createPair(tuning);
    pair.senderTransport.maximumDataMessageBytes = 256 * 1024;
    const data = new Uint8Array(256 * 1024);

    pair.sender.select(sourceFromBytes(data));
    pair.sender.offer();
    await waitFor(() => pair.receiverSnapshots.at(-1)?.state === "READY");
    await pair.receiver.accept(new MemoryDestination());
    await waitFor(() => pair.senderSnapshots.at(-1)?.state === "COMPLETED");

    expect(pair.senderSnapshots.at(-1)?.metrics.effectiveFramePayloadBytes).toBe(256 * 1024 - 20);
    expect(pair.receiverSnapshots.at(-1)?.metrics.effectiveFramePayloadBytes).toBe(256 * 1024 - 20);
  });
});
