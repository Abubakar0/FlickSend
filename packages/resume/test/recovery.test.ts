import { describe, expect, it } from "vitest";
import {
  blockByteRange,
  compactBlockIndexes,
  createRecoveryRecord,
  expandBlockRanges,
  markBlockCommitted,
  missingBlockIndexes,
  pageBlockRanges,
  reconcileMissingBlocks
} from "../src/index.js";

const transferId = "fs_tr_00000000-0000-4000-8000-000000000001";

describe("M4 recovery state", () => {
  it("uses an 8 MiB logical block candidate and preserves a partial final block", () => {
    const record = createRecoveryRecord({
      transferId,
      protocolVersion: 3,
      totalBytes: 20 * 1024 * 1024 + 7
    });
    expect(record.blockBytes).toBe(8 * 1024 * 1024);
    expect(record.blockCount).toBe(3);
    expect(blockByteRange(2, record.totalBytes, record.blockBytes)).toEqual([
      16 * 1024 * 1024,
      20 * 1024 * 1024 + 7
    ]);
  });

  it("compacts and validates sparse committed block ranges", () => {
    expect(compactBlockIndexes([7, 1, 2, 4, 5, 6], 8)).toEqual([
      [1, 3],
      [4, 8]
    ]);
    expect(() =>
      expandBlockRanges(
        [
          [2, 4],
          [3, 5]
        ],
        6
      )
    ).toThrow("Recovery block ranges are invalid.");
  });

  it("reconciles only missing blocks after interruptions at 10, 50, and 90 percent", () => {
    for (const committedCount of [1, 5, 9]) {
      let record = createRecoveryRecord({
        transferId,
        protocolVersion: 3,
        totalBytes: 10 * 8 * 1024 * 1024,
        updatedAtMs: 1
      });
      for (let block = 0; block < committedCount; block += 1)
        record = markBlockCommitted(record, block, 2 + block);
      expect(reconcileMissingBlocks(record, record)).toEqual(
        Array.from({ length: 10 - committedCount }, (_, index) => index + committedCount)
      );
    }
  });

  it("does not turn an ambiguous unacknowledged block into a committed block", () => {
    const record = createRecoveryRecord({
      transferId,
      protocolVersion: 3,
      totalBytes: 3 * 8 * 1024 * 1024
    });
    const persisted = markBlockCommitted(record, 0, 10);
    expect(missingBlockIndexes(persisted)).toEqual([1, 2]);
  });

  it("rejects recovery state for a different transfer manifest", () => {
    const receiver = createRecoveryRecord({
      transferId,
      protocolVersion: 3,
      totalBytes: 8 * 1024 * 1024
    });
    expect(() =>
      reconcileMissingBlocks({ ...receiver, totalBytes: receiver.totalBytes + 1 }, receiver)
    ).toThrow("Recovery state does not match the transfer manifest.");
  });

  it("pages a sparse recovery map without losing range order", () => {
    const ranges = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7]
    ] as const;
    expect(pageBlockRanges(ranges, 2)).toEqual([
      [
        [0, 1],
        [2, 3]
      ],
      [
        [4, 5],
        [6, 7]
      ]
    ]);
  });
});
