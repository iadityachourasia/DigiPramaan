"""
api/v1/scans.py — POST /scans, GET /scans/{id}/pipeline,
POST /scans/{id}/pipeline/{stage_id}/retry.

Image quality runs SYNCHRONOUSLY inside POST /scans, before any B2 upload
or scan_session row is created — the established "quality gate must give a
verdict before the officer leaves the capture screen" rule, and why
`uploading`/`qualityCheck` start life already `completed` (see
jobs/pipeline.py's `initial_stages`). Everything from `textExtraction`
onward runs in a BackgroundTask.
"""

from __future__ import annotations

import json
import math
import uuid
from datetime import datetime, timezone

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session as DbSession

from pydantic import BaseModel

from app.api.deps.auth import get_current_user
from app.api.deps.permissions import require_permission
from app.core.config import Settings, get_settings
from app.core.ids import derive_record_id
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, EvidenceImage, Profile, ScanSession
from app.db.session import get_db
from app.jobs.pipeline import initial_stages, retry_stage, run_pipeline
from app.services.extraction.schema import CalibrationData, ComplianceEvidenceBundle, Point
from app.services.image_quality import (
    QualityVerdict,
    evaluate_image_quality,
    find_duplicate_angles,
)
from app.services.measurement.font_height import measure_font_height
from app.services.rules.apply import reapply_rules
from app.services.records.serialize import to_frontend_record

# fieldId (frontend/checklist convention) -> the StructuredExtraction
# attribute Rule 7 measurement applies to. Only MRP and net quantity carry a
# statutory height requirement (matches src/types/scan.ts's FontSizeCheck,
# which is scoped to the same two fields).
_CALIBRATION_FIELD_TO_ATTR = {"retailSalePrice": "mrp", "netQuantity": "net_quantity"}

router = APIRouter(tags=["scans"])

REQUIRED_ANGLES = ("front", "back", "side_pdp")


def _extension_for(upload: UploadFile) -> str:
    if upload.filename and "." in upload.filename:
        return upload.filename.rsplit(".", 1)[-1].lower()
    return "jpg"


@router.post("/scans", status_code=status.HTTP_201_CREATED)
async def create_scan(
    background_tasks: BackgroundTasks,
    metadata: str = Form(...),
    front: UploadFile = File(...),
    back: UploadFile = File(...),
    side_pdp: UploadFile = File(...),
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        meta = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="metadata must be valid JSON") from exc

    uploads = {"front": front, "back": back, "side_pdp": side_pdp}
    image_bytes_by_angle: dict[str, bytes] = {}
    quality_by_angle = {}
    hashes_by_angle: dict[str, str] = {}

    for angle, upload in uploads.items():
        image_bytes = await upload.read()
        quality = evaluate_image_quality(image_bytes)
        image_bytes_by_angle[angle] = image_bytes
        quality_by_angle[angle] = quality
        hashes_by_angle[angle] = quality.content_hash

    duplicate_angles = find_duplicate_angles(hashes_by_angle)

    rejected = {
        angle: q
        for angle, q in quality_by_angle.items()
        if q.overall_verdict == QualityVerdict.RECAPTURE_REQUIRED
    }
    if rejected or duplicate_angles:
        detail = {
            "error": "One or more images failed the quality check.",
            "rejected": {
                angle: {"reason": q.reason, "checks": [c.model_dump() for c in q.checks]}
                for angle, q in rejected.items()
            },
            "duplicateAngles": duplicate_angles,
        }
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    # All three passed (PASS or non-blocking REVIEW) — create the scan
    # session, upload evidence, kick off the async pipeline.
    scan_session = ScanSession(
        created_by=current_user.id,
        category=meta.get("category"),
        region=meta.get("region"),
        stages=initial_stages(
            quality_summary="; ".join(
                f"{angle}: {q.overall_verdict.value}" for angle, q in quality_by_angle.items()
            )
        ),
        status="pending",
    )
    db.add(scan_session)
    db.flush()  # assigns scan_session.id without committing yet

    s3_client = get_s3_client(settings)
    uploaded_keys: list[str] = []
    try:
        for angle, image_bytes in image_bytes_by_angle.items():
            quality = quality_by_angle[angle]
            ext = _extension_for(uploads[angle])
            storage_key = f"evidence/{scan_session.id}/{angle}-{quality.content_hash[:12]}.{ext}"
            s3_client.put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=image_bytes)
            uploaded_keys.append(storage_key)

            db.add(
                EvidenceImage(
                    scan_session_id=scan_session.id,
                    angle=angle,
                    storage_key=storage_key,
                    content_hash=quality.content_hash,
                    quality_result=quality.model_dump(),
                )
            )
    except (BotoCoreError, ClientError) as exc:
        # Partial upload: some images already landed in B2 before this one
        # failed. Best-effort delete what we already put there (an orphan
        # here is a wasted object, not incorrect data, so a failure to
        # delete is logged-and-ignored, not re-raised) and explicitly roll
        # back the DB transaction so no half-created ScanSession/
        # EvidenceImage rows survive — the flushed-but-uncommitted
        # scan_session row from above is discarded too.
        for key in uploaded_keys:
            try:
                s3_client.delete_object(Bucket=settings.s3_bucket, Key=key)
            except (BotoCoreError, ClientError):
                pass
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Evidence storage is temporarily unavailable. Please retry the scan.",
        ) from exc

    db.commit()

    background_tasks.add_task(run_pipeline, scan_session.id)

    return {
        "id": str(scan_session.id),
        "recordId": str(derive_record_id(scan_session.id)),
        "status": "Processing",
        "createdAt": scan_session.created_at.isoformat()
        if scan_session.created_at
        else datetime.now(timezone.utc).isoformat(),
    }


@router.get("/scans/{scan_id}/pipeline")
def get_pipeline(
    scan_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    _current_user: Profile = Depends(get_current_user),
) -> dict:
    """A pure DB read — the persisted `stages` column, nothing else. Any
    authenticated user may poll (matches the existing mock's own
    "reachable by anyone signed in who knows a scan id" behavior); it does
    not require scan.create specifically."""
    scan_session = db.get(ScanSession, scan_id)
    if scan_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline run not found")

    record_id = scan_session.record_id or derive_record_id(scan_session.id)
    return {
        "scanId": str(scan_session.id),
        "recordId": str(record_id),
        "stages": scan_session.stages,
    }


@router.post("/scans/{scan_id}/pipeline/{stage_id}/retry")
def retry_pipeline_stage(
    scan_id: uuid.UUID,
    stage_id: str,
    background_tasks: BackgroundTasks,
    db: DbSession = Depends(get_db),
    _current_user: Profile = Depends(require_permission("scan.create")),
) -> dict:
    """Resets the failed stage and returns immediately — the actual
    re-run happens in a BackgroundTask (see jobs/pipeline.py's
    retry_stage() docstring for why this changed in Phase 3). The response
    below reflects the just-persisted `pending` state, not eventual
    completion; GET /scans/{id}/pipeline is the source of truth for
    progress from here."""
    scan_session = db.get(ScanSession, scan_id)
    if scan_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline run not found")

    ok = retry_stage(scan_id, stage_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That stage is not currently failed, or does not exist",
        )

    background_tasks.add_task(run_pipeline, scan_id)

    db.refresh(scan_session)
    record_id = scan_session.record_id or derive_record_id(scan_session.id)
    return {
        "scanId": str(scan_session.id),
        "recordId": str(record_id),
        "stages": scan_session.stages,
    }


class CalibrationPoint(BaseModel):
    x: float
    y: float


class CalibrationRequest(BaseModel):
    # The frontend only ever knows WHICH CAPTURED ANGLE it displayed
    # (front/back/side_pdp) — it has no reason to know the backend's
    # internal EvidenceImage id. The real image id used for measurement is
    # derived server-side from the field's own OCR evidence
    # (evidence[0].image_id), never trusted from the client; `angle` is
    # only a sanity check that the officer calibrated against the same
    # image the field's evidence actually came from.
    angle: str
    field_id: str
    known_dimension_mm: float
    start_point: CalibrationPoint
    end_point: CalibrationPoint
    is_embossed: bool = False


@router.post("/scans/{scan_id}/calibration")
def submit_calibration(
    scan_id: uuid.UUID,
    body: CalibrationRequest,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: Profile = Depends(require_permission("verification.confirm")),
) -> dict:
    """Phase 6 — Rule 7 manual two-point calibration. Establishes SCALE
    ONLY (see measurement/font_height.py's module docstring on why this is
    never perspective correction). Refused outright once the record is
    Verified — same immutability convention as corrections/resolutions. A
    new calibration for `field_id` supersedes (never overwrites/deletes)
    any prior one, preserving full provenance in evidence_bundle."""
    scan_session = db.get(ScanSession, scan_id)
    if scan_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")

    record = db.query(ComplianceRecord).filter(ComplianceRecord.scan_session_id == scan_id).first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No compliance record for this scan yet")
    if record.verification_status == "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record is Verified — calibration/remeasurement is refused",
        )
    if body.field_id not in _CALIBRATION_FIELD_TO_ATTR:
        raise HTTPException(status_code=422, detail=f"Unsupported fieldId for calibration: {body.field_id}")
    if record.evidence_bundle is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No evidence bundle available yet")

    pixel_length = math.hypot(
        body.end_point.x - body.start_point.x, body.end_point.y - body.start_point.y
    )
    if pixel_length <= 0 or body.known_dimension_mm <= 0:
        raise HTTPException(status_code=422, detail="Calibration points and known dimension must be positive")

    bundle = ComplianceEvidenceBundle.model_validate(record.evidence_bundle)
    internal_attr = _CALIBRATION_FIELD_TO_ATTR[body.field_id]
    field = getattr(bundle.structured_extraction, internal_attr)
    if field is None or not field.evidence:
        raise HTTPException(
            status_code=409, detail="No OCR evidence exists for this field yet — nothing to measure against"
        )
    evidence_ref = field.evidence[0]
    if evidence_ref.image_angle != body.angle:
        raise HTTPException(
            status_code=422,
            detail=f"This declaration's evidence came from the '{evidence_ref.image_angle}' image — "
                   f"calibrate against that image, not '{body.angle}'",
        )

    # Append-only provenance: mark any prior calibration for this field
    # superseded rather than overwriting/removing it (mirrors
    # ProductInspectionLink's ACTIVE/SUPERSEDED convention).
    for existing in bundle.calibrations:
        if existing.field_id == body.field_id and not existing.superseded:
            existing.superseded = True

    calibration = CalibrationData(
        field_id=body.field_id,
        image_id=evidence_ref.image_id,
        known_dimension_mm=body.known_dimension_mm,
        start_point=Point(x=body.start_point.x, y=body.start_point.y),
        end_point=Point(x=body.end_point.x, y=body.end_point.y),
        pixel_length=pixel_length,
        pixels_per_mm=pixel_length / body.known_dimension_mm,
        is_embossed=body.is_embossed,
        calibrated_by=str(current_user.id),
        calibrated_at=datetime.now(timezone.utc).isoformat(),
    )
    bundle.calibrations.append(calibration)

    measurement = measure_font_height(calibration, evidence_ref, db, settings)

    result = reapply_rules(record, bundle, font_measurement=measurement, is_embossed=body.is_embossed)
    record.evidence_bundle = bundle.model_dump()
    record.extraction = result["extraction_result"]
    record.checklist = result["checklist"]
    record.violations = result["violations"]
    record.compliance_status = result["legal_status"]
    record.compliance_score = result["score_result"]["value"]
    record.compliance_band = result["score_result"]["band"]
    db.commit()
    db.refresh(record)

    return to_frontend_record(record, db)
