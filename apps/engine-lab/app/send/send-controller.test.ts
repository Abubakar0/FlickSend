import { describe, expect, it } from "vitest";
import { SendSessionController } from "./send-controller";
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
});
