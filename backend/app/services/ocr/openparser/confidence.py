"""
services/ocr/openparser/confidence.py — OP-Phase 4's confidence model and
mapping (spec §6.4).

`OcrConfidence` is the canonical INTERNAL shape (spec's own literal model
definition) — kept distinct from `normalized_schemas.NormalizedConfidence`
(the strict contract-reading model) on purpose: one reads the wire, the
other is what the rest of this codebase is meant to consume, so a future
non-OpenParser provider's confidence could map into the same internal
type without this module depending on OpenParser's own schema names.

Rules enforced here (spec §6.4), each a property of what this file does
NOT do, not a runtime guard:
- missing confidence stays `None` — `map_confidence(None)` returns `None`;
- never substitute 0/1/100/Gemini-self-confidence/image-quality-score —
  no such value is ever constructed here, only copied from the input;
- never relabel `scope=detection` as recognition confidence — `scope` is
  copied verbatim, never reassigned;
- never average scores with different scopes/providers/scales — this
  file has no function that takes more than one confidence value;
- `calibrated` is preserved, never coerced to imply correctness.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.services.ocr.openparser.normalized_schemas import NormalizedConfidence


class OcrConfidence(BaseModel):
    score: float  # 0..1, validated canonical score
    scope: Literal["detection", "recognition", "classification", "geometry", "answer", "quality"]
    calibrated: bool = False
    source_value: float | None = None
    source_scale: Literal["zero_to_one", "zero_to_hundred", "log_probability", "unknown"] | None = None


def map_confidence(raw: dict | NormalizedConfidence | None) -> OcrConfidence | None:
    """`None` in, `None` out — a missing element confidence is a fact,
    never converted to a fabricated number. Otherwise validates through
    `NormalizedConfidence` (so a malformed wire value fails loudly) and
    copies every field across 1:1 — no scaling, no relabeling."""
    if raw is None:
        return None
    parsed = raw if isinstance(raw, NormalizedConfidence) else NormalizedConfidence.model_validate(raw)
    return OcrConfidence(
        score=parsed.score,
        scope=parsed.scope,
        calibrated=parsed.calibrated,
        source_value=parsed.source_value,
        source_scale=parsed.source_scale,
    )


def is_recognition_confidence(confidence: OcrConfidence | None) -> bool:
    """`True` only for `scope == "recognition"` — the one scope this
    codebase's legacy `OcrBlock.confidence` (a bare recognition-probability
    float) can honestly represent. A layout `detection` score or a
    `geometry`/`classification`/`answer`/`quality` score must never be
    treated as if it answered "how confident is this text recognition,"
    per spec §6.4's explicit relabeling prohibition."""
    return confidence is not None and confidence.scope == "recognition"
