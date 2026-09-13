import { describe, expect, it } from "vitest";
import { engineCoreBoundary } from "../src/index.js";

describe("engine-core M0 boundary", () => {
  it("documents framework independence", () => {
    expect(engineCoreBoundary).toContain("Framework-independent");
  });
});
