import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../..", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("P13/P14 evidence documentation", () => {
  it("records external blockers without storing a TURN shared secret", () => {
    const p13Report = read("docs/P13-IMPLEMENTATION-REPORT.md");
    const p14Report = read("docs/P14-IMPLEMENTATION-REPORT.md");
    const integrationReport = read("docs/P13-P14-INTEGRATION-REPORT.md");
    const allDocs = [p13Report, p14Report, integrationReport].join("\n");

    expect(p13Report).toContain(
      "BLOCKED — PERSISTENT CLOUDFLARE STAGING QUALIFICATION NOT EXECUTED"
    );
    expect(p14Report).toContain("BLOCKED — PUBLIC TURN INFRASTRUCTURE QUALIFICATION NOT EXECUTED");
    expect(integrationReport).toContain("P15+ scope was not started.");
    expect(allDocs).not.toMatch(/TURN_SHARED_SECRET=[^${\n]+/);
  });
});
