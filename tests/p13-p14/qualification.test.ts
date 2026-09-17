import { describe, expect, it } from "vitest";
import { combinedExternalStatus } from "./run-integration-qualification.mjs";

describe("P13/P14 qualification result", () => {
  it("keeps combined infrastructure evidence blocked until both provider-owned gates execute", () => {
    expect(combinedExternalStatus({}, {})).toEqual({
      blockedReason: "P13_AND_P14_EXTERNAL_QUALIFICATION_NOT_EXECUTED",
      externalStatus: "BLOCKED"
    });
  });
});
