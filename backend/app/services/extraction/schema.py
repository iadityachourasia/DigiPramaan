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

from app.services.rules.types import RuleResult


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
    # Phase 3 officer-correction metadata. Additive, backward-compatible
    # defaults — old persisted evidence_bundle/extraction JSON blobs from
    # before Phase 3 simply default both to False/None on model_validate.
    corrected: bool = False
    corrected_by: str | None = None


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
    # Phase 3.1: the full rule-engine output, persisted alongside the
    # extraction it was computed from — including any officer resolutions
    # (RuleResult.resolution). This is the ONLY place resolutions live;
    # POST /records/{id}/resolutions mutates one entry here in place, and
    # POST /records/{id}/corrections must carry existing resolutions
    # forward onto the freshly-recomputed list rather than discarding them
    # (see rules/aggregate.py's carry_forward_resolutions()).
    rule_results: list[RuleResult] = []
