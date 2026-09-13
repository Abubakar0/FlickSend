import { describe, expect, it } from "vitest";
import type { FileSource, RandomAccessFileDestination } from "@flicksend/filesystem-browser";
import { createRecoveryRecord, type RecoveryRecord, type RecoveryStore } from "@flicksend/resume";
import { ResumableBlockCopy } from "../src/resumable-copy.js";

const transferId = "fs_tr_00000000-0000-4000-8000-000000000001";
const blockBytes = 1024 * 1024;
const totalBytes = 10 * blockBytes;

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

function createSource(bytes: Uint8Array, reads: number[]): FileSource {
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

describe("M4 resumable block copy", () => {
  it.each([1, 5, 9])(
    "resumes after a %i0%% interruption without rereading committed blocks",
    async (committedCount) => {
      const sourceBytes = new Uint8Array(totalBytes);
      sourceBytes.forEach((_, index) => (sourceBytes[index] = index % 251));
      const destination = new MemoryDestination();
      const store = createStore();
      const record = createRecoveryRecord({
        transferId,
        protocolVersion: 3,
        totalBytes,
        blockBytes,
        updatedAtMs: 1
      });
      const initialReads: number[] = [];

      await expect(
        new ResumableBlockCopy(createSource(sourceBytes, initialReads), {
          destination,
          recoveryStore: store,
          recoveryRecord: record,
          onBlockCommitted: (blockIndex) => {
            if (blockIndex + 1 === committedCount) throw new Error("SIMULATED_INTERRUPTION");
          }
        }).copyMissingBlocks()
      ).rejects.toThrow("SIMULATED_INTERRUPTION");

      const resumedReads: number[] = [];
      const completed = await new ResumableBlockCopy(createSource(sourceBytes, resumedReads), {
        destination,
        recoveryStore: store,
        recoveryRecord: record
      }).copyMissingBlocks();

      expect(completed.committedBlockRanges).toEqual([[0, 10]]);
      expect(Math.min(...resumedReads)).toBe(committedCount * blockBytes);
      expect(destination.bytes.every((value, index) => value === sourceBytes[index])).toBe(true);
    }
  );
});
