import { describe, expect, it } from "vitest";
import { digestBlock } from "@flicksend/integrity";
import { createRecoveryRecord, markVerifiedBlockCommitted } from "@flicksend/resume";
import { createStreamPackManifest } from "@flicksend/stream-pack";
import { destinationFromWritable, SmallStreamPackFixtureDestination } from "../src/index.js";

describe("M4 random-access destination", () => {
  it("writes a recovered block at its validated destination offset", async () => {
    const writes: unknown[] = [];
    const stream = {
      write: async (chunk: unknown) => {
        writes.push(chunk);
      },
      close: async () => undefined,
      abort: async () => undefined
    } as unknown as FileSystemWritableFileStream;
    const destination = destinationFromWritable(stream);
    const payload = Uint8Array.of(1, 2, 3);

    await destination.writeAt(8 * 1024 * 1024, payload);

    expect(writes).toEqual([{ type: "write", position: 8 * 1024 * 1024, data: payload }]);
    await expect(destination.writeAt(-1, payload)).rejects.toThrow("Invalid offset.");
  });
});

describe("M6 bounded StreamPack fixture destination", () => {
  it("re-hashes committed blocks before permitting verified recovery", async () => {
    const manifest = createStreamPackManifest({
      blockBytes: 8,
      entries: [
        { type: "DIRECTORY", relativePath: "Root" },
        { type: "FILE", relativePath: "Root/payload.bin", sizeBytes: 8 }
      ]
    });
    const payload = Uint8Array.of(3, 7, 11, 13, 17, 19, 23, 29);
    const destination = new SmallStreamPackFixtureDestination();
    await destination.prepare(manifest);
    await destination.writeRange(0, 0, payload);
    const record = markVerifiedBlockCommitted(
      createRecoveryRecord({
        transferId: "fs_tr_00000000-0000-4000-8000-000000000000",
        protocolVersion: 5,
        manifestIdentity: "00000000-0000-4000-8000-000000000001",
        sourceIdentity: "fixture-source",
        destinationIdentity: "fixture-destination",
        totalBytes: payload.byteLength,
        blockBytes: 8
      }),
      0,
      digestBlock(payload)
    );

    await expect(destination.validateVerifiedRecovery(manifest, record)).resolves.toBeUndefined();

    await destination.writeRange(0, 0, Uint8Array.of(0));
    await expect(destination.validateVerifiedRecovery(manifest, record)).rejects.toThrow(
      "FS_STREAMPACK_DESTINATION_CHANGED"
    );
  });
});
