import { describe, expect, it } from "vitest";
import { externalP13Status } from "./run-qualification.mjs";

describe("P13 qualification result", () => {
  it("does not claim Cloudflare staging evidence without an explicit external qualification switch", () => {
    expect(externalP13Status({})).toEqual({
      blockedReason: "PERSISTENT_CLOUDFLARE_STAGING_QUALIFICATION_NOT_EXECUTED",
      externalStatus: "BLOCKED"
    });
  });
});
