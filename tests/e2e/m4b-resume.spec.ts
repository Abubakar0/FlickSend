import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

test("M4B reuses persisted receiver blocks after an actual WebRTC transport disconnect", async ({
  browser
}) => {
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const fixture = Buffer.alloc(16 * 1024 * 1024);
  for (let index = 0; index < fixture.length; index += 1) fixture[index] = (index * 31) % 251;

  await sender.goto("/");
  await receiver.goto("/");
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  const code = await sender.getByTestId("session-code").textContent();
  await receiver.getByLabel("Session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("control-state")).toHaveText("open", { timeout: 20_000 });
  await expect(receiver.getByTestId("control-state")).toHaveText("open", { timeout: 20_000 });
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });

  await sender.getByLabel("Source file").setInputFiles({
    name: "m4b-resume-fixture.bin",
    mimeType: "application/octet-stream",
    buffer: fixture
  });
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect(receiver.getByTestId("m4-recovery-metrics")).toContainText("1 / 2", {
    timeout: 60_000
  });
  const transferId = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .first()
    .textContent();
  await sender.getByRole("button", { name: "Simulate Transport Disconnect" }).click();

  await expect(sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 60_000
  });
  await expect(receiver.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 60_000
  });
  await expect(sender.getByTestId("m4-recovery-metrics")).toContainText(transferId ?? "");
  await expect(sender.getByTestId("m4-recovery-metrics").locator("dd").nth(5)).toHaveText("1");
  await expect(sender.getByTestId("m4-recovery-metrics")).toContainText("Resumed payload8.00 MiB");
  const destinationDigest = await receiver.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(name);
    const bytes = await (await handle.getFile()).arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }, "m4b-resume-fixture.bin");
  expect(destinationDigest).toBe(createHash("sha256").update(fixture).digest("hex"));

  await senderContext.close();
  await receiverContext.close();
});
