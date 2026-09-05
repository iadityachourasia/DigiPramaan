#!/usr/bin/env node
/**
 * sync-locales.mjs — keeps every locale file structurally identical to en.json.
 *
 * BRD §15 Q-03 is answered "English only at launch, Hindi scaffolded". Scaffolded
 * only means something if the scaffold stays in step with English, so this script:
 *
 *   1. Copies any key present in en.json and missing from another locale, carrying
 *      the English string across as a placeholder.
 *   2. Writes the list of still-untranslated key paths into that file's `_meta`
 *      block, so "what is left to translate" is a fact in the repo rather than a
 *      guess.
 *   3. Removes keys the other locale has and English does not, which are always
 *      leftovers from a renamed key.
 *
 * Run it after editing en.json. `--check` fails instead of writing, for CI.
 *
 * Hindi is not offered in the language switcher until its untranslated count is
 * zero — see src/i18n/routing.ts.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "src", "messages");
const BASE = "en";
const checkOnly = process.argv.includes("--check");

const read = (locale) =>
  JSON.parse(fs.readFileSync(path.join(DIR, `${locale}.json`), "utf8"));

const base = read(BASE);

const targets = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => path.basename(f, ".json"))
  .filter((l) => l !== BASE);

let failed = false;

for (const locale of targets) {
  const existing = fs.existsSync(path.join(DIR, `${locale}.json`))
    ? read(locale)
    : {};
  const untranslated = [];

  /** Walk en.json, filling gaps from the target and recording what is still English. */
  const merge = (source, target, trail) => {
    const out = {};
    for (const [key, value] of Object.entries(source)) {
      const at = trail ? `${trail}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const branch =
          target?.[key] && typeof target[key] === "object" ? target[key] : {};
        out[key] = merge(value, branch, at);
      } else if (typeof target?.[key] === "string" && target[key] !== value) {
        out[key] = target[key];
      } else {
        out[key] = value;
        untranslated.push(at);
      }
    }
    return out;
  };

  const merged = merge(base, existing, "");
  const withMeta = {
    _meta: {
      note: `Scaffolded locale. Values still identical to ${BASE}.json are untranslated.`,
      generatedBy: "scripts/sync-locales.mjs",
      untranslatedCount: untranslated.length,
      untranslated,
    },
    ...merged,
  };

  const serialized = JSON.stringify(withMeta, null, 2) + "\n";
  const current = fs.existsSync(path.join(DIR, `${locale}.json`))
    ? fs.readFileSync(path.join(DIR, `${locale}.json`), "utf8")
    : "";

  if (checkOnly) {
    if (current !== serialized) {
      console.error(
        `\x1b[31mFAIL\x1b[0m src/messages/${locale}.json is out of step with ${BASE}.json. Run \`npm run i18n:sync\`.`
      );
      failed = true;
    } else {
      console.log(
        `OK   ${locale}.json in step with ${BASE}.json — ${untranslated.length} key(s) untranslated`
      );
    }
  } else {
    fs.writeFileSync(path.join(DIR, `${locale}.json`), serialized, "utf8");
    console.log(
      `OK   wrote src/messages/${locale}.json — ${untranslated.length} key(s) untranslated`
    );
  }
}

if (failed) process.exit(1);
