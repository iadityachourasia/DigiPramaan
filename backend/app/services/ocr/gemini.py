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

import time

from pydantic import BaseModel

from app.services.extraction.schema import EvidenceRef, ExtractedField, StructuredExtraction
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


def _build_prompt(blocks: list[OcrBlock]) -> str:
    numbered = "\n".join(f"[{i}] {b.text}" for i, b in enumerate(blocks))
    return _STRUCTURING_PROMPT.format(numbered_blocks=numbered)


def _to_extracted_field(
    gemini_field: GeminiFieldExtraction | None, blocks: list[OcrBlock], angle_by_image_id: dict[str, str]
) -> ExtractedField:
    if gemini_field is None:
        return ExtractedField(value=None, not_detected=True, evidence=[], extraction_confidence=0.0)

    evidence: list[EvidenceRef] = []
    for idx in gemini_field.source_block_indices:
        if 0 <= idx < len(blocks):
            block = blocks[idx]
            evidence.append(
                EvidenceRef(
                    image_id=block.image_id,
                    image_angle=angle_by_image_id.get(block.image_id, "unknown"),
                    ocr_block_text=block.text,
                    bbox=block.bbox,
                    provider=block.provider,
                    ocr_confidence=block.confidence,
                )
            )

    return ExtractedField(
        value=gemini_field.value,
        not_detected=gemini_field.not_detected,
        evidence=evidence,
        extraction_confidence=gemini_field.confidence,
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
    blocks: list[OcrBlock], angle_by_image_id: dict[str, str], settings
) -> StructuredExtraction:
    if not settings.gemini_api_keys:
        raise GeminiUnavailableError("GEMINI_API_KEY is not set")

    prompt = _build_prompt(blocks)
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
            OcrBlock(image_id=image_id, text=line.strip(), confidence=0.0, bbox=(0, 0, 1, 1), provider=self.name)
            for line in text.splitlines()
            if line.strip()
        ]
        return OcrResult(blocks=blocks, provider=self.name, duration_ms=duration_ms)
