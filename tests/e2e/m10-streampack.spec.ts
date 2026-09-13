import { expect, test } from "@playwright/test";
import {
  BrowserTreeSampler,
  healthFrom,
  integrityFrom,
  speedProofFrom,
  writeM10Evidence
} from "./m10-evidence.js";

const enabled = process.env.FLICKSEND_M10_STREAMPACK === "1";

test.skip(
  !enabled,
  "Set FLICKSEND_M10_STREAMPACK=1 to run the physical same-host 10,000-file case."
);

async function waitForDelivered(
  sender: import("@playwright/test").Page,
  receiver: import("@playwright/test").Page
): Promise<void> {
  const deadline = Date.now() + 720_000;
  while (Date.now() < deadline) {
    const [senderStatus, receiverStatus] = await Promise.all([
      sender.getByTestId("transfer-status").textContent(),
      receiver.getByTestId("transfer-status").textContent()
    ]);
    if (senderStatus?.includes("DELIVERED") && receiverStatus?.includes("DELIVERED")) return;
    if (senderStatus?.includes("FAILED") || receiverStatus?.includes("FAILED"))
      throw new Error(`M10 StreamPack failed: sender=${senderStatus}; receiver=${receiverStatus}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("M10 StreamPack did not reach DELIVERED before timeout.");
}

test("M10 same-host StreamPack 10,000-file stress qualification", async ({ browser }) => {
  test.setTimeout(900_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const sampler = new BrowserTreeSampler();
  const startedAt = performance.now();
  try {
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
    await sampler.start();
    await sender.getByRole("button", { name: "Load M6 10k Fixture" }).click();
    await sender.getByRole("button", { name: "Offer Folder" }).click();
    await expect(receiver.getByTestId("transfer-status")).toContainText("StreamPack folder: READY");
    await receiver.getByRole("button", { name: "Accept M6 10k to OPFS" }).click();
    await waitForDelivered(sender, receiver);
    await expect(receiver.getByTestId("streampack-tree-status")).toHaveText("Folder tree: match", {
      timeout: 120_000
    });
    const [senderIntegrity, receiverIntegrity, senderHealth, receiverHealth, speedProof] =
      await Promise.all([
        integrityFrom(sender),
        integrityFrom(receiver),
        healthFrom(sender),
        healthFrom(receiver),
        speedProofFrom(sender)
      ]);
    expect(senderIntegrity.manifestRootVerified).toBe(true);
    expect(receiverIntegrity.manifestRootVerified).toBe(true);
    await sampler.stop();
    await writeM10Evidence("m10-same-host-streampack-10k", {
      schemaVersion: 1,
      milestone: "M10",
      recordType: "SAME_HOST_STREAMPACK_STRESS",
      capturedAt: new Date().toISOString(),
      evidenceClass: "SAME_HOST_PHYSICAL_BROWSER",
      topology: "SINGLE_MACHINE_ONLY",
      fixture: {
        files: 10_000,
        directories: 103,
        payloadSizeClass: "APPROX_48_MIB",
        treeMatch: true,
        fspkRootVerified: true,
        boundedWriterEvidence: "M6 OPFS bounded writer path"
      },
      transfer: {
        senderDelivered: true,
        receiverDelivered: true,
        senderManifestRootVerified: senderIntegrity.manifestRootVerified,
        receiverManifestRootVerified: receiverIntegrity.manifestRootVerified,
        durationMs: performance.now() - startedAt,
        senderHealth,
        receiverHealth,
        speedProof
      },
      externalBrowserProcess: sampler.summary(),
      physicalNetworkUtilization: null,
      privacy: {
        transferIdRetained: false,
        fileNameRetained: false,
        filePathRetained: false,
        browserProcessIdRetained: false,
        payloadRetained: false
      }
    });
  } finally {
    await sampler.stop().catch(() => undefined);
    await senderContext.close();
    await receiverContext.close();
  }
});
