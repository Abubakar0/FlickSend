import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const turboConfiguration = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../turbo.json"), "utf8")
) as { tasks?: { build?: { env?: string[] } } };

describe("P13 build environment contract", () => {
  it("hashes the public signaling endpoint without making the capability secret a client build input", () => {
    const environment = turboConfiguration.tasks?.build?.env ?? [];

    expect(environment).toContain("NEXT_PUBLIC_PRODUCTION_SIGNALING_URL");
    expect(environment).not.toContain("SIGNALING_CAPABILITY_SECRET");
  });
});
