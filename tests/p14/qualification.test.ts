import { describe, expect, it } from "vitest";
import { externalP14Status } from "./run-qualification.mjs";

describe("P14 qualification result", () => {
  it("does not claim public TURN evidence without an explicit external qualification switch", () => {
    expect(externalP14Status({})).toEqual({
      blockedReason: "PUBLIC_TURN_INFRASTRUCTURE_QUALIFICATION_NOT_EXECUTED",
      externalStatus: "BLOCKED"
    });
  });
});
