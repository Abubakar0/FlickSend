import { expect, test, type Browser, type Page } from "@playwright/test";

const alexButton = "Send to Alex Morgan";

async function waitForP4(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP4)), { timeout: 15_000 })
    .toBe(true);
}

async function waitForP5(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP5)), { timeout: 15_000 })
    .toBe(true);
}

async function resetP7History(page: Page): Promise<void> {
  await page.goto("/transfers");
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP7)), { timeout: 15_000 })
    .toBe(true);
  await page.evaluate(async () => {
    await window.__flicksendP7?.resetDevelopmentStore();
    // P7 tests can intentionally leave a development People relationship blocked. P8 recovery
    // qualification requires the independent default recipient fixture, not prior-test state.
    await window.__flicksendP6?.resetDevelopmentStore();
  });
}

async function selectAlex(sender: Page): Promise<void> {
  await sender.getByRole("button", { name: alexButton }).click();
  await expect(sender.getByRole("button", { name: "Selected" })).toBeVisible();
}

async function startP4Harness(sender: Page, receiver: Page): Promise<void> {
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Alex Morgan" })).toBeVisible();
  const code = await sender.getByTestId("p4-development-session-code").textContent();
  await receiver.getByLabel("Development session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join development session" }).click();
}

async function startRecipient(sender: Page, recipient: Page): Promise<void> {
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Alex Morgan" })).toBeVisible();
  const code = await sender.getByTestId("p4-development-session-code").textContent();
  await recipient.goto(`/receive/${(code ?? "").replaceAll(" ", "")}`);
  await waitForP5(recipient);
  await expect(recipient.getByTestId("receive-review")).toBeVisible({ timeout: 30_000 });
}

async function chooseFixtureDestination(recipient: Page): Promise<void> {
  await recipient.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(recipient.getByRole("heading", { name: "Choose where to save" })).toBeVisible();
  await recipient.locator(".p5-development-destination summary").click();
  await recipient.getByRole("button", { name: "Use development test destination" }).click();
  await expect(recipient.getByTestId("receive-destination-summary")).toBeVisible();
}

async function receiveToFixture(recipient: Page): Promise<void> {
  await chooseFixtureDestination(recipient);
  await recipient.getByRole("button", { name: "Receive", exact: true }).click();
}

async function expectSenderDelivered(sender: Page): Promise<void> {
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).toBeVisible({
    timeout: 120_000
  });
}

test("P8 explains real sender recovery, announces restoration, and keeps one safe P7 record", async ({
  browser
}) => {
  test.setTimeout(240_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await resetP7History(sender);
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startP4Harness(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Reconnecting", exact: true })).toBeVisible({
    timeout: 90_000
  });
  await expect(
    sender.locator(".p8-recovery-notice").getByText("Your verified progress is safe.")
  ).toBeVisible();
  await expect(
    sender.getByRole("button", { name: /Start a new|Choose source|Try connecting/ })
  ).not.toBeVisible();
  await sender.getByText("Details").click();
  const details = await sender.locator(".p8-recovery-notice").textContent();
  expect(details).not.toContain("fs_tr_");
  expect(details).not.toContain("candidate");
  expect(details).not.toContain("127.0.0.1");
  await sender.evaluate(() => window.__flicksendP4?.resumeReconnect());
  await expect(sender.getByRole("heading", { name: "Connection restored" })).toBeVisible({
    timeout: 30_000
  });
  await expectSenderDelivered(sender);
  await sender.goto("/transfers");
  await expect(sender.locator(".p7-transfer-link")).toHaveCount(1);
  await sender.locator(".p7-transfer-link").click();
  await expect(sender.getByText(/Recovered through .* reconnection/)).toBeVisible();
  await senderContext.close();
  await receiverContext.close();
});

test("P8 explains real recipient recovery and preserves the prepared destination", async ({
  browser
}) => {
  test.setTimeout(240_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startRecipient(sender, recipient);
  await receiveToFixture(recipient);
  await expect(recipient.getByRole("heading", { name: "Reconnecting", exact: true })).toBeVisible({
    timeout: 90_000
  });
  await expect(
    recipient.locator(".p8-recovery-notice").getByText("Your verified progress is safe.")
  ).toBeVisible();
  await expect(recipient.getByTestId("receive-destination-summary")).not.toBeVisible();
  await sender.evaluate(() => window.__flicksendP4?.resumeReconnect());
  await expect(recipient.getByRole("heading", { name: "Connection restored" })).toBeVisible({
    timeout: 30_000
  });
  await expect(recipient.getByTestId("receive-completed")).toBeVisible({ timeout: 120_000 });
  await senderContext.close();
  await recipientContext.close();
});

test("P8 turns exhausted route recovery into a terminal new-send action without a spinner", async ({
  browser
}) => {
  test.setTimeout(180_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startP4Harness(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Reconnecting", exact: true })).toBeVisible({
    timeout: 90_000
  });
  await sender.evaluate(() => window.__flicksendP4?.exhaustRecovery());
  await expect(sender.getByTestId("send-terminal-error")).toContainText("Couldn't reconnect");
  await expect(sender.getByRole("button", { name: "Start a new send" })).toBeVisible();
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).not.toBeVisible();
  await senderContext.close();
  await receiverContext.close();
});

test("P8 gives source mutation a source-reselection action without a false safe-progress claim", async ({
  browser
}) => {
  test.setTimeout(240_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadMutableFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startP4Harness(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Reconnecting", exact: true })).toBeVisible({
    timeout: 90_000
  });
  await sender.evaluate(() => window.__flicksendP4?.mutateSelectedFixture());
  await sender.evaluate(() => window.__flicksendP4?.resumeReconnect());
  await expect(sender.getByTestId("send-terminal-error")).toContainText("Source changed", {
    timeout: 90_000
  });
  await expect(sender.getByText("Your verified progress is safe.")).not.toBeVisible();
  await expect(sender.getByRole("button", { name: "Choose source again" })).toBeVisible();
  await senderContext.close();
  await receiverContext.close();
});

test("P8 gives destination mutation a safe terminal explanation without overwrite or completion", async ({
  browser
}) => {
  test.setTimeout(240_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startRecipient(sender, recipient);
  await receiveToFixture(recipient);
  await expect(recipient.getByRole("heading", { name: "Reconnecting", exact: true })).toBeVisible({
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
  await expect(recipient.getByText("Your verified progress is safe.")).not.toBeVisible();
  await expect(recipient.getByTestId("receive-completed")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();
});

async function expectDestinationFault(
  browser: Browser,
  code: "FS_DESTINATION_PERMISSION_DENIED" | "FS_DESTINATION_STORAGE_FULL",
  title: string
): Promise<void> {
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    buffer: Buffer.alloc(512 * 1024, 7),
    mimeType: "video/quicktime",
    name: "destination-fault.mov"
  });
  await startRecipient(sender, recipient);
  await recipient.getByRole("button", { name: "Accept", exact: true }).click();
  await recipient.evaluate(
    (fault) => window.__flicksendP5?.configureDestinationFailure(fault),
    code
  );
  await recipient.locator(".p5-development-destination summary").click();
  await recipient.getByRole("button", { name: "Use development test destination" }).click();
  await expect(recipient.getByRole("heading", { name: title })).toBeVisible();
  await expect(recipient.getByRole("button", { name: "Choose another destination" })).toBeVisible();
  await expect(recipient.getByTestId("receive-completed")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();
}

test("P8 maps deterministic recipient permission loss to actionable copy", async ({ browser }) => {
  test.setTimeout(120_000);
  await expectDestinationFault(browser, "FS_DESTINATION_PERMISSION_DENIED", "Can't save there");
});

test("P8 maps deterministic recipient storage exhaustion to actionable copy", async ({
  browser
}) => {
  test.setTimeout(120_000);
  await expectDestinationFault(browser, "FS_DESTINATION_STORAGE_FULL", "Not enough space");
});

test("P8 shows automatic integrity checking before a successful real retry", async ({
  browser
}) => {
  test.setTimeout(180_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => {
    window.__flicksendP4?.configureIntegrityRetry();
    return window.__flicksendP4?.loadRecoveryFolderFixture();
  });
  await startP4Harness(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Checking transferred data" })).toBeVisible({
    timeout: 90_000
  });
  await expect(sender.getByText("FlickSend is checking what can continue safely.")).toBeVisible();
  await expectSenderDelivered(sender);
  await senderContext.close();
  await receiverContext.close();
});

test("P8 keeps integrity exhaustion and finalization failures terminal", async ({ browser }) => {
  test.setTimeout(180_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => {
    window.__flicksendP4?.configureIntegrityFailure();
    return window.__flicksendP4?.loadStructuralFolderFixture();
  });
  await startRecipient(sender, recipient);
  await receiveToFixture(recipient);
  await expect(recipient.getByTestId("receive-terminal-error")).toContainText(
    "Transfer couldn't be verified",
    { timeout: 120_000 }
  );
  await expect(recipient.getByText("Nothing has been marked complete.")).toBeVisible();
  await expect(recipient.getByTestId("receive-completed")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();
});

test("P8 maps finalization and service failures without raw engine detail", async ({
  browser,
  page
}) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await sender.goto("/send");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    buffer: Buffer.alloc(512 * 1024, 9),
    mimeType: "video/quicktime",
    name: "finalize.mov"
  });
  await startRecipient(sender, recipient);
  await recipient.evaluate(() => window.__flicksendP5?.configureFinalizationFailure(true));
  await receiveToFixture(recipient);
  await expect(recipient.getByTestId("receive-terminal-error")).toContainText(
    "Couldn't finish saving",
    {
      timeout: 90_000
    }
  );
  await expect(recipient.getByTestId("receive-completed")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();

  await page.goto("/send");
  await waitForP4(page);
  await selectAlex(page);
  await page.getByLabel("Source files").setInputFiles({
    buffer: Buffer.alloc(64 * 1024, 3),
    mimeType: "text/plain",
    name: "service.txt"
  });
  await page.evaluate(() => window.__flicksendP4?.failService());
  await expect(page.getByTestId("send-terminal-error")).toContainText(
    "FlickSend is temporarily unavailable"
  );
  await expect(page.getByRole("button", { name: "Start a new send" })).toBeVisible();
  const content = await page.getByTestId("send-terminal-error").textContent();
  expect(content).not.toContain("FS_ICE_NEGOTIATION_FAILED");
  expect(content).not.toContain("Error:");
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
});

test("P8 keeps explicit cancellation distinct while automatic recovery is active", async ({
  browser
}) => {
  test.setTimeout(180_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startP4Harness(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Reconnecting", exact: true })).toBeVisible({
    timeout: 90_000
  });
  await sender.getByRole("button", { name: "Cancel transfer", exact: true }).click();
  const dialog = sender.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel transfer", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Transfer canceled" })).toBeVisible();
  await expect(sender.getByTestId("send-terminal-error")).not.toBeVisible();
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).not.toBeVisible();
  await senderContext.close();
  await receiverContext.close();
});

test("P8 starts a new transfer identity after terminal recovery failure", async ({ browser }) => {
  test.setTimeout(240_000);
  const senderContext = await browser.newContext();
  const oldReceiverContext = await browser.newContext();
  const newReceiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const oldReceiver = await oldReceiverContext.newPage();
  const newReceiver = await newReceiverContext.newPage();
  await sender.goto("/send");
  await oldReceiver.goto("/p4-harness");
  await newReceiver.goto("/p4-harness");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startP4Harness(sender, oldReceiver);
  await expect(sender.getByRole("heading", { name: "Reconnecting", exact: true })).toBeVisible({
    timeout: 90_000
  });
  const failedTransferId = await sender.evaluate(
    () => window.__flicksendP4?.snapshot().activeTransferId
  );
  expect(failedTransferId).not.toBeNull();
  await sender.evaluate(() => window.__flicksendP4?.exhaustRecovery());
  await sender.getByRole("button", { name: "Start a new send" }).click();
  await sender.getByLabel("Source files").setInputFiles({
    buffer: Buffer.alloc(512 * 1024, 11),
    mimeType: "video/quicktime",
    name: "new-transfer.mov"
  });
  await expect(sender.getByRole("heading", { name: "Ready to send" })).toBeVisible();
  await startP4Harness(sender, newReceiver);
  await expect
    .poll(() => sender.evaluate(() => window.__flicksendP4?.snapshot().activeTransferId), {
      timeout: 30_000
    })
    .not.toBe(failedTransferId);
  await expectSenderDelivered(sender);
  await senderContext.close();
  await oldReceiverContext.close();
  await newReceiverContext.close();
});
