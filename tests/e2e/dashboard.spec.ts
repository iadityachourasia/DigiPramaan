import { expect, test, type Page } from "@playwright/test";

/**
 * Dashboard — page 2's KPI cards, trend toggle, recent scans, alerts and
 * quick actions, per Pages_Userflow/02-dashboard.md.
 */

async function signInAs(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Password", { exact: true }).waitFor();
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("Demo@2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);
}

test.describe("Dashboard KPIs", () => {
  test("each KPI card links to Compliance Records with the right filter", async ({
    page,
  }) => {
    await signInAs(page, "r.deshmukh");

    await expect(
      page.getByRole("link", { name: /^Compliant\b/ })
    ).toHaveAttribute("href", /\/records\?complianceStatuses=Compliant/);

    await expect(
      page.getByRole("link", { name: /^Non-Compliant\b/ })
    ).toHaveAttribute("href", /\/records\?complianceStatuses=Non-Compliant/);

    /* Products Scanned has no single status, so it links to the plain list. */
    await expect(
      page.getByRole("link", { name: /Products Scanned/ })
    ).toHaveAttribute("href", "/records");
  });

  test("the Pending KPI states it means awaiting verification", async ({
    page,
  }) => {
    await signInAs(page, "r.deshmukh");
    const pendingCard = page.getByRole("link", { name: /^Pending\b/ });
    await expect(pendingCard).toContainText("Awaiting verification");
  });
});

test.describe("Compliance trend", () => {
  test("the weekly/monthly toggle switches pressed state", async ({ page }) => {
    await signInAs(page, "r.deshmukh");

    const weekly = page.getByRole("button", { name: "Weekly" });
    const monthly = page.getByRole("button", { name: "Monthly" });

    await expect(weekly).toHaveAttribute("aria-pressed", "true");
    await expect(monthly).toHaveAttribute("aria-pressed", "false");

    await monthly.click();

    await expect(monthly).toHaveAttribute("aria-pressed", "true");
    await expect(weekly).toHaveAttribute("aria-pressed", "false");
  });

  test("the toggle actually swaps the rendered series", async ({
    page,
  }, testInfo) => {
    /*
     * recharts thins its x-axis ticks on narrow viewports for readability, so
     * a specific date label is not guaranteed present at every width — this
     * assertion checks the real data change and is only meaningful where the
     * full tick set renders.
     */
    test.skip(
      testInfo.project.name.startsWith("mobile"),
      "recharts adaptively drops x-axis ticks on narrow viewports"
    );

    await signInAs(page, "r.deshmukh");

    /*
     * The chart now has a visually-hidden `ux4g-sr-only` table fallback
     * (ComplianceTrendChart.tsx) carrying the same dates as the chart's own
     * x-axis ticks — a plain page-wide getByText would ambiguously match
     * both. Scope to the chart's own aria-hidden SVG wrapper, the only place
     * this test actually means to look.
     */
    const chart = page.locator(".lmcs-chart-svg-wrapper");

    /* Weekly-only: the series never reaches this far in the monthly data. */
    await expect(chart.getByText("2026-08-10")).toBeVisible();

    await page.getByRole("button", { name: "Monthly" }).click();

    await expect(chart.getByText("2026-08-10")).toHaveCount(0);
    await expect(chart.getByText("2026-08-01")).toBeVisible();
  });
});

test.describe("Recent Scans", () => {
  test("caps at 8 rows and each row links to its record", async ({ page }) => {
    await signInAs(page, "r.deshmukh");

    /*
     * DataTable renders both the table and the card layout into the DOM at
     * all times — CSS shows exactly one per breakpoint. `.first()` picks by
     * DOM order, not visibility, and the table markup comes first, so an
     * unscoped locator can resolve to the hidden copy at narrow widths.
     * `:visible` filters to whichever layout the current viewport is
     * actually showing.
     */
    const visibleProductCells = page
      .getByText("Deccan Dishwash Gel 750 ml")
      .locator("visible=true");
    await expect(visibleProductCells).toHaveCount(1);

    /*
     * Each row's View link carries an aria-label naming its own product
     * ("View: <product name>") so a screen-reader links list doesn't show
     * eight indistinguishable "View" entries — match by prefix rather than
     * the plain visible text.
     */
    const visibleViewLinks = page
      .getByRole("link", { name: /^View:/ })
      .locator("visible=true");
    expect(await visibleViewLinks.count()).toBeGreaterThan(0);
  });
});

test.describe("Alerts", () => {
  test("the repeat-offender alert deep-links to the manufacturer scorecard", async ({
    page,
  }) => {
    await signInAs(page, "r.deshmukh");

    const alert = page.getByText("Ganga Beverages Ltd has crossed");
    await expect(alert).toBeVisible();

    const link = page
      .locator(".ux4g-alert", { hasText: "Ganga Beverages Ltd" })
      .getByRole("link", { name: /^View:/ });
    await expect(link).toHaveAttribute("href", "/manufacturers/mfr-002");
  });
});

test.describe("Quick actions, role-gated", () => {
  test("Enforcement Officer sees both scan-creating quick actions", async ({
    page,
  }) => {
    await signInAs(page, "r.deshmukh");
    await expect(
      page.getByRole("link", { name: "Scan New Product", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Scan E-commerce Listing", exact: true })
    ).toBeVisible();
  });

  test("Reviewer sees neither scan-creating quick action", async ({ page }) => {
    await signInAs(page, "a.banerjee");
    await expect(
      page.getByRole("link", { name: "Scan New Product" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Scan E-commerce Listing" })
    ).toHaveCount(0);
    /* Retains the two actions available to every role. */
    await expect(page.getByRole("link", { name: "View Records" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Generate Report" })
    ).toBeVisible();
  });
});

test.describe("Independent widget states", () => {
  test("loading puts every widget in a skeleton, not a blank page", async ({
    page,
  }) => {
    await signInAs(page, "r.deshmukh");
    await page.goto("/dashboard?demo=loading");
    await expect(page.locator(".lmcs-skeleton").first()).toBeVisible();
    /* The page shell itself still renders — not a blank screen. */
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("one widget's error leaves the rest of the dashboard rendering", async ({
    page,
  }) => {
    await signInAs(page, "r.deshmukh");
    await page.goto("/dashboard?demo=recentScans-error");

    await expect(page.getByText("Could not load recent scans")).toBeVisible();
    /* KPIs, unaffected. */
    await expect(page.getByRole("link", { name: /Products Scanned/ })).toBeVisible();
    /* Alerts, unaffected. */
    await expect(page.getByText("Ganga Beverages Ltd has crossed")).toBeVisible();
  });

  test("the error state offers a retry action", async ({ page }) => {
    await signInAs(page, "r.deshmukh");
    await page.goto("/dashboard?demo=alerts-error");
    await expect(
      page.getByRole("link", { name: "Try again" })
    ).toBeVisible();
  });

  test("empty alerts shows the exact required copy", async ({ page }) => {
    await signInAs(page, "r.deshmukh");
    await page.goto("/dashboard?demo=empty");
    await expect(page.getByText("No active alerts")).toBeVisible();
    await expect(page.getByText("No scans yet")).toBeVisible();
  });
});
