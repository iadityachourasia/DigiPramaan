import { expect, test } from "@playwright/test";

/**
 * Login — the seven states of `Pages_Userflow/01-login.md` §4.
 *
 * These assert behaviour a screenshot cannot: that the submit button is gated
 * on both fields, that a wrong password clears only the password, that the two
 * failure states are genuinely distinct, and that the guard round-trips a deep
 * link. Credentials are the seeded fixtures in `src/lib/mock/users.ts`.
 */

const OFFICER = { username: "r.deshmukh", password: "Demo@2026" };

/**
 * The form is a client island behind a Suspense boundary, so it is not in the
 * DOM on first paint. Waiting for a field rather than asserting immediately
 * keeps these tests from racing hydration under parallel load.
 */
async function awaitForm(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
}

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await awaitForm(page);
  });

  test("state 1: submit is gated until both fields have content", async ({
    page,
  }) => {
    const submit = page.getByRole("button", { name: "Sign in", exact: true });
    await expect(submit).toBeDisabled();

    await page.getByLabel("Username or email").fill(OFFICER.username);
    await expect(submit).toBeDisabled();

    await page.getByLabel("Password", { exact: true }).fill("anything");
    await expect(submit).toBeEnabled();
  });

  test("state 2: an invalid username format is reported on that field", async ({
    page,
  }) => {
    await page.getByLabel("Username or email").fill("a@");
    await page.getByLabel("Password", { exact: true }).fill("anything");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    /* Field-specific, and visible — not merely present in the DOM. */
    const error = page.locator("#login-username-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("valid email address");
  });

  test("state 3: a wrong password is generic and clears only the password", async ({
    page,
  }) => {
    await page.getByLabel("Username or email").fill(OFFICER.username);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    /*
     * Scoped to the component rather than `getByRole("alert")`. Next renders a
     * route announcer carrying that role on every page for screen readers, so
     * the bare role always matches something.
     */
    const banner = page.locator(".ux4g-alert.ux4g-alert-error");
    await expect(banner).toContainText("Invalid username or password");

    /* Never names which half was wrong — that would enumerate accounts. */
    await expect(banner).not.toContainText("password is incorrect");

    /* §3 step 7: password cleared, username kept. */
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Username or email")).toHaveValue(
      OFFICER.username
    );
  });

  test("state 6: valid credentials reach the dashboard", async ({ page }) => {
    await page.getByLabel("Username or email").fill(OFFICER.username);
    await page.getByLabel("Password", { exact: true }).fill(OFFICER.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("state 7: an expired session reads as a notice, not a failure", async ({
    page,
  }) => {
    await page.goto("/login?reason=expired");
    await awaitForm(page);

    const notice = page.locator(".ux4g-alert.ux4g-alert-warning");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("session expired");

    /* Distinct from a sign-in failure: no error banner on arrival. */
    await expect(page.locator(".ux4g-alert.ux4g-alert-error")).toHaveCount(0);
  });

  test("the password reveal toggle meets the 44px touch target", async ({
    page,
  }) => {
    const toggle = page.locator(".ux4g-input-action-btn").first();
    const box = await toggle.boundingBox();

    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("the reveal toggle switches the field between masked and plain", async ({
    page,
  }) => {
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");

    await page.locator(".ux4g-input-action-btn").first().click();
    await expect(password).toHaveAttribute("type", "text");
  });
});

test.describe("Route guard", () => {
  test("an authenticated route bounces to login and returns after sign-in", async ({
    page,
  }) => {
    await page.goto("/records");

    await expect(page).toHaveURL(/\/login\?next=/);

    await page.getByLabel("Username or email").fill(OFFICER.username);
    await page.getByLabel("Password", { exact: true }).fill(OFFICER.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    /* The deep link survives the round trip rather than dumping on dashboard. */
    await expect(page).toHaveURL(/\/records$/);
  });
});
