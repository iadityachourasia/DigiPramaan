"""
extraction/adapter.py — StructuredExtraction -> the EXISTING frontend
ExtractionResult contract (ExtractedDeclaration[] over the 7
DECLARATION_FIELD_IDS, plus fontSizeChecks).

The ONE place manufacturer/packer/importer/brand_owner_or_marketer get
combined into the frontend's single `manufacturerDetails` field — an
explicit, documented MVP display simplification, not a data loss: the full
separation survives in `StructuredExtraction`/`compliance_records.extraction`
untouched; only this adapter's OUTPUT collapses it, and only for the
existing checklist UI. No frontend type change, no UI redesign, per Phase 2
scope.

fontSizeChecks is deliberately empty — Rule 7 measurement is Phase 3's
rule-engine job; producing anything here now would be exactly the kind of
fabricated precision this project's own discipline forbids.
"""

from __future__ import annotations

from app.services.extraction.schema import ExtractedField, StructuredExtraction

# Matches src/types/scan.ts's ConfidenceBand thresholds exactly.
def _band(confidence: float) -> str:
    if confidence >= 90:
        return "High"
    if confidence >= 70:
        return "Medium"
    return "Low"


def _representative_confidence(field: ExtractedField) -> float:
    """Real, measured OCR confidence from evidence — never the LLM's own
    self-reported extraction_confidence, per the standing rule that the
    latter is informational only. Gemini-fallback-only fields (no per-block
    OCR score available) get a fixed, documented placeholder rather than a
    fabricated precise number."""
    ocr_confidences = [e.ocr_confidence for e in field.evidence if e.ocr_confidence is not None]
    if ocr_confidences:
        return sum(ocr_confidences) / len(ocr_confidences)
    if field.evidence:
        return 75.0  # Gemini-transcription-only evidence, no real OCR score — documented placeholder
    return 0.0


def _source_engine(field: ExtractedField) -> str:
    providers = {e.provider for e in field.evidence}
    if "paddleocr" in providers:
        return "paddleocr"
    if "gemini" in providers:
        return "gemini_fallback"
    return "manual"


def _source_angle(field: ExtractedField) -> str:
    if field.evidence:
        return field.evidence[0].image_angle
    return "front"


def _combine_manufacturer_details(extraction: StructuredExtraction) -> ExtractedField:
    """The one deliberate merge — see module docstring."""
    parts: list[str] = []
    all_evidence = []
    labels = [
        ("Manufacturer", extraction.manufacturer),
        ("Packer", extraction.packer),
        ("Importer", extraction.importer),
        ("Brand owner", extraction.brand_owner_or_marketer),
    ]
    for label, field in labels:
        if field is not None and not field.not_detected and field.value:
            parts.append(f"{label}: {field.value}" if len(parts) or label != "Manufacturer" else field.value)
            all_evidence.extend(field.evidence)

    if not parts:
        return ExtractedField(value=None, not_detected=True, evidence=[], extraction_confidence=0.0)

    return ExtractedField(
        value=" · ".join(parts),
        not_detected=False,
        evidence=all_evidence,
        extraction_confidence=extraction.manufacturer.extraction_confidence,
    )


def to_extraction_result(scan_id: str, extraction: StructuredExtraction) -> dict:
    """Returns a plain dict matching ExtractionResult exactly (field names
    as the frontend expects them, camelCase) — deliberately a dict, not a
    Pydantic response model, since it's stored as-is in
    compliance_records.extraction (JSONB) and re-served verbatim."""

    field_map = {
        "manufacturerDetails": (_combine_manufacturer_details(extraction), "front"),
        "genericName": (extraction.generic_name, "front"),
        "netQuantity": (extraction.net_quantity, "front"),
        "manufactureDate": (extraction.manufacture_or_import_date, "back"),
        "retailSalePrice": (extraction.mrp, "front"),
        "countryOfOrigin": (extraction.country_of_origin or _empty_field(), "back"),
        "consumerCareDetails": (extraction.consumer_care, "back"),
    }

    declarations = []
    confidences = []
    for field_id, (field, default_angle) in field_map.items():
        confidence = _representative_confidence(field)
        confidences.append(confidence)
        declarations.append(
            {
                "fieldId": field_id,
                "value": field.value,
                "notDetected": field.not_detected,
                "confidence": round(confidence),
                "band": _band(confidence),
                "corrected": False,
                "sourceEngine": _source_engine(field) if field.evidence else "paddleocr",
                "sourceImageAngle": _source_angle(field) if field.evidence else default_angle,
            }
        )

    overall_confidence = round(sum(confidences) / len(confidences)) if confidences else 0

    return {
        "scanId": scan_id,
        "processingStatus": "Completed",
        "overallConfidence": overall_confidence,
        "declarations": declarations,
        "fontSizeChecks": [],  # Rule 7 measurement is Phase 3's job — see module docstring
    }


def _empty_field() -> ExtractedField:
    return ExtractedField(value=None, not_detected=True, evidence=[], extraction_confidence=0.0)
