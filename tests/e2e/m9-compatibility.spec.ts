import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type HealthSnapshot = {
  measurementAvailability?: Record<string, string>;
  routeType?: string;
  routeDetail?: string;
};

type BrowserCapabilitySnapshot = {
  browser: string;
  browserVersion: string | null;
  engine: string;
  operatingSystem: string;
  operatingSystemVersion: string | null;
  deviceClass: string;
  architecture: string | null;
  supportedTransferModes: Record<string, string>;
  [key: string]: unknown;
};

function integer(value: string | null | undefined): number {
  const digits = value?.replace(/[^0-9]/g, "") ?? "";
  return digits ? Number(digits) : 0;
}

async function connect(browser: Browser): Promise<{
  sender: Page;
  receiver: Page;
  close: () => Promise<void>;
}> {
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  try {
    const sender = await senderContext.newPage();
    const receiver = await receiverContext.newPage();
    await sender.goto("/");
    await receiver.goto("/");
    await sender.getByRole("button", { name: "Create Session" }).click();
    await expect(sender.getByTestId("session-code")).not.toHaveText("none");
    const code = await sender.getByTestId("session-code").textContent();
    await receiver.getByLabel("Session code").fill(code ?? "");
    await receiver.getByRole("button", { name: "Join" }).click();
    try {
      await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 25_000 });
      await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 25_000 });
    } catch {
      const details = await Promise.all([
        sender.getByTestId("connection-state").textContent(),
        receiver.getByTestId("connection-state").textContent(),
        sender.getByTestId("connection-error").textContent(),
        receiver.getByTestId("connection-error").textContent(),
        sender.getByTestId("connection-trace").textContent(),
        receiver.getByTestId("connection-trace").textContent(),
        sender.getByTestId("route").textContent(),
        receiver.getByTestId("route").textContent()
      ]);
      throw new Error(`M9 WebRTC negotiation failed: ${details.join(" | ")}`);
    }
    return {
      sender,
      receiver,
      close: async () => {
        await Promise.all([senderContext.close(), receiverContext.close()]);
      }
    };
  } catch (error) {
    await Promise.all([senderContext.close(), receiverContext.close()]);
    throw error;
  }
}

async function waitForDelivered(sender: Page, receiver: Page, timeout = 90_000): Promise<void> {
  await expect(sender.getByTestId("transfer-status")).toContainText("DELIVERED", { timeout });
  await expect(receiver.getByTestId("transfer-status")).toContainText("DELIVERED", { timeout });
}

async function health(page: Page): Promise<HealthSnapshot | null> {
  const raw = await page.getByTestId("m8-health-snapshot").textContent();
  return raw && raw !== "null" ? (JSON.parse(raw) as HealthSnapshot) : null;
}

async function directM5(browser: Browser): Promise<Record<string, unknown>> {
  const connection = await connect(browser);
  try {
    const fixture = Buffer.alloc(8 * 1024 * 1024);
    for (let index = 0; index < fixture.length; index += 1) fixture[index] = (index * 17) % 251;
    await connection.sender.getByLabel("Source file").setInputFiles({
      name: "m9-direct.bin",
      mimeType: "application/octet-stream",
      buffer: fixture
    });
    await connection.sender.getByRole("button", { name: "Offer File" }).click();
    await expect(connection.receiver.getByTestId("transfer-status")).toContainText("READY");
    await connection.receiver
      .getByRole("button", { name: "Accept to OPFS Benchmark Storage" })
      .click();
    await waitForDelivered(connection.sender, connection.receiver);
    await expect(connection.sender.getByTestId("m5-integrity-metrics")).toContainText("verified");
    return {
      delivered: true,
      manifestRootVerified: true,
      route: await connection.sender.getByTestId("route").textContent(),
      health: await health(connection.sender)
    };
  } finally {
    await connection.close();
  }
}

async function resumeM5(browser: Browser): Promise<Record<string, unknown>> {
  const connection = await connect(browser);
  try {
    const fixture = Buffer.alloc(16 * 1024 * 1024);
    for (let index = 0; index < fixture.length; index += 1) fixture[index] = (index * 31) % 251;
    await connection.sender.getByLabel("Source file").setInputFiles({
      name: "m9-resume.bin",
      mimeType: "application/octet-stream",
      buffer: fixture
    });
    await connection.sender.getByRole("button", { name: "Offer File" }).click();
    await connection.receiver
      .getByRole("button", { name: "Accept to OPFS Benchmark Storage" })
      .click();
    await expect(connection.receiver.getByTestId("m4-recovery-metrics")).toContainText("1 / 2", {
      timeout: 90_000
    });
    const transferId = await connection.sender
      .getByTestId("m4-recovery-metrics")
      .locator("dd")
      .first()
      .textContent();
    await connection.sender.getByRole("button", { name: "Simulate Transport Disconnect" }).click();
    await waitForDelivered(connection.sender, connection.receiver);
    const continuity = await connection.sender
      .getByTestId("continuity-metrics")
      .locator("dd")
      .allTextContents();
    expect(continuity).toHaveLength(6);
    expect(integer(continuity[3])).toBe(0);
    expect(integer(continuity[4])).toBe(0);
    await expect(connection.sender.getByTestId("m4-recovery-metrics")).toContainText(
      transferId ?? ""
    );
    return {
      delivered: true,
      transferIdStable: true,
      safeBytesBeforeDisconnect: integer(continuity[0]),
      remainingBytesAtResume: integer(continuity[1]),
      resumedPayloadBytes: integer(continuity[2]),
      duplicateRetransmittedBytes: integer(continuity[3]),
      committedBlocksRetransmitted: integer(continuity[4]),
      ambiguousInflightBytesRetransmitted: integer(continuity[5])
    };
  } finally {
    await connection.close();
  }
}

async function corruptionRetry(browser: Browser): Promise<Record<string, unknown>> {
  const connection = await connect(browser);
  try {
    await connection.sender.getByLabel("Integrity fault", { exact: true }).selectOption("payload");
    await connection.sender.getByLabel("Integrity fault block").fill("0");
    await connection.sender.getByRole("button", { name: "Apply Integrity Fault" }).click();
    await connection.sender.getByLabel("Source file").setInputFiles({
      name: "m9-corruption.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(8 * 1024 * 1024, 0x5a)
    });
    await connection.sender.getByRole("button", { name: "Offer File" }).click();
    await connection.receiver
      .getByRole("button", { name: "Accept to OPFS Benchmark Storage" })
      .click();
    await waitForDelivered(connection.sender, connection.receiver);
    await expect(connection.sender.getByTestId("m5-integrity-metrics")).toContainText(
      "Integrity retries1"
    );
    return { delivered: true, retries: 1, manifestRootVerified: true };
  } finally {
    await connection.close();
  }
}

async function streamPack(browser: Browser): Promise<Record<string, unknown>> {
  const connection = await connect(browser);
  try {
    await connection.sender.getByRole("button", { name: "Load M6 Structural Fixture" }).click();
    await connection.sender.getByRole("button", { name: "Offer Folder" }).click();
    await expect(connection.receiver.getByTestId("transfer-status")).toContainText(
      "StreamPack folder: READY"
    );
    await connection.receiver.getByRole("button", { name: "Accept M6 Structural Fixture" }).click();
    await waitForDelivered(connection.sender, connection.receiver);
    await expect(connection.receiver.getByTestId("streampack-tree-status")).toHaveText(
      "Folder tree: match"
    );
    await expect(connection.sender.getByTestId("m5-integrity-metrics")).toContainText("verified");
    return {
      delivered: true,
      files: 3,
      directories: 3,
      emptyDirectoryPreserved: true,
      finalTreeMatch: true,
      manifestRootVerified: true
    };
  } finally {
    await connection.close();
  }
}

test("M9 records a real browser core compatibility qualification", async ({ browser }) => {
  test.setTimeout(300_000);
  const capabilityPage = await browser.newPage();
  await capabilityPage.goto("/");
  await expect(capabilityPage.getByTestId("browser-capability-snapshot")).not.toHaveText("null");
  const capabilities = JSON.parse(
    (await capabilityPage.getByTestId("browser-capability-snapshot").textContent()) ?? "null"
  ) as BrowserCapabilitySnapshot;
  await capabilityPage.close();

  const [singleFile, resume, integrity, folder] = [
    await directM5(browser),
    await resumeM5(browser),
    await corruptionRetry(browser),
    await streamPack(browser)
  ];
  const target = process.env.FLICKSEND_M9_TARGET ?? "m9-browser";
  const evidenceDirectory = resolve(
    process.env.FLICKSEND_M9_EVIDENCE_DIR ?? "test-results/m9-evidence"
  );
  const artifact = {
    schemaVersion: 1,
    milestone: "M9",
    generatedAt: new Date().toISOString(),
    target,
    environment: {
      realBrowser: true,
      automated: true,
      emulated: false,
      hostOperatingSystem: process.env.FLICKSEND_M9_HOST_OS ?? "UNKNOWN",
      hostOperatingSystemVersion: process.env.FLICKSEND_M9_HOST_OS_VERSION ?? null,
      hostArchitecture: process.env.FLICKSEND_M9_HOST_ARCHITECTURE ?? null
    },
    browser: {
      name: capabilities.browser,
      version: browser.version(),
      userAgentVersion: capabilities.browserVersion,
      engine: capabilities.engine,
      operatingSystem: capabilities.operatingSystem,
      operatingSystemVersion: capabilities.operatingSystemVersion,
      deviceClass: capabilities.deviceClass,
      architecture: capabilities.architecture
    },
    supportTier: "SUPPORTED_WITH_LIMITATIONS",
    capabilities,
    qualificationResults: {
      m5SingleFile: singleFile,
      m5Resume: resume,
      m5CorruptionRetry: integrity,
      m6StructuralStreamPack: folder,
      destinationStreaming: "LIMITED",
      turnRelay: "NOT_TESTED",
      routeRecovery: "NOT_TESTED",
      backgroundLifecycle: "NOT_TESTED",
      browserRestart: "NOT_TESTED",
      permissionRevocation: "NOT_TESTED"
    },
    limitations: [
      "The M9 harness proves bounded OPFS fixture writes only; OPFS is not a production giant-payload destination.",
      "User-selected File System Access file and directory destinations are feature-detected but require an assisted real-user permission qualification.",
      "TURN relay and route replacement require a separate browser-specific coturn run and are not inferred from this direct qualification.",
      "Page refresh, browser restart, backgrounding, sleep, screen lock, and permission revocation were not exercised."
    ]
  };
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    join(evidenceDirectory, `${target}.json`),
    JSON.stringify(artifact, null, 2) + "\n"
  );
});
