"""
jobs/pipeline.py — the persisted pipeline runner.

`scan_sessions.stages` is the ONLY source of truth (per the Phase 2
mandate) — every stage transition is written to the DB (via `_persist`,
which reassigns the whole `stages` list so SQLAlchemy's change tracking
picks it up, rather than mutating in place) before this function proceeds
to the next stage. `run_pipeline` is the SAME entry point for both the
initial BackgroundTasks kick-off and the manual retry endpoint — it always
resumes from whatever is currently persisted, never from in-memory state,
because there IS no in-memory state: if the process dies here, nothing
resumes automatically, and the next call to this function (via retry) is
what continues it. That is deliberate, not a gap — see the module's own
Phase 2 brief ("do not pretend BackgroundTasks automatically resumes work").

Stage order: uploading, qualityCheck (both already `completed` by the time
this runs — see api/v1/scans.py, which does both synchronously before the
scan_session row is even created) -> textExtraction -> fallbackExtraction
-> barcodeDetection -> structuring -> ruleEngine -> complianceScore ->
readyForVerification. barcodeDetection (Phase 8) is independent of OCR in
both directions — it never reads OCR's output and never blocks
structuring/ruleEngine on its own failure (see services/barcode/'s own
docstrings) — it's ordered here only to match the officer-facing narrative
("Extracting declarations" -> "Checking product barcode" -> "Structuring
evidence").

ruleEngine/complianceScore (Phase 3) run the deterministic Legal Metrology
rule engine (app/services/rules/) over the structured extraction and write
a real compliance_status/compliance_score/checklist/violations onto the
provisional ComplianceRecord — verification_status stays "Extracted" until
an officer explicitly verifies via POST /records/{id}/verify
(api/v1/records.py), which only freezes the record; it does not compute
compliance for the first time.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ids import derive_record_id
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, EvidenceImage, ScanSession
from app.db.session import SessionLocal
from app.services.barcode import (
    BarcodeAnalysis,
    barcode_analysis_to_frontend,
    detect_barcodes,
    resolve_barcode_analysis,
)
from app.services.extraction.adapter import to_extraction_result
from app.services.extraction.schema import ComplianceEvidenceBundle, ImageQualitySummary
from app.services.ocr.gemini import GeminiOcrProvider, GeminiUnavailableError, structure
from app.services.ocr.paddle import PaddleOcrProvider
from app.services.ocr.provider import OcrBlock
from app.services.rules.aggregate import compute_compliance_score, compute_legal_status
from app.services.rules.checks import _side_pdp_evidence, run_all_rule_checks
from app.services.rules.frontend_adapter import to_checklist_and_violations

# A field is "insufficient" enough to justify a Gemini fallback pass on
# whichever image angle it's normally read from — deliberately not just
# "overall confidence low", since one weak field on an otherwise-clear
# photo shouldn't trigger a second full-image call.
FALLBACK_MIN_BLOCKS = 3  # fewer than this many detected lines looks like a bad read

# Exactly src/types/scan.ts's PIPELINE_STAGE_IDS, in order — never reordered
# or renamed independently of that frontend contract.
PIPELINE_STAGE_IDS = [
    "uploading",
    "qualityCheck",
    "textExtraction",
    "fallbackExtraction",
    "barcodeDetection",
    "structuring",
    "ruleEngine",
    "complianceScore",
    "readyForVerification",
]


def initial_stages(quality_summary: str) -> list[dict]:
    """uploading/qualityCheck start already `completed` — both already ran
    synchronously in the POST /scans handler before this scan_session row
    was even created, the same "quality check is already resolved before
    this route is reached... created already completed here, for
    continuity" convention already documented for PIPELINE_STAGE_IDS."""
    stages = []
    for stage_id in PIPELINE_STAGE_IDS:
        if stage_id == "uploading":
            stages.append({"id": stage_id, "state": "completed", "summary": "Evidence stored."})
        elif stage_id == "qualityCheck":
            stages.append({"id": stage_id, "state": "completed", "summary": quality_summary})
        else:
            stages.append({"id": stage_id, "state": "pending"})
    return stages


def initial_stages_pending_capture() -> list[dict]:
    """Every stage starts pending — used only by the Mobile QR Handoff's
    scan-session-creation path (api/v1/mobile_handoff.py), where no image
    exists yet at creation time. uploading/qualityCheck transition to
    completed later, via `mark_capture_stages_completed` below, once the
    officer's own "Continue" click confirms all required images have
    landed — mirroring what `initial_stages()` above assumes was already
    true by the time IT runs."""
    return [{"id": stage_id, "state": "pending"} for stage_id in PIPELINE_STAGE_IDS]


def mark_capture_stages_completed(stages: list[dict], quality_summary: str) -> list[dict]:
    """The Mobile QR Handoff finalize step's counterpart to
    `initial_stages()`'s already-completed uploading/qualityCheck — called
    once real EvidenceImage rows exist for every required angle, just
    before `run_pipeline` is scheduled. Reuses `_with_stage_update` (the
    same stage-transition primitive every other stage change in this file
    goes through) rather than re-deriving the stage-list shape by hand."""
    stages = _with_stage_update(stages, "uploading", state="completed", summary="Evidence stored.")
    stages = _with_stage_update(stages, "qualityCheck", state="completed", summary=quality_summary)
    return stages


def _find_stage(stages: list[dict], stage_id: str) -> dict:
    for stage in stages:
        if stage["id"] == stage_id:
            return stage
    raise KeyError(stage_id)


def _with_stage_update(stages: list[dict], stage_id: str, **updates) -> list[dict]:
    """Returns a NEW list with one stage updated — reassigning
    `session.stages` to this return value (never mutating the existing list
    in place) is what makes SQLAlchemy detect and persist the change."""
    new_stages = []
    for stage in stages:
        if stage["id"] == stage_id:
            new_stages.append({**stage, **updates})
        else:
            new_stages.append(stage)
    return new_stages


def _persist(db: Session, session: ScanSession, stages: list[dict], **session_updates) -> None:
    session.stages = stages
    for key, value in session_updates.items():
        setattr(session, key, value)
    db.commit()


def _fetch_image_bytes(storage_key: str, settings) -> bytes:
    client = get_s3_client(settings)
    obj = client.get_object(Bucket=settings.s3_bucket, Key=storage_key)
    return obj["Body"].read()


def run_pipeline(scan_session_id: uuid.UUID) -> None:
    settings = get_settings()
    with SessionLocal() as db:
        session = db.get(ScanSession, scan_session_id)
        if session is None:
            return

        stages = list(session.stages)

        text_extraction = _find_stage(stages, "textExtraction")
        if text_extraction["state"] == "failed":
            return  # a failed stage never auto-resumes — only explicit retry does
        if text_extraction["state"] in ("pending",):
            stages = _with_stage_update(stages, "textExtraction", state="in_progress")
            _persist(db, session, stages)

            images = (
                db.query(EvidenceImage)
                .filter(EvidenceImage.scan_session_id == scan_session_id)
                .order_by(EvidenceImage.angle)
                .all()
            )
            if not images:
                stages = _with_stage_update(
                    stages, "textExtraction", state="failed",
                    failureReason="No accepted evidence images found for this scan.",
                )
                _persist(db, session, stages, status="failed", error="No evidence images")
                return

            provider = PaddleOcrProvider()
            all_blocks: list[OcrBlock] = []
            angle_by_image_id: dict[str, str] = {}
            try:
                for image in images:
                    image_bytes = _fetch_image_bytes(image.storage_key, settings)
                    result = provider.extract(image_bytes, image_id=str(image.id))
                    print(f"[OCR-TIMING] angle={image.angle} duration_ms={result.duration_ms:.0f} blocks={len(result.blocks)}", flush=True)
                    all_blocks.extend(result.blocks)
                    angle_by_image_id[str(image.id)] = image.angle
            except Exception as exc:  # noqa: BLE001 - any OCR/storage failure
                stages = _with_stage_update(
                    stages, "textExtraction", state="failed", failureReason=str(exc)
                )
                _persist(db, session, stages, status="failed", error=str(exc))
                return

            stages = _with_stage_update(
                stages, "textExtraction", state="completed",
                summary=f"{len(all_blocks)} text blocks detected across {len(images)} images.",
            )
            _persist(db, session, stages)
        else:
            # Already completed in an earlier run — reload what we need to continue.
            images = (
                db.query(EvidenceImage)
                .filter(EvidenceImage.scan_session_id == scan_session_id)
                .order_by(EvidenceImage.angle)
                .all()
            )
            all_blocks, angle_by_image_id = _reextract_for_resume(images, settings)

        # --- fallbackExtraction ---
        fallback = _find_stage(stages, "fallbackExtraction")
        if fallback["state"] == "failed":
            return
        if fallback["state"] == "pending":
            if len(all_blocks) >= FALLBACK_MIN_BLOCKS:
                stages = _with_stage_update(
                    stages, "fallbackExtraction", state="skipped",
                    summary="Not needed — primary OCR found sufficient text.",
                )
                _persist(db, session, stages)
            else:
                stages = _with_stage_update(stages, "fallbackExtraction", state="in_progress")
                _persist(db, session, stages)
                try:
                    gemini_ocr = GeminiOcrProvider(settings)
                    for image in images:
                        image_bytes = _fetch_image_bytes(image.storage_key, settings)
                        fb_result = gemini_ocr.extract(image_bytes, image_id=str(image.id))
                        all_blocks.extend(fb_result.blocks)
                    stages = _with_stage_update(
                        stages, "fallbackExtraction", state="completed",
                        summary=f"Gemini fallback added {len(fb_result.blocks)} more blocks.",
                    )
                    _persist(db, session, stages)
                except GeminiUnavailableError as exc:
                    stages = _with_stage_update(
                        stages, "fallbackExtraction", state="failed", failureReason=str(exc)
                    )
                    _persist(db, session, stages, status="failed", error=str(exc))
                    return

        # --- barcodeDetection ---
        # Deterministic, never Gemini (services/barcode/resolve.py's own
        # docstring) — an independent per-image pass over the same evidence
        # images OCR just used, but with zero dependency on OCR's outcome in
        # either direction. Follows structuring/ruleEngine's own "always
        # recompute the pure/cheap work, only conditionally persist the
        # stage-state transition" discipline below, rather than OCR's
        # resume-caching pattern — detection is comparatively cheap per
        # image and has no intermediate artifact worth avoiding a redo of.
        #
        # Deliberately never gates the rest of the pipeline: a failed or
        # empty barcode result is an explicitly normal outcome (no barcode
        # detected -> existing Product DNA composite fallback, unchanged;
        # see checks.py-adjacent docs), so this block never `return`s even
        # on failure — only textExtraction/fallbackExtraction/structuring/
        # ruleEngine's own failures gate downstream stages.
        barcode_stage = _find_stage(stages, "barcodeDetection")
        if barcode_stage["state"] == "failed":
            barcode_analysis = BarcodeAnalysis()
        else:
            barcode_was_pending = barcode_stage["state"] == "pending"
            if barcode_was_pending:
                stages = _with_stage_update(stages, "barcodeDetection", state="in_progress")
                _persist(db, session, stages)
            try:
                per_image_barcode_results = [
                    result
                    for image in images
                    for result in detect_barcodes(
                        _fetch_image_bytes(image.storage_key, settings), str(image.id), image.angle
                    )
                ]
                barcode_analysis = resolve_barcode_analysis(per_image_barcode_results)
                if barcode_was_pending:
                    if barcode_analysis.status == "trusted":
                        summary = f"Barcode {barcode_analysis.trusted_identifier.normalized_value} detected."
                    elif barcode_analysis.status == "needs_review":
                        summary = "Multiple product identifiers detected — needs review."
                    else:
                        summary = "No barcode detected."
                    stages = _with_stage_update(stages, "barcodeDetection", state="completed", summary=summary)
                    _persist(db, session, stages)
            except Exception as exc:  # noqa: BLE001 - never blocks the rest of the pipeline
                barcode_analysis = BarcodeAnalysis()
                if barcode_was_pending:
                    stages = _with_stage_update(
                        stages, "barcodeDetection", state="failed", failureReason=str(exc)
                    )
                    _persist(db, session, stages)

        # --- structuring ---
        # Runs whenever we don't already have a result in hand this call —
        # including the resume case where the STAGE was already marked
        # `completed` in an earlier run but the process died before
        # readyForVerification: there is nowhere the intermediate
        # StructuredExtraction was persisted (see _reextract_for_resume's
        # own docstring on this same "cheap re-run over caching" trade-off
        # at MVP scale), so recomputing it here is correct, not a bug
        # papered over — the STAGE stays `completed` either way since the
        # work it represents (turning OCR into structured fields) already
        # genuinely succeeded once and this just repeats it.
        structuring_stage = _find_stage(stages, "structuring")
        if structuring_stage["state"] == "failed":
            return

        was_pending = structuring_stage["state"] == "pending"
        if was_pending:
            stages = _with_stage_update(stages, "structuring", state="in_progress")
            _persist(db, session, stages)

        try:
            structured_extraction = structure(all_blocks, angle_by_image_id, settings)
        except GeminiUnavailableError as exc:
            stages = _with_stage_update(
                stages, "structuring", state="failed", failureReason=str(exc)
            )
            _persist(db, session, stages, status="failed", error=str(exc))
            return

        extraction_result = to_extraction_result(str(scan_session_id), structured_extraction)
        extraction_result["barcodeAnalysis"] = barcode_analysis_to_frontend(barcode_analysis)
        if was_pending:
            stages = _with_stage_update(
                stages, "structuring", state="completed",
                summary="Declarations structured from OCR evidence.",
            )
            _persist(db, session, stages)

        # --- ruleEngine ---
        # Runs the same "always recompute the pure/cheap work, only
        # conditionally persist the stage-state transition" discipline
        # already established for `structuring` above — rule evaluation is
        # pure Python over in-memory data, so re-running it on resume is
        # free, unlike redoing OCR.
        rule_engine_stage = _find_stage(stages, "ruleEngine")
        if rule_engine_stage["state"] == "failed":
            return
        rule_engine_was_pending = rule_engine_stage["state"] == "pending"
        if rule_engine_was_pending:
            stages = _with_stage_update(stages, "ruleEngine", state="in_progress")
            _persist(db, session, stages)

        try:
            quality_results = [
                ImageQualitySummary(
                    image_id=str(image.id),
                    angle=image.angle,
                    overall_verdict=(image.quality_result or {}).get("overall_verdict", "unknown"),
                    reason=(image.quality_result or {}).get("reason"),
                    checks=(image.quality_result or {}).get("checks", []),
                )
                for image in images
            ]
            rule_results = run_all_rule_checks(
                structured_extraction, category=session.category,
                image_quality_results=quality_results, total_ocr_blocks=len(all_blocks),
            )
            bundle = ComplianceEvidenceBundle(
                structured_extraction=structured_extraction,
                ocr_blocks=[b.model_dump() for b in all_blocks],
                image_quality_results=quality_results,
                pdp_declarations_detected=_pdp_declarations(structured_extraction),
                rule_results=rule_results,
                barcode_analysis=barcode_analysis,
            )
        except Exception as exc:  # noqa: BLE001 - the rule engine is pure/local; any failure here is a real bug
            stages = _with_stage_update(
                stages, "ruleEngine", state="failed", failureReason=str(exc)
            )
            _persist(db, session, stages, status="failed", error=str(exc))
            return

        if rule_engine_was_pending:
            stages = _with_stage_update(
                stages, "ruleEngine", state="completed",
                summary=f"{len(rule_results)} rules evaluated; Rule 7 (font size) always requires "
                        "manual verification — no calibration hardware at MVP.",
            )
            _persist(db, session, stages)

        # --- complianceScore ---
        score_stage = _find_stage(stages, "complianceScore")
        score_was_pending = score_stage["state"] == "pending"
        if score_was_pending:
            stages = _with_stage_update(stages, "complianceScore", state="in_progress")
            _persist(db, session, stages)

        legal_status = compute_legal_status(rule_results)
        score_result = compute_compliance_score(rule_results)
        checklist, violations = to_checklist_and_violations(rule_results)
        if legal_status == "Not Applicable":
            violations = []  # an exempt product carries no actionable violations

        if score_was_pending:
            stages = _with_stage_update(
                stages, "complianceScore", state="completed",
                summary=f"Score {score_result['value']} ({score_result['band']}); status {legal_status}.",
            )
            _persist(db, session, stages)

        # --- readyForVerification: create the provisional record ---
        record_id = derive_record_id(scan_session_id)
        record = db.get(ComplianceRecord, record_id)
        if record is None:
            record = ComplianceRecord(id=record_id, scan_session_id=scan_session_id)
            db.add(record)

        record.product_name_observed = extraction_result["declarations"][1]["value"]  # genericName
        record.manufacturer_name_observed = extraction_result["declarations"][0]["value"]
        record.category = session.category
        record.region = session.region
        record.source = session.source
        record.ecommerce_listing_url = session.ecommerce_listing_url
        # verification_status stays "Extracted" until an officer explicitly
        # verifies (see api/v1/records.py) — but compliance_status/score/
        # checklist/violations now reflect the REAL deterministic rule
        # engine result immediately, not a "Pending" placeholder. This is a
        # deliberate Phase 3 semantic shift: the rule engine determines
        # compliance at pipeline-completion time; verification is a
        # separate officer sign-off/freeze step, not the determination step.
        record.verification_status = "Extracted"
        record.compliance_status = legal_status
        record.compliance_score = score_result["value"]
        record.compliance_band = score_result["band"]
        record.extraction = extraction_result
        record.checklist = checklist
        record.violations = violations
        record.evidence_bundle = bundle.model_dump()
        record.assigned_officer_id = session.created_by
        record.scanned_at = session.created_at

        session.record_id = record.id
        stages = _with_stage_update(
            stages, "readyForVerification", state="completed",
            summary="Provisional record created — awaiting officer verification.",
        )
        _persist(db, session, stages, status="completed")


def _pdp_declarations(extraction) -> list[str]:
    """Distinct labels for every piece of OCR evidence sourced from the
    side/PDP image, across all StructuredExtraction fields — reuses the
    same field-iteration as check_rule_8_pdp_presence (checks.py) so the
    same evidence isn't scanned twice."""
    seen: set[str] = set()
    labels: list[str] = []
    for evidence in _side_pdp_evidence(extraction):
        label = evidence.ocr_block_text or ""
        if label and label not in seen:
            seen.add(label)
            labels.append(label)
    return labels


def _reextract_for_resume(images: list[EvidenceImage], settings) -> tuple[list[OcrBlock], dict[str, str]]:
    """If textExtraction was already marked completed in a PRIOR run of this
    function (process died later, retry re-entered here), OCR blocks
    weren't persisted anywhere except folded into the eventual record — so
    resuming past that point re-runs OCR rather than inventing a cache we
    don't have. Cheap enough at MVP scale; a real job queue would persist
    intermediate artifacts instead."""
    provider = PaddleOcrProvider()
    all_blocks: list[OcrBlock] = []
    angle_by_image_id: dict[str, str] = {}
    for image in images:
        image_bytes = _fetch_image_bytes(image.storage_key, settings)
        result = provider.extract(image_bytes, image_id=str(image.id))
        all_blocks.extend(result.blocks)
        angle_by_image_id[str(image.id)] = image.angle
    return all_blocks, angle_by_image_id


def retry_stage(scan_session_id: uuid.UUID, stage_id: str) -> bool:
    """Resets exactly one FAILED stage to pending and persists it — does NOT
    run the pipeline itself. Returns False if the scan or stage doesn't
    exist, or the stage isn't currently failed.

    Phase 2's original version of this function called run_pipeline()
    synchronously right here, which meant the retry HTTP endpoint blocked
    for as long as the whole re-run took (measured at 60-90+ seconds when
    OCR/Gemini had to redo work) before returning. Phase 3 fixes this: the
    caller (the retry route in api/v1/scans.py) persists this fast reset
    and returns immediately, then schedules run_pipeline() via
    BackgroundTasks. GET /scans/{id}/pipeline remains the only way to
    observe progress after that — exactly the same pattern POST /scans
    already used for the initial run.
    """
    with SessionLocal() as db:
        session = db.get(ScanSession, scan_session_id)
        if session is None:
            return False
        stages = list(session.stages)
        try:
            stage = _find_stage(stages, stage_id)
        except KeyError:
            return False
        if stage["state"] != "failed":
            return False

        stages = _with_stage_update(stages, stage_id, state="pending", failureReason=None)
        _persist(db, session, stages, status="pending", error=None)

    return True
