import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runner = readFileSync(resolve(import.meta.dirname, "run-qualification.mjs"), "utf8");

describe("P12 local qualification setup", () => {
  it("resets only its fixed loopback PostgreSQL fixture before migrating", () => {
    expect(runner).toContain(
      'run("docker", ["compose", "-f", composeFile, "down", "--volumes", "--remove-orphans"]);'
    );
    expect(runner).toContain(
      "if (process.env.DATABASE_URL && process.env.DATABASE_URL !== databaseUrl)"
    );
  });
});
