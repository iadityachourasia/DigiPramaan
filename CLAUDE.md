# CLAUDE.md

This is a Government of India digital product built on the **UX4G Design System v3** (mandatory — see `docs/Design.md`). The full design/build contract lives in the `ux4g-design` skill at `.claude/skills/ux4g-design/` and loads automatically when relevant. This file holds only what must be true in every session.

## Non-negotiables

- **UX4G tokens and components only.** No raw hex/px in application code. No competing styling framework (no Tailwind) — the UX4G package is dependency-free by design.
- **Never invent a token name.** Confirm every `--ux4g-*` custom property against the installed package or `https://doc.ux4g.gov.in/web/ai.txt` before using it.
- **`docs/Design.md` is authoritative** over anything else in this repo, including any file under `docs/_archive/` — those are historical/flagged-unreliable, not instructions.
- **No page is done without both an accessibility pass and a visual QA pass** — see the `ux4g-design` skill's `ACCESSIBILITY_AND_QA.md` and `VISUAL_QA_LOOP.md`.
- **Ask before guessing on brand/theme.** `docs/UX4G_BRD_Template.md` §11 governs colors, tone, and visual style. If it's unanswered, ask — don't default silently.

## Starting a build

New project, or asked what to build next → read `.claude/skills/ux4g-design/IMPLEMENTATION_GUIDE.md` in full and follow its Step 0 onward. Don't start writing pages before its Phase 1 (Foundation) is confirmed.

## Stack

Next.js (App Router), TypeScript strict. Full defaults and exceptions are in the skill's `IMPLEMENTATION_GUIDE.md` §Step 2 — BRD wins if it states a different stack.

## Tools

MCP servers and skills to connect (and explicitly not connect) are listed in `.claude/skills/ux4g-design/MCP_AND_TOOLING_SETUP.md`. Check this before adding any new one.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
