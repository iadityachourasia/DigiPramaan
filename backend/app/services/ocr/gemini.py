"""
ocr/gemini.py — Gemini's two jobs in this pipeline, and nowhere else:

  1. Structuring: turn OCR blocks into a StructuredExtraction (always runs,
     regardless of which OCR provider found the text).
  2. OCR fallback: implements OcrProvider too, for the case Paddle's output
     looks insufficient — full-image transcription only (Gemini does not
     give reliable per-line bounding boxes the way PaddleOCR does, so a
     fallback block's bbox is honestly the whole image, not a fabricated
     precise region).

Gemini NEVER decides legal compliance — its only output is extracted/
structured evidence, exactly the boundary the whole rule-engine design
(Phase 3) depends on. `confidence` fields here are the LLM's own
self-reported numbers: logged, carried through, never authoritative (see
extraction/schema.py's own docstring on this same point).
"""

from __future__ import annotations

import re
import time

from pydantic import BaseModel

from app.services.extraction.schema import (
    EvidenceRef,
    ExtractedField,
    FieldReliability,
    StructuredExtraction,
)
from app.services.gemini_client import call_with_key_fallback
from app.services.ocr.provider import OcrBlock, OcrResult


class GeminiFieldExtraction(BaseModel):
    value: str | None
    not_detected: bool
    source_block_indices: list[int] = []
    confidence: float = 0.0


class GeminiStructuredOutput(BaseModel):
    manufacturer: GeminiFieldExtraction
    packer: GeminiFieldExtraction | None = None
    importer: GeminiFieldExtraction | None = None
    brand_owner_or_marketer: GeminiFieldExtraction | None = None
    generic_name: GeminiFieldExtraction
    net_quantity: GeminiFieldExtraction
    manufacture_or_import_date: GeminiFieldExtraction
    mrp: GeminiFieldExtraction
    consumer_care: GeminiFieldExtraction
    country_of_origin: GeminiFieldExtraction | None = None
    address: GeminiFieldExtraction | None = None
    quantity_unit_expression: GeminiFieldExtraction | None = None
    language_detected: str | None = None


class GeminiUnavailableError(Exception):
    """Raised when GEMINI_API_KEY is unset or the API call itself fails —
    callers (the pipeline runner) must treat this as a failed, retryable
    stage, never as "no data found"."""


_STRUCTURING_PROMPT = """You are structuring evidence from OCR text extracted \
from photographs of a packaged commodity label, for Legal Metrology \
compliance review in India. You are NOT deciding legal compliance — only \
extracting what is printed, verbatim, into the given fields.

Rules:
- Never invent a value. If a field is not present in the text, set value to \
null and not_detected to true.
- manufacturer, packer, importer, and brand_owner_or_marketer are DIFFERENT \
legal roles under Rule 6(1)(a) — do not merge them. Most labels only state \
one or two of these; leave the rest not_detected.
- country_of_origin only applies to imported goods; leave not_detected if \
the label gives no indication either way.
- For every field you DO extract, list which numbered OCR block(s) below \
the value came from, in source_block_indices.
- confidence is your own rough self-assessment (0-100) — it will be logged \
but never used as an authoritative probability by anything downstream.

Numbered OCR blocks (one per detected text line, across all submitted \
images):
{numbered_blocks}

Return structured JSON matching the required schema exactly.
"""


def _build_prompt(blocks: list[OcrBlock], *, missing_field_hint: list[str] | None = None) -> str:
    numbered = "\n".join(f"[{i}] {b.text}" for i, b in enumerate(blocks))
    prompt = _STRUCTURING_PROMPT.format(numbered_blocks=numbered)
    if missing_field_hint:
        prompt += (
            "\n\nA prior pass did not find these fields — look again, especially at any "
            f"text you may have skipped: {', '.join(missing_field_hint)}. Still use "
            "not_detected=true honestly if the text truly isn't present."
        )
    return prompt


_CITATION_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def _normalize_for_citation(text: str) -> set[str]:
    """Unicode-aware token set for the citation-grounding check —
    deliberately NOT `normalization.normalize_text` (ASCII-only by design
    for its own exact-identity-matching callers; reusing it here would
    silently collapse any non-Latin script, e.g. Devanagari/Tamil, to a
    near-empty string and make grounding trivially — and wrongly — pass).
    `.casefold()` is the Unicode-correct case-fold; `\\w` with
    `re.UNICODE` matches word characters from any script."""
    return set(_CITATION_TOKEN_RE.findall(text.casefold()))


def _citation_is_grounded(value: str | None, block_text: str) -> bool:
    """True when the structured value's text is genuinely supported by the
    cited OCR block — a real (if simple) containment check, not just an
    in-bounds index check. Subset in EITHER direction so both "the value
    is a fragment of a longer OCR line" and "the OCR block is a shorter
    fragment than the structured value" pass, without requiring exact
    string equality (OCR/Gemini punctuation and spacing rarely matches
    exactly)."""
    if not value:
        return False
    value_tokens = _normalize_for_citation(value)
    block_tokens = _normalize_for_citation(block_text)
    if not value_tokens or not block_tokens:
        return False
    return value_tokens <= block_tokens or block_tokens <= value_tokens


def _assess_reliability(evidence: list[EvidenceRef], citation_count: int) -> FieldReliability:
    """Pure — derived entirely from what `_to_extracted_field` already
    computed (grounded evidence + the raw citation count Gemini claimed).
    No new inputs, no new call. `min_ocr_confidence` stays `None` when no
    evidence carries a real measured score — never defaulted to 0."""
    real_confidences = [e.ocr_confidence for e in evidence if e.ocr_confidence is not None]
    return FieldReliability(
        citation_count=citation_count,
        verified_citation_count=len(evidence),
        has_verified_citation=len(evidence) > 0,
        min_ocr_confidence=min(real_confidences) if real_confidences else None,
    )


def _to_extracted_field(
    gemini_field: GeminiFieldExtraction | None, blocks: list[OcrBlock], angle_by_image_id: dict[str, str]
) -> ExtractedField:
    if gemini_field is None:
        return ExtractedField(value=None, not_detected=True, evidence=[], extraction_confidence=0.0)

    evidence: list[EvidenceRef] = []
    citation_count = 0
    for idx in gemini_field.source_block_indices:
        if not (0 <= idx < len(blocks)):
            continue
        citation_count += 1
        block = blocks[idx]
        if not _citation_is_grounded(gemini_field.value, block.text):
            continue  # in-bounds but not textually supported — no forged evidence accepted
        evidence.append(
            EvidenceRef(
                image_id=block.image_id,
                image_angle=angle_by_image_id.get(block.image_id, "unknown"),
                ocr_block_text=block.text,
                bbox=block.bbox,
                provider=block.provider,
                model=block.model,
                ocr_confidence=block.confidence,
            )
        )

    return ExtractedField(
        value=gemini_field.value,
        not_detected=gemini_field.not_detected,
        evidence=evidence,
        extraction_confidence=gemini_field.confidence,
        reliability=_assess_reliability(evidence, citation_count),
    )


def _get_client(api_key: str):
    from google import genai

    return genai.Client(api_key=api_key)


def _call_structure(api_key: str, prompt: str, settings) -> GeminiStructuredOutput:
    client = _get_client(api_key)
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[prompt],
            config={
                "response_mime_type": "application/json",
                "response_schema": GeminiStructuredOutput,
            },
        )
    except Exception as exc:  # noqa: BLE001 - any Gemini SDK/network failure
        raise GeminiUnavailableError(f"Gemini structuring call failed: {exc}") from exc

    parsed: GeminiStructuredOutput = response.parsed
    if parsed is None:
        raise GeminiUnavailableError("Gemini did not return schema-valid structured output")
    return parsed


def structure(
    blocks: list[OcrBlock],
    angle_by_image_id: dict[str, str],
    settings,
    *,
    missing_field_hint: list[str] | None = None,
) -> StructuredExtraction:
    """`missing_field_hint` is OP-Phase 6's coverage-retry hook — optional,
    keyword-only, defaults to `None` so the existing single positional-arg
    call site (`jobs/pipeline.py:321`) is completely unaffected."""
    if not settings.gemini_api_keys:
        raise GeminiUnavailableError("GEMINI_API_KEY is not set")

    prompt = _build_prompt(blocks, missing_field_hint=missing_field_hint)
    # _call_structure always raises GeminiUnavailableError on failure, so
    # call_with_key_fallback's re-raised "last failure" is already that type.
    parsed = call_with_key_fallback(
        settings.gemini_api_keys, lambda key: _call_structure(key, prompt, settings)
    )

    return StructuredExtraction(
        manufacturer=_to_extracted_field(parsed.manufacturer, blocks, angle_by_image_id),
        packer=_to_extracted_field(parsed.packer, blocks, angle_by_image_id),
        importer=_to_extracted_field(parsed.importer, blocks, angle_by_image_id),
        brand_owner_or_marketer=_to_extracted_field(
            parsed.brand_owner_or_marketer, blocks, angle_by_image_id
        ),
        generic_name=_to_extracted_field(parsed.generic_name, blocks, angle_by_image_id),
        net_quantity=_to_extracted_field(parsed.net_quantity, blocks, angle_by_image_id),
        manufacture_or_import_date=_to_extracted_field(
            parsed.manufacture_or_import_date, blocks, angle_by_image_id
        ),
        mrp=_to_extracted_field(parsed.mrp, blocks, angle_by_image_id),
        consumer_care=_to_extracted_field(parsed.consumer_care, blocks, angle_by_image_id),
        country_of_origin=_to_extracted_field(parsed.country_of_origin, blocks, angle_by_image_id),
        address=_to_extracted_field(parsed.address, blocks, angle_by_image_id),
        quantity_unit_expression=_to_extracted_field(
            parsed.quantity_unit_expression, blocks, angle_by_image_id
        ),
        language_detected=parsed.language_detected,
    )


def _missing_required_fields(extraction: StructuredExtraction, required_field_ids: list[str]) -> list[str]:
    missing = []
    for field_id in required_field_ids:
        field: ExtractedField | None = getattr(extraction, field_id, None)
        if field is None or field.not_detected:
            missing.append(field_id)
    return missing


def structure_with_coverage_retry(
    blocks: list[OcrBlock],
    angle_by_image_id: dict[str, str],
    settings,
    *,
    required_field_ids: list[str],
    coverage_threshold: float = 0.5,
    max_retries: int = 1,
) -> StructuredExtraction:
    """OP-Phase 6 — a bounded coverage-gate retry, built and tested but
    DELIBERATELY NOT CALLED from `app/jobs/pipeline.py`. Wiring this in
    would double Gemini quota usage on exactly the low-coverage scans
    that most need conserving it — `gemini_client.py`'s own comment
    records a hard free-tier 20-requests/day ceiling. Enabling this is an
    explicit operational-cost decision for a later phase, not a pure
    quality improvement; until then this function exists only for tests
    and any future caller that has made that call deliberately.

    Retries AT MOST `max_retries` times, regardless of how poor coverage
    remains — the budget is absolute, not "keep trying until good." A
    retry keeps only the fields the PRIOR pass missed; anything already
    found is never overwritten by a later, possibly worse, pass."""
    extraction = structure(blocks, angle_by_image_id, settings)
    attempts = 0
    while attempts < max_retries:
        missing = _missing_required_fields(extraction, required_field_ids)
        coverage = 1.0 - (len(missing) / len(required_field_ids)) if required_field_ids else 1.0
        if coverage >= coverage_threshold or not missing:
            break
        attempts += 1
        retried = structure(blocks, angle_by_image_id, settings, missing_field_hint=missing)
        for field_id in missing:
            retried_field: ExtractedField = getattr(retried, field_id)
            if not retried_field.not_detected:
                setattr(extraction, field_id, retried_field)
    return extraction


class GeminiOcrProvider:
    """OcrProvider implementation — full-image transcription only, used as
    a fallback when the primary provider's output looks insufficient."""

    name = "gemini"

    def __init__(self, settings) -> None:
        self._settings = settings

    def _call_transcribe(self, api_key: str, image_bytes: bytes) -> str:
        from google.genai import types

        client = _get_client(api_key)
        try:
            response = client.models.generate_content(
                model=self._settings.gemini_model,
                contents=[
                    "Transcribe every line of printed text visible in this package "
                    "label photo, verbatim, one line per line of output. Do not "
                    "summarize or interpret — transcription only.",
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                ],
            )
        except Exception as exc:  # noqa: BLE001
            raise GeminiUnavailableError(f"Gemini OCR fallback call failed: {exc}") from exc
        return (response.text or "").strip()

    def extract(self, image_bytes: bytes, image_id: str) -> OcrResult:
        if not self._settings.gemini_api_keys:
            raise GeminiUnavailableError("GEMINI_API_KEY is not set")

        started = time.perf_counter()
        text = call_with_key_fallback(
            self._settings.gemini_api_keys, lambda key: self._call_transcribe(key, image_bytes)
        )
        duration_ms = (time.perf_counter() - started) * 1000

        if not text:
            return OcrResult(blocks=[], provider=self.name, duration_ms=duration_ms)

        # No reliable per-line bbox from a vision-language transcription —
        # one block per non-empty line, bbox honestly spans the whole image
        # rather than a fabricated precise region.
        blocks = [
            OcrBlock(
                image_id=image_id, text=line.strip(), confidence=0.0, bbox=(0, 0, 1, 1),
                provider=self.name, model=self.name,
            )
            for line in text.splitlines()
            if line.strip()
        ]
        return OcrResult(blocks=blocks, provider=self.name, duration_ms=duration_ms)
