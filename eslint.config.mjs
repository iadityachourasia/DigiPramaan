import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * Flat config, consumed directly.
 *
 * eslint-config-next 16 ships real flat-config arrays, so there is no FlatCompat
 * shim here. Routing it through @eslint/eslintrc instead throws on a circular
 * plugin reference, which is a confusing failure to inherit for no benefit.
 *
 * Two jobs beyond the Next defaults:
 *
 *   1. jsx-a11y at error level, not warn. ACCESSIBILITY_AND_QA.md §3 round 3 asks
 *      for zero errors AND zero warnings from this plugin, and §4 puts any
 *      accessibility error in P0. A warning nobody has to fix is not a P0.
 *   2. A no-restricted-imports rule that pushes every navigation import through
 *      src/i18n/navigation.ts, so a stray next/link cannot silently drop the locale.
 */
const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "design_system/**",
      "src/styles/tokens.css",
      "src/messages/hi.json",
      "qa-screenshots/**",
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    files: ["**/*.{ts,tsx}"],
    /*
     * No `plugins` key. eslint-config-next already registers jsx-a11y, and flat
     * config refuses to let a second entry redefine a plugin. The rule names below
     * resolve against that registration.
     */
    rules: {
      /*
       * The full jsx-a11y recommended set, every rule at error. Next's own config
       * enables only a handful of these and leaves them at warn, which is short of
       * what a GIGW-scoped product needs.
       */
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [
          rule,
          "error",
        ])
      ),

      /* No console in committed code (round 4). Warnings and errors stay allowed. */
      "no-console": ["error", { allow: ["warn", "error"] }],

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message:
                "Import Link from '@/i18n/navigation' so the active locale is carried through.",
            },
            {
              name: "next/navigation",
              importNames: ["redirect", "usePathname", "useRouter"],
              message:
                "Import these from '@/i18n/navigation' so the active locale is carried through.",
            },
          ],
        },
      ],
    },
  },

  {
    /* Node scripts are not React and are allowed to talk to the terminal. */
    files: ["scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },
];

export default config;
