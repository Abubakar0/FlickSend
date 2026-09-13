import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const enabled = process.env.FLICKSEND_M7_TURN_QUALIFICATION === "1";

type RoutePolicy = "AUTO" | "RELAY_ONLY";
type CredentialMode = "valid" | "expired" | "invalid" | "unreachable";
const browserNetworkDiagnostics = new WeakMap<Page, string[]>();

function captureBrowserNetworkDiagnostics(page: Page): void {
  const diagnostics: string[] = [];
  browserNetworkDiagnostics.set(page, diagnostics);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/turn-credentials")
      diagnostics.push(`request:${request.method()}:${url.origin}${url.pathname}`);
  });
  page.on("requestfailed", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/turn-credentials" || pathname === "/session")
      diagnostics.push(`${pathname}:${request.failure()?.errorText ?? "unknown"}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      diagnostics.push(`response:${response.status()}:${url.origin}${url.pathname}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console:${message.text()}`);
  });
}

async function selectRoute(
  page: Page,
  policy: RoutePolicy,
  nextPolicy = policy,
  credentialMode: CredentialMode = "valid"
): Promise<void> {
  await page.getByLabel("Route policy").selectOption(policy);
  await page.getByLabel("Next recovery route").selectOption(nextPolicy);
  await page.getByLabel("TURN credential test mode").selectOption(credentialMode);
  await page.getByRole("button", { name: "Apply Route Policy" }).click();
}

async function createPeerPair(
  browser: Browser,
  policy: RoutePolicy,
  options: { nextPolicy?: RoutePolicy; credentialMode?: CredentialMode } = {}
): Promise<{ sender: Page; receiver: Page; close: () => Promise<void> }> {
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  captureBrowserNetworkDiagnostics(sender);
  captureBrowserNetworkDiagnostics(receiver);
  await sender.goto("/");
  await receiver.goto("/");
  await selectRoute(sender, policy, options.nextPolicy ?? policy, options.credentialMode);
  await selectRoute(receiver, policy, options.nextPolicy ?? policy, options.credentialMode);
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).toHaveText(/^\d{3} \d{3}$/);
  const code = await sender.getByTestId("session-code").textContent();
  await receiver.getByLabel("Session code").fill(code ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  return {
    sender,
    receiver,
    close: async () => {
      await senderContext.close();
      await receiverContext.close();
    }
  };
}

async function expectRelay(sender: Page, receiver: Page): Promise<void> {
  await expectDataOpen(sender);
  await expectDataOpen(receiver);
  await expect(sender.getByTestId("route")).toContainText("RELAY", { timeout: 10_000 });
  await expect(receiver.getByTestId("route")).toContainText("RELAY", { timeout: 10_000 });
}

async function expectDataOpen(page: Page, peer?: Page): Promise<void> {
  try {
    await expect(page.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  } catch (error) {
    // Failures retain only safe application diagnostics, never candidate strings or credentials.
    await logConnectionDiagnostics(page, peer);
    throw error;
  }
}

async function expectConnectionError(
  page: Page,
  code: string,
  timeout: number,
  peer?: Page
): Promise<void> {
  try {
    await expect(page.getByTestId("connection-error")).toContainText(code, { timeout });
  } catch (error) {
    await logConnectionDiagnostics(page, peer);
    throw error;
  }
}

async function logConnectionDiagnostics(page: Page, peer?: Page): Promise<void> {
  console.log(
    "M7 connection diagnostics:",
    JSON.stringify({
      error: await page.getByTestId("connection-error").textContent(),
      trace: await page.getByTestId("connection-trace").textContent(),
      controlPlane: await page.getByTestId("m7-control-plane-config").textContent(),
      route: await page.getByTestId("m7-route-snapshot").textContent(),
      network: browserNetworkDiagnostics.get(page) ?? [],
      peer: peer
        ? {
            error: await peer.getByTestId("connection-error").textContent(),
            trace: await peer.getByTestId("connection-trace").textContent(),
            network: browserNetworkDiagnostics.get(peer) ?? []
          }
        : null
    })
  );
}

async function expectStreamPackTreeMatch(sender: Page, receiver: Page): Promise<void> {
  try {
    await expect(receiver.getByTestId("streampack-tree-status")).toContainText("match", {
      timeout: 120_000
    });
  } catch (error) {
    console.log(
      "M7 StreamPack recovery diagnostics:",
      JSON.stringify({
        senderTransfer: await sender.getByTestId("transfer-status").textContent(),
        receiverTransfer: await receiver.getByTestId("transfer-status").textContent(),
        senderStreamPack: await sender.getByTestId("streampack-protocol-trace").textContent(),
        receiverStreamPack: await receiver.getByTestId("streampack-protocol-trace").textContent(),
        senderTrace: await sender.getByTestId("connection-trace").textContent(),
        receiverTrace: await receiver.getByTestId("connection-trace").textContent(),
        senderRoute: await sender.getByTestId("m7-route-snapshot").textContent(),
        receiverRoute: await receiver.getByTestId("m7-route-snapshot").textContent()
      })
    );
    throw error;
  }
}

async function browserEvidenceIdentity(page: Page): Promise<{
  actualVersion: string | null;
  userAgent: string;
}> {
  return {
    actualVersion: page.context().browser()?.version() ?? null,
    userAgent: await page.evaluate(() => navigator.userAgent)
  };
}

async function recordEvidence(
  testInfo: TestInfo,
  name: string,
  sender: Page,
  receiver: Page,
  scenario: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const [
    senderRoute,
    receiverRoute,
    senderRecovery,
    receiverRecovery,
    senderHealth,
    receiverHealth
  ] = await Promise.all([
    sender.getByTestId("m7-route-snapshot").textContent(),
    receiver.getByTestId("m7-route-snapshot").textContent(),
    sender.getByTestId("m7-recovery-snapshot").textContent(),
    receiver.getByTestId("m7-recovery-snapshot").textContent(),
    sender.getByTestId("m8-health-snapshot").textContent(),
    receiver.getByTestId("m8-health-snapshot").textContent()
  ]);
  const evidence = {
    schemaVersion: 1,
    milestone: "M7",
    scenario,
    createdAt: new Date().toISOString(),
    browser: await browserEvidenceIdentity(sender),
    senderRoute: senderRoute ? JSON.parse(senderRoute) : null,
    receiverRoute: receiverRoute ? JSON.parse(receiverRoute) : null,
    senderRecovery: senderRecovery ? JSON.parse(senderRecovery) : null,
    receiverRecovery: receiverRecovery ? JSON.parse(receiverRecovery) : null,
    senderHealth: senderHealth ? JSON.parse(senderHealth) : null,
    receiverHealth: receiverHealth ? JSON.parse(receiverHealth) : null,
    ...extra
  };
  const output = testInfo.outputPath(name);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2));
}

async function healthSnapshot(page: Page): Promise<Record<string, unknown>> {
  const value = await page.getByTestId("m8-health-snapshot").textContent();
  if (!value) throw new Error("M8 health snapshot is unavailable during M7 qualification.");
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object")
    throw new Error("M8 health snapshot is not an object during M7 qualification.");
  return parsed as Record<string, unknown>;
}

async function recordM8RouteHealth(
  testInfo: TestInfo,
  healthSequence: Record<string, unknown>,
  extra: Record<string, unknown>
): Promise<void> {
  const output = testInfo.outputPath("m8-direct-to-turn-route-health.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        milestone: "M8",
        scenario: "m7-direct-to-turn-m5-route-health",
        createdAt: new Date().toISOString(),
        browser: "Chromium Playwright with local coturn",
        evidenceMode: "Real M7 direct-to-relay recovery with M8 observer snapshots.",
        healthSequence,
        ...extra
      },
      null,
      2
    ) + "\n"
  );
}

test.describe("M7 real coturn qualification", () => {
  test.skip(!enabled, "Requires qualification:m7 to start the pinned local coturn service.");

  test("normal direct ICE still delivers an M5 file", async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const pair = await createPeerPair(browser, "AUTO");
    try {
      await expectDataOpen(pair.sender, pair.receiver);
      await expect(pair.sender.getByTestId("route")).toContainText("DIRECT", { timeout: 10_000 });
      await pair.sender.getByLabel("Source file").setInputFiles({
        name: "m7-direct-file.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(8 * 1024 * 1024, 0x44)
      });
      await pair.sender.getByRole("button", { name: "Offer File" }).click();
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("READY");
      await pair.receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
        timeout: 90_000
      });
      await recordEvidence(
        testInfo,
        "m7-direct-route.json",
        pair.sender,
        pair.receiver,
        "normal-direct",
        {
          delivered: true
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("forced relay delivers an M5 file with a verified route", async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const pair = await createPeerPair(browser, "RELAY_ONLY");
    try {
      await expectRelay(pair.sender, pair.receiver);
      await pair.sender.getByLabel("Source file").setInputFiles({
        name: "m7-relay-file.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(8 * 1024 * 1024, 0x71)
      });
      await pair.sender.getByRole("button", { name: "Offer File" }).click();
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("READY");
      await pair.receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
        timeout: 100_000
      });
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("DELIVERED", {
        timeout: 100_000
      });
      await recordEvidence(
        testInfo,
        "m7-forced-turn-single-file.json",
        pair.sender,
        pair.receiver,
        "forced-turn-single-file",
        {
          delivered: true,
          manifestRootVerified: true
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("forced relay delivers an M6 StreamPack folder", async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const pair = await createPeerPair(browser, "RELAY_ONLY");
    try {
      await expectRelay(pair.sender, pair.receiver);
      await pair.sender.getByRole("button", { name: "Load M6 Structural Fixture" }).click();
      await pair.sender.getByRole("button", { name: "Offer Folder" }).click();
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("READY");
      await pair.receiver.getByRole("button", { name: "Accept M6 Structural Fixture" }).click();
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
        timeout: 100_000
      });
      await expect(pair.receiver.getByTestId("streampack-tree-status")).toContainText("match", {
        timeout: 100_000
      });
      await recordEvidence(
        testInfo,
        "m7-forced-turn-folder.json",
        pair.sender,
        pair.receiver,
        "forced-turn-folder",
        {
          delivered: true,
          finalTreeMatches: true
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("direct to relay replacement preserves M5 transfer identity", async ({
    browser
  }, testInfo) => {
    test.setTimeout(180_000);
    const pair = await createPeerPair(browser, "AUTO", { nextPolicy: "RELAY_ONLY" });
    try {
      await expectDataOpen(pair.sender);
      await expect(pair.sender.getByTestId("route")).toContainText("DIRECT", { timeout: 10_000 });
      await pair.sender.getByLabel("Source file").setInputFiles({
        name: "m7-direct-relay-resume.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(40 * 1024 * 1024, 0x32)
      });
      await pair.sender.getByLabel("Integrity fault", { exact: true }).selectOption("payload");
      await pair.sender.getByLabel("Integrity fault block").fill("3");
      await pair.sender.getByRole("button", { name: "Apply Integrity Fault" }).click();
      await pair.sender.getByRole("button", { name: "Offer File" }).click();
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("READY");
      await pair.receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("SENDING", {
        timeout: 30_000
      });
      await expect
        .poll(async () => Number((await healthSnapshot(pair.sender)).safeBytes ?? 0), {
          timeout: 30_000
        })
        .toBeGreaterThan(0);
      const direct = await healthSnapshot(pair.sender);
      expect(direct.routeType).toBe("DIRECT");
      const transferId = await pair.sender
        .getByTestId("m4-recovery-metrics")
        .locator("dd")
        .first()
        .textContent();
      await pair.sender.getByRole("button", { name: "Break Current Transport" }).click();
      await expect
        .poll(async () => (await healthSnapshot(pair.sender)).healthState, { timeout: 30_000 })
        .toBe("RECOVERING");
      const recovering = await healthSnapshot(pair.sender);
      expect(recovering.bottleneck).toBe("RECOVERING");
      await expect(pair.sender.getByTestId("route")).toContainText("RELAY", { timeout: 40_000 });
      await expect(pair.sender.getByTestId("m4-recovery-metrics").locator("dd").first()).toHaveText(
        transferId ?? "pending"
      );
      await expect
        .poll(
          async () => {
            const snapshot = await healthSnapshot(pair.sender);
            return snapshot.routeType === "RELAY" && snapshot.healthState === "STARTING";
          },
          { timeout: 40_000 }
        )
        .toBe(true);
      const relayWarmup = await healthSnapshot(pair.sender);
      await expect
        .poll(
          async () => {
            const state = (await healthSnapshot(pair.sender)).healthState;
            return state === "GOOD" || state === "DEGRADED";
          },
          { timeout: 60_000 }
        )
        .toBe(true);
      const relayActive = await healthSnapshot(pair.sender);
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
        timeout: 120_000
      });
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("DELIVERED", {
        timeout: 120_000
      });
      await expect(pair.sender.getByTestId("m5-integrity-metrics")).toContainText(
        "Integrity retries1"
      );
      await recordEvidence(
        testInfo,
        "m7-direct-to-turn-resume.json",
        pair.sender,
        pair.receiver,
        "direct-to-turn-m5-resume",
        {
          routeBefore: "DIRECT",
          routeAfter: "RELAY",
          transferIdStable: true,
          verifiedCheckpointBeforeDisconnect: Number(direct.safeBytes ?? 0) > 0,
          delivered: true,
          manifestRootVerified: true,
          integrityAfterRouteSwitch: "one corrupted logical block retried",
          healthSequence: { direct, recovering, relayWarmup, relayActive }
        }
      );
      await recordM8RouteHealth(
        testInfo,
        { direct, recovering, relayWarmup, relayActive },
        {
          transferIdStable: true,
          verifiedCheckpointBeforeDisconnect: Number(direct.safeBytes ?? 0) > 0,
          delivered: true,
          manifestRootVerified: true,
          integrityRetryCount: 1
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("relay replacement stays on relay and preserves M5 recovery", async ({
    browser
  }, testInfo) => {
    test.setTimeout(180_000);
    const pair = await createPeerPair(browser, "RELAY_ONLY", { nextPolicy: "RELAY_ONLY" });
    try {
      await expectRelay(pair.sender, pair.receiver);
      await pair.sender.getByLabel("Source file").setInputFiles({
        name: "m7-relay-replacement.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(40 * 1024 * 1024, 0x27)
      });
      await pair.sender.getByRole("button", { name: "Offer File" }).click();
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("READY");
      await pair.receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("SENDING", {
        timeout: 30_000
      });
      await pair.sender.getByRole("button", { name: "Break Current Transport" }).click();
      await expect(pair.sender.getByTestId("route")).toContainText("RELAY", { timeout: 40_000 });
      await expect(pair.sender.getByTestId("route-metrics")).toHaveText(/replacements [1-2]$/, {
        timeout: 40_000
      });
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
        timeout: 120_000
      });
      await recordEvidence(
        testInfo,
        "m7-turn-replacement-resume.json",
        pair.sender,
        pair.receiver,
        "turn-to-turn-m5-resume",
        {
          routeBefore: "RELAY",
          routeAfter: "RELAY",
          delivered: true
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("direct to relay replacement preserves M6 StreamPack recovery", async ({
    browser
  }, testInfo) => {
    test.setTimeout(180_000);
    const pair = await createPeerPair(browser, "AUTO", { nextPolicy: "RELAY_ONLY" });
    try {
      await expect(pair.sender.getByTestId("route")).toContainText("DIRECT", { timeout: 10_000 });
      await pair.sender.getByRole("button", { name: "Load M6 Mixed Fixture" }).click();
      await pair.sender.getByRole("button", { name: "Offer Folder" }).click();
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("READY");
      await pair.receiver.getByRole("button", { name: "Accept M6 Mixed to OPFS" }).click();
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("SENDING", {
        timeout: 30_000
      });
      const transferId = await pair.sender
        .getByTestId("m4-recovery-metrics")
        .locator("dd")
        .first()
        .textContent();
      await pair.sender.getByRole("button", { name: "Break Current Transport" }).click();
      await expect(pair.sender.getByTestId("route")).toContainText("RELAY", { timeout: 40_000 });
      await expect(pair.sender.getByTestId("m4-recovery-metrics").locator("dd").first()).toHaveText(
        transferId ?? "pending"
      );
      await expectStreamPackTreeMatch(pair.sender, pair.receiver);
      await recordEvidence(
        testInfo,
        "m7-direct-to-turn-streampack-resume.json",
        pair.sender,
        pair.receiver,
        "direct-to-turn-m6-resume",
        {
          routeBefore: "DIRECT",
          routeAfter: "RELAY",
          transferIdStable: true,
          delivered: true,
          finalTreeMatches: true
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("relay-to-auto replacement preserves M5 recovery when direct reacquisition is available", async ({
    browser
  }, testInfo) => {
    test.setTimeout(180_000);
    const pair = await createPeerPair(browser, "RELAY_ONLY", { nextPolicy: "AUTO" });
    try {
      await expectRelay(pair.sender, pair.receiver);
      await pair.sender.getByLabel("Source file").setInputFiles({
        name: "m7-turn-direct-replacement.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(40 * 1024 * 1024, 0x28)
      });
      await pair.sender.getByRole("button", { name: "Offer File" }).click();
      await expect(pair.receiver.getByTestId("transfer-status")).toContainText("READY");
      await pair.receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("SENDING", {
        timeout: 30_000
      });
      const transferId = await pair.sender
        .getByTestId("m4-recovery-metrics")
        .locator("dd")
        .first()
        .textContent();
      await pair.sender.getByRole("button", { name: "Break Current Transport" }).click();
      await expect(pair.sender.getByTestId("route-metrics")).toContainText("replacements 1", {
        timeout: 40_000
      });
      await expect(pair.sender.getByTestId("m4-recovery-metrics").locator("dd").first()).toHaveText(
        transferId ?? "pending"
      );
      await expect(pair.sender.getByTestId("route")).toHaveText(/^(DIRECT|RELAY) /, {
        timeout: 10_000
      });
      const routeAfter = (await pair.sender.getByTestId("route").textContent()) ?? "UNKNOWN";
      expect(routeAfter).toMatch(/DIRECT|RELAY/);
      await expect(pair.sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
        timeout: 120_000
      });
      await recordEvidence(
        testInfo,
        "m7-turn-to-auto-resume.json",
        pair.sender,
        pair.receiver,
        "turn-to-auto-m5-resume",
        {
          routeBefore: "RELAY",
          routeAfter: routeAfter.startsWith("DIRECT") ? "DIRECT" : "RELAY",
          directReacquired: routeAfter.startsWith("DIRECT"),
          transferIdStable: true,
          delivered: true
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("invalid TURN credentials fail explicitly without opening a data route", async ({
    browser
  }, testInfo) => {
    test.setTimeout(60_000);
    const pair = await createPeerPair(browser, "RELAY_ONLY", { credentialMode: "invalid" });
    try {
      await expectConnectionError(pair.sender, "FS_TURN_AUTH_FAILED", 30_000, pair.receiver);
      await expect(pair.sender.getByTestId("data-state")).not.toHaveText("open");
      await recordEvidence(
        testInfo,
        "m7-invalid-turn-credentials.json",
        pair.sender,
        pair.receiver,
        "invalid-turn-credentials",
        {
          delivered: false,
          terminalError: "FS_TURN_AUTH_FAILED"
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("expired TURN credentials fail safely at a real coturn allocation", async ({
    browser
  }, testInfo) => {
    test.setTimeout(90_000);
    const pair = await createPeerPair(browser, "RELAY_ONLY", { credentialMode: "expired" });
    try {
      await expectConnectionError(pair.sender, "FS_TURN_UNREACHABLE", 70_000, pair.receiver);
      await recordEvidence(
        testInfo,
        "m7-expired-turn-credentials.json",
        pair.sender,
        pair.receiver,
        "expired-turn-credentials",
        {
          delivered: false,
          terminalError: "FS_TURN_UNREACHABLE"
        }
      );
    } finally {
      await pair.close();
    }
  });

  test("forced relay with no reachable relay fails after bounded recovery", async ({
    browser
  }, testInfo) => {
    test.setTimeout(90_000);
    const pair = await createPeerPair(browser, "RELAY_ONLY", { credentialMode: "unreachable" });
    try {
      await expectConnectionError(pair.sender, "FS_TURN_UNREACHABLE", 70_000, pair.receiver);
      await expect(pair.sender.getByTestId("data-state")).not.toHaveText("open");
      await recordEvidence(
        testInfo,
        "m7-route-exhaustion.json",
        pair.sender,
        pair.receiver,
        "unreachable-turn",
        {
          delivered: false,
          terminalError: "FS_TURN_UNREACHABLE"
        }
      );
    } finally {
      await pair.close();
    }
  });
});
