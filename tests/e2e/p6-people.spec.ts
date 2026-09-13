import { expect, test, type Page } from "@playwright/test";

async function waitForP6(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP6)), { timeout: 15_000 })
    .toBe(true);
}

async function openPeople(page: Page, personId = "dev-sender"): Promise<void> {
  await page.goto(`/people?as=${personId}`);
  await waitForP6(page);
}

async function resetPeople(page: Page): Promise<void> {
  await page.evaluate(() => window.__flicksendP6?.resetDevelopmentStore());
  await expect(page.getByTestId("people-connected-alex-morgan")).toBeVisible();
}

async function createPairingCode(page: Page): Promise<string> {
  await page.locator("#p6-connect-trigger").click();
  await page.getByRole("button", { name: "Create development pairing code" }).click();
  const code = await page.getByTestId("people-pairing-code").locator("code").textContent();
  expect(code).toMatch(/^fp-[a-f0-9]{12}$/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  return code!;
}

async function redeemPairingCode(page: Page, code: string): Promise<void> {
  await page.locator("#p6-connect-trigger").click();
  await page.getByLabel("Enter invite code").fill(code);
  await page.getByRole("button", { name: "Use pairing code" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
}

async function joinP4Harness(sender: Page, receiver: Page): Promise<void> {
  const code = await sender.getByTestId("p4-development-session-code").textContent();
  await receiver.goto("/p4-harness");
  await receiver.getByLabel("Development session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join development session" }).click();
}

test("P6 pairs two people, preselects the existing Send flow, and completes a small P4 transfer", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await openPeople(sender);
  await resetPeople(sender);
  const code = await createPairingCode(sender);
  await openPeople(recipient, "jordan-lee");
  await redeemPairingCode(recipient, code);
  await expect(recipient.getByTestId("people-incoming-dev-sender")).toBeVisible();
  await recipient
    .getByRole("button", { name: "Accept invitation from Development sender" })
    .dblclick();
  await expect(recipient.getByTestId("people-connected-dev-sender")).toBeVisible();
  await sender.evaluate(() => window.__flicksendP6?.reload());
  await expect(sender.getByTestId("people-connected-jordan-lee")).toBeVisible();

  await sender.getByRole("button", { name: "Send to Jordan Lee" }).click();
  await expect(sender).toHaveURL(/\/send\?person=jordan-lee/);
  await expect(sender.getByRole("button", { name: "Selected" })).toBeVisible();
  await sender.getByLabel("Source files").setInputFiles({
    name: "p6-small-transfer.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(64 * 1024, 6)
  });
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Jordan Lee" })).toBeVisible();
  await joinP4Harness(sender, recipient);
  await expect(sender.getByRole("heading", { name: "Sent to Jordan Lee" })).toBeVisible({
    timeout: 90_000
  });
  await expect(recipient.getByTestId("p4-harness-status")).toContainText("DELIVERED", {
    timeout: 90_000
  });
  await senderContext.close();
  await recipientContext.close();
});

test("P6 declines, deduplicates, and converges cross-invites without duplicate People rows", async ({
  browser
}) => {
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await openPeople(sender);
  await resetPeople(sender);
  const senderCode = await createPairingCode(sender);
  await expect(
    sender.evaluate(() => window.__flicksendP6?.createInvite())
  ).resolves.toBeUndefined();
  const duplicateCode = await sender.evaluate(() => window.__flicksendP6?.snapshot().inviteCode);
  expect(duplicateCode).toBe(senderCode);

  await openPeople(recipient, "jordan-lee");
  await redeemPairingCode(recipient, senderCode);
  await recipient
    .getByRole("button", { name: "Decline invitation from Development sender" })
    .click();
  await expect(recipient.getByTestId("people-incoming-dev-sender")).not.toBeVisible();
  await sender.evaluate(() => window.__flicksendP6?.reload());

  const jordanCode = await createPairingCode(recipient);
  await sender.evaluate((code) => window.__flicksendP6?.redeemInvite(code), jordanCode);
  await expect(sender.getByTestId("people-incoming-jordan-lee")).toBeVisible();
  const secondSenderCode = await createPairingCode(sender);
  await recipient.evaluate((code) => window.__flicksendP6?.redeemInvite(code), secondSenderCode);
  await expect(recipient.getByTestId("people-connected-dev-sender")).toBeVisible();
  await sender.evaluate(() => window.__flicksendP6?.reload());
  await expect(sender.getByTestId("people-connected-jordan-lee")).toBeVisible();
  expect(await sender.getByTestId("people-connected-jordan-lee").count()).toBe(1);
  await senderContext.close();
  await recipientContext.close();
});

test("P6 keeps remove, block, unblock, and blocked Send eligibility distinct", async ({ page }) => {
  await openPeople(page);
  await resetPeople(page);
  await page.getByRole("button", { name: "Manage Alex Morgan" }).click();
  await page.getByRole("button", { name: "Remove connection" }).click();
  await page.getByRole("button", { name: "Remove Alex Morgan" }).click();
  await expect(page.getByTestId("people-connected-alex-morgan")).not.toBeVisible();

  await page.evaluate(() => window.__flicksendP6?.resetDevelopmentStore());
  await expect(page.getByTestId("people-connected-alex-morgan")).toBeVisible();
  await page.getByRole("button", { name: "Manage Alex Morgan" }).click();
  await page.getByRole("button", { name: "Block person" }).click();
  await page.getByRole("button", { name: "Block Alex Morgan" }).click();
  await expect(page.getByTestId("people-blocked-alex-morgan")).toBeVisible();

  await page.goto("/send?as=dev-sender&person=alex-morgan");
  await expect(page.getByRole("button", { name: "Send to Alex Morgan" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Selected" })).not.toBeVisible();

  await openPeople(page);
  await page.getByRole("button", { name: "Unblock Alex Morgan" }).click();
  await expect(page.getByTestId("people-blocked-alex-morgan")).not.toBeVisible();
  await page.evaluate(() => window.__flicksendP6?.resetDevelopmentStore());
});

test("P6 rejects self and invalid pairing codes with generic, metadata-free product errors", async ({
  page
}) => {
  await openPeople(page);
  await resetPeople(page);
  const ownCode = await createPairingCode(page);
  await page.locator("#p6-connect-trigger").click();
  await page.getByLabel("Enter invite code").fill(ownCode);
  await page.getByRole("button", { name: "Use pairing code" }).click();
  await expect(
    page.getByRole("heading", { name: "You can't connect with yourself" })
  ).toBeVisible();

  await openPeople(page, "taylor-chen");
  await redeemPairingCode(page, "fp-invalid");
  await expect(
    page.getByRole("heading", { name: "That invitation isn't available" })
  ).toBeVisible();
  await expect(page.getByText("Alex Morgan")).not.toBeVisible();
  await expect(page.getByText("Development sender")).not.toBeVisible();
});

test("P6 People remains keyboard-operable and responsive with an unknown-presence long name", async ({
  browser
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await openPeople(second);
  await resetPeople(second);
  await openPeople(first, "elodie-van-der-berg-luczak");
  const code = await createPairingCode(first);
  await redeemPairingCode(second, code);
  await second
    .getByRole("button", { name: "Accept invitation from Elodie van der Berg-Luczak" })
    .click();
  await expect(second.getByTestId("people-connected-elodie-van-der-berg-luczak")).toBeVisible();

  const connect = second.getByRole("button", { name: "Connect with someone" });
  await connect.focus();
  await expect(connect).toBeFocused();
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await second.setViewportSize({ width, height: 960 });
    await expect
      .poll(() => second.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
  await firstContext.close();
  await secondContext.close();
});

test("P6 relationship changes do not mutate an already authorized P4 transfer", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const people = await senderContext.newPage();
  await openPeople(people);
  await resetPeople(people);
  await sender.goto("/send?as=dev-sender");
  await sender.getByRole("button", { name: "Send to Alex Morgan" }).click();
  await sender.getByLabel("Source files").setInputFiles({
    name: "p6-active-transfer.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(64 * 1024, 19)
  });
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Alex Morgan" })).toBeVisible();

  await people.getByRole("button", { name: "Manage Alex Morgan" }).click();
  await people.getByRole("button", { name: "Block person" }).click();
  await people.getByRole("button", { name: "Block Alex Morgan" }).click();
  await expect(people.getByTestId("people-blocked-alex-morgan")).toBeVisible();
  await joinP4Harness(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).toBeVisible({
    timeout: 90_000
  });
  await senderContext.close();
  await receiverContext.close();
});
