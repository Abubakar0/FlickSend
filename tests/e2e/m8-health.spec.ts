import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function health(page: Page): Promise<Record<string, unknown> | null> {
  const value = await page.getByTestId("m8-health-snapshot").textContent();
  return value ? (JSON.parse(value) as Record<string, unknown>) : null;
}

async function speedProof(page: Page): Promise<Record<string, unknown> | null> {
  const value = await page.getByTestId("m8-speed-proof").textContent();
  return value ? (JSON.parse(value) as Record<string, unknown>) : null;
}

async function recordEvidence(name: string, evidence: unknown): Promise<void> {
  const directory = join(process.cwd(), "test-results", "m8-evidence");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, name),
    JSON.stringify({ createdAt: new Date().toISOString(), ...(evidence as object) }, null, 2) + "\n"
  );
}

test("M8 observes an actual browser M5 transfer without exposing payload metadata", async ({
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
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });

  const fixture = Buffer.alloc(16 * 1024 * 1024);
  for (let index = 0; index < fixture.length; index += 1) fixture[index] = index % 251;
  await sender.getByLabel("Source file").setInputFiles({
    name: "m8-health-fixture.bin",
    mimeType: "application/octet-stream",
    buffer: fixture
  });
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  const startedAt = performance.now();
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 90_000
  });
  await expect(receiver.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 90_000
  });

  const [senderHealth, receiverHealth, senderProof, receiverProof] = await Promise.all([
    health(sender),
    health(receiver),
    speedProof(sender),
    speedProof(receiver)
  ]);
  expect(senderHealth?.measurementAvailability).toBeTruthy();
  expect(receiverHealth?.measurementAvailability).toBeTruthy();
  expect(senderHealth?.routeType).not.toBeUndefined();
  expect(senderProof?.schemaVersion).toBe(1);
  expect(receiverProof?.schemaVersion).toBe(1);
  expect(JSON.stringify(senderHealth)).not.toContain("m8-health-fixture.bin");
  expect(JSON.stringify(receiverHealth)).not.toContain("m8-health-fixture.bin");

  await recordEvidence("m8-browser-m5-health-work-rate-v2.json", {
    schemaVersion: 2,
    milestone: "M8",
    measurementSchema: "M8_WORK_RATE_V2",
    scenario: "browser-webrtc-m5-transfer-health",
    payloadBytes: fixture.byteLength,
    delivered: true,
    completionElapsedMs: performance.now() - startedAt,
    senderHealth,
    receiverHealth,
    senderSpeedProof: senderProof,
    receiverSpeedProof: receiverProof
  });
  await senderContext.close();
  await receiverContext.close();
});

test("M8 observer-off comparison preserves the verified M5 pipeline", async ({ browser }) => {
  test.setTimeout(120_000);
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  await sender.goto("/?health=off");
  await receiver.goto("/?health=off");
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  await receiver
    .getByLabel("Session code")
    .fill((await sender.getByTestId("session-code").textContent()) ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });

  const fixture = Buffer.alloc(16 * 1024 * 1024);
  for (let index = 0; index < fixture.length; index += 1) fixture[index] = index % 251;
  await sender.getByLabel("Source file").setInputFiles({
    name: "m8-observer-off-fixture.bin",
    mimeType: "application/octet-stream",
    buffer: fixture
  });
  await sender.getByRole("button", { name: "Offer File" }).click();
  await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
  const startedAt = performance.now();
  await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
  await expect(sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 90_000
  });
  await expect(receiver.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 90_000
  });

  expect(await health(sender)).toBeNull();
  expect(await health(receiver)).toBeNull();
  expect(await speedProof(sender)).toBeNull();
  expect(await speedProof(receiver)).toBeNull();
  await recordEvidence("m8-browser-observer-off-work-rate-v2.json", {
    schemaVersion: 2,
    milestone: "M8",
    measurementSchema: "M8_WORK_RATE_V2",
    scenario: "browser-webrtc-m5-observer-off-comparison",
    payloadBytes: fixture.byteLength,
    delivered: true,
    completionElapsedMs: performance.now() - startedAt,
    note: "Same-host comparison sample only; not a physical performance claim."
  });
  await senderContext.close();
  await receiverContext.close();
});
