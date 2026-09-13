import { defineConfig } from "@playwright/test";

const executablePath = process.env.FLICKSEND_M9_BROWSER_PATH;

if (!executablePath)
  throw new Error("FLICKSEND_M9_BROWSER_PATH must name an actual Chrome or Edge executable.");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    // A headed browser is necessary to observe actual tab visibility instead of a headless approximation.
    headless: false,
    launchOptions: { executablePath },
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "pnpm --filter @flicksend/signaling dev",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: false
    },
    {
      command: "pnpm --filter @flicksend/engine-lab dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false
    }
  ],
  projects: [{ name: "m9-lifecycle", use: { browserName: "chromium" } }]
});
