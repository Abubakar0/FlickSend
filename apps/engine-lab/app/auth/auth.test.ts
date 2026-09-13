import { describe, expect, it } from "vitest";
import { hasClerkConfiguration, isDevelopmentAuthFixtureEnabled } from "./config";
import { developmentFixtureSession } from "./development-fixture";
import { safeReturnPath, signInPath } from "./safe-return-path";

const fixtureEnvironment = {
  FLICKSEND_DEVELOPMENT_AUTH_FIXTURE: "1",
  NODE_ENV: "test"
} as const;

describe("P10 auth boundary", () => {
  it("accepts only safe account-owned local return paths", () => {
    expect(safeReturnPath("/transfers/example?view=active")).toBe("/transfers/example?view=active");
    expect(safeReturnPath("https://evil.example")).toBe("/send");
    expect(safeReturnPath("//evil.example")).toBe("/send");
    expect(safeReturnPath("javascript:alert(1)")).toBe("/send");
    expect(safeReturnPath("data:text/html,test")).toBe("/send");
    expect(signInPath("/people")).toBe("/sign-in?returnTo=%2Fpeople");
  });

  it("uses provider keys as the production configuration boundary", () => {
    expect(hasClerkConfiguration({ CLERK_SECRET_KEY: "secret" })).toBe(false);
    expect(
      hasClerkConfiguration({
        CLERK_SECRET_KEY: "secret",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "publishable"
      })
    ).toBe(true);
    expect(
      isDevelopmentAuthFixtureEnabled({
        NODE_ENV: "production",
        FLICKSEND_DEVELOPMENT_AUTH_FIXTURE: "1"
      })
    ).toBe(false);
  });

  it("keeps synthetic identity selection inside the explicit non-production fixture", () => {
    const selected = developmentFixtureSession({ as: "alex-morgan" }, fixtureEnvironment);
    expect(selected?.principal?.principalId).toBe("development-fixture:alex-morgan");
    expect(selected?.fixturePersonId).toBe("alex-morgan");
    expect(selected?.principal?.displayName).toBe("Alex Morgan");

    const production = developmentFixtureSession(
      { as: "alex-morgan" },
      { FLICKSEND_DEVELOPMENT_AUTH_FIXTURE: "1", NODE_ENV: "production" }
    );
    expect(production).toBeNull();
  });

  it("does not treat display information as account authority", () => {
    const first = developmentFixtureSession({ as: "dev-sender" }, fixtureEnvironment);
    const second = developmentFixtureSession({ as: "dev-sender" }, fixtureEnvironment);
    expect(first?.principal?.principalId).toBe(second?.principal?.principalId);
    expect(first?.principal?.primaryEmail).toBeNull();
    expect(first?.principal?.emailVerified).toBeNull();
  });
});
