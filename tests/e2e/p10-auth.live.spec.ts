import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

test("P10 live Clerk qualification", async ({ page }) => {
  test.setTimeout(90_000);

  const persistentDataAvailable = Boolean(process.env.DATABASE_URL);
  const emailAddress = `flicksend-p10+clerk_test_${Date.now()}@example.com`;
  const externalId = `flicksend-p10-live-${Date.now()}`;
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const testUser = await clerkClient.users.createUser({
    emailAddress: [emailAddress],
    externalId,
    skipPasswordRequirement: true
  });

  try {
    await page.goto("/");
    await clerk.signIn({ page, emailAddress });

    await page.goto("/send");
    await expect(
      page.getByRole("heading", {
        name: persistentDataAvailable ? "Send" : "Send is temporarily unavailable"
      })
    ).toBeVisible();

    await page.goto("/people");
    await expect(
      page.getByRole("heading", {
        name: persistentDataAvailable ? "People" : "People is temporarily unavailable"
      })
    ).toBeVisible();

    await page.goto("/receive/000000");
    await expect(
      page.getByRole("heading", { level: 1, name: "This transfer isn't available" })
    ).toBeVisible();

    await page.goto("/sign-in?returnTo=https%3A%2F%2Fevil.example");
    await expect(page).toHaveURL("http://127.0.0.1:3002/send");

    await page.goto("/");
    await clerk.signOut({ page, signOutOptions: { redirectUrl: "/sign-in" } });

    await page.goto("/send");
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fsend$/);

    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Faccount$/);

    await page.goto("/receive/000000");
    await expect(
      page.getByRole("heading", { level: 1, name: "This transfer isn't available" })
    ).toBeVisible();
  } finally {
    await clerkClient.users.deleteUser(testUser.id);
    const remaining = await clerkClient.users.getUserList({ externalId: [externalId] });
    expect(remaining.data).toHaveLength(0);
  }
});
