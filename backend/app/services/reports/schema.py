"""
reports/schema.py — ReportSnapshotV2, the explicit, versioned document model
the "core evidence report" upgrade renders from.

Replaces the loose dict `build_report_document()` used to return. Every
field here is deterministic, JSON-serializable, and safe to persist
verbatim into `Report.frozen_snapshot` (JSONB) — there is no binary data
and no local file path anywhere in this tree. Local temp file paths for
evidence/crop images are a separate, ephemeral structure
(`reports/images.py`'s `ReportImagePaths`) passed alongside this snapshot
to the renderer, never through it.

Serialization convention: this schema uses a shared `to_camel` alias
generator (`_CamelModel` below) rather than this codebase's more common
per-field `Field(alias=...)` pattern (mobile_handoff.py's request bodies)
or a hand-written `_to_frontend()` dict builder (barcode/types.py's
`barcode_analysis_to_frontend()`). Both of those are the right choice at
their own scale — a handful of fields. This schema has 16 sections and
several levels of nesting; hand-converting that by hand on every read
would be far more error-prone and harder to review than one declarative
alias generator applied once. `.model_dump(by_alias=True)` produces the
camelCase JSON both the Node renderer and the frontend preview expect.

REPORT_SCHEMA_VERSION is recorded on every snapshot's `report_metadata`
so a future renderer change can detect which shape an old, frozen
`frozen_snapshot` row was built against (pre-migration rows predate this
schema entirely — see snapshot.py/reports.py's handling of those).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

REPORT_SCHEMA_VERSION = "2.0"

# Recorded, not derived — a static label identifying the rule-engine
# version this report reflects. Bumped only on a deliberate, documented
# rule-engine version change, never automatically inferred from code.
RULE_SET_VERSION = "legal-metrology-2011-v1"

# The spec's own required governance statement, stored once so it can't
# drift between the per-violation "AI-assisted explanation" labels and the
# Officer Verification section that also carries it.
AI_GOVERNANCE_STATEMENT = (
    "AI-assisted extraction and explanation were used only as "
    "decision-support tools. Legal compliance status was determined by "
    "the configured deterministic rule engine and verified by the "
    "authorized officer."
)

# The exact label every AI-authored explanation must carry, verbatim,
# wherever it is shown — never presented as if it were the legal finding.
AI_EXPLANATION_LABEL = "AI-assisted explanation — interpretive aid only"

RuleResultStatus = Literal["PASS", "FAIL", "NEEDS_REVIEW", "INSUFFICIENT_EVIDENCE", "NOT_APPLICABLE"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReportMetadata(_CamelModel):
    report_id: str
    reference_code: str
    generated_at: str
    generated_by_name: str
    generated_by_role: str
    generated_by_region: str | None
    report_format_version: str = REPORT_SCHEMA_VERSION
    rule_set_version: str = RULE_SET_VERSION


class InspectionInfo(_CamelModel):
    inspection_id: str
    scanned_at: str | None
    source: str
    region: str | None
    category: str | None


class ProductInfo(_CamelModel):
    product_name: str
    generic_name: str | None
    category: str | None
    net_quantity: str | None
    mrp: str | None
    country_of_origin: str | None


class ResponsibleEntity(_CamelModel):
    role: Literal["manufacturer", "packer", "importer", "brand_owner_or_marketer"]
    value: str | None
    not_detected: bool
    corrected: bool = False


class OverallAssessment(_CamelModel):
    compliance_status: str
    compliance_score: int | None
    compliance_band: str | None
    verification_status: str


class ImageReference(_CamelModel):
    image_id: str
    angle: str
    content_hash: str | None
    uploaded_at: str | None
    quality_verdict: str | None
    image_width_px: int | None = None
    image_height_px: int | None = None


class DeclarationRow(_CamelModel):
    """One mandatory-declaration field as extracted — "what was observed",
    independent of the rule engine's pass/fail judgment on it (that's
    ChecklistRow, below)."""

    field_id: str
    label: str
    observed_value: str | None
    not_detected: bool
    corrected: bool
    evidence_image_id: str | None = None
    evidence_angle: str | None = None


class ChecklistRow(_CamelModel):
    """One rule-engine result — "what the deterministic engine concluded",
    always the rule's `effective_status` (officer resolution wins over the
    original automated verdict when one exists — never recomputed here,
    only read from the already-frozen evidence_bundle.rule_results)."""

    rule_id: str
    requirement: str
    observed_value: str | None
    result: RuleResultStatus
    evidence_note: str | None
    evidence_image_id: str | None = None
    evidence_angle: str | None = None
    officer_resolution_note: str | None = None


class ViolationDetail(_CamelModel):
    rule_id: str | None
    category: str
    legal_basis: str
    detail: str | None
    result: RuleResultStatus
    ai_explanation: dict | None = None  # ExplanationOutput shape, already camelCase
    ai_explanation_label: str = AI_EXPLANATION_LABEL
    original_image: ImageReference | None = None
    bbox: list[float] | None = None
    crop_image_ref: str | None = None  # key into RenderPackage.images.violationCrops


class FontMeasurement(_CamelModel):
    """Rule 7. Deliberately carries NO field capable of holding
    RULE_7_THRESHOLDS[...]['normal_mm']/['embossed_mm'] — those statutory
    figures are not legally validated (rule7_thresholds.py's own
    `validated=False`), so this model structurally cannot print them as
    authoritative. `insufficient_legal_validation_message` is always
    populated verbatim from rule7_thresholds.INSUFFICIENT_LEGAL_VALIDATION_MESSAGE."""

    rule_id: str
    result: RuleResultStatus
    message: str
    field_id: str | None
    image_id: str | None
    calibration_method: str | None
    known_dimension_mm: float | None
    pixel_length: float | None
    pixels_per_mm: float | None
    bbox: list[float] | None
    measured_character_height_px: float | None
    measured_height_mm: float | None
    confidence: float | None
    insufficient_legal_validation_message: str


class PlacementEvidence(_CamelModel):
    """Rule 8."""

    rule_id: str
    result: RuleResultStatus
    expected_panel: str | None
    observed_panel: str | None
    image_id: str | None
    bbox: list[float] | None
    reason: str | None
    confidence: float | None


class ReadabilityFieldSignal(_CamelModel):
    field: str
    field_id: str | None
    angle: str | None
    ocr_confidence: float | None
    image_verdict: str | None
    recapture_required: bool
    has_real_evidence: bool
    status: str


class ReadabilityEvidence(_CamelModel):
    """Rule 9. OCR failure alone is never presented as a legal FAIL — the
    `result` field always reflects the rule's own effective_status
    (NEEDS_REVIEW/INSUFFICIENT_EVIDENCE/PASS/FAIL as the engine determined
    it), never re-derived from the raw OCR confidence numbers here."""

    rule_id: str
    result: RuleResultStatus
    language_detected: str | None
    language_ok: bool | None
    fields: list[ReadabilityFieldSignal] = []


class BarcodeCandidate(_CamelModel):
    raw_value: str
    normalized_value: str
    symbology: str
    checksum_valid: bool
    source_image_id: str
    source_angle: str
    bbox: list[float] | None
    decoder: str
    detection_method: str
    quality: float


class BarcodeEvidenceSection(_CamelModel):
    status: Literal["trusted", "needs_review", "none"]
    trusted_identifier: BarcodeCandidate | None
    candidates: list[BarcodeCandidate] = []


class OfficerResolution(_CamelModel):
    rule_id: str
    requirement: str
    resolved_status: Literal["PASS", "FAIL"]
    resolved_by: str
    resolved_at: str
    note: str


class OfficerVerification(_CamelModel):
    verified_by_name: str
    verified_by_role: str
    verified_by_region: str | None
    verified_at: str | None
    final_status: str
    resolutions: list[OfficerResolution] = []
    governance_statement: str = AI_GOVERNANCE_STATEMENT


class IntegrityBlock(_CamelModel):
    report_id: str
    inspection_id: str
    generated_at: str
    generated_by_name: str
    report_format_version: str
    rule_set_version: str
    pdf_sha256: str | None = None
    docx_sha256: str | None = None
    verify_url: str


class ReportSnapshotV2(_CamelModel):
    schema_version: Literal["2.0"] = REPORT_SCHEMA_VERSION
    report_metadata: ReportMetadata
    inspection: InspectionInfo
    product: ProductInfo
    responsible_entities: list[ResponsibleEntity] = []
    overall_assessment: OverallAssessment
    original_images: list[ImageReference] = []
    declarations: list[DeclarationRow] = []
    compliance_checklist: list[ChecklistRow] = []
    violations: list[ViolationDetail] = []
    font_measurements: list[FontMeasurement] = []
    placement_evidence: list[PlacementEvidence] = []
    readability_evidence: list[ReadabilityEvidence] = []
    barcode_evidence: BarcodeEvidenceSection | None = None
    officer_verification: OfficerVerification
    integrity: IntegrityBlock
