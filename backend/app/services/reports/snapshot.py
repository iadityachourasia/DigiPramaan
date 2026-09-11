"""
reports/snapshot.py — build_report_snapshot(), the frozen ReportSnapshotV2
(reports/schema.py) built directly from real DB data at generation time.

Phase 13 rewrite: the prior build_report_document() returned a loose dict
matching src/types/report.ts's older ReportDocument shape, and most of
what it computed (declarations, per-violation explanation/evidence,
inspectionMetadata) was silently dropped by the renderer, which only read
a narrower field set. This version reads the SAME underlying data one
level deeper — `evidence_bundle.rule_results` (the full, pre-flattening
list[RuleResult], including the original `status` alongside any officer
`resolution`) rather than the already-flattened `record.checklist`/
`.violations` — because `to_checklist_and_violations()`'s dict output
(the UI-facing, `passed: bool` shape) does not preserve the 5-way
PASS/FAIL/NEEDS_REVIEW/INSUFFICIENT_EVIDENCE/NOT_APPLICABLE distinction
this report is required to show; `effective_status` is a Python
`@property` on RuleResult, never serialized into that flattened JSON.

This module still calls `to_checklist_and_violations()` itself (imported,
not reimplemented) to decide WHICH rows are "confirmed violations" versus
merely "needs review" and to get the already-correct consumer-care merge
and NOT_APPLICABLE/rule3Applicability exclusion — it just also keeps a
reference back to each row's originating RuleResult (via the `ruleId` key
already threaded through violations/checklist dicts for exactly this
purpose, per that module's own docstring) so the true effective_status,
resolution, and rule_name survive into the report.

Deliberately reads NO image bytes and touches NO B2/S3 client — that is
`reports/images.py`'s job, run separately by the job orchestrator
(`jobs/reports.py`) after this snapshot is built. `ImageReference.image_
width_px/height_px` are left None here and patched in by the orchestrator
once the original (pre-resize) pixel dimensions are known.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session as DbSession

from app.core.config import Settings
from app.db.models import ComplianceRecord, EvidenceImage, Profile, RuleExplanation
from app.services.reports.schema import (
    BarcodeCandidate,
    BarcodeEvidenceSection,
    ChecklistRow,
    DeclarationRow,
    FontMeasurement,
    ImageReference,
    InspectionInfo,
    IntegrityBlock,
    OfficerResolution,
    OfficerVerification,
    OverallAssessment,
    PlacementEvidence,
    ProductInfo,
    ReadabilityEvidence,
    ReadabilityFieldSignal,
    ReportMetadata,
    ReportSnapshotV2,
    ResponsibleEntity,
    ViolationDetail,
)
from app.services.rules.frontend_adapter import to_checklist_and_violations
from app.services.rules.rule7_thresholds import INSUFFICIENT_LEGAL_VALIDATION_MESSAGE
from app.services.rules.types import RuleResult

REQUIRED_ANGLES = ("front", "back", "side_pdp")

_ROLE_LABELS = {
    "manufacturer": "manufacturer",
    "packer": "packer",
    "importer": "importer",
    "brand_owner_or_marketer": "brand_owner_or_marketer",
}


def _is_degenerate_bbox(bbox) -> bool:
    """Same one-line check as measurement/font_height.py and rules/checks.py
    — duplicated inline rather than importing a private cross-module
    helper, matching those modules' own stated convention for this exact
    check."""
    return bbox is None or tuple(bbox) == (0.0, 0.0, 1.0, 1.0)


def _rule_results(record: ComplianceRecord) -> list[RuleResult]:
    bundle = record.evidence_bundle or {}
    return [RuleResult.model_validate(r) for r in bundle.get("rule_results", [])]


def _rule_by_id(rule_results: list[RuleResult]) -> dict[str, RuleResult]:
    return {r.rule_id: r for r in rule_results}


def _explanation_for(record_id: uuid.UUID, rule_id: str | None, db: DbSession) -> dict | None:
    """A cached Gemini explanation for this rule's violation, if one
    exists — never triggers a live Gemini call. Returns the full
    ExplanationOutput dict (already camelCase, per gemini_explainer.py) so
    the renderer can show "what was found"/"what's missing"/"officer
    guidance", not just a one-line summary."""
    if not rule_id:
        return None
    cached = (
        db.query(RuleExplanation)
        .filter(RuleExplanation.compliance_record_id == record_id, RuleExplanation.rule_id == rule_id)
        .first()
    )
    return cached.explanation if cached is not None else None


def _build_metadata(report_id: uuid.UUID, reference_code: str, current_user: Profile) -> ReportMetadata:
    return ReportMetadata(
        report_id=str(report_id),
        reference_code=reference_code,
        generated_at=datetime.now(timezone.utc).isoformat(),
        generated_by_name=current_user.full_name,
        generated_by_role=current_user.role,
        generated_by_region=current_user.region,
    )


def _inspection_id(record: ComplianceRecord) -> str:
    return str(record.scan_session_id) if record.scan_session_id else str(record.id)


def _build_inspection(record: ComplianceRecord) -> InspectionInfo:
    return InspectionInfo(
        inspection_id=_inspection_id(record),
        scanned_at=record.scanned_at.isoformat() if record.scanned_at else None,
        source=record.source,
        region=record.region,
        category=record.category,
    )


def _extracted_value(structured_extraction: dict, key: str) -> str | None:
    field = structured_extraction.get(key)
    if not field:
        return None
    return field.get("value")


def _build_product(record: ComplianceRecord) -> ProductInfo:
    extraction = (record.evidence_bundle or {}).get("structured_extraction", {})
    return ProductInfo(
        product_name=record.product_name_observed or "Unknown product",
        generic_name=_extracted_value(extraction, "generic_name"),
        category=record.category,
        net_quantity=_extracted_value(extraction, "net_quantity"),
        mrp=_extracted_value(extraction, "mrp"),
        country_of_origin=_extracted_value(extraction, "country_of_origin"),
    )


def _build_responsible_entities(record: ComplianceRecord) -> list[ResponsibleEntity]:
    extraction = (record.evidence_bundle or {}).get("structured_extraction", {})
    entities: list[ResponsibleEntity] = []
    for role in ("manufacturer", "packer", "importer", "brand_owner_or_marketer"):
        field = extraction.get(role)
        if field is None:
            continue
        # Conditional section: skip a role entirely once it's both
        # not_detected AND has no value — nothing to show, not even a
        # "not found" row, for a role the extraction never populated.
        if field.get("not_detected") and not field.get("value"):
            continue
        entities.append(
            ResponsibleEntity(
                role=role,
                value=field.get("value"),
                not_detected=bool(field.get("not_detected")),
                corrected=bool(field.get("corrected")),
            )
        )
    return entities


def _build_overall_assessment(record: ComplianceRecord) -> OverallAssessment:
    return OverallAssessment(
        compliance_status=record.compliance_status,
        compliance_score=record.compliance_score,
        compliance_band=record.compliance_band,
        verification_status=record.verification_status,
    )


def _build_original_images(record: ComplianceRecord, db: DbSession) -> list[ImageReference]:
    if record.scan_session_id is None:
        return []
    images = (
        db.query(EvidenceImage)
        .filter(EvidenceImage.scan_session_id == record.scan_session_id)
        .order_by(EvidenceImage.uploaded_at)
        .all()
    )
    refs = []
    for image in images:
        quality = image.quality_result or {}
        refs.append(
            ImageReference(
                image_id=str(image.id),
                angle=image.angle,
                content_hash=image.content_hash,
                uploaded_at=image.uploaded_at.isoformat() if image.uploaded_at else None,
                quality_verdict=quality.get("overall_verdict"),
            )
        )
    return refs


def _build_declarations(record: ComplianceRecord) -> list[DeclarationRow]:
    extraction = (record.evidence_bundle or {}).get("structured_extraction", {})
    rows: list[DeclarationRow] = []
    for field_id, field in extraction.items():
        if not isinstance(field, dict) or field_id == "language_detected":
            continue
        evidence_list = field.get("evidence") or []
        first_evidence = evidence_list[0] if evidence_list else None
        rows.append(
            DeclarationRow(
                field_id=field_id,
                label=field_id.replace("_", " ").title(),
                observed_value=field.get("value"),
                not_detected=bool(field.get("not_detected")),
                corrected=bool(field.get("corrected")),
                evidence_image_id=first_evidence.get("image_id") if first_evidence else None,
                evidence_angle=first_evidence.get("image_angle") if first_evidence else None,
            )
        )
    return rows


def _evidence_ref_from_rule(evidence: dict | None) -> tuple[str | None, str | None]:
    """Best-effort (imageId, angle) pair from a rule's own structured
    evidence dict — the shapes differ per rule (Rule 8's `imageId`/
    `observedPanel`, Rule 9's per-field `angle`), so this checks the keys
    each rule actually populates rather than assuming one shape."""
    if not evidence:
        return None, None
    image_id = evidence.get("imageId") or evidence.get("image_id")
    angle = evidence.get("observedPanel") or evidence.get("angle") or evidence.get("sourceAngle")
    return image_id, angle


def _build_compliance_checklist(record: ComplianceRecord) -> list[ChecklistRow]:
    rule_results = _rule_results(record)
    by_id = _rule_by_id(rule_results)
    checklist_dicts, _ = to_checklist_and_violations(rule_results)

    rows: list[ChecklistRow] = []
    for row in checklist_dicts:
        rule = by_id.get(row.get("ruleId"))
        if rule is None:
            continue
        image_id, angle = _evidence_ref_from_rule(rule.evidence)
        rows.append(
            ChecklistRow(
                rule_id=rule.rule_id,
                requirement=rule.rule_name,
                observed_value=row.get("value"),
                result=rule.effective_status.value,
                evidence_note=row.get("detail"),
                evidence_image_id=image_id,
                evidence_angle=angle,
                officer_resolution_note=rule.resolution.note if rule.resolution else None,
            )
        )
    return rows


def _build_violations(record: ComplianceRecord, db: DbSession) -> list[ViolationDetail]:
    rule_results = _rule_results(record)
    by_id = _rule_by_id(rule_results)
    _, violation_dicts = to_checklist_and_violations(rule_results)
    original_images = _build_original_images(record, db)
    image_by_angle = {img.angle: img for img in original_images}
    image_by_id = {img.image_id: img for img in original_images}

    details: list[ViolationDetail] = []
    for v in violation_dicts:
        rule_id = v.get("ruleId")
        rule = by_id.get(rule_id)
        evidence = rule.evidence if rule else None
        bbox = None
        crop_ref = None
        original_image = None
        if evidence:
            raw_bbox = evidence.get("bbox")
            if not _is_degenerate_bbox(raw_bbox):
                bbox = list(raw_bbox)
                crop_ref = f"{rule_id}"
            image_id, angle = _evidence_ref_from_rule(evidence)
            # Prefer resolving by the specific image ID the rule cited
            # (Rule 6a-6e's evidence dicts only ever carry `imageId`, no
            # angle/panel key) — an angle-only match is the fallback for
            # rules (8/9) whose evidence names a panel instead.
            if image_id and image_id in image_by_id:
                original_image = image_by_id[image_id]
            elif angle and angle in image_by_angle:
                original_image = image_by_angle[angle]

        details.append(
            ViolationDetail(
                rule_id=rule_id,
                category=v.get("category"),
                legal_basis=v.get("legalBasis"),
                detail=v.get("detail"),
                result=rule.effective_status.value if rule else "FAIL",
                ai_explanation=_explanation_for(record.id, rule_id, db),
                original_image=original_image,
                bbox=bbox,
                crop_image_ref=crop_ref if bbox else None,
            )
        )
    return details


def _build_font_measurements(record: ComplianceRecord) -> list[FontMeasurement]:
    rule_results = _rule_results(record)
    measurements: list[FontMeasurement] = []
    for r in rule_results:
        if not r.rule_id.startswith("rule_7"):
            continue
        evidence = r.evidence or {}
        bbox = evidence.get("bbox")
        measurements.append(
            FontMeasurement(
                rule_id=r.rule_id,
                result=r.effective_status.value,
                message=r.message,
                field_id=r.field_id,
                image_id=evidence.get("image_id"),
                calibration_method=evidence.get("calibration_method"),
                known_dimension_mm=evidence.get("known_dimension_mm"),
                pixel_length=evidence.get("pixel_length"),
                pixels_per_mm=evidence.get("pixels_per_mm"),
                bbox=list(bbox) if bbox and not _is_degenerate_bbox(bbox) else None,
                measured_character_height_px=evidence.get("measured_character_height_px"),
                measured_height_mm=evidence.get("measured_height_mm"),
                confidence=evidence.get("confidence"),
                insufficient_legal_validation_message=INSUFFICIENT_LEGAL_VALIDATION_MESSAGE,
            )
        )
    return measurements


def _build_placement_evidence(record: ComplianceRecord) -> list[PlacementEvidence]:
    rule_results = _rule_results(record)
    rows: list[PlacementEvidence] = []
    for r in rule_results:
        if r.rule_id != "rule_8_pdp_presence":
            continue
        evidence = r.evidence or {}
        bbox = evidence.get("bbox")
        rows.append(
            PlacementEvidence(
                rule_id=r.rule_id,
                result=r.effective_status.value,
                expected_panel=evidence.get("expectedPanel"),
                observed_panel=evidence.get("observedPanel"),
                image_id=evidence.get("imageId"),
                bbox=list(bbox) if bbox and not _is_degenerate_bbox(bbox) else None,
                reason=evidence.get("reason"),
                confidence=evidence.get("confidence"),
            )
        )
    return rows


def _build_readability_evidence(record: ComplianceRecord) -> list[ReadabilityEvidence]:
    rule_results = _rule_results(record)
    rows: list[ReadabilityEvidence] = []
    for r in rule_results:
        if r.rule_id != "rule_9_language":
            continue
        evidence = r.evidence or {}
        fields = [
            ReadabilityFieldSignal(
                field=f.get("field", ""),
                field_id=f.get("fieldId"),
                angle=f.get("angle"),
                ocr_confidence=f.get("ocrConfidence"),
                image_verdict=f.get("imageVerdict"),
                recapture_required=bool(f.get("recaptureRequired")),
                has_real_evidence=bool(f.get("hasRealEvidence")),
                status=f.get("status", ""),
            )
            for f in evidence.get("fields", [])
        ]
        rows.append(
            ReadabilityEvidence(
                rule_id=r.rule_id,
                result=r.effective_status.value,
                language_detected=evidence.get("languageDetected"),
                language_ok=evidence.get("languageOk"),
                fields=fields,
            )
        )
    return rows


def _build_barcode_evidence(record: ComplianceRecord) -> BarcodeEvidenceSection | None:
    analysis = (record.evidence_bundle or {}).get("barcode_analysis")
    if not analysis or analysis.get("status") == "none":
        return None

    def _candidate(c: dict) -> BarcodeCandidate:
        bbox = c.get("bbox")
        return BarcodeCandidate(
            raw_value=c.get("raw_value", ""),
            normalized_value=c.get("normalized_value", ""),
            symbology=c.get("symbology", ""),
            checksum_valid=bool(c.get("checksum_valid")),
            source_image_id=c.get("source_image_id", ""),
            source_angle=c.get("source_angle", ""),
            bbox=list(bbox) if bbox else None,
            decoder=c.get("decoder", ""),
            detection_method=c.get("detection_method", ""),
            quality=c.get("quality", 1.0),
        )

    trusted = analysis.get("trusted_identifier")
    return BarcodeEvidenceSection(
        status=analysis["status"],
        trusted_identifier=_candidate(trusted) if trusted else None,
        candidates=[_candidate(c) for c in analysis.get("candidates", [])],
    )


def _build_officer_verification(record: ComplianceRecord, current_user: Profile) -> OfficerVerification:
    rule_results = _rule_results(record)
    resolutions = [
        OfficerResolution(
            rule_id=r.rule_id,
            requirement=r.rule_name,
            resolved_status=r.resolution.resolved_status.value,
            resolved_by=r.resolution.resolved_by,
            resolved_at=r.resolution.resolved_at,
            note=r.resolution.note,
        )
        for r in rule_results
        if r.resolution is not None
    ]
    return OfficerVerification(
        verified_by_name=current_user.full_name,
        verified_by_role=current_user.role,
        verified_by_region=current_user.region,
        verified_at=record.verified_at.isoformat() if record.verified_at else None,
        final_status=record.compliance_status,
        resolutions=resolutions,
    )


def _build_integrity(
    report_id: uuid.UUID, inspection_id: str, current_user: Profile, settings: Settings
) -> IntegrityBlock:
    return IntegrityBlock(
        report_id=str(report_id),
        inspection_id=inspection_id,
        generated_at=datetime.now(timezone.utc).isoformat(),
        generated_by_name=current_user.full_name,
        report_format_version="2.0",
        rule_set_version="legal-metrology-2011-v1",
        verify_url=f"{settings.frontend_base_url.rstrip('/')}/en/verify/report/{report_id}",
    )


def build_report_snapshot(
    record: ComplianceRecord,
    current_user: Profile,
    db: DbSession,
    settings: Settings,
    report_id: uuid.UUID,
    reference_code: str,
) -> ReportSnapshotV2:
    inspection_id = _inspection_id(record)
    return ReportSnapshotV2(
        report_metadata=_build_metadata(report_id, reference_code, current_user),
        inspection=_build_inspection(record),
        product=_build_product(record),
        responsible_entities=_build_responsible_entities(record),
        overall_assessment=_build_overall_assessment(record),
        original_images=_build_original_images(record, db),
        declarations=_build_declarations(record),
        compliance_checklist=_build_compliance_checklist(record),
        violations=_build_violations(record, db),
        font_measurements=_build_font_measurements(record),
        placement_evidence=_build_placement_evidence(record),
        readability_evidence=_build_readability_evidence(record),
        barcode_evidence=_build_barcode_evidence(record),
        officer_verification=_build_officer_verification(record, current_user),
        integrity=_build_integrity(report_id, inspection_id, current_user, settings),
    )
