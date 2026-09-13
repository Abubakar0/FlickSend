import {
  createStreamPackManifest,
  StreamPackLayout,
  type StreamPackSource
} from "@flicksend/stream-pack";
import type { StreamPackDestination } from "@flicksend/filesystem-browser";
import type { RecoveryRecord, RecoveryStore } from "@flicksend/resume";
import { describe, expect, it } from "vitest";
import { M6StreamPackTransfer } from "../src/m6-stream-pack-transfer.js";
import type { TransferSnapshot, TransferTransport } from "../src/transfer.js";

const manifest = createStreamPackManifest({
  blockBytes: 8 * 1024 * 1024,
  entries: [
    { type: "DIRECTORY", relativePath: "Root" },
    { type: "DIRECTORY", relativePath: "Root/Empty" },
    { type: "FILE", relativePath: "Root/a.txt", sizeBytes: 3 },
    { type: "FILE", relativePath: "Root/b.bin", sizeBytes: 5 },
    { type: "FILE", relativePath: "Root/zero.txt", sizeBytes: 0 }
  ]
});

function source(): StreamPackSource {
  const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  return {
    manifest,
    layout: new StreamPackLayout(manifest),
    assertUnchanged: async () => undefined,
    read: async (offset, length) => bytes.slice(offset, offset + length)
  };
}
class Destination implements StreamPackDestination {
  readonly ranges = new Map<number, Uint8Array>();
  openDestinationHandles = 0;
  peakOpenDestinationHandles = 0;
  prepared = false;
  closed = false;
  rejectRecovery = false;
  async prepare(): Promise<void> {
    this.prepared = true;
  }
  async writeRange(fileId: number, offset: number, bytes: Uint8Array): Promise<void> {
    const current = this.ranges.get(fileId) ?? new Uint8Array(offset + bytes.length);
    const next =
      current.length >= offset + bytes.length ? current : new Uint8Array(offset + bytes.length);
    next.set(current);
    next.set(bytes, offset);
    this.ranges.set(fileId, next);
  }
  async close(): Promise<void> {
    this.closed = true;
  }
  async abort(): Promise<void> {}
  async validateVerifiedRecovery(): Promise<void> {
    if (this.rejectRecovery) throw new Error("FS_STREAMPACK_DESTINATION_CHANGED");
  }
}
function store(): RecoveryStore {
  const records = new Map<string, RecoveryRecord>();
  return {
    load: async (id) => records.get(id) ?? null,
    save: async (record) => {
      records.set(record.transferId, record);
    },
    remove: async (id) => {
      records.delete(id);
    }
  };
}
function pair(): [
  TransferTransport,
  TransferTransport,
  (
    left: (raw: string) => Promise<void>,
    right: (raw: string) => Promise<void>,
    leftData: (raw: ArrayBuffer) => Promise<void>,
    rightData: (raw: ArrayBuffer) => Promise<void>
  ) => void
] {
  let leftControl: (raw: string) => Promise<void>;
  let rightControl: (raw: string) => Promise<void>;
  let leftData: (raw: ArrayBuffer) => Promise<void>;
  let rightData: (raw: ArrayBuffer) => Promise<void>;
  const endpoint = (
    target: () => (raw: string) => Promise<void>,
    data: () => (raw: ArrayBuffer) => Promise<void>
  ): TransferTransport => ({
    sendControl: (raw) => {
      queueMicrotask(() => void target()(raw));
      return true;
    },
    sendData: (raw) => {
      queueMicrotask(() => void data()(raw));
      return true;
    },
    waitForBufferedAmountLow: async () => 0,
    bufferedAmount: 0,
    maximumDataMessageBytes: 64 * 1024 + 20
  });
  return [
    endpoint(
      () => rightControl,
      () => rightData
    ),
    endpoint(
      () => leftControl,
      () => leftData
    ),
    (left, right, leftFrames, rightFrames) => {
      leftControl = left;
      rightControl = right;
      leftData = leftFrames;
      rightData = rightFrames;
    }
  ];
}
async function eventually(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for v5 transfer.");
}

describe("M6 StreamPack v5", () => {
  it("preserves StreamPack recovery state when the bounded route policy is exhausted", () => {
    const [senderTransport] = pair();
    let snapshot: TransferSnapshot | undefined;
    const sender = new M6StreamPackTransfer(senderTransport, (value) => {
      snapshot = value;
    });
    sender.select(source());
    sender.transportInterrupted();
    sender.routeRecoveryFailed("FS_ROUTE_EXHAUSTED");
    expect(snapshot).toMatchObject({ state: "RECONNECTING", error: "FS_ROUTE_EXHAUSTED" });
  });

  it("reconstructs an aggregated multi-file block and reaches DELIVERED only after root verification", async () => {
    const [senderTransport, receiverTransport, connect] = pair();
    let senderSnapshot: TransferSnapshot | undefined;
    let receiverSnapshot: TransferSnapshot | undefined;
    const sender = new M6StreamPackTransfer(senderTransport, (value) => {
      senderSnapshot = value;
    });
    const receiver = new M6StreamPackTransfer(receiverTransport, (value) => {
      receiverSnapshot = value;
    });
    connect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    const destination = new Destination();
    await receiver.accept({
      destination,
      recoveryStore: store(),
      destinationIdentity: "test-destination"
    });
    sender.select(source());
    sender.offer();
    await eventually(
      () => senderSnapshot?.state === "DELIVERED" && receiverSnapshot?.state === "DELIVERED"
    );
    expect(destination.prepared).toBe(true);
    expect(destination.closed).toBe(true);
    expect([...destination.ranges.get(0)!]).toEqual([1, 2, 3]);
    expect([...destination.ranges.get(1)!]).toEqual([4, 5, 6, 7, 8]);
    expect(receiverSnapshot?.integrity.manifestRootMatch).toBe(true);
  });

  it("serializes asynchronous destination writes for consecutive ordered frames", async () => {
    const value = createStreamPackManifest({
      blockBytes: 8 * 1024 * 1024,
      entries: [
        { type: "DIRECTORY", relativePath: "Root" },
        { type: "FILE", relativePath: "Root/payload.bin", sizeBytes: 130_000 }
      ]
    });
    const bytes = Uint8Array.from({ length: 130_000 }, (_, index) => index % 251);
    const largeSource: StreamPackSource = {
      manifest: value,
      layout: new StreamPackLayout(value),
      assertUnchanged: async () => undefined,
      read: async (offset, length) => bytes.slice(offset, offset + length)
    };
    class DelayedDestination extends Destination {
      override async writeRange(fileId: number, offset: number, chunk: Uint8Array): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 1));
        await super.writeRange(fileId, offset, chunk);
      }
    }
    const [senderTransport, receiverTransport, connect] = pair();
    let senderSnapshot: TransferSnapshot | undefined;
    let receiverSnapshot: TransferSnapshot | undefined;
    const sender = new M6StreamPackTransfer(senderTransport, (value) => {
      senderSnapshot = value;
    });
    const receiver = new M6StreamPackTransfer(receiverTransport, (value) => {
      receiverSnapshot = value;
    });
    connect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    await receiver.accept({
      destination: new DelayedDestination(),
      recoveryStore: store(),
      destinationIdentity: "delayed-destination"
    });
    sender.select(largeSource);
    sender.offer();
    await eventually(
      () => senderSnapshot?.state === "DELIVERED" && receiverSnapshot?.state === "DELIVERED"
    );
    expect(receiverSnapshot?.frameCount).toBeGreaterThan(1);
  });

  it("retries one corrupted block and never commits its failed attempt", async () => {
    const [senderTransport, receiverTransport, connect] = pair();
    let senderSnapshot: TransferSnapshot | undefined;
    let receiverSnapshot: TransferSnapshot | undefined;
    const sender = new M6StreamPackTransfer(senderTransport, (value) => {
      senderSnapshot = value;
    });
    const receiver = new M6StreamPackTransfer(receiverTransport, (value) => {
      receiverSnapshot = value;
    });
    connect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    let corrupt = true;
    const sendData = senderTransport.sendData.bind(senderTransport);
    senderTransport.sendData = (frame) => {
      if (!corrupt) return sendData(frame);
      corrupt = false;
      const damaged = frame.slice(0);
      const bytes = new Uint8Array(damaged);
      bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
      return sendData(damaged);
    };
    await receiver.accept({
      destination: new Destination(),
      recoveryStore: store(),
      destinationIdentity: "corruption-destination"
    });
    sender.select(source());
    sender.offer();
    await eventually(
      () => senderSnapshot?.state === "DELIVERED" && receiverSnapshot?.state === "DELIVERED"
    );
    expect(senderSnapshot?.integrity.integrityRetryCount).toBe(1);
    expect(receiverSnapshot?.integrity.integrityMismatchCount).toBe(1);
  });

  it("resumes the same transfer after a committed block without resending it", async () => {
    const blockBytes = 8 * 1024 * 1024;
    const value = createStreamPackManifest({
      blockBytes,
      entries: [
        { type: "DIRECTORY", relativePath: "Root" },
        { type: "FILE", relativePath: "Root/first.bin", sizeBytes: blockBytes },
        { type: "FILE", relativePath: "Root/second.bin", sizeBytes: 1024 }
      ]
    });
    const bytes = new Uint8Array(blockBytes + 1024);
    bytes.forEach((_, index) => (bytes[index] = index % 251));
    const reads: number[] = [];
    const resumableSource: StreamPackSource = {
      manifest: value,
      layout: new StreamPackLayout(value),
      assertUnchanged: async () => undefined,
      read: async (offset, length) => {
        reads.push(offset);
        if (offset === blockBytes) await new Promise((resolve) => setTimeout(resolve, 20));
        return bytes.slice(offset, offset + length);
      }
    };
    const [senderTransport, receiverTransport, connect] = pair();
    let senderSnapshot: TransferSnapshot | undefined;
    let receiverSnapshot: TransferSnapshot | undefined;
    const sender = new M6StreamPackTransfer(senderTransport, (value) => {
      senderSnapshot = value;
    });
    const receiver = new M6StreamPackTransfer(receiverTransport, (value) => {
      receiverSnapshot = value;
    });
    connect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    let staleBlockDigestCount = 0;
    let interrupted = false;
    const sendSenderControl = senderTransport.sendControl.bind(senderTransport);
    senderTransport.sendControl = (raw) => {
      if (interrupted && JSON.parse(raw).type === "STREAMPACK_BLOCK_DIGEST")
        staleBlockDigestCount += 1;
      return sendSenderControl(raw);
    };
    const sendReceiverControl = receiverTransport.sendControl.bind(receiverTransport);
    receiverTransport.sendControl = (raw) => {
      const sent = sendReceiverControl(raw);
      if (JSON.parse(raw).type === "STREAMPACK_BLOCK_COMMITTED" && JSON.parse(raw).blockIndex === 0)
        setTimeout(() => {
          interrupted = true;
          sender.transportInterrupted();
        }, 0);
      return sent;
    };
    const recoveryStore = store();
    await receiver.accept({
      destination: new Destination(),
      recoveryStore,
      destinationIdentity: "resume-destination"
    });
    sender.select(resumableSource);
    sender.offer();
    await eventually(() => senderSnapshot?.state === "RECONNECTING");
    const transferId = senderSnapshot?.transferId;
    const [replacementSender, replacementReceiver, reconnect] = pair();
    reconnect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    sender.replaceTransport(replacementSender);
    receiver.replaceTransport(replacementReceiver);
    sender.offer();
    await eventually(
      () => senderSnapshot?.state === "DELIVERED" && receiverSnapshot?.state === "DELIVERED",
      10_000
    );
    expect(senderSnapshot?.transferId).toBe(transferId);
    expect(reads.filter((offset) => offset === 0)).toHaveLength(1);
    expect(reads.filter((offset) => offset === blockBytes)).toHaveLength(2);
    expect(staleBlockDigestCount).toBe(0);
    expect(senderSnapshot?.continuity.safeBytesBeforeDisconnect).toBe(blockBytes);
    expect(senderSnapshot?.continuity.remainingBytesAtResume).toBe(1024);
    expect(senderSnapshot?.continuity.resumedPayloadBytes).toBe(1024);
    expect(senderSnapshot?.continuity.duplicateRetransmittedBytes).toBe(0);
    expect(senderSnapshot?.continuity.committedBlocksRetransmitted).toBe(0);
    expect(senderSnapshot?.continuity.safeBytesBeforeDisconnect).toBe(
      value.totalBytes - senderSnapshot!.continuity.remainingBytesAtResume
    );
  });

  it("counts an uncommitted partial block as ambiguity rather than duplicate retransmission", async () => {
    const blockBytes = 8 * 1024 * 1024;
    const trailingBytes = 128 * 1024;
    const value = createStreamPackManifest({
      blockBytes,
      entries: [
        { type: "DIRECTORY", relativePath: "Root" },
        { type: "FILE", relativePath: "Root/payload.bin", sizeBytes: blockBytes + trailingBytes }
      ]
    });
    const bytes = new Uint8Array(value.totalBytes);
    const [senderTransport, receiverTransport, connect] = pair();
    let senderSnapshot: TransferSnapshot | undefined;
    let receiverSnapshot: TransferSnapshot | undefined;
    const sender = new M6StreamPackTransfer(senderTransport, (snapshot) => {
      senderSnapshot = snapshot;
    });
    const receiver = new M6StreamPackTransfer(receiverTransport, (snapshot) => {
      receiverSnapshot = snapshot;
    });
    connect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    let connected = true;
    let dataFrames = 0;
    const sendData = senderTransport.sendData.bind(senderTransport);
    senderTransport.sendData = (frame) => {
      if (!connected) return false;
      dataFrames += 1;
      const sent = sendData(frame);
      // The first frame of block 1 was accepted by the old transport but its block
      // was never committed, so recovery must safely resend it without calling it a duplicate.
      if (dataFrames === 129) connected = false;
      return sent;
    };
    await receiver.accept({
      destination: new Destination(),
      recoveryStore: store(),
      destinationIdentity: "partial-inflight"
    });
    const fixture: StreamPackSource = {
      manifest: value,
      layout: new StreamPackLayout(value),
      assertUnchanged: async () => undefined,
      read: async (offset, length) => bytes.slice(offset, offset + length)
    };
    sender.select(fixture);
    sender.offer();
    await eventually(() => senderSnapshot?.state === "RECONNECTING");
    const [replacementSender, replacementReceiver, reconnect] = pair();
    reconnect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    sender.replaceTransport(replacementSender);
    receiver.replaceTransport(replacementReceiver);
    sender.offer();
    await eventually(
      () => senderSnapshot?.state === "DELIVERED" && receiverSnapshot?.state === "DELIVERED"
    );
    expect(senderSnapshot?.continuity.safeBytesBeforeDisconnect).toBe(blockBytes);
    expect(senderSnapshot?.continuity.remainingBytesAtResume).toBe(trailingBytes);
    expect(senderSnapshot?.continuity.resumedPayloadBytes).toBe(trailingBytes);
    expect(senderSnapshot?.continuity.ambiguousInflightBytesRetransmitted).toBe(64 * 1024);
    expect(senderSnapshot?.continuity.duplicateRetransmittedBytes).toBe(0);
    expect(senderSnapshot?.continuity.committedBlocksRetransmitted).toBe(0);
    expect(senderSnapshot?.continuity.safeBytesBeforeDisconnect).toBe(
      value.totalBytes - senderSnapshot!.continuity.remainingBytesAtResume
    );
  });

  it("fails explicitly when the source changes before a later logical block", async () => {
    const blockBytes = 8 * 1024 * 1024;
    const value = createStreamPackManifest({
      blockBytes,
      entries: [
        { type: "DIRECTORY", relativePath: "Root" },
        { type: "FILE", relativePath: "Root/payload.bin", sizeBytes: blockBytes + 1 }
      ]
    });
    const bytes = new Uint8Array(blockBytes + 1);
    let assertions = 0;
    const changedSource: StreamPackSource = {
      manifest: value,
      layout: new StreamPackLayout(value),
      assertUnchanged: async () => {
        assertions += 1;
        if (assertions >= 3) throw new Error("FS_STREAMPACK_SOURCE_CHANGED");
      },
      read: async (offset, length) => bytes.slice(offset, offset + length)
    };
    const [senderTransport, receiverTransport, connect] = pair();
    let senderSnapshot: TransferSnapshot | undefined;
    const sender = new M6StreamPackTransfer(senderTransport, (value) => {
      senderSnapshot = value;
    });
    const receiver = new M6StreamPackTransfer(receiverTransport, () => undefined);
    connect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    await receiver.accept({
      destination: new Destination(),
      recoveryStore: store(),
      destinationIdentity: "source-mutation"
    });
    sender.select(changedSource);
    sender.offer();
    await eventually(() => senderSnapshot?.state === "FAILED", 10_000);
    expect(senderSnapshot?.error).toBe("FS_STREAMPACK_SOURCE_CHANGED");
  });

  it("rejects mutated destination recovery state instead of trusting the checkpoint", async () => {
    const blockBytes = 8 * 1024 * 1024;
    const value = createStreamPackManifest({
      blockBytes,
      entries: [
        { type: "DIRECTORY", relativePath: "Root" },
        { type: "FILE", relativePath: "Root/payload.bin", sizeBytes: blockBytes + 1 }
      ]
    });
    const bytes = new Uint8Array(blockBytes + 1);
    const fixture: StreamPackSource = {
      manifest: value,
      layout: new StreamPackLayout(value),
      assertUnchanged: async () => undefined,
      read: async (offset, length) => bytes.slice(offset, offset + length)
    };
    const [senderTransport, receiverTransport, connect] = pair();
    let senderSnapshot: TransferSnapshot | undefined;
    let receiverSnapshot: TransferSnapshot | undefined;
    const sender = new M6StreamPackTransfer(senderTransport, (value) => {
      senderSnapshot = value;
    });
    const receiver = new M6StreamPackTransfer(receiverTransport, (value) => {
      receiverSnapshot = value;
    });
    connect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    let connected = true;
    const sendData = senderTransport.sendData.bind(senderTransport);
    senderTransport.sendData = (frame) => connected && sendData(frame);
    const receiverControl = receiverTransport.sendControl.bind(receiverTransport);
    receiverTransport.sendControl = (raw) => {
      const sent = receiverControl(raw);
      if (JSON.parse(raw).type === "STREAMPACK_BLOCK_COMMITTED") connected = false;
      return sent;
    };
    const destination = new Destination();
    await receiver.accept({
      destination,
      recoveryStore: store(),
      destinationIdentity: "destination-mutation"
    });
    sender.select(fixture);
    sender.offer();
    await eventually(() => senderSnapshot?.state === "RECONNECTING");
    destination.rejectRecovery = true;
    const [replacementSender, replacementReceiver, reconnect] = pair();
    reconnect(
      (raw) => sender.handleControl(raw),
      (raw) => receiver.handleControl(raw),
      (raw) => sender.handleData(raw),
      (raw) => receiver.handleData(raw)
    );
    sender.replaceTransport(replacementSender);
    receiver.replaceTransport(replacementReceiver);
    sender.offer();
    await eventually(() => receiverSnapshot?.state === "FAILED", 10_000);
    expect(receiverSnapshot?.error).toBe("FS_STREAMPACK_DESTINATION_CHANGED");
    expect(receiverSnapshot?.state).not.toBe("DELIVERED");
  });
});
