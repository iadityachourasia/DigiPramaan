"""
services/barcode/resolve.py — deterministic, pure merge/dedupe across every
image's decode results into one BarcodeAnalysis.

No DB, no network, no I/O, no Gemini/LLM call — same purity discipline
rules/checks.py documents for the rule engine, applied here because
`resolve_barcode_analysis` makes the one decision this feature is not
allowed to hand to an LLM: which barcode value (if any) is trusted.
"""

from __future__ import annotations

from app.services.barcode.types import BarcodeAnalysis, BarcodeDecodeResult


def resolve_barcode_analysis(all_results: list[BarcodeDecodeResult]) -> BarcodeAnalysis:
    """`all_results` is the flat list of every full-image and cropped-candidate
    decode across all three images (front/back/side_pdp), already
    checksum-validated per-result by checksum.py.

    1. Dedupe identical `normalized_value`s — kept as ONE candidate entry per
       distinct value, but every result must be preserved as evidence, so
       when a value repeats (e.g. seen on both back and side_pdp) the first
       occurrence in image order is what's returned as the representative
       result. (Every source detail — image, angle, bbox — the caller cares
       about is a property of that single kept result; a genuinely richer
       "list of all source refs per value" is a documented possible
       enhancement, not required by today's single-bbox evidence UI.)
    2. Count distinct values among only the checksum-valid ones — an
       invalid-checksum candidate never counts toward this and never
       becomes `trusted_identifier`, but always stays in `candidates`.
       0 -> "none" (the normal, unremarkable case — composite Product DNA
            fallback is untouched).
       1 -> "trusted".
       >1 -> "needs_review" — every candidate is shown, none silently picked.
    """
    deduped: dict[str, BarcodeDecodeResult] = {}
    for result in all_results:
        if result.normalized_value not in deduped:
            deduped[result.normalized_value] = result

    candidates = list(deduped.values())
    valid_values = {c.normalized_value: c for c in candidates if c.checksum_valid}

    if len(valid_values) == 0:
        return BarcodeAnalysis(candidates=candidates, trusted_identifier=None, status="none")
    if len(valid_values) == 1:
        trusted = next(iter(valid_values.values()))
        return BarcodeAnalysis(candidates=candidates, trusted_identifier=trusted, status="trusted")
    return BarcodeAnalysis(candidates=candidates, trusted_identifier=None, status="needs_review")
