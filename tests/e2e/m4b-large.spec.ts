import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const sourcePath = process.env.FLICKSEND_M4B_BENCHMARK_FILE;
const disconnectPercent = Number(process.env.FLICKSEND_M4B_DISCONNECT_PERCENT ?? "0");
const gibibyte = 1024 * 1024 * 1024;
const qualificationBytes = Number(process.env.FLICKSEND_M4B_EXPECTED_BYTES ?? gibibyte);
const supportedQualificationSizes = new Set([gibibyte, 10 * gibibyte]);
const fixtureMode = process.env.FLICKSEND_M4B_FIXTURE_MODE ?? "zero";
const validationBlockBytes = 8 * 1024 * 1024;
const validationConcurrency = 4;
const zeroBlockSha256 = createHash("sha256")
  .update(Buffer.alloc(validationBlockBytes))
  .digest("hex");

function indexedBytePatternHash(offset: number, length: number): string {
  const bytes = Buffer.allocUnsafe(length);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (offset + index) % 251;
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedBlockHashes(): string[] {
  const hashes: string[] = [];
  for (let offset = 0; offset < qualificationBytes; offset += validationBlockBytes) {
    const length = Math.min(validationBlockBytes, qualificationBytes - offset);
    hashes.push(fixtureMode === "zero" ? zeroBlockSha256 : indexedBytePatternHash(offset, length));
  }
  return hashes;
}

test.skip(
  !sourcePath ||
    ![10, 50, 90].includes(disconnectPercent) ||
    !supportedQualificationSizes.has(qualificationBytes) ||
    !["zero", "indexed-byte-pattern-v1"].includes(fixtureMode),
  "Set a 1 or 10 GiB supported fixture, expected byte size, and 10/50/90% interruption point for M4B qualification."
);

test("resumes a real browser transfer after a controlled transport disconnect", async ({
  browser
}) => {
  test.setTimeout(1_800_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const targetSafeBytes = Math.floor((qualificationBytes * disconnectPercent) / 100);
  const completionTimeout = qualificationBytes === gibibyte ? 300_000 : 1_800_000;
  const destinationName = basename(sourcePath!);

  await sender.goto("/");
  await receiver.goto("/");
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  const code = await sender.getByTestId("session-code").textContent();
  await receiver.getByLabel("Session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });

  await sender.getByLabel("Source file").setInputFiles(sourcePath!);
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect
    .poll(
      async () => {
        const safe = await receiver
          .getByTestId("m4-recovery-metrics")
          .locator("dd")
          .nth(2)
          .textContent();
        return Number((safe ?? "").replace(/[^0-9]/g, ""));
      },
      { timeout: 1_800_000 }
    )
    .toBeGreaterThanOrEqual(targetSafeBytes);

  const beforeDisconnect = await receiver
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .allTextContents();
  const transferId = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .first()
    .textContent();
  await sender.getByRole("button", { name: "Simulate Transport Disconnect" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("TRANSFER_BYTES_COMPLETE", {
    timeout: completionTimeout
  });
  await expect(receiver.getByTestId("transfer-status")).toContainText("TRANSFER_BYTES_COMPLETE", {
    timeout: completionTimeout
  });
  await expect(sender.getByTestId("m4-recovery-metrics")).toContainText(transferId ?? "");

  const finalDestinationMatchesFixture = await receiver.evaluate(
    async ({ name, expectedBlockHashes, size, blockBytes, validationConcurrency }) => {
      const root = await navigator.storage.getDirectory();
      const file = await (await root.getFileHandle(name)).getFile();
      if (file.size !== size) return false;
      for (let offset = 0; offset < file.size; offset += blockBytes * validationConcurrency) {
        const verified = await Promise.all(
          Array.from({ length: validationConcurrency }, async (_, index) => {
            const start = offset + index * blockBytes;
            if (start >= file.size) return true;
            const bytes = await file.slice(start, start + blockBytes).arrayBuffer();
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            const actual = Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0")
            ).join("");
            return actual === expectedBlockHashes[Math.floor(start / blockBytes)];
          })
        );
        if (verified.some((value) => !value)) return false;
      }
      return true;
    },
    {
      name: destinationName,
      expectedBlockHashes: expectedBlockHashes(),
      size: qualificationBytes,
      blockBytes: validationBlockBytes,
      validationConcurrency
    }
  );
  expect(finalDestinationMatchesFixture).toBe(true);

  console.log(
    "M4B_1G_BROWSER_EVIDENCE=" +
      JSON.stringify({
        disconnectPercent,
        qualificationBytes,
        fixtureMode,
        transferIdStable:
          transferId ===
          (await sender.getByTestId("m4-recovery-metrics").locator("dd").first().textContent()),
        beforeDisconnect,
        sender: await sender.getByTestId("m4-recovery-metrics").locator("dd").allTextContents(),
        receiver: await receiver.getByTestId("m4-recovery-metrics").locator("dd").allTextContents(),
        finalDestinationMatchesFixture
      })
  );

  await senderContext.close();
  await receiverContext.close();
});
