import { expect, test } from "@playwright/test";
import { basename } from "node:path";

const sourcePath = process.env.FLICKSEND_M5_BENCHMARK_FILE;
const expectedBytes = Number(process.env.FLICKSEND_M5_EXPECTED_BYTES ?? 1024 * 1024 * 1024);
const blockBytes = 8 * 1024 * 1024;

async function matchesFixture(
  page: import("@playwright/test").Page,
  name: string
): Promise<boolean> {
  return page.evaluate(
    async ({ name, expectedBytes, blockBytes }) => {
      const file = await (
        await (await navigator.storage.getDirectory()).getFileHandle(name)
      ).getFile();
      if (file.size !== expectedBytes) return false;
      for (let offset = 0; offset < file.size; offset += blockBytes) {
        const bytes = await file.slice(offset, offset + blockBytes).arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const actual = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("");
        const expected = new Uint8Array(bytes.byteLength);
        for (let index = 0; index < expected.length; index += 1)
          expected[index] = (offset + index) % 251;
        const expectedDigest = await crypto.subtle.digest("SHA-256", expected);
        const expectedHex = Array.from(new Uint8Array(expectedDigest), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("");
        if (actual !== expectedHex) return false;
      }
      return true;
    },
    { name, expectedBytes, blockBytes }
  );
}

async function connected(browser: import("@playwright/test").Browser) {
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/");
  await receiver.goto("/");
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  await receiver
    .getByLabel("Session code")
    .fill((await sender.getByTestId("session-code").textContent()) ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  return { senderContext, receiverContext, sender, receiver };
}

test.skip(
  !sourcePath,
  "Set FLICKSEND_M5_BENCHMARK_FILE to the deterministic indexed 1 GiB fixture."
);

test("M5 normal 1 GiB browser/WebRTC qualification", async ({ browser }) => {
  test.setTimeout(1_800_000);
  const { senderContext, receiverContext, sender, receiver } = await connected(browser);
  await sender.getByLabel("Source file").setInputFiles(sourcePath!);
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 1_800_000
  });
  const destinationMatches = await matchesFixture(receiver, basename(sourcePath!));
  expect(destinationMatches).toBe(true);
  console.log(
    "M5_1G_NORMAL=" +
      JSON.stringify({
        sender: await sender.getByTestId("m5-integrity-metrics").locator("dd").allTextContents(),
        receiver: await receiver
          .getByTestId("m5-integrity-metrics")
          .locator("dd")
          .allTextContents(),
        destinationMatches
      })
  );
  await senderContext.close();
  await receiverContext.close();
});

test("M5 1 GiB browser/WebRTC resume at about 50 percent", async ({ browser }) => {
  test.setTimeout(1_800_000);
  const { senderContext, receiverContext, sender, receiver } = await connected(browser);
  await sender.getByLabel("Source file").setInputFiles(sourcePath!);
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect
    .poll(
      async () =>
        Number(
          (
            (await receiver
              .getByTestId("m4-recovery-metrics")
              .locator("dd")
              .nth(2)
              .textContent()) ?? ""
          ).replace(/[^0-9]/g, "")
        ),
      { timeout: 1_800_000 }
    )
    .toBeGreaterThanOrEqual(expectedBytes / 2);
  const transferId = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .first()
    .textContent();
  await sender.getByRole("button", { name: "Simulate Transport Disconnect" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 1_800_000
  });
  const destinationMatches = await matchesFixture(receiver, basename(sourcePath!));
  expect(destinationMatches).toBe(true);
  console.log(
    "M5_1G_RESUME=" +
      JSON.stringify({
        transferIdStable:
          transferId ===
          (await sender.getByTestId("m4-recovery-metrics").locator("dd").first().textContent()),
        senderRecovery: await sender
          .getByTestId("m4-recovery-metrics")
          .locator("dd")
          .allTextContents(),
        senderIntegrity: await sender
          .getByTestId("m5-integrity-metrics")
          .locator("dd")
          .allTextContents(),
        destinationMatches
      })
  );
  await senderContext.close();
  await receiverContext.close();
});
