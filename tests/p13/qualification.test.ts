import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { externalP13Status } from "./run-qualification.mjs";

describe("P13 qualification result", () => {
  it("does not claim Cloudflare staging evidence without an explicit external qualification switch", () => {
    expect(externalP13Status({})).toEqual({
      blockedReason: "PERSISTENT_CLOUDFLARE_STAGING_QUALIFICATION_NOT_EXECUTED",
      externalStatus: "BLOCKED"
    });
  });

  it("uses the explicit development Worker environment for the repository build", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../../apps/signaling/package.json"), "utf8")
    ) as { scripts: { build: string } };
    expect(packageJson.scripts.build).toContain("--env development");
  });
});
