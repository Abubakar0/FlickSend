import { expect, test } from "@playwright/test";

test("M5 browser WebRTC repairs one corrupted block and verifies delivery", async ({ browser }) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const fixture = Buffer.alloc(8 * 1024 * 1024, 0x5a);
  await sender.goto("/");
  await receiver.goto("/");
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  const code = await sender.getByTestId("session-code").textContent();
  await receiver.getByLabel("Session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByLabel("Integrity fault", { exact: true }).selectOption("payload");
  await sender.getByLabel("Integrity fault block").fill("0");
  await sender.getByRole("button", { name: "Apply Integrity Fault" }).click();
  await sender.getByLabel("Source file").setInputFiles({
    name: "m5-corrupt.bin",
    mimeType: "application/octet-stream",
    buffer: fixture
  });
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 90_000
  });
  await expect(receiver.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 90_000
  });
  await expect(sender.getByTestId("m5-integrity-metrics")).toContainText("Integrity retries1");
  await expect(sender.getByTestId("m5-integrity-metrics")).toContainText("Mismatches1");
  await senderContext.close();
  await receiverContext.close();
});

test("M5 browser WebRTC rejects a manifest root mismatch", async ({ browser }) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/");
  await receiver.goto("/");
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  const code = await sender.getByTestId("session-code").textContent();
  await receiver.getByLabel("Session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByLabel("Integrity fault", { exact: true }).selectOption("manifestRoot");
  await sender.getByRole("button", { name: "Apply Integrity Fault" }).click();
  await sender.getByLabel("Source file").setInputFiles({
    name: "m5-root.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(8 * 1024 * 1024, 0x7f)
  });
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("INTEGRITY_FAILED", {
    timeout: 90_000
  });
  await expect(receiver.getByTestId("transfer-error")).toContainText(
    "FS_MANIFEST_INTEGRITY_FAILED"
  );
  await senderContext.close();
  await receiverContext.close();
});

test("M5 browser WebRTC fails after permanent block corruption exhausts retries", async ({
  browser
}) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/");
  await receiver.goto("/");
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  const code = await sender.getByTestId("session-code").textContent();
  await receiver.getByLabel("Session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByLabel("Integrity fault", { exact: true }).selectOption("payload");
  await sender.getByLabel("Integrity fault block").fill("0");
  await sender.getByLabel("Integrity fault mode").selectOption("always");
  await sender.getByRole("button", { name: "Apply Integrity Fault" }).click();
  await sender.getByLabel("Source file").setInputFiles({
    name: "m5-terminal.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(8 * 1024 * 1024, 0x63)
  });
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("INTEGRITY_FAILED", {
    timeout: 90_000
  });
  await expect(sender.getByTestId("transfer-error")).toContainText("FS_BLOCK_INTEGRITY_FAILED");
  await senderContext.close();
  await receiverContext.close();
});
