import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Demo@2026";

async function signInAs(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectKpis(page: Page, values: readonly number[]) {
  const labels = ["Products Scanned", "Compliant", "Non-Compliant", "Pending"];
  for (const [index, label] of labels.entries()) {
    await expect(page.getByRole("link", { name: new RegExp(`^${label}\\b[\\s\\S]*${values[index]}`) })).toBeVisible();
  }
}

test.describe("Dashboard jurisdiction scoping", () => {
  test("each account receives the KPI and recent-scan collection its dashboard may see", async ({ page }) => {
    for (const account of [
      { username: "r.deshmukh", kpis: [7, 1, 3, 2], recent: "Deccan Dishwash Gel 750 ml" },
      { username: "s.iyer", kpis: [11, 2, 5, 3], recent: "Aravalli Cotton Bedsheet Set" },
      { username: "a.banerjee", kpis: [11, 2, 5, 3], recent: "Aravalli Cotton Bedsheet Set" },
      { username: "p.kulkarni", kpis: [2, 1, 0, 1], recent: "Deccan Dishwash Gel 750 ml" },
      { username: "v.jadhav", kpis: [0, 0, 0, 0], recent: null },
    ]) {
      await signInAs(page, account.username);
      await expectKpis(page, account.kpis);
      if (account.recent) await expect(page.getByText(account.recent).locator("visible=true")).toHaveCount(1);
      else await expect(page.getByText("No scans yet")).toBeVisible();
      await page.getByRole("button", { name: "Log out" }).click();
    }
  });

  test("shows the pre-sorted National roll-up to Admin and Reviewer only", async ({ page }) => {
    for (const username of ["s.iyer", "a.banerjee"]) {
      await signInAs(page, username);
      await expect(page.getByRole("heading", { name: "Regional distribution" })).toBeVisible();
      await expect(page.getByText("Bihar").locator("visible=true")).toHaveCount(1);
      await page.getByRole("button", { name: "Log out" }).click();
    }
    for (const username of ["p.kulkarni", "r.deshmukh", "v.jadhav"]) {
      await signInAs(page, username);
      await expect(page.getByRole("heading", { name: "Regional distribution" })).toHaveCount(0);
      await page.getByRole("button", { name: "Log out" }).click();
    }
  });
});
