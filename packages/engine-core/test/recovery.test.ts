import { describe, expect, it } from "vitest";
import { createRecoveryRecord, type RecoveryRecord, type RecoveryStore } from "@flicksend/resume";
import {
  commitBlockAndCreateAcknowledgement,
  createHaveBlocksPages,
  createResumeOffer,
  ReceiverRecoveryCheckpoint,
  RecoveryReconciler
} from "../src/recovery.js";

const transferId = "fs_tr_00000000-0000-4000-8000-000000000001";
const record = createRecoveryRecord({
  transferId,
  protocolVersion: 3,
  totalBytes: 4 * 8 * 1024 * 1024,
  updatedAtMs: 1
});

describe("M4 recovery reconciliation", () => {
  it("uses all ordered HAVE_BLOCKS pages to schedule only missing blocks", () => {
    const reconciler = new RecoveryReconciler(record);
    expect(
      reconciler.accept({
        type: "TRANSFER_HAVE_BLOCKS",
        protocolVersion: 3,
        transferId,
        manifestIdentity: record.manifestIdentity,
        totalBytes: record.totalBytes,
        resumeBlockBytes: record.blockBytes,
        blockCount: record.blockCount,
        page: 0,
        hasMore: true,
        committedBlockRanges: [[0, 1]]
      })
    ).toBeNull();
    expect(
      reconciler.accept({
        type: "TRANSFER_HAVE_BLOCKS",
        protocolVersion: 3,
        transferId,
        manifestIdentity: record.manifestIdentity,
        totalBytes: record.totalBytes,
        resumeBlockBytes: record.blockBytes,
        blockCount: record.blockCount,
        page: 1,
        hasMore: false,
        committedBlockRanges: [[2, 3]]
      })
    ).toEqual([1, 3]);
  });

  it("fails explicitly for reordered pages or a mismatched manifest", () => {
    const reconciler = new RecoveryReconciler(record);
    expect(() =>
      reconciler.accept({
        type: "TRANSFER_HAVE_BLOCKS",
        protocolVersion: 3,
        transferId,
        manifestIdentity: record.manifestIdentity,
        totalBytes: record.totalBytes,
        resumeBlockBytes: record.blockBytes,
        blockCount: record.blockCount,
        page: 1,
        hasMore: false,
        committedBlockRanges: []
      })
    ).toThrow("Recovery pages are out of order.");
    expect(() =>
      new RecoveryReconciler(record).accept({
        type: "TRANSFER_HAVE_BLOCKS",
        protocolVersion: 3,
        transferId,
        manifestIdentity: record.manifestIdentity,
        totalBytes: record.totalBytes + 1,
        resumeBlockBytes: record.blockBytes,
        blockCount: record.blockCount,
        page: 0,
        hasMore: false,
        committedBlockRanges: []
      })
    ).toThrow("Recovery state does not match the transfer manifest.");
  });

  it("retains only blocks durably persisted before interruptions at 10, 50, and 90 percent", async () => {
    for (const committedCount of [1, 5, 9]) {
      const records = new Map<string, RecoveryRecord>();
      const store: RecoveryStore = {
        load: async (id) => records.get(id) ?? null,
        save: async (value) => void records.set(value.transferId, value),
        remove: async (id) => void records.delete(id)
      };
      const tenBlockRecord = createRecoveryRecord({
        transferId,
        protocolVersion: 3,
        totalBytes: 10 * 8 * 1024 * 1024,
        updatedAtMs: 1
      });
      const checkpoint = await ReceiverRecoveryCheckpoint.open(store, tenBlockRecord);
      for (let block = 0; block < committedCount; block += 1) await checkpoint.commit(block);

      const recovered = await ReceiverRecoveryCheckpoint.open(store, tenBlockRecord);
      expect(recovered.snapshot().committedBlockRanges).toEqual([[0, committedCount]]);
    }
  });

  it("rejects persisted state when the transfer manifest changes", async () => {
    const store: RecoveryStore = {
      load: async () => ({ ...record, totalBytes: record.totalBytes + 1 }),
      save: async () => undefined,
      remove: async () => undefined
    };
    await expect(ReceiverRecoveryCheckpoint.open(store, record)).rejects.toThrow(
      "Recovery block count does not match transfer size."
    );
  });

  it("rejects a persisted recovery map bound to a different destination", async () => {
    const expected = { ...record, destinationIdentity: "destination-a" };
    const store: RecoveryStore = {
      load: async () => ({ ...expected, destinationIdentity: "destination-b" }),
      save: async () => undefined,
      remove: async () => undefined
    };
    await expect(ReceiverRecoveryCheckpoint.open(store, expected)).rejects.toThrow(
      "Persisted recovery state does not match the transfer manifest."
    );
  });

  it("emits M4 block acknowledgement only after its recovery state is saved", async () => {
    const records = new Map<string, RecoveryRecord>();
    const store: RecoveryStore = {
      load: async (id) => records.get(id) ?? null,
      save: async (value) => void records.set(value.transferId, value),
      remove: async (id) => void records.delete(id)
    };
    const checkpoint = await ReceiverRecoveryCheckpoint.open(store, record);
    expect(createResumeOffer(record)).toMatchObject({ type: "TRANSFER_RESUME_OFFER" });
    expect(createHaveBlocksPages(record)).toHaveLength(1);
    await expect(commitBlockAndCreateAcknowledgement(checkpoint, 0)).resolves.toMatchObject({
      type: "TRANSFER_BLOCK_COMMITTED",
      blockIndex: 0
    });
    expect(records.get(transferId)?.committedBlockRanges).toEqual([[0, 1]]);
  });
});
