import { describe, expect, it, vi } from "vitest";
import type { ConnectionCoordinatorOptions } from "@flicksend/engine-core";
import { ProductionIceConfigurationProvider } from "../signaling/turn-client";
import { SendSessionController, type SendCoordinatorFactory } from "./send-controller";
import { developmentRecipients } from "./recipients";

describe("P6 recipient eligibility guard", () => {
  it("rejects direct selection of a person outside the connected People source", () => {
    const controller = new SendSessionController("ws://fixture", undefined, () => []);
    controller.selectRecipient(developmentRecipients[0]!);
    expect(controller.getSnapshot().recipient).toBeNull();
  });

  it("clears a pre-start recipient that becomes ineligible without touching a transfer", () => {
    let eligible = [developmentRecipients[0]!];
    const controller = new SendSessionController("ws://fixture", undefined, () => eligible);
    controller.selectRecipient(developmentRecipients[0]!);
    expect(controller.getSnapshot().recipient?.id).toBe("alex-morgan");
    eligible = [];
    controller.reconcileRecipientEligibility();
    expect(controller.getSnapshot().recipient).toBeNull();
    expect(controller.getSnapshot().activeTransferId).toBeNull();
  });

  it("injects the production ICE adapter only after the sender capability is issued", async () => {
    let options: Pick<ConnectionCoordinatorOptions, "iceConfigurationProvider"> | undefined;
    const createCoordinator = vi.fn(((
      url: string,
      receivedOptions?: ConnectionCoordinatorOptions
    ) => {
      void url;
      options = receivedOptions;
      return {
        createSession: vi.fn(),
        disconnect: vi.fn(),
        joinAuthorizedSignallingSession: vi.fn(async () => undefined),
        subscribe: vi.fn(() => () => undefined)
      };
    }) as unknown as SendCoordinatorFactory);
    const controller = new SendSessionController(
      "wss://signaling.example",
      createCoordinator,
      () => developmentRecipients,
      undefined,
      async () => ({
        receiverPath: "/receive/fsst1.placeholder.signature",
        sender: {
          accessToken: `fsst1.${"a".repeat(32)}.${"b".repeat(43)}`,
          expiresAtMs: Date.now() + 60_000
        }
      })
    );
    await controller.initializeCapabilities();
    const initialized = controller.getSnapshot();
    (controller as unknown as { snapshot: typeof initialized }).snapshot = {
      ...initialized,
      compatibility: { ...initialized.compatibility!, requiredCapabilityMissing: false }
    };
    controller.selectRecipient(developmentRecipients[0]!);
    await controller.selectFiles([new File(["test"], "test.txt")]);

    await controller.start();

    expect(createCoordinator).toHaveBeenCalledOnce();
    expect(options?.iceConfigurationProvider).toBeInstanceOf(ProductionIceConfigurationProvider);
  });
});
