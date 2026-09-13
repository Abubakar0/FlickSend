import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function expectNoAxeViolations(page: Page, state: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        failureSummary: node.failureSummary,
        target: node.target
      }))
    })),
    `axe violations in ${state}`
  ).toEqual([]);
}

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

async function selectAlex(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Send to Alex Morgan" }).click();
  await expect(page.getByRole("button", { name: "Selected" })).toBeVisible();
}

async function prepareSender(sender: Page, bytes = Buffer.alloc(128 * 1024, 17)): Promise<void> {
  await sender.goto("/send");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    buffer: bytes,
    mimeType: "application/octet-stream",
    name: "p9-qualified-fixture.bin"
  });
  await expect(sender.getByRole("heading", { name: "Ready to send" })).toBeVisible();
}

async function startSender(sender: Page): Promise<string> {
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Alex Morgan" })).toBeVisible();
  return (await sender.getByTestId("p4-development-session-code").textContent())?.trim() ?? "";
}

async function openRecipient(sender: Page, recipient: Page): Promise<void> {
  const code = await startSender(sender);
  await recipient.goto(`/receive/${code.replace(/\s/g, "")}`);
  await waitForP5(recipient);
  await expect(recipient.getByTestId("receive-review")).toBeVisible({ timeout: 30_000 });
}

async function chooseDevelopmentDestination(recipient: Page): Promise<void> {
  await recipient.locator(".p5-development-destination summary").click();
  await recipient.getByRole("button", { name: "Use development test destination" }).click();
  await expect(recipient.getByTestId("receive-destination-summary")).toBeVisible();
}

async function joinHarness(sender: Page, harness: Page): Promise<void> {
  const code = await startSender(sender);
  await joinHarnessWithCode(harness, code);
}

async function joinHarnessWithCode(harness: Page, code: string): Promise<void> {
  await harness.goto("/p4-harness");
  await harness.getByLabel("Development session code").fill(code);
  await harness.getByRole("button", { name: "Join development session" }).click();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

async function seedP9TransferRecord(page: Page): Promise<string> {
  const recordId = await page.evaluate(async () => {
    const response = await fetch("/api/development/transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: {
          active: null,
          deliveryConfirmed: true,
          direction: "sent",
          failureCategory: null,
          fileCount: 1,
          folderCount: 0,
          lifecycleKey: "p7-p9-keyboard-transfer-record",
          peerPersonId: null,
          productStatus: "COMPLETED",
          sourceKind: "single_file",
          speedProof: null,
          totalBytes: 128 * 1024
        },
        operation: "RECORD",
        person: "dev-sender"
      })
    });
    const body = (await response.json()) as { record?: { recordId?: string } };
    return body.record?.recordId ?? null;
  });
  expect(recordId).not.toBeNull();
  return recordId!;
}

test("P9 axe scans stable Send, People, Transfers, and design-system states", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/send");
  await expectNoAxeViolations(page, "Send empty");
  await selectAlex(page);
  await expectNoAxeViolations(page, "Send recipient selected");
  await page.getByRole("button", { name: "Light" }).click();
  await expectNoAxeViolations(page, "Send recipient selected in light theme");
  await page.getByRole("button", { name: "Dark" }).click();
  await expectNoAxeViolations(page, "Send recipient selected in dark theme");
  await page.getByLabel("Source files").setInputFiles({
    buffer: Buffer.alloc(64 * 1024, 7),
    mimeType: "application/octet-stream",
    name: "p9-review-fixture.bin"
  });
  await expect(page.getByRole("heading", { name: "Ready to send" })).toBeVisible();
  await expectNoAxeViolations(page, "Send review");

  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  await expectNoAxeViolations(page, "People connected and empty states");
  await page.getByRole("button", { name: "Connect with someone" }).click();
  await expect(page.getByRole("dialog", { name: "Connect with someone" })).toBeVisible();
  await expectNoAxeViolations(page, "People connect dialog");
  await page.keyboard.press("Escape");

  await page.goto("/transfers");
  await expect(page.getByRole("heading", { name: "Transfers" })).toBeVisible();
  await expectNoAxeViolations(page, "Transfers empty state");

  await page.goto("/design-system");
  await expectNoAxeViolations(page, "Design-system showcase");
  expect(pageErrors).toEqual([]);
});

test("P9 axe scans authorized recipient review and prepared destination states", async ({
  browser
}) => {
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await prepareSender(sender);
  await openRecipient(sender, recipient);
  await expectNoAxeViolations(recipient, "Receive review");
  await recipient.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(recipient.getByRole("heading", { name: "Choose where to save" })).toBeVisible();
  await expectNoAxeViolations(recipient, "Receive choose destination");
  await chooseDevelopmentDestination(recipient);
  await expectNoAxeViolations(recipient, "Receive destination ready");
  await senderContext.close();
  await recipientContext.close();
});

test("P9 exposes recovery, terminal errors, and completion with stable accessible semantics", async ({
  browser
}) => {
  test.setTimeout(180_000);
  const senderContext = await browser.newContext();
  const harnessContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const harness = await harnessContext.newPage();
  await sender.goto("/send");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await joinHarness(sender, harness);
  await expect(sender.getByRole("heading", { name: "Reconnecting…" })).toBeVisible({
    timeout: 45_000
  });
  await expect(sender.locator(".p4-sr-status")).toHaveAttribute("aria-live", "polite");
  await expect(sender.locator(".p4-sr-status")).toHaveAttribute("aria-atomic", "true");
  await expect(sender.getByRole("status").filter({ hasText: "Reconnecting" })).toBeVisible();
  const details = sender.locator(".p8-recovery-notice summary");
  await details.focus();
  await sender.keyboard.press("Enter");
  await expect(details.locator("..")).toHaveAttribute("open", "");
  await expectNoAxeViolations(sender, "Send automatic recovery");
  await sender.evaluate(() => window.__flicksendP4?.resumeReconnect());
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).toBeVisible({
    timeout: 90_000
  });
  await expectNoAxeViolations(sender, "Send completed");
  await senderContext.close();
  await harnessContext.close();

  const terminalSenderContext = await browser.newContext();
  const terminalHarnessContext = await browser.newContext();
  const terminalSender = await terminalSenderContext.newPage();
  const terminalHarness = await terminalHarnessContext.newPage();
  await terminalSender.goto("/send");
  await waitForP4(terminalSender);
  await selectAlex(terminalSender);
  await terminalSender.evaluate(() => {
    window.__flicksendP4?.configureIntegrityFailure();
    return window.__flicksendP4?.loadStructuralFolderFixture();
  });
  await joinHarness(terminalSender, terminalHarness);
  await expect(terminalSender.getByTestId("send-terminal-error")).toBeVisible({ timeout: 90_000 });
  await expectNoAxeViolations(terminalSender, "Send terminal error");
  await terminalSenderContext.close();
  await terminalHarnessContext.close();
});

test("P9 verifies keyboard Send flow and terminal focus without requiring the native picker", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const harnessContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const harness = await harnessContext.newPage();
  await sender.goto("/send");
  await waitForP4(sender);
  const recipient = sender.getByRole("button", { name: "Send to Alex Morgan" });
  await recipient.focus();
  await sender.keyboard.press("Enter");
  await expect(sender.getByRole("button", { name: "Selected" })).toBeVisible();
  await sender.evaluate(() => window.__flicksendP4?.configureIntegrityFailure());
  await sender.evaluate(() => window.__flicksendP4?.loadStructuralFolderFixture());
  const send = sender.getByRole("button", { name: "Send", exact: true });
  await send.focus();
  await sender.keyboard.press("Enter");
  const code =
    (await sender.getByTestId("p4-development-session-code").textContent())?.trim() ?? "";
  await joinHarnessWithCode(harness, code);
  const terminal = sender.getByTestId("send-terminal-error");
  await expect(terminal).toBeVisible({ timeout: 90_000 });
  await expect(terminal).toBeFocused();
  const restart = sender.getByRole("button", { name: "Start a new send" });
  await restart.focus();
  await sender.keyboard.press("Enter");
  await expect(sender.getByRole("heading", { name: "Send a file or folder" })).toBeVisible();
  await senderContext.close();
  await harnessContext.close();
});

test("P9 verifies keyboard Receive flow and completion focus", async ({ browser }) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  const payload = Buffer.alloc(512 * 1024, 11);
  await prepareSender(sender, payload);
  await openRecipient(sender, recipient);
  const accept = recipient.getByRole("button", { name: "Accept", exact: true });
  await accept.focus();
  await recipient.keyboard.press("Enter");
  await expect(recipient.getByRole("heading", { name: "Choose where to save" })).toBeVisible();
  await chooseDevelopmentDestination(recipient);
  const receive = recipient.getByRole("button", { name: "Receive", exact: true });
  await receive.focus();
  await recipient.keyboard.press("Enter");
  const completed = recipient.getByTestId("receive-completed").locator("..");
  await expect(completed).toBeVisible({ timeout: 90_000 });
  await expect(completed).toBeFocused();
  expect(await recipient.evaluate(() => window.__flicksendP5?.fixtureFileDigest())).toBe(
    sha256(payload)
  );
  await senderContext.close();
  await recipientContext.close();
});

test("P9 verifies dialog focus, Escape restoration, and People keyboard management", async ({
  page
}) => {
  await page.goto("/people");
  const connect = page.getByRole("button", { name: "Connect with someone" });
  await connect.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Connect with someone" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(connect).toBeFocused();

  const manage = page.getByRole("button", { name: "Manage Alex Morgan" });
  await manage.focus();
  await page.keyboard.press("Enter");
  const management = page.getByRole("dialog", { name: "Alex Morgan" });
  await expect(management).toBeVisible();
  const block = management.getByRole("button", { name: "Block person" });
  await block.focus();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("alertdialog", { name: "Block Alex Morgan?" });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(management).not.toBeVisible();
  await expect(manage).toBeFocused();
});

test("P9 verifies keyboard Transfers filters, detail navigation, reflow, zoom, and reduced motion", async ({
  page
}) => {
  await page.goto("/transfers");
  const recordId = await seedP9TransferRecord(page);
  await page.goto("/transfers");
  const sent = page.getByRole("button", { name: "Sent", exact: true });
  await sent.focus();
  await page.keyboard.press("Enter");
  await expect(sent).toHaveAttribute("aria-pressed", "true");
  const recordLink = page.getByRole("link", { name: "Sent to Unknown person" });
  await expect(recordLink).toBeVisible();
  await recordLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/transfers/${recordId}`));
  await expect(
    page.getByRole("heading", { name: "Transfer with Unknown person", exact: true })
  ).toBeVisible();
  const back = page.getByRole("link", { name: "Back to transfers" });
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Transfers", exact: true })).toBeVisible();

  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });

  await page.goto("/design-system");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.locator(".fs-progress--indeterminate").evaluate((element) => {
      return getComputedStyle(element, "::after").animationDuration;
    })
  ).toBe("0.001s");
});
