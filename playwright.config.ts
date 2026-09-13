import { defineConfig, devices } from "@playwright/test";

const qualificationBrowserPath = process.env.FLICKSEND_QUALIFICATION_BROWSER_PATH;
const qualificationBrowserName =
  process.env.FLICKSEND_QUALIFICATION_BROWSER === "firefox" ? "firefox" : "chromium";
const fixtureEnvironment = {
  ...process.env,
  CLERK_SECRET_KEY: "",
  FLICKSEND_DEVELOPMENT_AUTH_FIXTURE: "1",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ""
};

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["p10-auth.live.spec.ts", "p10-clerk.setup.ts"],
  // The Engine Lab signalling service intentionally hosts one two-peer session at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "pnpm --filter @flicksend/signaling dev",
      env: fixtureEnvironment,
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: !process.env.CI && process.env.FLICKSEND_M7_TURN_QUALIFICATION !== "1"
    },
    {
      command: "pnpm --filter @flicksend/engine-lab dev",
      env: fixtureEnvironment,
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI && process.env.FLICKSEND_M7_TURN_QUALIFICATION !== "1"
    }
  ],
  projects: [
    qualificationBrowserPath
      ? {
          name: process.env.FLICKSEND_QUALIFICATION_BROWSER_LABEL ?? "qualification-browser",
          use: {
            browserName: qualificationBrowserName,
            launchOptions: { executablePath: qualificationBrowserPath }
          }
        }
      : {
          name: "chromium",
          use: { ...devices["Desktop Chrome"], channel: "chromium" }
        }
  ]
});
