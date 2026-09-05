#!/usr/bin/env node
/**
 * verify-tokens.mjs — the guard that makes "never invent a token name" enforceable.
 *
 * Why this exists
 * ---------------
 * DESIGN_SYSTEM.md §0.3 forbids constructing a --ux4g-* name by guessing from the
 * Figma-side semantic name. IMPLEMENTATION_GUIDE.md Step 3 requires tokens.css to be
 * generated from the actual installed package rather than hand-written. This script
 * is both halves of that rule, executable:
 *
 *   1. GENERATE  — extracts the :root and :root[data-theme=dark] custom-property
 *                  declarations verbatim from the installed ux4g-web-components
 *                  package into src/styles/tokens.css, as a readable dictionary.
 *   2. VERIFY    — walks src/ for every var(--ux4g-*) reference and fails if any
 *                  name does not exist in the installed package.
 *
 * Run `npm run verify:tokens` after any package bump, and in CI.
 *
 * Usage:
 *   node scripts/verify-tokens.mjs            generate + verify
 *   node scripts/verify-tokens.mjs --check    verify only, fail if tokens.css is stale
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = path.join(ROOT, "node_modules", "ux4g-web-components");
const PKG_CSS = path.join(PKG_DIR, "styles", "ux4g.css");
const OUT = path.join(ROOT, "src", "styles", "tokens.css");
const SRC = path.join(ROOT, "src");
const checkOnly = process.argv.includes("--check");

function fail(msg) {
  console.error("\x1b[31mFAIL\x1b[0m " + msg);
  process.exit(1);
}

if (!fs.existsSync(PKG_CSS)) {
  fail(
    "ux4g-web-components is not installed. Run `npm install` first.\n" +
      "      Expected: " + PKG_CSS
  );
}

const pkgVersion = JSON.parse(
  fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8")
).version;
const css = fs.readFileSync(PKG_CSS, "utf8");

/** Pull the declaration body of the first rule whose selector matches exactly. */
function ruleBody(selector) {
  const at = css.indexOf(selector + "{");
  if (at === -1) return null;
  const start = at + selector.length + 1;
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

/** Split a declaration body into --ux4g-* pairs, ignoring nested var() commas. */
function customProps(body) {
  const out = [];
  const re = /(--ux4g-[a-zA-Z0-9_-]+)\s*:\s*([^;]+)(?:;|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) out.push([m[1], m[2].trim()]);
  return out;
}

const lightBody = ruleBody(":root");
if (!lightBody) fail("No :root rule found in the package stylesheet.");
const darkBody = ruleBody(":root[data-theme=dark]") ?? "";

const light = customProps(lightBody);
const dark = customProps(darkBody);

/** Every --ux4g-* name the package defines anywhere, for the reference check. */
const allDefined = new Set(
  [...css.matchAll(/(--ux4g-[a-zA-Z0-9_-]+)\s*:/g)].map((m) => m[1])
);

const header = `/*
 * tokens.css — GENERATED FILE, DO NOT EDIT BY HAND.
 *
 * Source:    ux4g-web-components@${pkgVersion} → styles/ux4g.css
 * Generator: scripts/verify-tokens.mjs  (npm run verify:tokens)
 *
 * WHY THIS FILE IS NOT IMPORTED ANYWHERE
 * --------------------------------------
 * IMPLEMENTATION_GUIDE.md Step 3 asks for a tokens.css generated from the real
 * installed package instead of hand-written from memory. This is that file, and it
 * is the dictionary the team greps when choosing a token.
 *
 * It is deliberately NOT imported by globals.css. The package stylesheet already
 * declares every one of these properties at :root, and re-declaring them would add
 * roughly 80 KB of byte-identical CSS on top of a bundle DESIGN_SYSTEM.md §12 item 4
 * already flags as a real performance cost on constrained mobile connections. The
 * generated copy earns its place as a readable, diffable reference and as the input
 * to the verification pass below; it does not need to ship.
 *
 * Light values are the package's :root block. Dark values are its
 * :root[data-theme="dark"] block — dark mode is opt-in by setting data-theme="dark"
 * on the root element; the package ships no prefers-color-scheme rule of its own.
 *
 * Counts: ${light.length} light properties, ${dark.length} redefined for dark.
 */

`;

const body =
  ":root {\n" +
  light.map(([k, v]) => `  ${k}: ${v};`).join("\n") +
  "\n}\n\n" +
  ':root[data-theme="dark"] {\n' +
  dark.map(([k, v]) => `  ${k}: ${v};`).join("\n") +
  "\n}\n";

const generated = header + body;

if (checkOnly) {
  const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (existing !== generated) {
    fail("src/styles/tokens.css is stale. Run `npm run verify:tokens`.");
  }
  console.log("OK   tokens.css matches ux4g-web-components@" + pkgVersion);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, generated, "utf8");
  console.log(
    `OK   wrote src/styles/tokens.css — ${light.length} light, ${dark.length} dark ` +
      `(ux4g-web-components@${pkgVersion})`
  );
}

/* ---- verification pass: no invented token names anywhere in src/ ---- */

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx?|jsx?|css)$/.test(entry.name) && full !== OUT) acc.push(full);
  }
  return acc;
}

/** Every ux4g-* class the package's compiled CSS defines. */
const allClasses = new Set(
  [...css.matchAll(/\.(ux4g-[a-zA-Z0-9_-]+)/g)].map((m) => m[1])
);

const badTokens = [];
const badClasses = [];

if (fs.existsSync(SRC)) {
  for (const file of walk(SRC)) {
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, "utf8");

    for (const m of text.matchAll(/var\(\s*(--ux4g-[a-zA-Z0-9_-]+)/g)) {
      if (!allDefined.has(m[1])) badTokens.push(`${rel} → ${m[1]}`);
    }

    /**
     * Class check. Reads className/class attribute values only, so a ux4g- string
     * inside a comment or a doc block is not treated as markup. This is the guard
     * that catches a plausible-looking but non-existent utility such as ux4g-mb-8,
     * which the package spells ux4g-mb-l — an error no type checker would see.
     */
    for (const attr of text.matchAll(/class(?:Name)?\s*=\s*"([^"]*)"/g)) {
      for (const name of attr[1].split(/\s+/)) {
        if (name.startsWith("ux4g-") && !allClasses.has(name)) {
          badClasses.push(`${rel} → ${name}`);
        }
      }
    }
  }
}

if (badTokens.length > 0 || badClasses.length > 0) {
  console.error("");
  const parts = [];
  if (badTokens.length > 0) {
    parts.push(
      `${badTokens.length} reference(s) to a --ux4g-* token the installed package ` +
        `does not define:\n       ` +
        [...new Set(badTokens)].join("\n       ")
    );
  }
  if (badClasses.length > 0) {
    parts.push(
      `${badClasses.length} reference(s) to a ux4g-* class the installed package ` +
        `does not define:\n       ` +
        [...new Set(badClasses)].join("\n       ")
    );
  }
  fail(parts.join("\n\n     "));
}

console.log(
  `OK   every --ux4g-* token and ux4g-* class referenced in src/ exists in the ` +
    `installed package (${allDefined.size} tokens, ${allClasses.size} classes available)`
);
