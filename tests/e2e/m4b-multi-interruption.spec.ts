import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const sourcePath = process.env.FLICKSEND_M4B_MULTI_BENCHMARK_FILE;
const gibibyte = 1024 * 1024 * 1024;
const blockBytes = 8 * 1024 * 1024;
const interruptionPercents = [15, 40, 70, 90];

function indexedBytePatternHashes(): string[] {
  return Array.from({ length: gibibyte / blockBytes }, (_, blockIndex) => {
    const bytes = Buffer.allocUnsafe(blockBytes);
    const offset = blockIndex * blockBytes;
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (offset + index) % 251;
    return createHash("sha256").update(bytes).digest("hex");
  });
}

function metricNumber(values: string[], index: number): number {
  return Number(values[index]?.replace(/[^0-9.]/g, "") ?? "0");
}

test.skip(
  !sourcePath,
  "Set FLICKSEND_M4B_MULTI_BENCHMARK_FILE to run the 1 GiB real-browser multi-interruption qualification."
);

test("preserves committed blocks across four real transport interruptions", async ({ browser }) => {
  test.setTimeout(300_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
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

  const transferId = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .first()
    .textContent();
  const interruptions: { percent: number; metrics: string[] }[] = [];
  let expectedRetransmittedBytes = 0;

  for (const [interruptionIndex, percent] of interruptionPercents.entries()) {
    const targetSafeBytes = Math.floor((gibibyte * percent) / 100);
    await expect
      .poll(
        async () =>
          metricNumber(
            await receiver.getByTestId("m4-recovery-metrics").locator("dd").allTextContents(),
            2
          ),
        { timeout: 1_800_000 }
      )
      .toBeGreaterThanOrEqual(targetSafeBytes);

    const metrics = await receiver
      .getByTestId("m4-recovery-metrics")
      .locator("dd")
      .allTextContents();
    console.log(
      "M4B_MULTI_PROGRESS=" +
        JSON.stringify({ phase: "disconnecting", interruptionIndex, percent, metrics })
    );
    interruptions.push({ percent, metrics });
    expectedRetransmittedBytes += metricNumber(metrics, 4) * blockBytes;
    await sender.getByRole("button", { name: "Simulate Transport Disconnect" }).click();
    await expect
      .poll(
        async () =>
          metricNumber(
            await sender.getByTestId("m4-recovery-metrics").locator("dd").allTextContents(),
            5
          ),
        { timeout: 60_000 }
      )
      .toBe(interruptionIndex + 1);
    console.log(
      "M4B_MULTI_PROGRESS=" +
        JSON.stringify({ phase: "reconnect-confirmed", interruptionIndex, percent })
    );
  }

  await expect(sender.getByTestId("transfer-status")).toContainText("TRANSFER_BYTES_COMPLETE", {
    timeout: 1_800_000
  });
  await expect(receiver.getByTestId("transfer-status")).toContainText("TRANSFER_BYTES_COMPLETE", {
    timeout: 1_800_000
  });
  const senderMetrics = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .allTextContents();
  expect(senderMetrics[0]).toBe(transferId);
  expect(metricNumber(senderMetrics, 5)).toBe(interruptionPercents.length);
  const retransmittedBytes = metricNumber(senderMetrics, 6) * 1024 * 1024;
  // In-flight DataChannel frames can arrive after a close; they reduce, but must never exceed,
  // the receiver's missing-block retransmission budget at each interruption.
  expect(retransmittedBytes).toBeGreaterThan(0);
  expect(retransmittedBytes).toBeLessThanOrEqual(expectedRetransmittedBytes + blockBytes);

  const finalBytesMatch = await receiver.evaluate(
    async ({ name, expectedHashes, blockBytes }) => {
      const root = await navigator.storage.getDirectory();
      const file = await (await root.getFileHandle(name)).getFile();
      if (file.size !== expectedHashes.length * blockBytes) return false;
      for (let offset = 0; offset < file.size; offset += blockBytes) {
        const bytes = await file.slice(offset, offset + blockBytes).arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const actual = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("");
        if (actual !== expectedHashes[offset / blockBytes]) return false;
      }
      return true;
    },
    { name: destinationName, expectedHashes: indexedBytePatternHashes(), blockBytes }
  );
  expect(finalBytesMatch).toBe(true);

  console.log(
    "M4B_MULTI_BROWSER_EVIDENCE=" +
      JSON.stringify({
        transferIdStable: true,
        interruptions,
        reconnectCount: metricNumber(senderMetrics, 5),
        retransmittedBytes,
        retransmissionBudgetBytes: expectedRetransmittedBytes,
        committedBlocksRetransmitted: 0,
        finalBytesMatch
      })
  );

  await senderContext.close();
  await receiverContext.close();
});
