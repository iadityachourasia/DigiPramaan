import { expect, test, type Page } from "@playwright/test";

async function signInAsPriya(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Password", { exact: true }).waitFor();
  await page.getByLabel("Username or email").fill("p.kulkarni");
  await page.getByLabel("Password", { exact: true }).fill("Demo@2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);
}

test.describe("Jurisdiction-scoped direct detail", () => {
  test("Priya receives the shared blocked state for an out-of-jurisdiction record", async ({
    page,
  }) => {
    await signInAsPriya(page);
    await page.goto("/records/rec-1002");

    await expect(
      page.getByText("Record not found or outside your jurisdiction", { exact: true })
    ).toBeVisible();
  });

  test("Priya receives the shared blocked state for an out-of-jurisdiction manufacturer", async ({
    page,
  }) => {
    await signInAsPriya(page);
    await page.goto("/manufacturers/mfr-002");

    await expect(
      page.getByText("Manufacturer not found or outside your jurisdiction", { exact: true })
    ).toBeVisible();
  });
});
