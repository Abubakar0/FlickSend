import { expect, test, type Page } from "@playwright/test";

type RecordView = {
  direction: "sent" | "received";
  failureCategory: string | null;
  productStatus: string;
  recordId: string;
  speedProof: { reconnectCount: number } | null;
};

const alexButton = "Send to Alex Morgan";

async function waitForP7(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP7)), { timeout: 15_000 })
    .toBe(true);
}

async function waitForP4(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__flicksendP4)), { timeout: 15_000 })
    .toBe(true);
}

async function resetDevelopmentStores(page: Page): Promise<void> {
  await page.goto("/transfers");
  await waitForP7(page);
  await page.evaluate(async () => {
    await window.__flicksendP7?.resetDevelopmentStore();
    await window.__flicksendP6?.resetDevelopmentStore();
  });
  await expect.poll(() => records(page, "dev-sender")).toEqual([]);
}

async function records(page: Page, person = "dev-sender"): Promise<RecordView[]> {
  return page.evaluate(async (personId) => {
    const response = await fetch(
      `/api/development/transfers?person=${encodeURIComponent(personId)}`
    );
    const body = (await response.json()) as { records?: RecordView[] };
    return body.records ?? [];
  }, person);
}

async function connectLongNameFixture(page: Page): Promise<void> {
  const response = await page.evaluate(async () => {
    const create = await fetch("/api/development/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "p7-long-name-creator",
        operation: "CREATE_INVITE",
        personId: "elodie-van-der-berg-luczak",
        revision: 1
      })
    });
    const created = (await create.json()) as { inviteCode?: string; ok: boolean };
    const redeem = await fetch("/api/development/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "p7-long-name-redeemer",
        code: created.inviteCode,
        operation: "REDEEM_INVITE",
        personId: "dev-sender",
        revision: 1
      })
    });
    const accept = await fetch("/api/development/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "p7-long-name-redeemer",
        operation: "ACCEPT",
        personId: "dev-sender",
        revision: 2,
        targetPersonId: "elodie-van-der-berg-luczak"
      })
    });
    return { accepted: accept.ok, created: created.ok, redeemed: redeem.ok };
  });
  expect(response).toEqual({ accepted: true, created: true, redeemed: true });
}

async function seedLargeSafeRecord(page: Page): Promise<string> {
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
          fileCount: 23_421,
          folderCount: 1,
          lifecycleKey: "p7-responsive-fixture",
          peerPersonId: "elodie-van-der-berg-luczak",
          productStatus: "COMPLETED",
          sourceKind: "folder",
          speedProof: {
            averagePayloadSpeedBps: 42_000_000,
            bottleneckConfidence: "MEDIUM",
            dominantBottleneck: "INSUFFICIENT_DATA",
            durationMs: 10 * 60 * 60 * 1000,
            integrityRetryCount: 0,
            measurementAvailability: {},
            payloadBytes: 184_000_000_000,
            peakPayloadSpeedBps: 83_000_000,
            reconnectCount: 999,
            routeChangeCount: 1,
            routeSegments: [{ averagePayloadSpeedBps: 42_000_000, route: "Direct" }],
            stallCount: 2,
            stalledDurationMs: 90_000
          },
          totalBytes: 184_000_000_000
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

async function selectAlex(sender: Page): Promise<void> {
  await sender.getByRole("button", { name: alexButton }).click();
  await expect(sender.getByRole("button", { name: "Selected" })).toBeVisible();
}

async function startAndOpenP4Harness(sender: Page, receiver: Page): Promise<void> {
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Alex Morgan" })).toBeVisible();
  const code = await sender.getByTestId("p4-development-session-code").textContent();
  await receiver.getByLabel("Development session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join development session" }).click();
}

async function openP5Recipient(sender: Page, recipient: Page): Promise<void> {
  await sender.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sender.getByRole("heading", { name: "Waiting for Alex Morgan" })).toBeVisible();
  const code = await sender.getByTestId("p4-development-session-code").textContent();
  await recipient.goto(`/receive/${(code ?? "").replace(/\s/g, "")}`);
  await expect(recipient.getByTestId("receive-review")).toBeVisible({ timeout: 30_000 });
  await recipient.getByRole("button", { name: "Accept", exact: true }).click();
  await recipient.locator(".p5-development-destination summary").click();
  await recipient.getByRole("button", { name: "Use development test destination" }).click();
  await recipient.getByRole("button", { name: "Receive", exact: true }).click();
}

test("P7 records a real P4 transfer as active then one verified metadata-only completion", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const observerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const observer = await observerContext.newPage();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await resetDevelopmentStores(observer);
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await selectAlex(sender);
  const privateName = "PRIVATE-HISTORY-NAME-MUST-NOT-PERSIST.mov";
  await sender.getByLabel("Source files").setInputFiles({
    name: privateName,
    mimeType: "video/quicktime",
    buffer: Buffer.alloc(16 * 1024 * 1024, 31)
  });
  await startAndOpenP4Harness(sender, receiver);
  await expect.poll(() => records(observer)).toHaveLength(1);
  await observer.reload();
  await expect(observer.getByRole("heading", { name: "Active" })).toBeVisible();
  await observer.close();
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).toBeVisible({
    timeout: 90_000
  });
  const [record] = await records(sender);
  expect(record?.productStatus).toBe("COMPLETED");
  expect(record?.direction).toBe("sent");
  expect(record?.speedProof).not.toBeNull();
  const serialized = JSON.stringify(await records(sender));
  expect(serialized).not.toContain(privateName);
  expect(serialized).not.toContain("p4-");
  await sender.goto(`/transfers/${record?.recordId}`);
  await expect(sender.getByRole("heading", { name: "Transfer with Alex Morgan" })).toBeVisible();
  await expect(sender.getByText(privateName)).not.toBeVisible();
  await expect(sender.getByRole("heading", { name: "SpeedProof" })).toBeVisible();
  await sender.getByRole("link", { name: "Send again" }).click();
  await expect(sender.getByRole("button", { name: "Selected" })).toBeVisible();
  await expect(sender.getByTestId("send-source-summary")).not.toBeVisible();
  await senderContext.close();
  await receiverContext.close();
  await observerContext.close();
});

test("P7 records a real P5 receipt with a safe current People resolution", async ({ browser }) => {
  test.setTimeout(150_000);
  const observerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const observer = await observerContext.newPage();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await resetDevelopmentStores(observer);
  await sender.goto("/send");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    name: "receiver-private-name.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.alloc(2 * 1024 * 1024, 17)
  });
  await openP5Recipient(sender, recipient);
  await expect(recipient.getByTestId("receive-completed")).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => records(observer, "alex-morgan")).toHaveLength(1);
  const [record] = await records(observer, "alex-morgan");
  expect(record?.direction).toBe("received");
  expect(record?.productStatus).toBe("COMPLETED");
  await recipient.goto(`/transfers/${record?.recordId}?as=alex-morgan`);
  await expect(
    recipient.getByRole("heading", { name: "Transfer with Development sender" })
  ).toBeVisible();
  await expect(recipient.getByText("Download again")).not.toBeVisible();
  await senderContext.close();
  await recipientContext.close();
  await observerContext.close();
});

test("P7 keeps recovery on one record and freezes its SpeedProof reconnect count", async ({
  browser
}) => {
  test.setTimeout(180_000);
  const observerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const observer = await observerContext.newPage();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await resetDevelopmentStores(observer);
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await sender.evaluate(() => window.__flicksendP4?.interruptAfterVerifiedProgress());
  await startAndOpenP4Harness(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Reconnecting…" })).toBeVisible({
    timeout: 45_000
  });
  await expect.poll(() => records(observer)).toHaveLength(1);
  await sender.evaluate(() => window.__flicksendP4?.resumeReconnect());
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).toBeVisible({
    timeout: 90_000
  });
  await expect.poll(() => records(observer)).toHaveLength(1);
  const [record] = await records(observer);
  expect(record?.productStatus).toBe("COMPLETED");
  expect(record?.speedProof?.reconnectCount).toBeGreaterThanOrEqual(1);
  await senderContext.close();
  await receiverContext.close();
  await observerContext.close();
});

test("P7 retains a safe failed outcome without treating it as completed", async ({ browser }) => {
  test.setTimeout(180_000);
  const observerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const observer = await observerContext.newPage();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await resetDevelopmentStores(observer);
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => {
    window.__flicksendP4?.configureIntegrityFailure();
    return window.__flicksendP4?.loadStructuralFolderFixture();
  });
  await startAndOpenP4Harness(sender, receiver);
  await expect(sender.getByTestId("send-terminal-error")).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => records(observer)).toHaveLength(1);
  const [failed] = await records(observer);
  expect(failed).toMatchObject({ failureCategory: "INTEGRITY", productStatus: "FAILED" });
  expect(failed?.productStatus).not.toBe("COMPLETED");
  await senderContext.close();
  await receiverContext.close();
  await observerContext.close();
});

test("P7 records a real P5 cancellation as canceled, not failed or completed", async ({
  browser
}) => {
  test.setTimeout(180_000);
  const observerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const observer = await observerContext.newPage();
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  await resetDevelopmentStores(observer);
  await sender.goto("/send");
  await waitForP4(sender);
  await selectAlex(sender);
  await sender.evaluate(() => window.__flicksendP4?.loadRecoveryFolderFixture());
  await openP5Recipient(sender, recipient);
  await expect(recipient.getByTestId("receive-active-transfer")).toBeVisible({ timeout: 30_000 });
  await recipient.getByRole("button", { name: "Cancel transfer" }).click();
  await recipient.getByRole("alertdialog").getByRole("button", { name: "Cancel transfer" }).click();
  await expect(recipient.getByTestId("receive-canceled")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => records(observer, "alex-morgan")).toHaveLength(1);
  const [canceled] = await records(observer, "alex-morgan");
  expect(canceled).toMatchObject({ failureCategory: null, productStatus: "CANCELED" });
  await senderContext.close();
  await recipientContext.close();
  await observerContext.close();
});

test("P7 Transfers stays keyboard-operable and responsive with large safe metadata", async ({
  page
}) => {
  await resetDevelopmentStores(page);
  await connectLongNameFixture(page);
  const recordId = await seedLargeSafeRecord(page);
  await page.goto("/transfers");
  await expect(page.getByText("Sent to Elodie van der Berg-Luczak")).toBeVisible();
  await expect(page.getByText("23,421 files").first()).toBeVisible();
  const sentFilter = page.getByRole("button", { name: "Sent", exact: true });
  await sentFilter.focus();
  await page.keyboard.press("Enter");
  await expect(sentFilter).toHaveAttribute("aria-pressed", "true");
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
  await page.goto(`/transfers/${recordId}`);
  await expect(page.getByText("184 GB")).toBeVisible();
  await expect(page.getByText("23,421 files").first()).toBeVisible();
  await expect(page.getByText("10h")).toBeVisible();
  await expect(page.getByText("999", { exact: true })).toBeVisible();
  await expect(page.getByText("Not enough information")).toBeVisible();
});

test("P7 preserves history after People removal and blocks Send again after People blocking", async ({
  browser
}) => {
  test.setTimeout(150_000);
  const observerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const observer = await observerContext.newPage();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await resetDevelopmentStores(observer);
  await sender.goto("/send");
  await receiver.goto("/p4-harness");
  await selectAlex(sender);
  await sender.getByLabel("Source files").setInputFiles({
    name: "history-retained.mov",
    mimeType: "video/quicktime",
    buffer: Buffer.alloc(512 * 1024, 7)
  });
  await startAndOpenP4Harness(sender, receiver);
  await expect(sender.getByRole("heading", { name: "Sent to Alex Morgan" })).toBeVisible({
    timeout: 90_000
  });
  const [record] = await records(sender);
  await sender.goto("/people");
  await sender.getByLabel("Manage Alex Morgan").click();
  await sender.getByRole("button", { name: "Remove connection" }).click();
  await sender.getByRole("alertdialog").getByRole("button", { name: "Remove Alex Morgan" }).click();
  await sender.goto(`/transfers/${record?.recordId}`);
  await expect(
    sender.getByRole("heading", { name: "Transfer with Former connection" })
  ).toBeVisible();
  await expect(sender.getByRole("link", { name: "Send again" })).not.toBeVisible();
  await sender.evaluate(async () => window.__flicksendP6?.resetDevelopmentStore());
  await sender.goto("/people");
  await sender.getByLabel("Manage Alex Morgan").click();
  await sender.getByRole("button", { name: "Block person" }).click();
  await sender.getByRole("alertdialog").getByRole("button", { name: "Block Alex Morgan" }).click();
  await sender.goto(`/transfers/${record?.recordId}`);
  await expect(sender.getByRole("link", { name: "Send again" })).not.toBeVisible();
  expect(await records(sender)).toHaveLength(1);
  await senderContext.close();
  await receiverContext.close();
  await observerContext.close();
});
