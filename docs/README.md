# docs/

| Path | What it is |
|---|---|
| [`SIH26034.md`](SIH26034.md) | The official Smart India Hackathon problem statement this project answers. |
| [`Design.md`](Design.md) | The UX4G Design System v3 build contract — authoritative over anything else in this repo, `_archive/` included. |
| [`UX4G_BRD_Template.md`](UX4G_BRD_Template.md) | The Business Requirements Document, drafted from `SIH26034.md` and the functional spec. |
| [`_archive/`](_archive/) | Superseded drafts, flagged unreliable by their own `ARCHIVE_NOTE.md` — historical reference only. |
| [`internal/`](internal/) | Archived AI-assisted development session handoffs and planning notes. Historical record of how this was built, not current documentation — see the note below. |

The 11-page functional specification itself (the source of truth for every page's
states, the Role Permission Matrix, and the fixed vocabulary) lives at the repo root in
[`Pages_Userflow/`](../Pages_Userflow/), not here — it's cross-referenced by name
throughout the source tree (`* Spec: Pages_Userflow/0N-*.md` doc comments), so it stays
where those references point.

## About `docs/internal/`

These are working notes from the AI-assisted build process (backend handoff, session
handoffs, an early product-vision draft) — kept for historical record, not maintained
as current documentation. If a claim in `docs/internal/` conflicts with the actual code,
the code wins.
