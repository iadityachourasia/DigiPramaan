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

from app.services.barcode.types import BarcodeAnalysis
from app.services.rules.types import RuleResult


class EvidenceRef(BaseModel):
    image_id: str
    image_angle: str
    ocr_block_text: str | None = None
    bbox: tuple[float, float, float, float] | None = None
    provider: str
    ocr_confidence: float | None = None  # None when the provider gave no per-block score


class FieldReliability(BaseModel):
    """OP-Phase 6 — a derived field-level assessment, kept explicitly
    separate from any single confidence number (spec §6.4: "must not be
    named 'OCR confidence'"). Computed purely from citation-grounding
    outcomes and real measured OCR confidences — never from the LLM's own
    self-reported `extraction_confidence`, and never fabricated when no
    real signal exists (`min_ocr_confidence` stays `None`, not `0.0`)."""

    algorithm_version: str = "grounding-v1"
    citation_count: int  # raw, pre-grounding-check count Gemini claimed
    verified_citation_count: int  # count that passed the grounding check
    has_verified_citation: bool
    min_ocr_confidence: float | None = None


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
    # OP-Phase 6 — additive, defaults to None so every pre-Phase-6 persisted
    # evidence_bundle/extraction JSON blob deserializes unchanged.
    reliability: FieldReliability | None = None


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
    # Phase 7 — the raw per-check list (QualityCheck.model_dump() — name/
    # passed/score/threshold/verdict), additive and defaulted empty so every
    # existing consumer of this collapsed summary is unaffected. Lets Rule 9
    # reason about which specific signal (blur/darkness/overexposure/
    # resolution) drove a REVIEW/RECAPTURE_REQUIRED verdict, not just the
    # collapsed verdict string.
    checks: list[dict] = []


class Point(BaseModel):
    x: float
    y: float


class CalibrationData(BaseModel):
    """Phase 6 — one officer-submitted manual two-point calibration for one
    declaration field. Establishes pixels-per-mm scale ONLY; it does not
    correct for perspective/tilt (that would need >=4 point correspondences
    for a homography, which this MVP does not collect — see
    measurement/font_height.py's own docstring on the plausibility-only
    geometry check this feeds).

    Provenance is append-only: a new calibration for the same field_id
    never overwrites a prior one — the prior entry is marked
    `superseded=True` and kept, mirroring the ACTIVE/SUPERSEDED convention
    `ProductInspectionLink` already established (Phase 4). The "current"
    calibration for a field is the latest entry with `superseded=False`.
    """

    field_id: str
    image_id: str
    known_dimension_mm: float
    start_point: Point
    end_point: Point
    pixel_length: float
    pixels_per_mm: float
    is_embossed: bool = False
    method: str = "manual_two_point"
    calibrated_by: str
    calibrated_at: str  # ISO 8601
    superseded: bool = False


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
    # Phase 6 — append-only history, see CalibrationData's own docstring.
    calibrations: list[CalibrationData] = []
    # Phase 8 — deterministic barcode/GTIN detection (never Gemini-decided,
    # see services/barcode/resolve.py's own docstring). Additive, defaults
    # to None so every existing persisted evidence_bundle validates unchanged.
    barcode_analysis: BarcodeAnalysis | None = None
