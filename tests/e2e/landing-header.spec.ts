import { expect, test } from "@playwright/test";

test("landing header navigation and search work at each viewport", async ({ page }) => {
  await page.goto("/");

  const officialImages = page.locator(
    ".lmcs-government-emblem, .lmcs-department-wordmark img"
  );
  await expect(officialImages).toHaveCount(2);
  expect(
    await officialImages.evaluateAll((images) =>
      images.every(
        (image) => image instanceof HTMLImageElement && image.naturalWidth > 0
      )
    )
  ).toBe(true);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();

  const navigation = page.getByRole("navigation", { name: "Site sections" });
  await expect(navigation).toBeVisible();
  const themeBounds = await navigation
    .getByRole("button", { name: "Dark mode" })
    .boundingBox();
  const searchBounds = await navigation
    .getByRole("button", { name: "Search the site" })
    .boundingBox();
  expect((themeBounds?.x ?? 0) + (themeBounds?.width ?? Infinity)).toBeLessThanOrEqual(
    searchBounds?.x ?? 0
  );
  const utilityHeight = await page
    .locator(".lmcs-masthead-utility")
    .evaluate((bar) => bar.getBoundingClientRect().height);
  expect(utilityHeight).toBeLessThanOrEqual(
    (page.viewportSize()?.width ?? 0) < 768 ? 130 : 56
  );

  if ((page.viewportSize()?.width ?? 0) < 1400) {
    await navigation.getByRole("button", { name: "Open menu" }).click();
    await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(navigation.getByRole("link", { name: "How it works" })).toBeVisible();
    await navigation.getByRole("button", { name: "Close menu" }).click();
  } else {
    await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(navigation.getByRole("link", { name: "How it works" })).toBeVisible();
  }

  await navigation.getByRole("button", { name: "Search the site" }).click();
  const dialog = page.getByRole("dialog", { name: "Search the site" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("searchbox", { name: "Search site sections" })
  ).toBeFocused();
  await dialog
    .getByRole("searchbox", { name: "Search site sections" })
    .fill("resources");
  await expect(dialog.getByRole("link", { name: "Resources" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Home" })).toHaveCount(0);
  await dialog.getByRole("link", { name: "Resources" }).click();
  await expect(page).toHaveURL(/\/help$/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
});

test("display size choice is accessible and persists across reloads", async ({
  page,
}) => {
  await page.goto("/");
  const sizeButton = page.getByRole("button", { name: "Larger display size" });
  const bounds = await sizeButton.boundingBox();
  expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);

  await sizeButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-display-size", "large");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Larger display size" })
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Largest display size" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-display-size", "larger");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
});
