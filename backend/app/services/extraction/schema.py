"""
extraction/schema.py — the internal ComplianceEvidenceBundle contract.

Keeps manufacturer/packer/importer/brand_owner_or_marketer separate per the
frozen legal data-model requirement — never recombined here. The adapter
(adapter.py) is the ONE place that collapses them into the existing
frontend's single `manufacturerDetails` field, and does so only for
display compatibility, not in this internal representation.

`extraction_confidence` on each field is the LLM's own self-reported
number — logged and carried through, never treated as an authoritative
probability (the rule engine, when it exists in Phase 3, must derive
confidence-band decisions from `evidence[].ocr_confidence`, a real
measured OCR signal, not this one).
"""

from __future__ import annotations

from pydantic import BaseModel


class EvidenceRef(BaseModel):
    image_id: str
    image_angle: str
    ocr_block_text: str | None = None
    bbox: tuple[float, float, float, float] | None = None
    provider: str
    ocr_confidence: float | None = None  # None when the provider gave no per-block score


class ExtractedField(BaseModel):
    value: str | None
    not_detected: bool
    evidence: list[EvidenceRef] = []
    extraction_confidence: float = 0.0  # LLM self-reported — informational only


class StructuredExtraction(BaseModel):
    manufacturer: ExtractedField
    packer: ExtractedField | None = None
    importer: ExtractedField | None = None
    brand_owner_or_marketer: ExtractedField | None = None
    generic_name: ExtractedField
    net_quantity: ExtractedField
    manufacture_or_import_date: ExtractedField
    mrp: ExtractedField
    consumer_care: ExtractedField
    country_of_origin: ExtractedField | None = None
    address: ExtractedField | None = None
    quantity_unit_expression: ExtractedField | None = None
    language_detected: str | None = None


class ImageQualitySummary(BaseModel):
    image_id: str
    angle: str
    overall_verdict: str
    reason: str | None = None


class ComplianceEvidenceBundle(BaseModel):
    structured_extraction: StructuredExtraction
    ocr_blocks: list[dict] = []  # OcrBlock.model_dump() per block, kept loose here
    image_quality_results: list[ImageQualitySummary] = []
    pdp_declarations_detected: list[str] = []
