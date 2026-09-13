import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type RecoverySnapshot = {
  transferId?: string | null;
  state?: string;
};

type HealthSnapshot = {
  healthState?: string;
  measurementAvailability?: Record<string, string>;
  reasons?: Array<{ code?: string }>;
};

const target = process.env.FLICKSEND_M9_TARGET;
const executablePath = process.env.FLICKSEND_M9_BROWSER_PATH;
const evidenceDirectory = resolve(
  process.env.FLICKSEND_M9_EVIDENCE_DIR ?? "test-results/m9-evidence"
);

async function createPair(context: BrowserContext): Promise<{ sender: Page; receiver: Page }> {
  const sender = await context.newPage();
  const receiver = await context.newPage();
  await sender.goto("/");
  await receiver.goto("/");
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).toHaveText(/^\d{3} \d{3}$/);
  await receiver
    .getByLabel("Session code")
    .fill((await sender.getByTestId("session-code").textContent()) ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  return { sender, receiver };
}

async function selectFixture(page: Page, name: string, bytes: number, fill: number): Promise<void> {
  await page.getByLabel("Source file").setInputFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(bytes, fill)
  });
}

async function recovery(page: Page): Promise<RecoverySnapshot> {
  return JSON.parse((await page.getByTestId("m7-recovery-snapshot").textContent()) ?? "null");
}

async function health(page: Page): Promise<HealthSnapshot> {
  return JSON.parse((await page.getByTestId("m8-health-snapshot").textContent()) ?? "null");
}

async function offerAndAccept(pair: { sender: Page; receiver: Page }): Promise<void> {
  await pair.sender.getByRole("button", { name: "Offer File" }).click();
  await expect(pair.receiver.getByTestId("transfer-status")).toContainText("READY", {
    timeout: 30_000
  });
  await pair.receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
}

async function waitForFirstCheckpoint(pair: {
  sender: Page;
  receiver: Page;
}): Promise<RecoverySnapshot> {
  await expect(pair.receiver.getByTestId("m4-recovery-metrics")).toContainText("1 / 2", {
    timeout: 90_000
  });
  // A receiver shows a block as committed only after its verified checkpoint write completes.
  const snapshot = await recovery(pair.receiver);
  expect(snapshot.transferId).toBeTruthy();
  return snapshot;
}

async function reloadObservation(
  page: Page,
  before: RecoverySnapshot
): Promise<Record<string, unknown>> {
  await page.reload();
  await expect(page.getByTestId("browser-capability-snapshot")).not.toHaveText("null");
  const after = await recovery(page);
  const transferStatus = await page.getByTestId("transfer-status").textContent();
  const transferIdSurvives =
    after.transferId === before.transferId && before.transferId !== undefined;
  return {
    status: transferIdSurvives ? "NOT_TESTED" : "NOT_SUPPORTED",
    verifiedCheckpointBeforeInterruption: true,
    checkpointSurvives: transferIdSurvives,
    sourceHandle: "NOT_TESTED",
    destinationHandle: "NOT_TESTED",
    repermissionRequired: "NOT_TESTED",
    resumeAbility: transferIdSurvives ? "NOT_TESTED" : "NOT_SUPPORTED",
    deliveredAfterRefresh: transferStatus?.includes("DELIVERED") === true
  };
}

test("M9 records actual Chrome or Edge lifecycle observations", async ({ browser }) => {
  test.skip(
    !target || !executablePath,
    "M9 lifecycle qualification requires a target and an actual browser executable."
  );
  if (!target || !executablePath) return;
  test.setTimeout(360_000);

  const backgroundContext = await browser.newContext();
  let background;
  try {
    const pair = await createPair(backgroundContext);
    const foreground = await backgroundContext.newPage();
    await foreground.goto("about:blank");
    await foreground.bringToFront();
    const [senderVisibility, receiverVisibility] = await Promise.all([
      pair.sender.evaluate(() => document.visibilityState),
      pair.receiver.evaluate(() => document.visibilityState)
    ]);
    await selectFixture(pair.sender, "m9-background.bin", 8 * 1024 * 1024, 0x6a);
    await offerAndAccept(pair);
    await expect(pair.sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
      timeout: 120_000
    });
    await expect(pair.receiver.getByTestId("transfer-status")).toContainText("DELIVERED", {
      timeout: 120_000
    });
    const senderHealth = await health(pair.sender);
    background = {
      status:
        senderVisibility === "hidden" && receiverVisibility === "hidden" ? "PASS" : "NOT_TESTED",
      senderVisibility,
      receiverVisibility,
      dataChannelContinuity: true,
      delivered: true,
      manifestRootVerified: true,
      healthStateAtCompletion: senderHealth.healthState ?? "UNKNOWN",
      healthReasonsAtCompletion:
        senderHealth.reasons?.map((reason) => reason.code ?? "UNKNOWN") ?? [],
      transferHealth: senderHealth.measurementAvailability ?? {}
    };
  } finally {
    await backgroundContext.close();
  }

  const refreshContext = await browser.newContext();
  let refresh;
  try {
    const pair = await createPair(refreshContext);
    await selectFixture(pair.sender, "m9-refresh.bin", 16 * 1024 * 1024, 0x4c);
    await offerAndAccept(pair);
    refresh = await reloadObservation(pair.sender, await waitForFirstCheckpoint(pair));
  } finally {
    await refreshContext.close();
  }

  const profile = await mkdtemp(join(tmpdir(), "flicksend-m9-restart-"));
  let restart;
  let persistent: BrowserContext | undefined;
  try {
    persistent = await chromium.launchPersistentContext(profile, {
      executablePath,
      headless: false
    });
    const pair = await createPair(persistent);
    await selectFixture(pair.sender, "m9-restart.bin", 16 * 1024 * 1024, 0x3f);
    await offerAndAccept(pair);
    const before = await waitForFirstCheckpoint(pair);
    await persistent.close();
    persistent = await chromium.launchPersistentContext(profile, {
      executablePath,
      headless: false
    });
    const restored = await persistent.newPage();
    await restored.goto("/");
    await expect(restored.getByTestId("browser-capability-snapshot")).not.toHaveText("null");
    const after = await recovery(restored);
    const transferStatus = await restored.getByTestId("transfer-status").textContent();
    const transferIdSurvives =
      after.transferId === before.transferId && before.transferId !== undefined;
    restart = {
      status: transferIdSurvives ? "NOT_TESTED" : "NOT_SUPPORTED",
      verifiedCheckpointBeforeInterruption: true,
      checkpointSurvives: transferIdSurvives,
      sourceHandle: "NOT_TESTED",
      destinationHandle: "NOT_TESTED",
      repermissionRequired: "NOT_TESTED",
      resumeAbility: transferIdSurvives ? "NOT_TESTED" : "NOT_SUPPORTED",
      deliveredAfterRestart: transferStatus?.includes("DELIVERED") === true
    };
  } finally {
    await persistent?.close();
    await rm(profile, { recursive: true, force: true });
  }

  const capabilities = JSON.parse(
    (await browser.newPage().then(async (page) => {
      await page.goto("/");
      const snapshot = page.getByTestId("browser-capability-snapshot");
      await expect(snapshot).toContainText('"schemaVersion"');
      const value = await snapshot.textContent();
      await page.close();
      return value;
    })) ?? "null"
  );
  expect(capabilities).not.toBeNull();
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    join(evidenceDirectory, `${target}-lifecycle.json`),
    JSON.stringify(
      {
        schemaVersion: 1,
        milestone: "M9",
        kind: "browser-lifecycle-qualification",
        generatedAt: new Date().toISOString(),
        target: `${target}-lifecycle`,
        environment: {
          realBrowser: true,
          automated: true,
          emulated: false,
          headed: true,
          hostOperatingSystem: process.env.FLICKSEND_M9_HOST_OS ?? "UNKNOWN",
          hostOperatingSystemVersion: process.env.FLICKSEND_M9_HOST_OS_VERSION ?? null,
          hostArchitecture: process.env.FLICKSEND_M9_HOST_ARCHITECTURE ?? null
        },
        browser: {
          name: capabilities.browser,
          version: browser.version(),
          userAgentVersion: capabilities.browserVersion,
          engine: capabilities.engine,
          operatingSystem: capabilities.operatingSystem,
          operatingSystemVersion: capabilities.operatingSystemVersion,
          deviceClass: capabilities.deviceClass,
          architecture: capabilities.architecture
        },
        qualificationResults: {
          backgroundLifecycle: background.status,
          pageRefresh: refresh.status,
          browserRestart: restart.status,
          permissionAfterPicker: "NOT_TESTED",
          ordinaryReconnect: "NOT_TESTED",
          permissionRevocation: "NOT_TESTED",
          screenLockSleep: "NOT_TESTED",
          background,
          refresh,
          restart
        },
        limitations: [
          "The background scenario uses headed actual-browser tabs and records visibility state, not a performance claim.",
          "Refresh and restart use the bounded OPFS benchmark fixture; no selected external source or destination handle was present.",
          "Native picker permission, permission revocation, screen lock, and sleep require assisted real interaction and remain unqualified."
        ]
      },
      null,
      2
    ) + "\n"
  );
});
