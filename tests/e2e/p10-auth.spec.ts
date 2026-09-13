import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(result.violations, "P10 auth accessibility violations").toEqual([]);
}

test("P10 protects sender-side routes on the server and preserves a safe return path", async ({
  page
}) => {
  for (const route of ["/send", "/people", "/transfers", "/account"]) {
    await page.goto(`${route}?fixture=signed-out`);
    await expect(page).toHaveURL(
      new RegExp(`/sign-in\\?returnTo=${encodeURIComponent(route)}&fixture=signed-out`)
    );
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  }
});

test("P10 rejects external return destinations", async ({ page }) => {
  await page.goto("/sign-in?fixture=signed-out&returnTo=https%3A%2F%2Fevil.example");
  const continueLink = page.getByRole("link", { name: "Continue as development sender" });
  await expect(continueLink).toHaveAttribute("href", "/send?as=dev-sender");
  await expectNoAxeViolations(page);
});

test("P10 development sign-out returns to a signed-out screen and protects a new account request", async ({
  page
}) => {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(page.getByText("Signed in as Development sender.")).toBeVisible();
  await page.getByRole("link", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/account?fixture=signed-out");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("P10 keeps guest Receive public and does not let a fixture identity authorize an invalid session", async ({
  page
}) => {
  await page.goto("/receive/000000?as=dev-sender");
  await expect(
    page.getByRole("heading", { level: 1, name: "This transfer isn't available" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("P10 account and sign-in fixture surfaces meet the retained accessibility target", async ({
  page
}) => {
  await page.goto("/account");
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.goto("/sign-up?fixture=signed-out");
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expectNoAxeViolations(page);
});
