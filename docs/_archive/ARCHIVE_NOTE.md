# ARCHIVE_NOTE.md
### Why the files in this folder are historical, not instructions

Per the root `CLAUDE.md`: `docs/Design.md` is authoritative over anything in this
folder. Nothing here should be read as current guidance — both files below are
kept for reference/history only.

---

**`SIH26034_9_Page_Website_Frontend_Specification.docx`** — an earlier, generic
draft of the frontend plan, superseded by `Pages_Userflow/` (11-page pack) and
the UX4G-based design contract in `docs/Design.md` + `.claude/skills/ux4g-design/`.
Superseded specifically because it: uses a different, incompatible status
vocabulary (`Pending/Processed/Verified/Needs Correction/Failed` instead of the
canonical `Pending/Compliant/Non-Compliant/Needs Review` + separate
`Extracted/Verified`); describes only 8 pages, missing all three USP pages
(E-commerce Listing Scanner, Manufacturer Compliance Scorecard, Citizen
Grievance Portal); and specifies a plain React + React Router stack with no
mention of UX4G, design tokens, or Legal Metrology-specific content (no MRP,
declarations, or violation taxonomy). Do not use it as a source for tokens,
components, status values, or page inventory.

**`UX4G_CodeGen_Prompt_v1.md`** — an earlier build-prompt draft, superseded by
`.claude/skills/ux4g-design/DESIGN_SYSTEM.md` and `IMPLEMENTATION_GUIDE.md`.
Superseded specifically because its token names, hex values, and
Tailwind-based styling approach are fictional and do not match `Design.md`'s
real UX4G structure — see `DESIGN_SYSTEM.md` §0 for the full explanation. Its
phased build order and audit-round shape were good and were preserved,
corrected, in `IMPLEMENTATION_GUIDE.md` and `ACCESSIBILITY_AND_QA.md`.
