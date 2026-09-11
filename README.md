# Digi-Pramaan

Legal Metrology Compliance System, built for SIH. Officers scan packaged-commodity
labels; the system extracts declarations via OCR, checks them against the Legal
Metrology (Packaged Commodities) Rules, 2011, and turns verified findings into
cross-inspection product/company intelligence, enforcement case tracking, deterministic
risk alerts, and immutable compliance reports — for the Department of Consumer Affairs.

Two parts:

- **Frontend** (this directory) — Next.js (App Router), built on the UX4G Design System
  v3, mandatory for Government of India digital products. The full build contract lives
  in `.claude/skills/ux4g-design/`; `CLAUDE.md` holds the non-negotiables.
- **Backend** ([`backend/`](backend/)) — FastAPI + PostgreSQL (Supabase) + Backblaze B2
  (S3-compatible object storage), covering auth, the scan/OCR pipeline, the deterministic
  rule engine, and the intelligence/reporting layer described below.

## What's built

- **Scan & verification** — capture/upload → image-quality gate → OCR (PaddleOCR +
  Gemini) → a deterministic rule engine checks every mandatory declaration against the
  Legal Metrology Rules → an officer corrects and verifies, immutably.
- **Product Compliance DNA** — cross-inspection product identity resolved from a
  composite fingerprint (legal entity + brand + generic name + net quantity), never a
  fuzzy auto-merge; full inspection timeline and recurring-violation history per product.
- **Company Compliance Profile** — aggregate compliance rate, trend, violation
  distribution and repeat-offender flags per legal entity, computed only from verified,
  jurisdiction-scoped records.
- **Compliance Follow-Through** — a real enforcement case workflow (`OPEN` →
  `ACTION_REQUIRED` → `REINSPECTION_REQUIRED` → `RESOLVED` → `CLOSED`), with a persisted
  status history.
- **Smart Risk** — deterministic, explainable enforcement-prioritization rules (repeat
  same-category violations, multiple non-compliant products, open enforcement cases),
  each alert naming its rule, reason, score contribution and evidence records. Never a
  legal-guilt determination — that stays with the rule engine's own verdict.
- **Immutable reports** — a verified record's PDF/DOCX compliance report is rendered
  once, stored in Backblaze B2, and never regenerated on re-download (byte-identical,
  proven by SHA256 in the backend's integration tests).

## Running it

**Frontend:**

```bash
npm install
npm run dev
```

Then open http://localhost:3000. `NEXT_PUBLIC_USE_MOCK_DATA` defaults to `true`, serving
the fixtures in `src/lib/mock/`; set it to `false` (see `.env.example`) once the backend
below is running to use real data end to end.

**Backend** (see [`backend/`](backend/) for the full FastAPI app):

```bash
cd backend
docker compose up -d          # local Postgres + MinIO (S3-compatible storage)
pip install -e ".[dev]"
cp .env.example .env          # fill in DATABASE_URL, S3_*, SUPABASE_* — see the template
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Checks

| Command | What it does |
|---|---|
| `npm run verify` | Runs all four gates below in order. Use this before any commit. |
| `npm run verify:tokens` | Regenerates `src/styles/tokens.css` from the installed UX4G package, then fails if any `--ux4g-*` token or `ux4g-*` class used in `src/` does not exist in that package. |
| `npm run i18n:check` | Fails if a locale file has drifted out of step with `en.json`. |
| `npm run typecheck` | TypeScript strict, zero errors. |
| `npm run lint` | ESLint with `jsx-a11y` at error level, zero warnings. |
| `npm test` | Vocabulary, status-model and mock-data consistency tests. |
| `npm run qa:visual -- /` | Screenshots a route at three widths in both themes into `qa-screenshots/`. |
| `pytest` (in `backend/`) | Unit tests, no external services required. |
| `pytest -m integration` (in `backend/`) | Safe integration tests against a real dev DB/B2 — each test creates and cleans up its own rows. |

`npm run verify:tokens` is the guard behind the rule that matters most here. UX4G
documents its tokens under Figma-side names like `Background/Neutral/Default`, and
the shipped CSS spells that `--ux4g-bg-neutral`. Guessing the CSS name from the
Figma name is how fabricated tokens get into a codebase, so the script checks every
reference against the installed package instead of trusting anyone's memory.

## Layout

```
src/
  app/[locale]/     routes, locale-segmented
  components/       ui/ layout/ sections/ and feature folders
  i18n/             next-intl routing, request config, navigation
  lib/mock/         fixtures matching the real API shape
  lib/api/          real-backend API clients (Bearer-token, apiGet/apiPost)
  messages/         en.json, hi.json
  styles/           tokens.css (generated), brand.css, typography.css
  types/            domain model, including the fixed vocabulary
scripts/            token verifier, locale sync, placeholder generator, visual QA,
                    render-report-cli.ts (the immutable-report PDF/DOCX renderer,
                    invoked as a subprocess by the backend)

backend/
  app/api/v1/       FastAPI routers (auth, scans, records, products, companies,
                    cases, dashboard, reports, ...)
  app/services/     rule engine, Product DNA, risk engine, intelligence loop,
                    report generation
  app/db/models/    SQLAlchemy models
  alembic/          migrations
  tests/            unit/ (no external deps) + integration/ (real dev DB)

Pages_Userflow/     the 11-page functional spec (source of truth for every page's
                    states and the fixed vocabulary) — see 00-README.md
docs/               problem statement, BRD, UX4G contract, archived planning notes
                    — see docs/README.md
```

## Decisions worth knowing

**Role comes from the account, not a dropdown.** Login has no role selector. The
backend returns the role with the session, and the sidebar reads it from there.

**English at launch, Hindi scaffolded.** Both locales route and both message files
stay in step, but the language switcher offers only what
`NEXT_PUBLIC_ACTIVE_LOCALES` lists. Hindi joins it when its translation is finished.

**UX4G default theme.** `src/styles/brand.css` is deliberately empty. If DoCA
supplies a palette, that file explains exactly which three primitives to override and
what to re-check afterwards.

**Fixed vocabulary is code, not convention.** Compliance statuses, roles, source tags
and the ten violation categories are constants in `src/types/vocabulary.ts`, and a
test asserts the English message catalogue matches them verbatim.

**No Product foreign key on a compliance record.** A record's product/company
association lives only in `product_inspection_links`, never a stored FK — correcting a
mistaken product match supersedes the old link rather than rewriting a verified record.

**Risk is prioritization, never a verdict.** Smart Risk's score/band never share a code
path with the rule engine's own compliance status — a high risk score flags something
for enforcement attention, it doesn't decide guilt.

## License

MIT — see [LICENSE](LICENSE).
