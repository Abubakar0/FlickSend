import { createHash } from "node:crypto";
import { chromium, expect, test } from "@playwright/test";
import { mkdir, open, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  BrowserTreeSampler,
  continuityFrom,
  healthFrom,
  integrityFrom,
  recoveryTimingFrom,
  speedProofFrom,
  writeM10Evidence
} from "./m10-evidence.js";

const sourcePath = process.env.FLICKSEND_M10_BENCHMARK_FILE;
const expectedBytes = Number(process.env.FLICKSEND_M10_EXPECTED_BYTES ?? "0");
const scenario = process.env.FLICKSEND_M10_SCENARIO ?? "normal";
const healthEnabled = process.env.FLICKSEND_M10_HEALTH !== "off";
const blockBytes = 8 * 1024 * 1024;
const profileRoot = process.env.FLICKSEND_M10_PROFILE_ROOT;
const isTenGiBQualification = expectedBytes >= 10 * 1024 ** 3;
const transferTimeoutMs = isTenGiBQualification ? 5_400_000 : 1_800_000;

test.skip(
  !sourcePath ||
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    !["normal", "resume"].includes(scenario),
  "Set FLICKSEND_M10_BENCHMARK_FILE, FLICKSEND_M10_EXPECTED_BYTES, and a normal or resume M10 scenario."
);

function fixtureSizeClass(bytes: number): string {
  const sizes = new Map([
    [1 * 1024 ** 3, "1_GIB"],
    [10 * 1024 ** 3, "10_GIB"],
    [25 * 1024 ** 3, "25_GIB"]
  ]);
  return sizes.get(bytes) ?? "OTHER_SIZE";
}

function qualificationProfiles(): { sender: string; receiver: string } | null {
  if (!profileRoot) return null;
  const root = resolve(profileRoot);
  if (basename(root) !== "m10-browser-profiles")
    throw new Error("FLICKSEND_M10_PROFILE_ROOT must end with m10-browser-profiles.");
  return { sender: join(root, "sender"), receiver: join(root, "receiver") };
}

async function persistentContext(
  profile: string
): Promise<import("@playwright/test").BrowserContext> {
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await mkdir(profile, { recursive: true });
  const executablePath = process.env.FLICKSEND_QUALIFICATION_BROWSER_PATH;
  return chromium.launchPersistentContext(profile, {
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });
}

async function connected(browser: import("@playwright/test").Browser) {
  const profiles = qualificationProfiles();
  const senderContext = profiles
    ? await persistentContext(profiles.sender)
    : await browser.newContext();
  const receiverContext = profiles
    ? await persistentContext(profiles.receiver)
    : await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  const target = healthEnabled ? "/" : "/?health=off";
  await sender.goto(target);
  await receiver.goto(target);
  await sender.getByRole("button", { name: "Create Session" }).click();
  await expect(sender.getByTestId("session-code")).not.toHaveText("none");
  await receiver
    .getByLabel("Session code")
    .fill((await sender.getByTestId("session-code").textContent()) ?? "");
  await receiver.getByRole("button", { name: "Join" }).click();
  await expect(sender.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  await expect(receiver.getByTestId("data-state")).toHaveText("open", { timeout: 30_000 });
  return { senderContext, receiverContext, sender, receiver, profiles };
}

async function fixtureMatches(
  page: import("@playwright/test").Page,
  name: string,
  source: string
): Promise<boolean> {
  const sourceDigests: string[] = [];
  const sourceFile = await open(source, "r");
  try {
    const buffer = Buffer.allocUnsafe(blockBytes);
    for (let offset = 0; offset < expectedBytes; offset += blockBytes) {
      const length = Math.min(blockBytes, expectedBytes - offset);
      const { bytesRead } = await sourceFile.read(buffer, 0, length, offset);
      if (bytesRead !== length) return false;
      sourceDigests.push(createHash("sha256").update(buffer.subarray(0, length)).digest("hex"));
    }
  } finally {
    await sourceFile.close();
  }
  return page.evaluate(
    async ({ name, expectedBytes, blockBytes, sourceDigests }) => {
      const file = await (
        await (await navigator.storage.getDirectory()).getFileHandle(name)
      ).getFile();
      if (file.size !== expectedBytes) return false;
      for (let offset = 0, block = 0; offset < file.size; offset += blockBytes, block += 1) {
        const bytes = await file.slice(offset, offset + blockBytes).arrayBuffer();
        const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const actualDigest = Array.from(actual, (value) =>
          value.toString(16).padStart(2, "0")
        ).join("");
        if (actualDigest !== sourceDigests[block]) return false;
      }
      return true;
    },
    { name, expectedBytes, blockBytes, sourceDigests }
  );
}

test("M10 same-host physical browser qualification", async ({ browser }) => {
  // Browser-side manifest construction hashes every logical block before a 10 GiB offer.
  test.setTimeout(transferTimeoutMs + 900_000);
  const { senderContext, receiverContext, sender, receiver, profiles } = await connected(browser);
  const sampler = new BrowserTreeSampler();
  const startedAt = performance.now();
  try {
    await sampler.start();
    await sender.getByLabel("Source file").setInputFiles(sourcePath!);
    await sender.getByRole("button", { name: "Offer File" }).click();
    await expect(receiver.getByTestId("transfer-status")).toContainText("READY");
    await receiver.getByRole("button", { name: "Accept to OPFS Benchmark Storage" }).click();
    if (scenario === "resume") {
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
          { timeout: transferTimeoutMs }
        )
        .toBeGreaterThanOrEqual(Math.floor(expectedBytes / 2));
      await sender.getByRole("button", { name: "Simulate Transport Disconnect" }).click();
    }
    await expect(sender.getByTestId("transfer-status")).toContainText("DELIVERED", {
      timeout: transferTimeoutMs
    });
    await expect(receiver.getByTestId("transfer-status")).toContainText("DELIVERED", {
      timeout: transferTimeoutMs
    });
    const [
      senderIntegrity,
      receiverIntegrity,
      continuity,
      senderHealth,
      receiverHealth,
      speedProof
    ] = await Promise.all([
      integrityFrom(sender),
      integrityFrom(receiver),
      continuityFrom(sender),
      healthFrom(sender),
      healthFrom(receiver),
      speedProofFrom(sender)
    ]);
    expect(receiverIntegrity.manifestRootVerified).toBe(true);
    expect(Number(continuity.duplicateRetransmittedBytes)).toBe(0);
    expect(Number(continuity.committedBlocksRetransmitted)).toBe(0);
    const destinationFixtureMatch = await fixtureMatches(
      receiver,
      basename(sourcePath!),
      sourcePath!
    );
    expect(destinationFixtureMatch).toBe(true);
    await sampler.stop();
    const durationMs = performance.now() - startedAt;
    await writeM10Evidence(
      `m10-same-host-${fixtureSizeClass(expectedBytes).toLowerCase()}-${scenario}-${healthEnabled ? "health-on" : "health-off"}`,
      {
        schemaVersion: 1,
        milestone: "M10",
        recordType: "SAME_HOST_BROWSER_TRANSFER",
        capturedAt: new Date().toISOString(),
        evidenceClass: "SAME_HOST_PHYSICAL_BROWSER",
        topology: "SINGLE_MACHINE_ONLY",
        scenario,
        fixtureSizeClass: fixtureSizeClass(expectedBytes),
        healthObserver: healthEnabled ? "ENABLED" : "DISABLED",
        route: (await sender.getByTestId("route").textContent())?.includes("DIRECT")
          ? "DIRECT"
          : "UNKNOWN",
        transfer: {
          senderDelivered: true,
          receiverDelivered: true,
          senderManifestRootObserved: senderIntegrity.manifestRootVerified,
          receiverManifestRootVerified: receiverIntegrity.manifestRootVerified,
          receiverFixtureBytesVerified:
            receiverIntegrity.blocksVerified === Math.ceil(expectedBytes / blockBytes),
          destinationFixtureMatch,
          continuity,
          senderIntegrity,
          receiverIntegrity
        },
        measurement: {
          durationMs,
          averagePayloadBytesPerSecond: (expectedBytes * 1000) / durationMs,
          senderHealth,
          receiverHealth,
          speedProof,
          recoveryReconciliationMs: scenario === "resume" ? await recoveryTimingFrom(sender) : null
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
      }
    );
  } finally {
    await sampler.stop().catch(() => undefined);
    await senderContext.close();
    await receiverContext.close();
    if (profiles)
      await Promise.all([
        rm(profiles.sender, { recursive: true, force: true, maxRetries: 3 }),
        rm(profiles.receiver, { recursive: true, force: true, maxRetries: 3 })
      ]);
  }
});
