import { expect, test } from "@playwright/test";

test("design-system showcase is a responsive fixture-only surface", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/design-system");

  await expect(
    page.getByRole("heading", { name: "A calmer way to show serious work." })
  ).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project transfer" })).toHaveAttribute(
    "aria-valuenow",
    "67"
  );
  await expect(page.getByText("Your verified progress is safe.")).toBeVisible();
  await expect(page.getByText("P3-SHOWCASE-ERROR")).toBeVisible();
  await expect(page.getByText("Aurelia Montgomery-Smythe-Rivera")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => {
      const activeElement = document.activeElement;
      return activeElement instanceof HTMLElement && activeElement.matches(":focus-visible");
    })
  ).toBe(true);

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Needs attention").first()).toBeVisible();
  await page.getByRole("button", { name: "System" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");

  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Open dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "Dialog primitive" });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((element) => element.getBoundingClientRect().width <= window.innerWidth)
  ).toBe(true);
  await page.keyboard.press("Escape");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.locator(".fs-progress--indeterminate").evaluate((element) => {
      return getComputedStyle(element, "::after").animationDuration;
    })
  ).toBe("0.001s");
  expect(pageErrors).toEqual([]);
});
