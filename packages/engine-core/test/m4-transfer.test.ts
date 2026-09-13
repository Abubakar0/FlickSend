import { describe, expect, it } from "vitest";
import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import { createRecoveryRecord, type RecoveryRecord, type RecoveryStore } from "@flicksend/resume";
import { M4ResumableReceiver, M4ResumableSender } from "../src/m4-transfer.js";

const transferId = "fs_tr_00000000-0000-4000-8000-000000000001";
const blockBytes = 1024 * 1024;
const totalBytes = 10 * blockBytes;
const transferReference = 7;

class MemoryDestination implements RandomAccessFileDestination {
  readonly bytes = new Uint8Array(totalBytes);
  async write(): Promise<void> {}
  async writeAt(offset: number, chunk: Uint8Array<ArrayBuffer>): Promise<void> {
    this.bytes.set(chunk, offset);
  }
  async close(): Promise<void> {}
  async abort(): Promise<void> {}
}

function createStore(): RecoveryStore {
  const records = new Map<string, RecoveryRecord>();
  return {
    load: async (id) => records.get(id) ?? null,
    save: async (record) => void records.set(record.transferId, record),
    remove: async (id) => void records.delete(id)
  };
}

function source(bytes: Uint8Array, reads: number[]): FileSource {
  return {
    name: "fixture.bin",
    size: bytes.byteLength,
    type: "application/octet-stream",
    read: async (offset, length) => {
      reads.push(offset);
      return bytes.slice(offset, offset + length).buffer;
    }
  };
}

describe("M4 FSTP v3 resumable pipeline", () => {
  it.each([1, 5, 9])(
    "resumes after a %i0%% interruption without sending committed blocks",
    async (committedCount) => {
      const bytes = new Uint8Array(totalBytes);
      bytes.forEach((_, index) => (bytes[index] = index % 251));
      const record = createRecoveryRecord({
        transferId,
        protocolVersion: 3,
        totalBytes,
        blockBytes,
        updatedAtMs: 1
      });
      const store = createStore();
      const destination = new MemoryDestination();
      const initialReads: number[] = [];
      let acknowledgements = 0;
      const initialReceiver = await M4ResumableReceiver.open({
        destination,
        recoveryStore: store,
        recoveryRecord: record,
        transferReference,
        onBlockCommitted: () => {
          acknowledgements += 1;
          if (acknowledgements === committedCount) throw new Error("SIMULATED_INTERRUPTION");
        }
      });
      const initialSender = new M4ResumableSender(
        source(bytes, initialReads),
        record,
        transferReference
      );

      await expect(
        initialSender.sendMissingBlocks(initialReceiver.haveBlocksPages(), (frame) =>
          initialReceiver.receive(frame)
        )
      ).rejects.toThrow("SIMULATED_INTERRUPTION");

      const resumedReads: number[] = [];
      const resumedReceiver = await M4ResumableReceiver.open({
        destination,
        recoveryStore: store,
        recoveryRecord: record,
        transferReference
      });
      const resumedSender = new M4ResumableSender(
        source(bytes, resumedReads),
        record,
        transferReference
      );
      await resumedSender.sendMissingBlocks(resumedReceiver.haveBlocksPages(), (frame) =>
        resumedReceiver.receive(frame)
      );

      expect(Math.min(...resumedReads)).toBe(committedCount * blockBytes);
      expect(destination.bytes.every((value, index) => value === bytes[index])).toBe(true);
    }
  );
});
