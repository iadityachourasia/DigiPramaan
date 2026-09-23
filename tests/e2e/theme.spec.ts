import { expect, test } from "@playwright/test";

test("theme defaults to light regardless of the system preference, then keeps a manual choice across pages and reloads", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const themeButton = page.getByRole("button", { name: "Dark mode" });
  await expect(themeButton).toHaveAttribute("aria-pressed", "false");

  const hitArea = await themeButton.boundingBox();
  expect(hitArea?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(hitArea?.height ?? 0).toBeGreaterThanOrEqual(44);

  await themeButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeButton).toHaveAttribute("aria-pressed", "true");

  await page.goto("/grievance");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto("/scan/mobile");
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("analytics chart colours update when the theme changes", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "lmcs-session",
      JSON.stringify({
        user: {
          id: "usr-002",
          username: "s.iyer",
          fullName: "Sunita Iyer",
          email: "s.iyer@doca.gov.in",
          role: "Admin",
          department: "Department of Consumer Affairs",
          region: "Delhi",
          jurisdictionId: "national",
          lastLoginAt: "2026-09-05T08:40:00+05:30",
        },
        token: "mock-session-usr-002",
        refreshToken: "mock-refresh-usr-002",
        expiresAt: "2099-01-01T00:00:00.000Z",
      })
    );
  });

  await page.goto("/analytics");
  const line = page.locator(".recharts-line-curve").first();
  await expect(line).toBeVisible();
  const lightStroke = await line.getAttribute("stroke");

  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => line.getAttribute("stroke")).not.toBe(lightStroke);
});
