# VISUAL_QA_LOOP.md
### The feedback loop that makes "expertly designed" achievable, not just "spec-compliant"

Every other file in this set is a rule Claude Code follows *before* looking at the result. None of them make Claude Code actually look at what it built. This file closes that gap. **Run this loop at every checkpoint named in `IMPLEMENTATION_GUIDE.md`'s build order** — it is not optional polish, it is the mechanism that catches what token/component compliance alone cannot.

This is also, independently, Anthropic's own stated practice for its official `frontend-design` skill: *"Critique your own work as you build, taking screenshots to review if your environment supports it — a picture is worth 1000 tokens."* This file is that principle made concrete and repeatable for a multi-page government build.

---

## 1. Setup — two ways to get eyes on the build, pick based on what's available

### Preferred: Chrome DevTools MCP or Playwright MCP (live, interactive)

If either is connected (see `MCP_AND_TOOLING_SETUP.md` for setup), use it directly instead of a standalone script — Claude drives the browser live: navigate, screenshot, resize viewport, read console errors, inspect a specific element's computed styles, all as tool calls in the same session.

**Tool choice inside the loop — this matters for cost, not just capability:** both servers' own docs default-recommend calling their "snapshot" tool (an accessibility-tree dump) before a screenshot. For this loop specifically, that default is backwards. Measured token costs put a full snapshot at roughly **5.5× the cost of a screenshot**, and a screenshot at a small fraction of a narrowly-targeted script call for something like "how wide is this element." Rule for this loop:
- **Visual/compositional check (this file's actual job) → screenshot.** You need pixels, not an accessibility tree; a tree can't tell you a card's shadow is too heavy or its heading is the same weight as its body text.
- **Precise measurement question ("is this overflowing its container," "is this button under 44px") → a targeted evaluate/computed-style call**, not a full snapshot.
- **Never default to snapshot for this loop.** Reserve it for accessibility-tree-specific audit work in `ACCESSIBILITY_AND_QA.md`, where the tree *is* the thing being checked.

Minimum viable sequence per route, per breakpoint, per theme:
```
1. navigate to the route
2. resize viewport (390 / 1024 / 1440 — see the breakpoint table in DESIGN_SYSTEM §8)
3. screenshot (full page)
4. repeat for the other color scheme (light/dark)
```

### Fallback: standalone Playwright script (headless, scriptable, good for CI)

Use this if no browser MCP is connected, or when you want a repeatable non-interactive pass (e.g., a final Phase 6 sweep across every route in one command rather than one-by-one tool calls).

```bash
npm install -D playwright
npx playwright install chromium
```

`scripts/visual-qa.mjs`:

```js
import { chromium } from 'playwright';
import fs from 'node:fs';

const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.error('Usage: node scripts/visual-qa.mjs /route1 /route2 ...');
  process.exit(1);
}

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 1366 },
  { name: 'desktop', width: 1440, height: 900 },
];

const outDir = 'qa-screenshots';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const route of routes) {
  const safeName = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
  for (const vp of viewports) {
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: scheme,
      });
      await page.goto(`http://localhost:3000${route}`, { waitUntil: 'networkidle' });
      await page.screenshot({
        path: `${outDir}/${safeName}__${vp.name}__${scheme}.png`,
        fullPage: true,
      });
      await page.close();
    }
  }
}
await browser.close();
console.log(`Screenshots written to ${outDir}/`);
```

```bash
npm run dev &
sleep 3
node scripts/visual-qa.mjs / /apply /track    # pass the actual routes just built
```

Either path produces the same thing: `mobile/tablet/desktop × light/dark` for every route — the full matrix `ACCESSIBILITY_AND_QA.md` §5 already requires you to verify anyway. This loop is where that verification actually happens, instead of being an unchecked box.

---

## 2. If a real visual reference exists, compare against it — don't self-critique in a vacuum

Before scoring from principles alone (§3), check whether there's actual ground truth available:
- **A Figma file exists** (the project's own mockups, or, at minimum, the UX4G Figma Community file named in `DESIGN_SYSTEM.md` §1) and the Figma Dev Mode MCP is connected (`MCP_AND_TOOLING_SETUP.md`) → pull the real layer structure/spacing/variants for the page being built and compare the screenshot against it directly. This is strictly better evidence than the rubric below.
- **No Figma file for this specific page**, but a reference-quality real-world example is needed → if Mobbin MCP is connected, pull 2-3 real examples of the same page archetype (a citizen-facing tracker, a gov service list) for compositional comparison — not to copy, but to calibrate "does this look like a real shipped product" against something more concrete than an abstract rubric.
- **Neither is available** → proceed straight to §3's rubric. This is the fallback, not the default — a rubric-only self-critique is real signal but weaker than a side-by-side comparison, per the standing caveat in `IMPLEMENTATION_GUIDE.md`.

---

## 3. Look at every screenshot — literally

Open each generated PNG (Claude Code can read image files directly). Do not skip this step by reasoning about the code instead of the rendered output — the entire point of this loop is that code review and visual review catch different classes of problem. A layout can be 100% token-compliant and still look bad; you can only see that in the screenshot.

---

## 4. Score against the rubric — every screenshot, every axis

For each screenshot, score 1–5 on each axis. Be honest — a self-critique that scores everything 5 defeats the purpose.

| # | Axis | 5 looks like | 1 looks like |
|---|---|---|---|
| 1 | **Focal hierarchy** | Squint test passes — one obvious dominant element per viewport, found in under 3 seconds | Multiple elements compete at equal weight; eye doesn't know where to land |
| 2 | **Grid alignment** | Every element's edges land on a column line from `PAGE_COMPOSITION.md` §0's grid table | Elements float at arbitrary offsets; edges don't line up across sections |
| 3 | **Spacing rhythm** | Vertical gaps between sections are visibly consistent, matching `Section/*`/`Stack/*` tokens | Spacing looks ad hoc — some gaps tight, some loose, with no visible pattern |
| 4 | **Whitespace/density** | Breathing room matches the page type's declared density (`PAGE_COMPOSITION.md`'s per-archetype spec) | Feels cramped (citizen-facing pages) or feels sparse/unfinished (admin pages) |
| 5 | **Typography hierarchy** | Clear step-down through heading levels; no two adjacent text blocks compete at the same weight | Everything reads at similar size/weight; can't tell headline from body at a glance |
| 6 | **Color discipline** | Brand color appears only on primary actions/identity, roughly ≤10% of visible area (§0's 60/30/10 rule); status colors used only for status | Brand color washes large areas; status colors used decoratively |
| 7 | **Image/media treatment** | Real image or a properly-styled branded placeholder, correct aspect ratio | Grey box, broken image icon, or stretched/cropped-wrong image |
| 8 | **Responsive integrity** | Mobile screenshot looks *designed for mobile* — reordered/simplified, not just a narrower desktop; no horizontal scroll | Desktop layout visibly squished; text wrapping badly; elements overlapping |
| 9 | **Cross-page consistency** | This page's cards/spacing/buttons match the equivalent elements on sibling pages already built | Same "kind of thing" (e.g. a metric card) looks different from page to page |
| 10 | **Overall polish (gut check)** | Would pass as production-quality against the bar of a well-executed government digital service (GOV.UK/USDS-tier composition — not their colors, their compositional discipline) | Reads as "assembled from components," not designed |

**Minimum bar to pass:** every axis ≥3, no axis at 1 or 2, average ≥3.5. Anything below that is a finding, not a pass.

---

## 5. Fix and re-screenshot

For every axis scoring below the bar:
1. Identify the specific element/section causing it — name it, don't just note the score.
2. Fix it by adjusting composition (spacing, column span, hierarchy) per the relevant section of `PAGE_COMPOSITION.md`, not by inventing a new token or hardcoding a value.
3. Re-run the screenshot script for that route.
4. Re-score. Repeat.

**Cap: 3 iterations per route.** If a route still fails the bar after 3 rounds, stop looping — flag it to the user with the specific failing axis and your best diagnosis of why, rather than silently continuing to consume time on it. A repeated failure after genuine attempts is more likely a spec gap (an archetype `PAGE_COMPOSITION.md` doesn't cover well, or a BRD content gap) than something one more self-critique pass will fix.

---

## 6. When to run this loop

Tie it to `IMPLEMENTATION_GUIDE.md`'s phases, not to every single component:

- **End of Phase 2** (layout shell) — screenshot the shell alone (empty/mock content) across all breakpoints. Catches grid/nav/footer composition problems before they're repeated on every page.
- **End of each page within Phase 3/4** — screenshot that page immediately after building it, not batched at the end of the phase. Fixing composition on page 1 before building page 2 in the same pattern is much cheaper than fixing five pages that all inherited the same mistake.
- **End of Phase 6** (final audit) — full-site pass, every route, checking axis 9 (cross-page consistency) specifically, since that axis can only be judged once multiple pages exist side by side.

---

## 7. Report format

After each loop, before moving on, state plainly:

```
Route: /apply
Scores: focal 4, grid 5, spacing 3→4 (fixed: tightened gap between stepper and
  form, was using Section/L, changed to Section/M per PAGE_COMPOSITION §4),
  density 4, typography 4, color 5, media n/a, responsive 4, consistency 4,
  polish 4
Iterations used: 1 of 3
Status: PASS
```

If a route doesn't pass within the cap, say so explicitly and name what's still wrong — don't present a failing route as done.

---

## 8. What this loop is not a substitute for

This is a compositional/visual check, not an accessibility or functional check — `ACCESSIBILITY_AND_QA.md`'s 5 audit rounds still run separately and fully. A page can score well here and still fail an axe contrast check, and vice versa (a screenshot can't show you a missing `alt` attribute). Run both; neither replaces the other.

If the Web Interface Guidelines skill is installed (`MCP_AND_TOOLING_SETUP.md`), run it as a **third**, independent pass after these two — it checks against a separately-maintained spec (Vercel's Web Interface Guidelines) that will occasionally catch something neither this rubric nor `ACCESSIBILITY_AND_QA.md`'s UX4G-specific checklist happens to name. Where it recommends something that conflicts with a UX4G token, component, or class, UX4G wins — see `DESIGN_SYSTEM.md` §0's authority order, which applies to every tool in this set, not just the files.
