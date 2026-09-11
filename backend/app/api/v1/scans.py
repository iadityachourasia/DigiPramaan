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
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session as DbSession

from pydantic import BaseModel

from app.api.deps.auth import get_current_user, get_current_user_from_bearer_or_query
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
from app.services.scope import apply_officer_scope

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


def create_scan_session_from_images(
    *,
    db: DbSession,
    settings: Settings,
    background_tasks: BackgroundTasks,
    created_by: uuid.UUID,
    category: str | None,
    region: str | None,
    source: str,
    images: list[tuple[str, str, bytes]],
    ecommerce_listing_url: str | None = None,
    batch_id: uuid.UUID | None = None,
) -> dict:
    """The one place a scan session is actually created — quality-check
    every image, upload to B2, persist `ScanSession`/`EvidenceImage` rows,
    schedule `run_pipeline`. `POST /scans` (real camera capture) and the
    E-commerce Listing Scanner's routes both call this, rather than each
    reimplementing it — the same "one function, one call site" discipline
    `resolve_product()` established for identity resolution (Phase 8).

    `images` is `(angle, filename, bytes)` — keyed by POSITION internally,
    never by `angle` as a dict key: a physically captured scan has exactly
    3 distinct angles (front/back/side_pdp), but an e-commerce listing's
    images share "front"/"additional" labels (see the frontend's own
    `toPipelineImages`), so `angle` is NOT a safe dict key here.
    """
    image_bytes_list = [b for _angle, _filename, b in images]
    qualities = [evaluate_image_quality(b) for b in image_bytes_list]
    hashes_by_position = {str(i): q.content_hash for i, q in enumerate(qualities)}
    duplicate_positions = find_duplicate_angles(hashes_by_position)

    rejected = [
        (images[i][0], q) for i, q in enumerate(qualities) if q.overall_verdict == QualityVerdict.RECAPTURE_REQUIRED
    ]
    if rejected or duplicate_positions:
        # Keyed by angle, matching this response's existing contract (a
        # physically captured scan has 3 distinct angle names) — a position
        # index would break that for POST /scans's real callers. Two
        # e-commerce images sharing one angle label (e.g. "additional")
        # both failing quality is a rare, acceptable edge case where only
        # the last one's detail survives here — the request is rejected
        # either way, which is the part that actually matters.
        rejected_detail: dict[str, dict] = {}
        for angle, q in rejected:
            rejected_detail[angle] = {"reason": q.reason, "checks": [c.model_dump() for c in q.checks]}
        detail = {
            "error": "One or more images failed the quality check.",
            "rejected": rejected_detail,
            "duplicateAngles": [images[int(p)][0] for p in duplicate_positions],
        }
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    # All images passed (PASS or non-blocking REVIEW) — create the scan
    # session, upload evidence, kick off the async pipeline.
    scan_session = ScanSession(
        created_by=created_by,
        category=category,
        region=region,
        source=source,
        ecommerce_listing_url=ecommerce_listing_url,
        batch_id=batch_id,
        stages=initial_stages(
            quality_summary="; ".join(
                f"{angle}: {q.overall_verdict.value}"
                for (angle, _filename, _bytes), q in zip(images, qualities)
            )
        ),
        status="pending",
    )
    db.add(scan_session)
    db.flush()  # assigns scan_session.id without committing yet

    s3_client = get_s3_client(settings)
    uploaded_keys: list[str] = []
    try:
        for (angle, filename, image_bytes), quality in zip(images, qualities):
            ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
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

    uploads = [("front", front), ("back", back), ("side_pdp", side_pdp)]
    images: list[tuple[str, str, bytes]] = []
    for angle, upload in uploads:
        image_bytes = await upload.read()
        filename = upload.filename or f"{angle}.{_extension_for(upload)}"
        images.append((angle, filename, image_bytes))

    return create_scan_session_from_images(
        db=db,
        settings=settings,
        background_tasks=background_tasks,
        created_by=current_user.id,
        category=meta.get("category"),
        region=meta.get("region"),
        source="Officer-Scanned",
        images=images,
    )


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


_CONTENT_TYPE_BY_EXTENSION = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp",
}


@router.get("/evidence-images/{image_id}")
def get_evidence_image(
    image_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: Profile = Depends(get_current_user_from_bearer_or_query),
) -> Response:
    """Phase 7 — streams a real evidence photograph's bytes. Never a
    permanent public B2 object: auth is the same Bearer-or-query-token
    dependency Phase 5's report download uses (an `<img src>` can't set an
    Authorization header either), AND every request is scope-checked
    against the record that owns this image — closing a real gap, since no
    image-serving endpoint existed before this phase to even consider.
    404 (not 403) when the image doesn't belong to a record this officer
    can see, so a probe can't distinguish "wrong scope" from "no such
    image." No bytes are re-uploaded or duplicated — reads the same
    storage_key POST /scans already wrote."""
    image = db.get(EvidenceImage, image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence image not found")

    owning_record = (
        apply_officer_scope(
            db.query(ComplianceRecord).filter(ComplianceRecord.scan_session_id == image.scan_session_id),
            current_user,
        )
        .first()
    )
    if owning_record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence image not found")

    s3_client = get_s3_client(settings)
    obj = s3_client.get_object(Bucket=settings.s3_bucket, Key=image.storage_key)
    body = obj["Body"].read()

    extension = image.storage_key.rsplit(".", 1)[-1].lower() if "." in image.storage_key else ""
    content_type = _CONTENT_TYPE_BY_EXTENSION.get(extension, "application/octet-stream")

    return Response(
        content=body, media_type=content_type,
        headers={"Cache-Control": "private, max-age=60"},
    )
