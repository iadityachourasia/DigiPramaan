#!/usr/bin/env node
/**
 * visual-qa.mjs — the screenshot half of VISUAL_QA_LOOP.md, as a repeatable sweep.
 *
 * Produces the full matrix the loop requires: every route at mobile, tablet and
 * desktop, in both themes. Use the browser MCP for per-page checking while building;
 * use this for the Phase 6 full-site pass where one command beats forty tool calls.
 *
 * ONE CORRECTION TO THE SKILL'S SAMPLE SCRIPT, DELIBERATE AND VERIFIED
 * --------------------------------------------------------------------
 * VISUAL_QA_LOOP.md §1's sample toggles dark mode with Playwright's
 * `colorScheme: "dark"` context option, which drives the prefers-color-scheme media
 * query. ux4g-web-components@2.0.1 ships no prefers-color-scheme rule at all. Its
 * dark theme is 114 custom properties redefined under `:root[data-theme=dark]`, and
 * five further rules keyed to the same attribute. Passing colorScheme alone would
 * screenshot the light theme twice and quietly report a dark-mode pass that never
 * happened, so this script sets the attribute itself after load, and still passes
 * colorScheme for any component that reads the media query directly.
 *
 * ROUTES ARE WRITTEN WITHOUT A LEADING SLASH
 * ------------------------------------------
 * Say `home` for the root and `login` for /login. Git Bash on Windows rewrites a
 * bare `/` argument into a Windows path before Node ever sees it, which produced a
 * nonsense URL and a confusing Playwright error. Taking slashless names avoids the
 * whole class of problem and reads the same on every shell. A leading slash is still
 * accepted for anyone who prefers it on macOS or Linux.
 *
 * Usage:
 *   node scripts/visual-qa.mjs home                    the root route
 *   node scripts/visual-qa.mjs home login dashboard    several
 *   BASE_URL=http://localhost:3001 node scripts/visual-qa.mjs home
 */

import fs from "node:fs";

import { chromium } from "playwright";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/visual-qa.mjs home [login] [dashboard] ...");
  console.error('       Write routes without a leading slash. "home" means "/".');
  process.exit(1);
}

const routes = args.map((arg) => {
  const trimmed = arg.trim();
  if (trimmed === "home" || trimmed === "/" || trimmed === ".") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
});

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * Widths chosen from the pixel ranges in DESIGN_SYSTEM.md §8, not from device names.
 * §8's naming trap matters here: a 768px portrait tablet resolves to the Mobile
 * 4-column grid, so 1024 is the narrowest width that exercises the Tablet grid.
 */
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 1024, height: 1366 },
  { name: "desktop", width: 1440, height: 900 },
];

const themes = ["light", "dark"];
const outDir = "qa-screenshots";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const consoleProblems = [];

for (const route of routes) {
  const safeName =
    route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "_");

  for (const vp of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });

      /*
       * The theme attribute is applied after load, not through an init script.
       *
       * Setting data-theme before React hydrates makes the client markup differ
       * from the server's <html>, and React reports that as a hydration mismatch —
       * a loud error in the console capture below that is entirely an artefact of
       * the harness. Applying it after load keeps the capture honest. Screenshots
       * are taken after networkidle, so nothing is captured mid-swap.
       *
       * If the product ever ships a real theme toggle, the app itself will set this
       * attribute and <html> will need suppressHydrationWarning. That is a product
       * change, not something to fake here.
       */
      const page = await context.newPage();

      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleProblems.push(`${route} ${vp.name}/${theme}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        consoleProblems.push(`${route} ${vp.name}/${theme}: ${error.message}`);
      });

      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });

      /* Apply the package's dark-theme attribute once the page has settled. */
      await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
      }, theme);

      /* Horizontal overflow is axis 8 of the rubric and is cheap to measure here. */
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      );
      if (overflows) {
        consoleProblems.push(
          `${route} ${vp.name}/${theme}: page scrolls horizontally (rubric axis 8)`
        );
      }

      await page.screenshot({
        path: `${outDir}/${safeName}__${vp.name}__${theme}.png`,
        fullPage: true,
      });

      await context.close();
    }
  }
}

await browser.close();

console.log(
  `Wrote ${routes.length * viewports.length * themes.length} screenshots to ${outDir}/`
);

if (consoleProblems.length > 0) {
  console.error("\nProblems found while capturing:");
  for (const problem of [...new Set(consoleProblems)]) {
    console.error("  - " + problem);
  }
  process.exitCode = 1;
} else {
  console.log("No console errors and no horizontal overflow on any capture.");
}
