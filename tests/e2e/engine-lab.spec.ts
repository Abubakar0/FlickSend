import { expect, test } from "@playwright/test";

test("two browser contexts negotiate channels and complete the M5 verified file pipeline", async ({
  browser
}) => {
  const creatorContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const joiner = await joinerContext.newPage();

  await creator.goto("/");
  await joiner.goto("/");
  await creator.getByRole("button", { name: "Create Session" }).click();
  await expect(creator.getByTestId("session-code")).not.toHaveText("none");

  const code = await creator.getByTestId("session-code").textContent();
  await joiner.getByLabel("Session code").fill(code ?? "");
  await joiner.getByRole("button", { name: "Join" }).click();

  await expect(creator.getByTestId("control-state")).toHaveText("open", { timeout: 20_000 });
  await expect(joiner.getByTestId("control-state")).toHaveText("open", { timeout: 20_000 });
  await expect(creator.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });
  await expect(joiner.getByTestId("data-state")).toHaveText("open", { timeout: 20_000 });

  await creator.getByRole("button", { name: "Send HELLO" }).click();
  await expect(joiner.getByTestId("proof-status")).toContainText("HELLO received");
  await creator.getByRole("button", { name: "Send Binary Test" }).click();
  await expect(joiner.getByTestId("proof-status")).toContainText("verified 1048576 bytes");

  const fixture = Buffer.alloc(256 * 1024);
  for (let index = 0; index < fixture.length; index += 1) fixture[index] = (index * 17) % 251;
  await creator.getByLabel("Source file").setInputFiles({
    name: "m2-fixture.bin",
    mimeType: "application/octet-stream",
    buffer: fixture
  });
  await creator.getByRole("button", { name: "Offer File" }).click();
  await expect(joiner.getByTestId("transfer-status")).toContainText("m2-fixture.bin: READY");
  await joiner.getByRole("button", { name: "Accept Small Test Fixture" }).click();
  await expect(creator.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 20_000
  });
  await expect(joiner.getByTestId("transfer-status")).toContainText("DELIVERED", {
    timeout: 20_000
  });
  await expect(creator.getByTestId("m3-metrics")).toContainText("Current speed");
  await expect(joiner.getByTestId("m5-integrity-metrics")).toContainText("verified");

  await creatorContext.close();
  await joinerContext.close();
});
