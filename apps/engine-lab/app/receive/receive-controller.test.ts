import { describe, expect, it, vi } from "vitest";
import type { ConnectionCoordinatorOptions } from "@flicksend/engine-core";
import { ProductionIceConfigurationProvider } from "../signaling/turn-client";
import { ReceiveSessionController, type ReceiveCoordinatorFactory } from "./receive-controller";

describe("P14 receiver ICE integration", () => {
  it("injects the production ICE adapter for an authorized recipient session", async () => {
    let options: Pick<ConnectionCoordinatorOptions, "iceConfigurationProvider"> | undefined;
    const createCoordinator = vi.fn(((
      url: string,
      receivedOptions?: ConnectionCoordinatorOptions
    ) => {
      void url;
      options = receivedOptions;
      return {
        disconnect: vi.fn(),
        joinAuthorizedSignallingSession: vi.fn(async () => undefined),
        joinSession: vi.fn(async () => undefined),
        subscribe: vi.fn(() => () => undefined)
      };
    }) as unknown as ReceiveCoordinatorFactory);
    const capability = `fsst1.${"a".repeat(32)}.${"b".repeat(43)}`;
    const controller = new ReceiveSessionController(
      "wss://signaling.example",
      createCoordinator,
      (rawSession) =>
        rawSession === capability
          ? { accessToken: capability, expiresAtMs: Date.now() + 60_000 }
          : null
    );

    await controller.open(capability);

    expect(createCoordinator).toHaveBeenCalledOnce();
    expect(options?.iceConfigurationProvider).toBeInstanceOf(ProductionIceConfigurationProvider);
  });
});
