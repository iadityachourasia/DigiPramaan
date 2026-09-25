<div align="center">

<img src="public/images/digi-pramaan-logo.png" alt="Digi-Pramaan" width="120" />

# Digi-Pramaan

**AI-Powered Legal Metrology Compliance System**

Automated, evidence-backed compliance verification for packaged commodities — built for the **Department of Consumer Affairs, Ministry of Consumer Affairs, Food & Public Distribution**, Government of India.

[![Smart India Hackathon](https://img.shields.io/badge/SIH%202026-PS%20SIH26034-ff6f00?style=for-the-badge)](docs/SIH26034.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-digipramaan.click-2ea44f?style=for-the-badge)](https://digipramaan.click)

[![Backend Deploy](https://github.com/iadityachourasia/DigiPramaan/actions/workflows/backend-deploy.yml/badge.svg)](https://github.com/iadityachourasia/DigiPramaan/actions/workflows/backend-deploy.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-real--time%20API-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql&logoColor=white)](https://supabase.com)
[![Azure](https://img.shields.io/badge/Backend-Azure%20App%20Service-0078D4?logo=microsoftazure&logoColor=white)](https://azure.microsoft.com)
[![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![Tests](https://img.shields.io/badge/tests-797%20backend%20%C2%B7%20188%20frontend-2ea44f?style=flat)](#testing--quality-gates)

[Live Demo](https://digipramaan.click) · [Problem Statement](docs/SIH26034.md) · [Design System](docs/Design.md) · [Report a Bug](../../issues)

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Live Environment](#live-environment)
- [Recently Shipped](#recently-shipped)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
- [Testing & Quality Gates](#testing--quality-gates)
- [Deployment](#deployment)
- [Security & Compliance](#security--compliance)
- [Design Principles](#design-principles-worth-knowing)
- [Roadmap](#roadmap)
- [License](#license)

---

## The Problem

Packaged commodities sold across India's retail stores, supermarkets, and e-commerce platforms must, under the **Legal Metrology Act, 2009** and the **Legal Metrology (Packaged Commodities) Rules, 2011**, carry mandatory declarations — manufacturer/packer/importer identity, net quantity, Maximum Retail Price, month/year of manufacture, consumer-care details, and more — in a legally specified format, size, and placement.

Enforcement today is manual: an officer inspects a label, cross-checks a dozen rules by eye, and files a report by hand. At retail scale, this is slow, inconsistent, and leaves common violations — missing declarations, undersized MRP fonts, non-compliant net-quantity statements — under-detected.

**SIH Problem Statement [SIH26034](docs/SIH26034.md)** asks for a software system that scans product labels, images, and listings, and automatically detects, extracts, and validates these declarations against the 2011 Rules.

| | |
|---|---|
| **PS Number** | SIH26034 |
| **Organization** | Ministry of Consumer Affairs, Food & Public Distribution |
| **Department** | Department of Consumer Affairs (DoCA) |
| **Category** | Software |
| **Theme** | Agriculture, FoodTech & Rural Development |

## The Solution

**Digi-Pramaan** turns a photograph of a product label into a legally defensible compliance verdict:

```
Officer captures photos  →  Image quality gate  →  OCR extraction (+ escalation on a miss)  →  Rule engine
       →  Officer review & correction  →  Immutable Verified record  →  Evidence-backed PDF/DOCX report
```

Every step is **deterministic and auditable** — the rule engine never fabricates a legal threshold it can't cite a source for, every AI-assisted step is labeled as decision-support only, and once an officer verifies a record it becomes immutable: the same report ID always regenerates the exact same byte-identical artifact.

## Live Environment

| Surface | URL | Notes |
|---|---|---|
| **Web app** | [digipramaan.click](https://digipramaan.click) | Next.js on Vercel, auto-deployed from `master` |
| **Backend API** | [digipramaan-backend-cfh2aubja6g8dqfz.centralindia-01.azurewebsites.net/docs](https://digipramaan-backend-cfh2aubja6g8dqfz.centralindia-01.azurewebsites.net/docs) | FastAPI on Azure App Service (Containers), Central India |
| **Report verification** | [digipramaan.click/verify/report/\[id\]](https://digipramaan.click) | Public, unauthenticated authenticity check for any issued report's QR code |

> The backend runs on a Basic-tier Azure App Service instance funded by an Azure for Students grant — expect it to scale accordingly, not production SLA.

## Recently Shipped

A running log of the most recent real, production-deployed changes — not a full changelog, just enough to show the project is actively maintained and what's genuinely new since the last major milestone.

- **Multi-provider OCR escalation** — when a legally required field (manufacturer, MRP, net quantity, etc.) is still `not_detected` after the primary OCR pass, the pipeline now automatically escalates the specific image to a second, third, and fourth OCR provider in a fixed order — **Mistral OCR 4 → Google Enterprise Document OCR → Azure DI Read** — before giving up, fixing a real class of false compliance `FAIL`s caused by a single silently-dropped OCR line. Gated by a DB-backed hourly/daily circuit breaker so it can never run away on cost; live in production behind a settings flag (`openparser_fallback_enabled`).
- **Scan progress page redesign** — the post-capture processing screen is now a horizontal Application Tracker (real per-stage icons, live elapsed-time clock, session metadata, a duration-weighted progress bar with an always-honestly-labeled `"(estimated)"` remaining-time figure, and a collapsible stage history with real measured per-stage durations) built entirely from confirmed real UX4G Design System components — no invented CSS classes.
- **Compliance report redesign** — the generated PDF/DOCX now embeds custom typography (Source Serif 4 + Inter), a native table of contents, a complete photographic gallery of *every* captured evidence image (fixing a real bug where only the last image per angle was ever included), and a "Declared Particulars" section built from data the renderer already had but never rendered.
- **Notifications & Alerts** — a real per-officer notification feed (bell + dropdown + full page) backed by seven real backend trigger events (case reassignment, review flags, status changes, account creation, threshold changes, enforcement flags), not a static mock badge.

## Key Features

### Scan & Verification Pipeline
Officer captures front/back/PDP photos (device camera, file upload, or a QR-code mobile handoff) → a real image-quality gate (blur, brightness, resolution, decodability) rejects unusable photos before they're ever stored → OCR extracts every mandatory declaration → a **deterministic rule engine** checks each one against the Legal Metrology Rules, including barcode/GTIN cross-verification, font-height measurement for MRP and net-quantity text, and declaration placement/readability → the officer corrects and verifies, and the record becomes **immutable**. Progress is shown live on a horizontal Application Tracker with real per-stage timing, not a placeholder spinner.

### Multi-Provider OCR, With Escalation on a Miss
Primary OCR runs through **OpenParser** (a hosted OCR broker) on the **PaddleOCR-VL 1.6** model. If a specific legally-required field still reads `not_detected` after the primary pass and the primary structuring attempt, the pipeline escalates *only that image* through a fixed fallback order — **Mistral OCR 4 → Google Enterprise Document OCR → Azure DI Read** — re-structuring after each tier, stopping as soon as the field is recovered. This targets the exact failure mode a scan-wide "did we get almost nothing" fallback can't catch: nine lines read cleanly, one silently vanishes, and — without this — the rule engine has no way to tell that apart from a genuine absence.

### Legal-Safety by Construction
Rule 7 (font-height thresholds) has no officially validated legal source for its mm figures today — the system is built so it **cannot** print an authoritative "4mm required" unless a validated `RuleSetVersion` says so. It structurally can only reach `NEEDS_REVIEW`, printing an explicit "pending validated source confirmation" message instead of guessing. This isn't a UI warning bolted on top — the data model itself has no field capable of holding an unvalidated threshold.

### Evidence-Backed Regulatory Reports
Every verified record generates a forensic-quality PDF and a genuinely editable DOCX — not a screenshot dressed up as a document. Embedded custom typography, a native table of contents, a complete photographic gallery of every captured image (every angle, every recapture — not just three), a 5-way compliance checklist (`PASS` / `FAIL` / `NEEDS_REVIEW` / `INSUFFICIENT_EVIDENCE` / `NOT_APPLICABLE`), dedicated Rule 7/8/9 sections, barcode evidence (showing *every* candidate when conflicting, never silently picking one), officer attestation, and a SHA-256 integrity block with a QR code linking to a public, unauthenticated verification page. Generated once, stored in Backblaze B2, and **never regenerated** — a re-download years later is byte-identical.

### Product Compliance DNA
Cross-inspection product identity resolved from a composite fingerprint (legal entity + brand + generic name + net quantity) — never a fuzzy auto-merge. Gives every product a full inspection timeline and recurring-violation history across every time it's been scanned, anywhere.

### Company Compliance Profile
Aggregate compliance rate, trend, violation distribution, and repeat-offender flags per legal entity — computed only from verified, jurisdiction-scoped records, never speculative data.

### Compliance Follow-Through
A real enforcement case workflow — `OPEN` → `ACTION_REQUIRED` → `REINSPECTION_REQUIRED` → `RESOLVED` → `CLOSED` — with a persisted, auditable status history, not a status field that silently overwrites its own past.

### Smart Risk (Enforcement Prioritization)
Deterministic, explainable rules flag records for enforcement attention — repeat same-category violations, multiple non-compliant products under one entity, open enforcement cases — each alert naming its exact rule, reason, score contribution, and supporting evidence records. Explicitly a **prioritization signal**, never a guilt determination; that authority stays with the rule engine's own verdict and the officer's judgment.

### Notifications & Alerts
A real per-officer notification feed — bell icon with unread badge, dropdown popover, and a full filterable page — backed by seven genuine backend trigger events: case reassignment, a record flagged or cleared for review, case status changes, account creation, rule-threshold changes, and enforcement flags. No stored English copy; every notification resolves its message client-side from a fixed vocabulary, so Hindi support is automatic.

### Citizen Grievance Portal
A shopper who spots a label that looks wrong can report it — no account, no sign-in, contact details optional. The report enters the same officer queue as a self-initiated scan, and the citizen gets a reference number to track its status.

### E-Commerce Listing Scanner
Feed in a product listing URL and the same OCR/rule pipeline runs against its scraped images — extending compliance checking beyond physical shelf inspection to online marketplaces.

### Mobile QR Handoff
An officer on a laptop generates a QR code; a phone scans it and becomes the camera for that scan session in real time — no app install, backed by a real, token-scoped, time-limited upload session (never a same-server mock).

## System Architecture

```mermaid
graph TB
    subgraph Client["Officer / Citizen"]
        Browser["Web Browser"]
        Phone["Phone Camera<br/>(QR Handoff)"]
    end

    subgraph Frontend["Frontend — Vercel"]
        NextJS["Next.js 16 App Router<br/>UX4G Design System v3<br/>next-intl (en / hi)"]
    end

    subgraph Backend["Backend — Azure App Service (Docker)"]
        API["FastAPI"]
        Auth["Supabase Auth<br/>(JWT / role-based)"]
        Pipeline["Scan Pipeline<br/>Quality Gate → OCR → Rules"]
        Rules["Deterministic<br/>Rule Engine"]
        Reports["Report Renderer<br/>(subprocess → Node/jsPDF/docx)"]
        Intel["Intelligence Loop<br/>Product DNA · Risk · Cases"]
        Notify["Notifications<br/>7 real trigger events"]
    end

    subgraph AI["OCR — via OpenParser"]
        Primary["PaddleOCR-VL 1.6<br/>(primary)"]
        Tier1["Mistral OCR 4"]
        Tier2["Google Enterprise<br/>Document OCR"]
        Tier3["Azure DI Read<br/>(last resort)"]
        Gemini["Google Gemini<br/>(structuring + explanations)"]
    end

    subgraph Data["Data Layer"]
        PG[("PostgreSQL<br/>Supabase")]
        B2[("Backblaze B2<br/>Evidence + Reports")]
    end

    Browser -->|HTTPS| NextJS
    Phone -->|Token-scoped upload| API
    NextJS -->|REST / JSON| API
    API --> Auth
    API --> Pipeline
    Pipeline --> Primary
    Pipeline -.field miss.-> Tier1
    Tier1 -.still missing.-> Tier2
    Tier2 -.last resort.-> Tier3
    Pipeline --> Gemini
    Pipeline --> Rules
    Rules --> Intel
    API --> Notify
    API --> Reports
    Reports --> B2
    API --> PG
    API --> B2

    style Frontend fill:#000,color:#fff
    style Backend fill:#009688,color:#fff
    style AI fill:#1a73e8,color:#fff
    style Data fill:#336791,color:#fff
```

**CI/CD:** every push to `master` touching `backend/` triggers a two-job GitHub Actions workflow — build the Docker image and push it to Azure Container Registry, then a separate `deploy` job points the App Service at the new image, restarts it, and polls `/api/v1/health` for up to 4 minutes, **failing the workflow if the app never comes back healthy**. That explicit health-check gate exists because an earlier deploy once left new routes built-but-never-actually-deployed; the frontend redeploys automatically via Vercel's native Git integration, no manual step in either loop.

## Tech Stack

<table>
<tr><td valign="top">

**Frontend**
- Next.js 16 (App Router) · React 19 · TypeScript 5.9 (strict)
- UX4G Design System v3 (`ux4g-web-components` 2.0.1) — the mandatory, dependency-free component/token system for Government of India digital products
- next-intl — English + Hindi (scaffolded)
- react-hook-form + zod
- recharts — analytics/trend charts
- framer-motion — motion, respects reduced-motion
- jsPDF + `docx` + `qrcode` — client-orchestrated report rendering
- Vitest + Testing Library + Playwright

</td><td valign="top">

**Backend**
- FastAPI (Python 3.11+) · SQLAlchemy 2.0 + Alembic
- PostgreSQL via Supabase (Auth + DB)
- Backblaze B2 (S3-compatible object storage) via boto3
- OCR via **OpenParser** — PaddleOCR-VL 1.6 primary, Mistral OCR 4 / Google Enterprise Document OCR / Azure DI Read escalation tiers
- `paddleocr` + `paddlepaddle` + OpenCV — local rollback OCR path (`OCR_PROVIDER=local_paddle`)
- Google Gemini (`google-genai`) — structuring + AI-assisted explanations
- zxing-cpp — barcode/GTIN decoding · beautifulsoup4 — e-commerce listing parsing
- structlog · pytest

</td><td valign="top">

**Infrastructure**
- Vercel — frontend hosting, Git-triggered deploys
- Azure App Service (Linux Containers) — backend hosting
- Azure Container Registry
- GitHub Actions — build, push, deploy, and health-check the backend on every push
- Docker + docker-compose (local Postgres/MinIO)

</td></tr>
</table>

## Repository Layout

```
src/
  app/[locale]/       routes, locale-segmented (App Router)
  components/         ui/ layout/ sections/ and feature folders
  i18n/               next-intl routing, request config, navigation
  lib/api/            real-backend API clients
  lib/mock/           fixtures matching the real API shape (mock-mode)
  lib/server/         report-render-v2/ — the PDF/DOCX renderer
  messages/           en.json, hi.json
  styles/             tokens.css (generated), brand.css, typography.css
  types/              domain model, including the fixed vocabulary

backend/
  app/api/v1/         FastAPI routers, 18 total:
                         core        — health, auth, internal, scans, mobile_handoff
                         compliance  — records, products, companies, cases, reports, explanations
                         engagement  — notifications, grievances, activity
                         intelligence— dashboard, analytics, admin
                         other       — ecommerce
  app/services/       rule engine, image quality, OpenParser OCR escalation,
                       Product DNA, risk engine, intelligence loop, report generation
  app/jobs/           async pipeline + report generation orchestration
  app/db/models/      SQLAlchemy models
  alembic/            hand-authored migrations
  tests/              unit/ (no external deps) + integration/ (real dev DB/B2)
  Dockerfile          production container image

.github/workflows/    CI — build, push, deploy, and health-check the backend image
docs/                 problem statement, BRD, UX4G design contract
Pages_Userflow/       the functional spec — source of truth for every page's
                       states and the fixed vocabulary
```

## Getting Started

### Prerequisites

- Node.js ≥ 20.9
- Python ≥ 3.11
- Docker (for local Postgres/MinIO, or to build the backend image)
- A Supabase project and a Backblaze B2 bucket for real-data mode (optional — mock mode needs neither)

### Frontend

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. `NEXT_PUBLIC_USE_MOCK_DATA` defaults to `true`, serving realistic fixtures from `src/lib/mock/` — no backend required to explore the UI. Set it to `false` (see `.env.example`) and point `NEXT_PUBLIC_API_BASE_URL` at a running backend for real end-to-end data. If you're also running report generation locally, `INTERNAL_RENDER_SECRET` here must match the backend's value exactly — it's a shared bearer secret for the report-render bridge between the two services.

### Backend

```bash
cd backend
docker compose up -d              # local Postgres + MinIO (S3-compatible storage)
pip install -e ".[dev]"
cp .env.example .env              # fill in DATABASE_URL, S3_*, SUPABASE_*, GEMINI_API_KEY,
                                   # the OPENPARSER_* block (OCR), and INTERNAL_RENDER_SECRET
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Interactive API docs are then live at `http://localhost:8000/docs`. `OCR_PROVIDER` defaults to `openparser`; set it to `local_paddle` if you'd rather run OCR entirely locally with no external OCR calls.

### Docker (production-shaped)

```bash
cd backend
docker build -t digipramaan-backend .
docker run -p 8000:8000 --env-file .env digipramaan-backend
```

## Testing & Quality Gates

| Command | What it does |
|---|---|
| `npm run verify` | Runs the four gates below, in order — the required pre-commit check |
| `npm run verify:tokens` | Regenerates `tokens.css` from the installed UX4G package, fails on any fabricated `--ux4g-*` token |
| `npm run i18n:check` | Fails if `hi.json` has drifted out of step with `en.json` |
| `npm run typecheck` | TypeScript strict, zero errors |
| `npm run lint` | ESLint with `jsx-a11y` at error level, zero warnings |
| `npm test` | Vitest — component, vocabulary, and report-renderer tests |
| `npm run qa:visual -- /` | Screenshots a route at three widths, both themes |
| `pytest` (in `backend/`) | Unit tests — no external services required |
| `pytest -m integration` (in `backend/`) | Real integration tests against dev DB/B2 — each test creates and cleans up its own rows |

Current state: **797 backend unit tests**, **188 frontend Vitest tests**, all green — including dedicated suites for the OCR escalation chain (budget circuit breaker, tier ordering, per-field recovery) and the scan progress page (every stage/state renders the correct icon, the `"(estimated)"` qualifier is never omitted, orientation flips correctly at the tablet breakpoint) — plus a dedicated integration suite validating real report generation, immutability (SHA-256 byte-identical redownload), and the full scan → OCR → rule-engine pipeline against real infrastructure.

`npm run verify:tokens` guards the rule that matters most in a UX4G codebase: the design system documents tokens under Figma-side names (`Background/Neutral/Default`), while the shipped CSS spells that `--ux4g-bg-neutral`. Guessing the CSS name from the Figma name is exactly how fabricated tokens creep in — the script checks every reference against the installed package instead.

## Deployment

| Component | Platform | Trigger |
|---|---|---|
| Frontend | Vercel | Git push to `master` (native GitHub integration) |
| Backend | Azure App Service (Web App for Containers) | GitHub Actions: build & push to ACR, then a separate `deploy` job repoints the App Service and health-checks it |
| Database | Supabase (managed Postgres) | — |
| Object storage | Backblaze B2 | — |

The backend Dockerfile ships everything the pipeline needs at the system level — including `libgl1`/`libglib2.0-0` for OpenCV (a transitive PaddleOCR dependency) — so the container that CI builds is exactly what runs in production, no drift between "works on my machine" and what's deployed. The deploy job's health-check gate (polling `GET /api/v1/health` for up to 4 minutes before either declaring success or failing the workflow outright) exists because of a real past incident where a build succeeded and sat in the registry without ever actually being deployed — the workflow now cannot silently report green without the new image provably serving traffic.

## Security & Compliance

- **Role-based access control** — every record, report, and case is scoped to the officer's jurisdiction; cross-jurisdiction access returns `404`, never a distinguishable `403`, so probing can't map what exists outside your scope.
- **Immutable audit trail** — a verified compliance record cannot be silently edited; corrections are logged, not overwritten.
- **No fabricated legal thresholds** — Rule 7 (font-height) is structurally incapable of stating an unvalidated mm figure as authoritative.
- **AI is decision-support only** — every AI-generated explanation is explicitly labeled "AI-assisted explanation — interpretive aid only"; the rule engine's deterministic verdict is always authoritative.
- **OCR escalation is cost-bounded** — the multi-provider fallback chain is gated by a DB-backed hourly/daily circuit breaker, so a bug that always trips it can never run up an unbounded vendor bill.
- **Private object storage** — evidence photos and reports live in a private Backblaze B2 bucket, served only through authenticated (or narrowly scoped, time-limited) backend endpoints — never a public bucket URL.
- **Report integrity** — every issued report carries a SHA-256 hash and a QR code resolving to a minimal, unauthenticated verification endpoint that confirms authenticity without exposing report contents.

## Design Principles Worth Knowing

**Role comes from the account, not a dropdown.** Login has no role selector — the backend returns the role with the session, and the UI reads it from there.

**English at launch, Hindi scaffolded.** Both locales route and both message files stay in step programmatically, but the language switcher only offers what's configured live.

**Fixed vocabulary is code, not convention.** Compliance statuses, roles, source tags, and violation categories are constants in `src/types/vocabulary.ts` — a test asserts the English message catalogue matches them verbatim. Notification copy follows the same pattern: no stored English text, only a `type` + structured `detail`, resolved client-side.

**No Product foreign key on a compliance record.** A record's product/company association lives only in a link table, never a stored FK — correcting a mistaken product match supersedes the old link rather than rewriting a verified record.

**Risk is prioritization, never a verdict.** Smart Risk's score never shares a code path with the rule engine's own compliance status — a high risk score flags something for enforcement attention; it does not decide guilt.

**An automated fallback is not a blanket retry.** OCR escalation fires only for the specific field a legally-required declaration is still missing on, never as a routine "run every model and compare" pass on every scan — that mode exists too, but strictly as an opt-in benchmarking tool (`backend/scripts/ocr_benchmark.py`), never live pipeline behavior.

## Roadmap

- [ ] Validate the OCR escalation chain's real recall improvement against a larger sample of production scans (`scripts/ocr_benchmark.py --full-pipeline`)
- [ ] Company/manufacturer cross-inspection context surfaced directly in the report
- [ ] Perspective/curvature-aware image quality checks
- [ ] Hindi translation completion
- [ ] Legally validated Rule 7 threshold source, to unlock automated PASS/FAIL

## License

Released under the [MIT License](LICENSE).

---

<div align="center">

Built for **Smart India Hackathon 2026** · Problem Statement [SIH26034](docs/SIH26034.md)

</div>
