import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../..", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("P14 production coturn artifacts", () => {
  it("requires runtime REST credentials and exposes only the bounded relay ports", () => {
    const template = read("infra/turn/turnserver.conf.template");
    const compose = read("infra/turn/compose.production.yaml");

    expect(template).toContain("use-auth-secret");
    expect(template).toContain("min-port=49160");
    expect(template).toContain("max-port=49200");
    expect(template).toContain("static-auth-secret=${TURN_SHARED_SECRET}");
    expect(template.match(/^static-auth-secret=(.+)$/m)?.[1]).toBe("${TURN_SHARED_SECRET}");
    expect(compose).toContain('"3478:3478/udp"');
    expect(compose).toContain('"49160-49200:49160-49200/udp"');
    expect(compose).not.toContain("TURNS_QUALIFIED=true");
  });
});
