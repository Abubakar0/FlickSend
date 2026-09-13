import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const alexButton = "Send to Alex Morgan";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function waitForDevelopmentHook(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP4)), { timeout: 15_000 })
    .toBe(true);
}

async function selectAlex(page: Page): Promise<void> {
  await page.getByRole("button", { name: alexButton }).click();
  await expect(page.getByRole("button", { name: "Selected" })).toBeVisible();
}

async function startAndJoin(sender: Page, receiver: Page): Promise<void> {
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Alex Morgan" })).toBeVisible();
  await expect(sender.locator(".p4-sr-status")).toHaveText("Waiting for Alex Morgan.");
  const code = await sender.getByTestId("p4-development-session-code").textContent();
  await receiver.getByLabel("Development session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join development session" }).click();
}

async function expectDelivered(sender: Page, receiver: Page): Promise<void> {
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).toBeVisible({
    timeout: 90_000
  });
  await expect(receiver.getByTestId("p4-harness-status")).toContainText("DELIVERED", {
    timeout: 90_000
  });
  await expect(receiver.getByTestId("p4-harness-root")).toContainText("verified");
}

test("P4 sender sends a selected file through the actual engine and completes only after delivery", async ({
  browser
}, testInfo) => {
  test.setTimeout(120_000);
  const payload = Buffer.alloc(16 * 1024 * 1024, 31);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto(`/p4-harness?expectedDigest=${sha256(payload)}`);
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    name: "camera-a.mov",
    mimeType: "video/quicktime",
    buffer: payload
  });
  await expect(sender.getByRole("heading", { name: "Ready to send" })).toBeVisible();
  await startAndJoin(sender, receiver);
  await expect(sender.getByRole("progressbar", { name: "Transfer progress" })).toBeVisible();
  await sender.screenshot({ path: testInfo.outputPath("p4-active-light.png"), fullPage: true });
  await expectDelivered(sender, receiver);
  await sender.screenshot({ path: testInfo.outputPath("p4-completed-light.png"), fullPage: true });
  await expect(receiver.getByTestId("p4-harness-file-match")).toContainText("match");
  await senderContext.close();
  await receiverContext.close();
});

test("P4 sender maps a multi-file source to StreamPack without loading a combined payload", async ({
  browser
}) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles([
    { name: "camera-a.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(256 * 1024, 17) },
    { name: "audio.wav", mimeType: "audio/wav", buffer: Buffer.alloc(64 * 1024, 29) }
  ]);
  await expect(sender.getByTestId("send-source-summary")).toContainText("2 files");
  await startAndJoin(sender, receiver);
  await expectDelivered(sender, receiver);
  await senderContext.close();
  await receiverContext.close();
});

test("P4 sender transfers the structural StreamPack folder fixture with an exact receiver tree", async ({
  browser
}) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto("/p4-harness?expectStructuralFixture=1");
  await waitForDevelopmentHook(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadStructuralFolderFixture());
  await expect(sender.getByRole("heading", { name: "Ready to send" })).toBeVisible();
  await startAndJoin(sender, receiver);
  await expectDelivered(sender, receiver);
  await expect(receiver.getByTestId("p4-harness-folder-match")).toContainText("match");
  await senderContext.close();
  await receiverContext.close();
});

test("P4 sender visibly recovers a controlled interruption without creating a new send", async ({
  browser
}, testInfo) => {
  test.setTimeout(180_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForDevelopmentHook(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startAndJoin(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Reconnecting…" })).toBeVisible({
    timeout: 30_000
  });
  await expect(sender.locator(".fs-progress__supporting")).not.toHaveText("Verified progress: 0%");
  await sender.screenshot({
    path: testInfo.outputPath("p4-reconnecting-light.png"),
    fullPage: true
  });
  await sender.evaluate(() => window.__flicksendP4?.resumeReconnect());
  await expectDelivered(sender, receiver);
  const recovery = await sender.evaluate(() => window.__flicksendP4?.recoveryEvidence());
  expect(recovery?.reconnectCount).toBeGreaterThanOrEqual(1);
  expect(recovery?.committedBlocksRetransmitted).toBe(0);
  expect(recovery?.duplicateRetransmittedBytes).toBe(0);
  await senderContext.close();
  await receiverContext.close();
});

test("P4 maps exhausted integrity retries to a terminal error without showing completion", async ({
  browser
}, testInfo) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForDevelopmentHook(sender);
  await selectAlex(sender);
  await sender.evaluate(() => {
    window.__flicksendP4?.configureIntegrityFailure();
    return window.__flicksendP4?.loadStructuralFolderFixture();
  });
  await startAndJoin(sender, receiver);
  await expect(sender.getByTestId("send-terminal-error")).toContainText(
    "Transfer couldn't be verified",
    { timeout: 90_000 }
  );
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).not.toBeVisible();
  await expect(sender.getByRole("button", { name: "Start a new send" })).toBeVisible();
  await sender.screenshot({ path: testInfo.outputPath("p4-error-light.png"), fullPage: true });
  await senderContext.close();
  await receiverContext.close();
});

test("P4 recipient selection and source controls remain keyboard reachable", async ({ page }) => {
  await page.goto("/send");
  const recipient = page.getByRole("button", { name: alexButton });
  await recipient.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Selected" })).toBeVisible();
  await page.getByRole("button", { name: "Select files" }).focus();
  await expect(page.getByRole("button", { name: "Select files" })).toBeFocused();
  await page.getByRole("button", { name: "Select folder" }).focus();
  await expect(page.getByRole("button", { name: "Select folder" })).toBeFocused();
});

test("P4 sender layout remains usable across review widths and both themes", async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/send");
  await page.getByRole("button", { name: "Light" }).click();
  await page.screenshot({ path: testInfo.outputPath("p4-empty-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Dark" }).click();
  await page.screenshot({ path: testInfo.outputPath("p4-empty-dark.png"), fullPage: true });
  await selectAlex(page);
  await page.screenshot({ path: testInfo.outputPath("p4-recipient-dark.png"), fullPage: true });
  await page.getByRole("button", { name: "Light" }).click();
  await page.getByLabel("Source files").setInputFiles({
    name: "Project Footage.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.alloc(64 * 1024, 23)
  });
  await expect(page.getByRole("heading", { name: "Ready to send" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("p4-review-light.png"), fullPage: true });

  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});
