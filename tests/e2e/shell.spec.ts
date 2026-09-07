import { expect, test, type Page } from "@playwright/test";

/**
 * Authenticated shell — role-gated navigation.
 *
 * Asserts the Role Permission Matrix in `Pages_Userflow/00-README.md` §C as it
 * actually renders. Reviewer is the interesting case: full read access and
 * reporting, but no scanning, so it must lose exactly the two entries that
 * create compliance records and keep everything else.
 */

const ACCOUNTS = {
  officer: { username: "r.deshmukh", role: "Enforcement Officer", navCount: 7 },
  admin: { username: "s.iyer", role: "Admin", navCount: 8 },
  reviewer: { username: "a.banerjee", role: "Reviewer", navCount: 6 },
} as const;

const PASSWORD = "Demo@2026";

async function signIn(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Role-gated navigation", () => {
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    test(`${key} sees ${account.navCount} navigation items`, async ({ page }) => {
      await signIn(page, account.username);

      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await expect(nav.getByRole("link")).toHaveCount(account.navCount);
    });
  }

  test("Reviewer loses exactly the two scan-creating entries", async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.reviewer.username);
    const nav = page.getByRole("navigation", { name: "Main navigation" });

    /* Cannot create scans. */
    await expect(
      nav.getByRole("link", { name: "Scan / Upload Product" })
    ).toHaveCount(0);
    await expect(
      nav.getByRole("link", { name: "E-commerce Listing Scanner" })
    ).toHaveCount(0);

    /* Retains full read access and reporting. */
    await expect(nav.getByRole("link", { name: "Compliance Records" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Analytics & Violation Trends" })
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Manufacturer Scorecard" })
    ).toBeVisible();
    await expect(nav.getByRole("link", { name: "Reports & Profile" })).toBeVisible();
    /* Gains the oversight surface an Enforcement Officer does not get. */
    await expect(nav.getByRole("link", { name: "Activity Log" })).toBeVisible();
  });

  test("Enforcement Officer keeps the scan-creating entries", async ({ page }) => {
    await signIn(page, ACCOUNTS.officer.username);
    const nav = page.getByRole("navigation", { name: "Main navigation" });

    await expect(
      nav.getByRole("link", { name: "Scan / Upload Product" })
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "E-commerce Listing Scanner" })
    ).toBeVisible();

    /* The one entry that runs the other way: the Activity Log is an oversight
     * surface about what officers did, so an officer does not get it. */
    await expect(nav.getByRole("link", { name: "Activity Log" })).toHaveCount(0);
  });
});

test.describe("Shell chrome", () => {
  test("the header shows the signed-in role as a labelled badge", async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.admin.username);

    /* A-14: the role is readable text, not colour alone. */
    await expect(page.locator(".lmcs-header-user")).toContainText(
      ACCOUNTS.admin.role
    );
  });

  test("signing out clears the session and returns to login", async ({ page }) => {
    await signIn(page, ACCOUNTS.officer.username);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    /* The session is gone, not merely navigated away from. */
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
