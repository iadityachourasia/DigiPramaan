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
-> structuring -> ruleEngine (skipped, Phase 3) -> complianceScore (skipped,
Phase 3) -> readyForVerification.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ids import derive_record_id
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, EvidenceImage, ScanSession
from app.db.session import SessionLocal
from app.services.extraction.adapter import to_extraction_result
from app.services.ocr.gemini import GeminiOcrProvider, GeminiUnavailableError, structure
from app.services.ocr.paddle import PaddleOcrProvider
from app.services.ocr.provider import OcrBlock

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
        if was_pending:
            stages = _with_stage_update(
                stages, "structuring", state="completed",
                summary="Declarations structured from OCR evidence.",
            )
            _persist(db, session, stages)

        # --- ruleEngine / complianceScore: deferred to Phase 3 ---
        stages = _with_stage_update(
            stages, "ruleEngine", state="skipped", summary="Deferred to Phase 3."
        )
        stages = _with_stage_update(
            stages, "complianceScore", state="skipped", summary="Deferred to Phase 3."
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
        record.source = "Officer-Scanned"
        # Deliberately NOT "Verified"/compliant — Phase 2 produces a
        # provisional record only; Phase 3's rule engine + officer
        # verification is what may ever set these.
        record.verification_status = "Extracted"
        record.compliance_status = "Pending"
        record.extraction = extraction_result
        record.checklist = None
        record.violations = None
        record.assigned_officer_id = session.created_by
        record.scanned_at = session.created_at

        session.record_id = record.id
        stages = _with_stage_update(
            stages, "readyForVerification", state="completed",
            summary="Provisional record created — awaiting Phase 3 rule evaluation.",
        )
        _persist(db, session, stages, status="completed")


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
    """Resets exactly one FAILED stage to pending, then re-runs the whole
    pipeline function (which will fast-forward through already-completed/
    skipped stages and pick up from the reset one). Returns False if the
    scan or stage doesn't exist, or the stage isn't currently failed."""
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

    run_pipeline(scan_session_id)
    return True
