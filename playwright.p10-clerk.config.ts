import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

loadEnvConfig(resolve(process.cwd(), "apps/engine-lab"), true);

const requiredProviderEnvironment = ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"];
const missingProviderEnvironment = requiredProviderEnvironment.filter((name) => !process.env[name]);

if (missingProviderEnvironment.length > 0) {
  throw new Error(
    `P10 live Clerk qualification requires ${missingProviderEnvironment.join(" and ")}.`
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "p10-auth.live.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "pnpm --filter @flicksend/signaling dev",
      env: { ...process.env, FLICKSEND_DEVELOPMENT_AUTH_FIXTURE: "" },
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: false
    },
    {
      command: "pnpm --filter @flicksend/engine-lab exec next dev --port 3002",
      env: { ...process.env, FLICKSEND_DEVELOPMENT_AUTH_FIXTURE: "" },
      url: "http://127.0.0.1:3002/sign-in",
      reuseExistingServer: false
    }
  ],
  projects: [
    {
      name: "clerk-setup",
      testMatch: "p10-clerk.setup.ts"
    },
    {
      name: "clerk-development",
      testMatch: "p10-auth.live.spec.ts",
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"], channel: "chromium" }
    }
  ]
});
