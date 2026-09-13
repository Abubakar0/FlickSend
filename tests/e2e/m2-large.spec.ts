import { expect, test } from "@playwright/test";

const sourcePath = process.env.FLICKSEND_M2_BENCHMARK_FILE;

test.skip(!sourcePath, "Set FLICKSEND_M2_BENCHMARK_FILE to run a manual large-file benchmark.");

test("streams the selected large file to the OPFS benchmark destination", async ({ browser }) => {
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();

  await sender.goto("/");
  await receiver.goto("/");
  await sender.getByRole("button", { name: "Create Session" }).click();
  const code = await sender.getByTestId("session-code").textContent();
  await receiver.getByLabel("Session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });

  await sender.getByLabel("Source file").setInputFiles(sourcePath!);
  await sender.getByRole("button", { name: "Offer File" }).click();
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("TRANSFER_BYTES_COMPLETE", {
    timeout: 1_800_000
  });
  await expect(receiver.getByTestId("transfer-status")).toContainText("TRANSFER_BYTES_COMPLETE", {
    timeout: 1_800_000
  });

  await senderContext.close();
  await receiverContext.close();
});
