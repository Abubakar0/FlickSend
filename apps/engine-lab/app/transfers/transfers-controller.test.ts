import { describe, expect, it } from "vitest";
import { TransfersController } from "./transfers-controller";
import type { TransfersRepository } from "./transfers-repository";
import type { TransferHistoryRecord, TransferLifecycleEvent } from "./transfer-types";

const record: TransferHistoryRecord = {
  active: null,
  direction: "sent",
  endedAt: "2026-09-12T00:01:00.000Z",
  failureCategory: null,
  fileCount: 1,
  folderCount: 0,
  peerPersonId: "alex-morgan",
  productStatus: "COMPLETED",
  recordId: "tr-safe-record",
  sourceKind: "single_file",
  speedProof: null,
  startedAt: "2026-09-12T00:00:00.000Z",
  totalBytes: 512
};

class Repository implements TransfersRepository {
  recorded: TransferLifecycleEvent[] = [];
  constructor(private readonly records: readonly TransferHistoryRecord[]) {}
  async get(): Promise<TransferHistoryRecord | null> {
    return this.records[0] ?? null;
  }
  async list(): Promise<readonly TransferHistoryRecord[]> {
    return this.records;
  }
  async record(_: string, event: TransferLifecycleEvent): Promise<TransferHistoryRecord> {
    this.recorded.push(event);
    return record;
  }
  async resetDevelopmentStore(): Promise<void> {}
}

describe("P7 TransfersController", () => {
  it("loads repository records and keeps filtering view-only", async () => {
    const repository = new Repository([record]);
    const controller = new TransfersController("dev-sender", repository);
    await controller.load();
    controller.setFilter("SENT");

    expect(controller.getSnapshot().records).toEqual([record]);
    expect(controller.getSnapshot().filter).toBe("SENT");
  });

  it("queues lifecycle writes without making UI filter state a persistence authority", async () => {
    const repository = new Repository([]);
    const controller = new TransfersController("dev-sender", repository);
    controller.setFilter("RECEIVED");
    controller.record({
      active: null,
      deliveryConfirmed: true,
      direction: "sent",
      failureCategory: null,
      fileCount: 1,
      folderCount: 0,
      lifecycleKey: "p7-controller",
      peerPersonId: "alex-morgan",
      productStatus: "COMPLETED",
      sourceKind: "single_file",
      speedProof: null,
      totalBytes: 512
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(repository.recorded).toHaveLength(1);
    expect(controller.getSnapshot().filter).toBe("RECEIVED");
  });
});
