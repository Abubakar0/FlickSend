import { describe, expect, it } from "vitest";
import {
  decodeDataFrame,
  encodeDataFrame,
  parseM4RecoveryControlMessage,
  parseM6StreamPackControlMessage,
  parseTransferControlMessage,
  transferFrameHeaderBytes,
  m6StreamPackProtocolVersion,
  transferProtocolVersion
} from "../src/index.js";

describe("M3 binary frames", () => {
  it("round-trips bounded binary payloads", () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const decoded = decodeDataFrame(
      encodeDataFrame({ transferReference: 7, offset: 1024, payload })
    );
    expect(decoded).toMatchObject({ transferReference: 7, offset: 1024 });
    expect([...decoded!.payload]).toEqual([1, 2, 3, 4]);
  });

  it("rejects malformed frame lengths and versions", () => {
    expect(decodeDataFrame(new ArrayBuffer(1))).toBeNull();
    const invalid = new ArrayBuffer(transferFrameHeaderBytes);
    new DataView(invalid).setUint8(0, transferProtocolVersion + 1);
    expect(decodeDataFrame(invalid)).toBeNull();
  });

  it("requires the M3 receiver window on transfer acceptance", () => {
    expect(
      parseTransferControlMessage({
        type: "TRANSFER_ACCEPT",
        protocolVersion: transferProtocolVersion,
        transferId: "fs_tr_00000000-0000-4000-8000-000000000001",
        receiveWindowBytes: 8 * 1024 * 1024
      })
    ).toMatchObject({ type: "TRANSFER_ACCEPT", receiveWindowBytes: 8 * 1024 * 1024 });
    expect(
      parseTransferControlMessage({
        type: "TRANSFER_ACCEPT",
        protocolVersion: transferProtocolVersion,
        transferId: "fs_tr_00000000-0000-4000-8000-000000000001"
      })
    ).toBeNull();
  });

  it("validates paginated M4 committed-block reconciliation", () => {
    expect(
      parseM4RecoveryControlMessage({
        type: "TRANSFER_HAVE_BLOCKS",
        protocolVersion: 3,
        transferId: "fs_tr_00000000-0000-4000-8000-000000000001",
        manifestIdentity: "00000000-0000-4000-8000-000000000002",
        totalBytes: 32 * 1024 * 1024,
        resumeBlockBytes: 8 * 1024 * 1024,
        blockCount: 4,
        page: 0,
        hasMore: false,
        committedBlockRanges: [
          [0, 2],
          [3, 4]
        ]
      })
    ).toMatchObject({ type: "TRANSFER_HAVE_BLOCKS" });
    expect(
      parseM4RecoveryControlMessage({
        type: "TRANSFER_HAVE_BLOCKS",
        protocolVersion: 3,
        transferId: "fs_tr_00000000-0000-4000-8000-000000000001",
        manifestIdentity: "00000000-0000-4000-8000-000000000002",
        totalBytes: 32 * 1024 * 1024,
        resumeBlockBytes: 8 * 1024 * 1024,
        blockCount: 4,
        page: 0,
        hasMore: false,
        committedBlockRanges: [
          [0, 3],
          [2, 4]
        ]
      })
    ).toBeNull();
  });

  it("accepts only bounded v5 StreamPack manifest chunks", () => {
    expect(
      parseM6StreamPackControlMessage({
        type: "STREAMPACK_MANIFEST_CHUNK",
        protocolVersion: m6StreamPackProtocolVersion,
        transferId: "fs_tr_00000000-0000-4000-8000-000000000001",
        manifestIdentity: "00000000-0000-4000-8000-000000000002",
        chunkIndex: 0,
        entries: [{ entryId: 0, type: "DIRECTORY", relativePath: "Root" }]
      })
    ).toMatchObject({ type: "STREAMPACK_MANIFEST_CHUNK" });
    expect(
      parseM6StreamPackControlMessage({
        type: "STREAMPACK_MANIFEST_CHUNK",
        protocolVersion: m6StreamPackProtocolVersion,
        transferId: "fs_tr_00000000-0000-4000-8000-000000000001",
        manifestIdentity: "00000000-0000-4000-8000-000000000002",
        chunkIndex: 0,
        entries: []
      })
    ).toBeNull();
  });
});
