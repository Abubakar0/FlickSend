import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const alexButton = "Send to Alex Morgan";
const structuralBytes = Buffer.from([7, 19, 43, 71, 101, 131, 167, 197]);

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function waitForP4Hook(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP4)), { timeout: 15_000 })
    .toBe(true);
}

async function waitForP5Hook(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP5)), { timeout: 15_000 })
    .toBe(true);
}

async function selectAlex(sender: Page): Promise<void> {
  await sender.getByRole("button", { name: alexButton }).click();
  await expect(sender.getByRole("button", { name: "Selected" })).toBeVisible();
}

async function sendAndOpenRecipient(sender: Page, recipient: Page): Promise<void> {
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Alex Morgan" })).toBeVisible();
  const code = await sender.getByTestId("p4-development-session-code").textContent();
  await recipient.goto(`/receive/${(code ?? "").replace(/\s/g, "")}`);
  await waitForP5Hook(recipient);
  await expect(recipient.getByTestId("receive-review")).toBeVisible({ timeout: 30_000 });
}

async function acceptToFixture(recipient: Page): Promise<void> {
  await recipient.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(recipient.getByRole("heading", { name: "Choose where to save" })).toBeVisible();
  await recipient.locator(".p5-development-destination summary").click();
  await recipient.getByRole("button", { name: "Use development test destination" }).click();
  await expect(recipient.getByTestId("receive-destination-summary")).toContainText(
    "Development test destination"
  );
  await recipient.getByRole("button", { name: "Receive", exact: true }).click();
}

async function expectProductDelivery(sender: Page, recipient: Page): Promise<void> {
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).toBeVisible({
    timeout: 120_000
  });
  await expect(recipient.getByTestId("receive-completed")).toBeVisible({ timeout: 120_000 });
  await expect(
    recipient.getByTestId("receive-completed").getByText("Completed and verified.")
  ).toBeVisible();
}

test("P5 receives a P4 single file into a prepared bounded destination and completes after DELIVERED", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const payload = Buffer.alloc(16 * 1024 * 1024, 31);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    name: "project-footage.mov",
    mimeType: "video/quicktime",
    buffer: payload
  });
  await sendAndOpenRecipient(sender, recipient);
  await expect(recipient.getByTestId("receive-review").getByText("From Alex Morgan")).toBeVisible();
  await expect(
    recipient.getByTestId("receive-review").getByText("project-footage.mov")
  ).toBeVisible();
  await acceptToFixture(recipient);
  await expect(recipient.getByRole("progressbar", { name: "Receive progress" })).toBeVisible();
  await expectProductDelivery(sender, recipient);
  expect(await recipient.evaluate(() => window.__flicksendP5?.fixtureFileDigest())).toBe(
    sha256(payload)
  );
  await senderContext.close();
  await recipientContext.close();
});

test("P5 receives P4 multiple files through bounded StreamPack", async ({ browser }) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles([
    { name: "camera-a.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(512 * 1024, 17) },
    { name: "audio.wav", mimeType: "audio/wav", buffer: Buffer.alloc(64 * 1024, 29) }
  ]);
  await sendAndOpenRecipient(sender, recipient);
  await acceptToFixture(recipient);
  await expectProductDelivery(sender, recipient);
  await expect(recipient.getByTestId("receive-completed").getByText("2 files")).toBeVisible();
  await senderContext.close();
  await recipientContext.close();
});

test("P5 receives the P4 structural folder with verified reconstructed fixture bytes", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await waitForP4Hook(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadStructuralFolderFixture());
  await sendAndOpenRecipient(sender, recipient);
  await acceptToFixture(recipient);
  await expectProductDelivery(sender, recipient);
  expect(await recipient.evaluate(() => window.__flicksendP5?.fixtureFolderDigests())).toEqual({
    0: sha256(structuralBytes.subarray(0, 3)),
    1: sha256(structuralBytes),
    2: sha256(Buffer.alloc(0))
  });
  const streamPack = await recipient.evaluate(
    () => window.__flicksendP5?.snapshot().engine?.transfer.streamPack
  );
  expect(streamPack?.filesTotal).toBe(3);
  expect(streamPack?.directoriesTotal).toBe(3);
  await senderContext.close();
  await recipientContext.close();
});

test("P5 visibly preserves verified progress through a real P4-controlled recovery", async ({
  browser
}) => {
  test.setTimeout(240_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await waitForP4Hook(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await sendAndOpenRecipient(sender, recipient);
  await acceptToFixture(recipient);
  await expect(recipient.getByRole("heading", { name: "Reconnecting…" })).toBeVisible({
    timeout: 90_000
  });
  await expect(recipient.locator(".fs-progress__supporting")).not.toHaveText(
    "Verified progress: 0%"
  );
  await sender.evaluate(() => window.__flicksendP4?.resumeReconnect());
  await expectProductDelivery(sender, recipient);
  const recovery = await recipient.evaluate(
    () => window.__flicksendP5?.snapshot().engine?.transfer
  );
  expect(recovery?.reconnectCount).toBeGreaterThanOrEqual(1);
  expect(recovery?.continuity.committedBlocksRetransmitted).toBe(0);
  expect(recovery?.continuity.duplicateRetransmittedBytes).toBe(0);
  await senderContext.close();
  await recipientContext.close();
});

test("P5 fails safely when the recipient destination changes during recovery", async ({
  browser
}) => {
  test.setTimeout(240_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await waitForP4Hook(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await sendAndOpenRecipient(sender, recipient);
  await acceptToFixture(recipient);
  await expect(recipient.getByRole("heading", { name: "Reconnecting…" })).toBeVisible({
    timeout: 90_000
  });
  await recipient.evaluate(() => window.__flicksendP5?.mutateDestination());
  await sender.evaluate(() => window.__flicksendP4?.resumeReconnect());
  await expect(recipient.getByTestId("receive-terminal-error")).toContainText(
    "Destination changed",
    {
      timeout: 90_000
    }
  );
  await expect(recipient.getByTestId("receive-completed")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();
});

test("P5 never completes when destination finalization fails", async ({ browser }) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    name: "finalize.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.alloc(512 * 1024, 7)
  });
  await sendAndOpenRecipient(sender, recipient);
  await recipient.evaluate(() => window.__flicksendP5?.configureFinalizationFailure(true));
  await acceptToFixture(recipient);
  await expect(recipient.getByTestId("receive-terminal-error")).toContainText(
    "Couldn't finish saving",
    {
      timeout: 90_000
    }
  );
  await expect(recipient.getByTestId("receive-completed")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();
});

test("P5 maps exhausted integrity retries to a terminal product error without completion", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await waitForP4Hook(sender);
  await selectAlex(sender);
  await sender.evaluate(() => {
    window.__flicksendP4?.configureIntegrityFailure();
    return window.__flicksendP4?.loadStructuralFolderFixture();
  });
  await sendAndOpenRecipient(sender, recipient);
  await acceptToFixture(recipient);
  await expect(recipient.getByTestId("receive-terminal-error")).toContainText(
    "Transfer couldn't be verified",
    { timeout: 90_000 }
  );
  expect(
    await recipient.evaluate(() => {
      const snapshot = window.__flicksendP5?.snapshot();
      return { code: snapshot?.error?.code, phase: snapshot?.phase };
    })
  ).toEqual({ code: "FS-PRODUCT-INTEGRITY-FAILED", phase: "FAILED" });
  await expect(recipient.getByTestId("receive-completed")).not.toBeVisible();
  await expect(recipient.getByText("Received and verified")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();
});

test("P5 keeps an invalid session generic and exposes no transfer metadata", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/receive/000000");
  await expect(page.getByTestId("receive-terminal-error")).toContainText(
    "This transfer isn't available",
    { timeout: 20_000 }
  );
  await expect(page.getByText("Alex Morgan")).not.toBeVisible();
  await expect(page.getByText("Project Footage")).not.toBeVisible();
  await expect(page.getByText("files")).not.toBeVisible();
});

test("P5 recipient review stays keyboard-operable without horizontal overflow", async ({
  browser
}) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    name: "responsive-review.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.alloc(64 * 1024, 23)
  });
  await sendAndOpenRecipient(sender, recipient);
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await recipient.setViewportSize({ width, height: 960 });
    await expect(recipient.getByTestId("receive-review")).toBeVisible();
    await expect
      .poll(() =>
        recipient.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      )
      .toBe(true);
  }
  const accept = recipient.getByRole("button", { name: "Accept", exact: true });
  await accept.focus();
  await expect(accept).toBeFocused();
  await recipient.keyboard.press("Enter");
  await expect(recipient.getByRole("heading", { name: "Choose where to save" })).toBeVisible();
  await senderContext.close();
  await recipientContext.close();
});

test("P5 makes repeated recipient acceptance idempotent and keeps cancel keyboard-operable", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await waitForP4Hook(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sendAndOpenRecipient(sender, recipient);
  await recipient.getByRole("button", { name: "Accept", exact: true }).dblclick();
  await expect(recipient.getByRole("heading", { name: "Choose where to save" })).toBeVisible();
  await acceptToFixtureDestinationOnly(recipient);
  await recipient.getByRole("button", { name: "Receive", exact: true }).click();
  await expect(recipient.getByTestId("receive-active-transfer")).toBeVisible({ timeout: 30_000 });
  await recipient.getByRole("button", { name: "Cancel transfer" }).focus();
  await recipient.keyboard.press("Enter");
  const dialog = recipient.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel transfer" }).click();
  await expect(recipient.getByTestId("receive-canceled")).toBeVisible();
  await expect(recipient.getByTestId("receive-completed")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();
});

async function acceptToFixtureDestinationOnly(recipient: Page): Promise<void> {
  await recipient.locator(".p5-development-destination summary").click();
  await recipient.getByRole("button", { name: "Use development test destination" }).click();
  await expect(recipient.getByTestId("receive-destination-summary")).toBeVisible();
}
