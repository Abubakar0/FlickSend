import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type ContinuityMetrics = {
  safeBytesBeforeDisconnect: number;
  remainingBytesAtResume: number;
  resumedPayloadBytes: number;
  duplicateRetransmittedBytes: number;
  committedBlocksRetransmitted: number;
  ambiguousInflightBytesRetransmitted: number;
};

function integer(value: string | null | undefined): number {
  const digits = value?.replace(/[^0-9]/g, "") ?? "";
  return digits ? Number(digits) : 0;
}

function decimal(value: string | null | undefined): number | null {
  const match = value?.match(/[0-9][0-9,]*(?:\.[0-9]+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : null;
}

async function continuityMetrics(page: Page): Promise<ContinuityMetrics> {
  const values = await page.getByTestId("continuity-metrics").locator("dd").allTextContents();
  if (values.length !== 6) throw new Error("M6 continuity metrics are incomplete.");
  return {
    safeBytesBeforeDisconnect: integer(values[0]),
    remainingBytesAtResume: integer(values[1]),
    resumedPayloadBytes: integer(values[2]),
    duplicateRetransmittedBytes: integer(values[3]),
    committedBlocksRetransmitted: integer(values[4]),
    ambiguousInflightBytesRetransmitted: integer(values[5])
  };
}

async function currentSafeBytes(page: Page): Promise<number> {
  return integer(await page.getByTestId("m4-recovery-metrics").locator("dd").nth(2).textContent());
}

async function reconciliationMs(page: Page): Promise<number | null> {
  return decimal(await page.getByTestId("m4-recovery-metrics").locator("dd").nth(7).textContent());
}

async function waitForSafeBytes(page: Page, minimum: number, timeoutMs = 90_000): Promise<void> {
  await expect
    .poll(() => currentSafeBytes(page), { timeout: timeoutMs, intervals: [25, 50, 100] })
    .toBeGreaterThanOrEqual(minimum);
}

async function waitForFailure(
  sender: Page,
  receiver: Page,
  code: string,
  timeoutMs = 90_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [senderState, receiverState, senderError, receiverError] = await Promise.all([
      sender.getByTestId("transfer-status").textContent(),
      receiver.getByTestId("transfer-status").textContent(),
      sender.getByTestId("transfer-error").allTextContents(),
      receiver.getByTestId("transfer-error").allTextContents()
    ]);
    if (senderError.join(" ").includes(code) || receiverError.join(" ").includes(code)) {
      expect(senderState).not.toContain("DELIVERED");
      expect(receiverState).not.toContain("DELIVERED");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`M6 expected ${code} but neither peer reported it.`);
}

async function expectManifestRootVerified(page: Page): Promise<void> {
  await expect(page.getByTestId("m5-integrity-metrics").locator("dd").nth(4)).toHaveText(
    "verified"
  );
}

async function recordEvidence(name: string, value: unknown): Promise<void> {
  const directory = join(process.cwd(), "test-results", "m6-evidence");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, name),
    JSON.stringify({ generatedAt: new Date().toISOString(), ...(value as object) }, null, 2) + "\n"
  );
}

async function waitForDelivered(sender: Page, receiver: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [senderStatus, receiverStatus] = await Promise.all([
      sender.getByTestId("transfer-status").textContent(),
      receiver.getByTestId("transfer-status").textContent()
    ]);
    if (senderStatus?.includes("DELIVERED") && receiverStatus?.includes("DELIVERED")) return;
    if (senderStatus?.includes("FAILED") || receiverStatus?.includes("FAILED")) {
      const [senderError, receiverError, senderTrace, receiverTrace] = await Promise.all([
        sender.getByTestId("transfer-error").allTextContents(),
        receiver.getByTestId("transfer-error").allTextContents(),
        sender.getByTestId("streampack-protocol-trace").allTextContents(),
        receiver.getByTestId("streampack-protocol-trace").allTextContents()
      ]);
      throw new Error(
        `M6 transfer failed. sender=${senderStatus}; senderError=${senderError.join(" ")}; senderTrace=${senderTrace.join(" ")}; receiver=${receiverStatus}; receiverError=${receiverError.join(" ")}; receiverTrace=${receiverTrace.join(" ")}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("M6 transfer did not reach DELIVERED before timeout.");
}

test("M6 browser WebRTC delivers a virtual multi-file StreamPack fixture", async ({ browser }) => {
  test.setTimeout(90_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/");
  await receiver.goto("/");
  await expect(sender.getByRole("button", { name: "Create Session" })).toBeEnabled();
  await expect(receiver.getByRole("button", { name: "Join" })).toBeEnabled();
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  const code = await sender.getByTestId("session-code").textContent();
  await receiver.getByLabel("Session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(receiver.getByTestId("connection-trace")).not.toHaveText("connection trace pending");
  try {
    await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  } catch {
    throw new Error(
      "Sender connection trace: " +
        (await sender.getByTestId("connection-trace").textContent()) +
        "; receiver connection trace: " +
        (await receiver.getByTestId("connection-trace").textContent())
    );
  }
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByRole("button", { name: "Load M6 Structural Fixture" }).click();
  await sender.getByRole("button", { name: "Offer Folder" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("StreamPack folder: READY");
  await receiver.getByRole("button", { name: "Accept M6 Structural Fixture" }).click();
  await waitForDelivered(sender, receiver, 60_000);
  await expect(receiver.getByTestId("streampack-metrics")).toContainText("Files / folders3 / 3");
  await expect(receiver.getByTestId("streampack-tree-status")).toHaveText("Folder tree: match");
  await expectManifestRootVerified(sender);
  const [senderHealth, receiverHealth] = await Promise.all([
    sender.getByTestId("m8-health-snapshot").textContent(),
    receiver.getByTestId("m8-health-snapshot").textContent()
  ]);
  await recordEvidence("m6-browser-structural.json", {
    scenario: "browser-webrtc-structural-folder",
    protocolVersion: 5,
    files: 3,
    directories: 3,
    payloadBytes: 8,
    delivered: true,
    manifestRootVerified: true,
    finalTreeMatch: true,
    senderHealth: senderHealth ? JSON.parse(senderHealth) : null,
    receiverHealth: receiverHealth ? JSON.parse(receiverHealth) : null
  });
  await senderContext.close();
  await receiverContext.close();
});

test("M6 browser WebRTC delivers the 10,000-file fixture through bounded OPFS writers", async ({
  browser
}) => {
  // This is a functional tree-reconstruction qualification, not a throughput target. On a loaded
  // local browser, the bounded 10,000-file OPFS write path can take longer than payload transfer.
  test.setTimeout(720_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/");
  await receiver.goto("/");
  await expect(sender.getByRole("button", { name: "Create Session" })).toBeEnabled();
  await expect(receiver.getByRole("button", { name: "Join" })).toBeEnabled();
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  await receiver
    .getByLabel("Session code")
    .fill((await sender.getByTestId("session-code").textContent()) ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByRole("button", { name: "Load M6 10k Fixture" }).click();
  await sender.getByRole("button", { name: "Offer Folder" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("StreamPack folder: READY");
  await receiver.getByRole("button", { name: "Accept M6 10k to OPFS" }).click();
  await waitForDelivered(sender, receiver, 540_000);
  await expect(receiver.getByTestId("streampack-metrics")).toContainText(
    "Files / folders10000 / 103"
  );
  await expect(receiver.getByTestId("streampack-tree-status")).toHaveText("Folder tree: match", {
    timeout: 120_000
  });
  await expectManifestRootVerified(sender);
  await recordEvidence("m6-browser-10k.json", {
    scenario: "browser-webrtc-10000-files-opfs",
    protocolVersion: 5,
    files: 10_000,
    directories: 103,
    payloadBytes: 49_598_976,
    delivered: true,
    manifestRootVerified: true,
    finalTreeMatch: true,
    receiverMetrics: await receiver.getByTestId("streampack-metrics").innerText()
  });
  await senderContext.close();
  await receiverContext.close();
});

test("M6 browser WebRTC delivers the mixed hierarchy and verifies its reconstructed tree", async ({
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
  await receiver
    .getByLabel("Session code")
    .fill((await sender.getByTestId("session-code").textContent()) ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByRole("button", { name: "Load M6 Mixed Fixture" }).click();
  await sender.getByRole("button", { name: "Offer Folder" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept M6 Mixed to OPFS" }).click();
  await waitForDelivered(sender, receiver, 90_000);
  await expect(receiver.getByTestId("streampack-tree-status")).toHaveText("Folder tree: match", {
    timeout: 60_000
  });
  await expect(receiver.getByTestId("streampack-metrics")).toContainText("Files / folders131 / 5");
  await expectManifestRootVerified(sender);
  const [senderHealth, receiverHealth] = await Promise.all([
    sender.getByTestId("m8-health-snapshot").textContent(),
    receiver.getByTestId("m8-health-snapshot").textContent()
  ]);
  await recordEvidence("m6-browser-mixed.json", {
    scenario: "browser-webrtc-mixed-folder-opfs",
    protocolVersion: 5,
    files: 131,
    directories: 5,
    payloadBytes: 17_304_188,
    delivered: true,
    manifestRootVerified: true,
    finalTreeMatch: true,
    receiverMetrics: await receiver.getByTestId("streampack-metrics").innerText(),
    senderHealth: senderHealth ? JSON.parse(senderHealth) : null,
    receiverHealth: receiverHealth ? JSON.parse(receiverHealth) : null
  });
  await senderContext.close();
  await receiverContext.close();
});

test("M6 browser WebRTC retries one corrupted StreamPack block", async ({ browser }) => {
  test.setTimeout(120_000);
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
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByRole("button", { name: "Load M6 Structural Fixture" }).click();
  await sender.getByRole("button", { name: "Apply Integrity Fault" }).click();
  await sender.getByRole("button", { name: "Offer Folder" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept M6 Structural Fixture" }).click();
  await waitForDelivered(sender, receiver, 60_000);
  await expect(sender.getByTestId("m5-integrity-metrics")).toContainText("Integrity retries1");
  await expectManifestRootVerified(sender);
  await recordEvidence("m6-browser-corruption-retry.json", {
    scenario: "browser-webrtc-payload-corruption-retry",
    protocolVersion: 5,
    delivered: true,
    manifestRootVerified: true,
    integrityMetrics: await sender.getByTestId("m5-integrity-metrics").innerText()
  });
  await senderContext.close();
  await receiverContext.close();
});

test("M6 browser WebRTC resumes the mixed folder after its first verified block", async ({
  browser
}) => {
  test.setTimeout(180_000);
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
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByRole("button", { name: "Load M6 Mixed Fixture" }).click();
  await sender.getByRole("button", { name: "Offer Folder" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept M6 Mixed to OPFS" }).click();
  await waitForSafeBytes(receiver, 8 * 1024 * 1024);
  const transferId = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .first()
    .textContent();
  await sender.getByRole("button", { name: "Simulate Transport Disconnect" }).click();
  await waitForDelivered(sender, receiver, 120_000);
  const deliveredTransferId = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .first()
    .textContent();
  expect(deliveredTransferId).toBe(transferId);
  await expect(sender.getByTestId("m4-recovery-metrics").locator("dd").nth(5)).toHaveText("1");
  await expect(sender.getByTestId("streampack-protocol-trace")).toContainText(
    "recv:STREAMPACK_HAVE_VERIFIED_BLOCKS"
  );
  await expect(receiver.getByTestId("streampack-tree-status")).toHaveText("Folder tree: match", {
    timeout: 60_000
  });
  await expectManifestRootVerified(sender);
  const continuity = await continuityMetrics(sender);
  expect(continuity.safeBytesBeforeDisconnect).toBeGreaterThan(0);
  expect(continuity.safeBytesBeforeDisconnect + continuity.remainingBytesAtResume).toBe(17_304_188);
  expect(continuity.resumedPayloadBytes).toBeGreaterThanOrEqual(continuity.remainingBytesAtResume);
  expect(continuity.duplicateRetransmittedBytes).toBe(0);
  expect(continuity.committedBlocksRetransmitted).toBe(0);
  expect(continuity.ambiguousInflightBytesRetransmitted).toBeLessThanOrEqual(
    continuity.resumedPayloadBytes
  );
  console.info("M6 browser single-resume evidence " + JSON.stringify(continuity));
  await recordEvidence("m6-browser-single-resume.json", {
    scenario: "browser-webrtc-mixed-folder-resume",
    protocolVersion: 5,
    transferId,
    transferIdStable: true,
    reconnectCount: 1,
    reconciliationMs: await reconciliationMs(sender),
    haveVerifiedBlocksObserved: true,
    delivered: true,
    manifestRootVerified: true,
    finalTreeMatch: true,
    continuity
  });
  await senderContext.close();
  await receiverContext.close();
});

test("M6 browser WebRTC preserves verified folder progress across three interruptions", async ({
  browser
}) => {
  test.setTimeout(360_000);
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
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByRole("button", { name: "Load M6 Interruption Fixture" }).click();
  await sender.getByRole("button", { name: "Offer Folder" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept M6 Interruption to OPFS" }).click();
  const transferId = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .first()
    .textContent();
  for (const threshold of [8, 24, 40].map((mebibytes) => mebibytes * 1024 * 1024)) {
    await waitForSafeBytes(receiver, threshold, 150_000);
    await sender.getByRole("button", { name: "Simulate Transport Disconnect" }).click();
    await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 60_000 });
    await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 60_000 });
  }
  await waitForDelivered(sender, receiver, 180_000);
  const deliveredTransferId = await sender
    .getByTestId("m4-recovery-metrics")
    .locator("dd")
    .first()
    .textContent();
  expect(deliveredTransferId).toBe(transferId);
  await expect(sender.getByTestId("m4-recovery-metrics").locator("dd").nth(5)).toHaveText("3");
  await expect(sender.getByTestId("streampack-protocol-trace")).toContainText(
    "recv:STREAMPACK_HAVE_VERIFIED_BLOCKS"
  );
  await expect(receiver.getByTestId("streampack-tree-status")).toHaveText("Folder tree: match", {
    timeout: 60_000
  });
  await expectManifestRootVerified(sender);
  const continuity = await continuityMetrics(sender);
  expect(continuity.safeBytesBeforeDisconnect).toBeGreaterThanOrEqual(40 * 1024 * 1024);
  expect(continuity.safeBytesBeforeDisconnect + continuity.remainingBytesAtResume).toBe(48_761_468);
  expect(continuity.resumedPayloadBytes).toBeGreaterThanOrEqual(continuity.remainingBytesAtResume);
  expect(continuity.duplicateRetransmittedBytes).toBe(0);
  expect(continuity.committedBlocksRetransmitted).toBe(0);
  expect(continuity.ambiguousInflightBytesRetransmitted).toBeLessThanOrEqual(
    continuity.resumedPayloadBytes
  );
  console.info("M6 browser multi-resume evidence " + JSON.stringify(continuity));
  await recordEvidence("m6-browser-multi-resume.json", {
    scenario: "browser-webrtc-folder-multi-interruption",
    protocolVersion: 5,
    transferId,
    transferIdStable: true,
    reconnectCount: 3,
    reconciliationMs: await reconciliationMs(sender),
    interruptionSafeByteThresholds: [8, 24, 40].map((mebibytes) => mebibytes * 1024 * 1024),
    delivered: true,
    manifestRootVerified: true,
    finalTreeMatch: true,
    continuity
  });
  await senderContext.close();
  await receiverContext.close();
});

test("M6 browser WebRTC rejects a source mutation after an interrupted folder transfer", async ({
  browser
}) => {
  test.setTimeout(180_000);
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
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByRole("button", { name: "Load M6 Mutable Fixture" }).click();
  await sender.getByRole("button", { name: "Offer Folder" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept M6 Mutable to OPFS" }).click();
  await waitForSafeBytes(receiver, 8 * 1024 * 1024);
  await sender.getByRole("button", { name: "Interrupt M6 Transport (Hold)" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("RECONNECTING");
  await expect(receiver.getByTestId("transfer-status")).toContainText("RECONNECTING", {
    timeout: 20_000
  });
  await sender.getByRole("button", { name: "Mutate M6 Source" }).click();
  await sender.getByRole("button", { name: "Resume Held M6 Reconnect" }).click();
  await waitForFailure(sender, receiver, "FS_STREAMPACK_SOURCE_CHANGED");
  await recordEvidence("m6-browser-source-mutation.json", {
    scenario: "browser-webrtc-source-mutation-after-interruption",
    protocolVersion: 5,
    expectedFailure: "FS_STREAMPACK_SOURCE_CHANGED",
    delivered: false
  });
  await senderContext.close();
  await receiverContext.close();
});

test("M6 browser WebRTC rejects a mutated destination checkpoint after interruption", async ({
  browser
}) => {
  test.setTimeout(180_000);
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
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await sender.getByRole("button", { name: "Load M6 Mixed Fixture" }).click();
  await sender.getByRole("button", { name: "Offer Folder" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  await receiver.getByRole("button", { name: "Accept M6 Mixed to OPFS" }).click();
  await waitForSafeBytes(receiver, 8 * 1024 * 1024);
  await sender.getByRole("button", { name: "Interrupt M6 Transport (Hold)" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("RECONNECTING");
  await expect(receiver.getByTestId("transfer-status")).toContainText("RECONNECTING", {
    timeout: 20_000
  });
  await receiver.getByRole("button", { name: "Mutate M6 Destination" }).click();
  await expect(receiver.getByTestId("streampack-status")).toContainText("destination mutated");
  await sender.getByRole("button", { name: "Resume Held M6 Reconnect" }).click();
  await waitForFailure(sender, receiver, "FS_STREAMPACK_DESTINATION_CHANGED");
  await recordEvidence("m6-browser-destination-mutation.json", {
    scenario: "browser-webrtc-destination-mutation-after-interruption",
    protocolVersion: 5,
    expectedFailure: "FS_STREAMPACK_DESTINATION_CHANGED",
    delivered: false
  });
  await senderContext.close();
  await receiverContext.close();
});
