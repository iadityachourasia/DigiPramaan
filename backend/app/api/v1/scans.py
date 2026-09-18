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
from app.db.models import AuditEvent, ComplianceRecord, EvidenceImage, Profile, ScanSession
from app.db.session import get_db
from app.jobs.pipeline import initial_stages, mark_capture_stages_completed, retry_stage, run_pipeline
from app.services.extraction.schema import CalibrationData, ComplianceEvidenceBundle, Point
from app.services.image_quality import (
    QualityResult,
    QualityVerdict,
    evaluate_image_quality,
    find_duplicate_angles,
)
from app.services.authz.repositories import get_visible_scan_session
from app.services.measurement.font_height import measure_font_height
from app.services.mobile_handoff import (
    create_pending_scan_session,
    get_owned_scan_session,
    is_scan_session_record_verified,
)
from app.services.rules.apply import reapply_rules
from app.services.records.serialize import to_frontend_record
from app.services.scans import AcceptanceState, accept_evidence_image
from app.services.scope import apply_officer_scope

# fieldId (frontend/checklist convention) -> the StructuredExtraction
# attribute Rule 7 measurement applies to. Only MRP and net quantity carry a
# statutory height requirement (matches src/types/scan.ts's FontSizeCheck,
# which is scoped to the same two fields).
_CALIBRATION_FIELD_TO_ATTR = {"retailSalePrice": "mrp", "netQuantity": "net_quantity"}

router = APIRouter(tags=["scans"])

# All three are valid capture angles, but only front/back are mandatory —
# many products carry no printed declarations on a side panel at all, so
# an officer may skip side_pdp entirely. VALID_ANGLES is used to validate
# "is this a real angle" (e.g. the quality-check endpoint); MANDATORY_ANGLES
# gates "has the officer captured everything required" (e.g. finalize/
# create_scan's completeness checks).
VALID_ANGLES = ("front", "back", "side_pdp")
MANDATORY_ANGLES = ("front", "back")


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
    never by `angle` as a dict key: a physically captured scan has 2 or 3
    distinct angles (front/back always, side_pdp only when the officer
    captured one), but an e-commerce listing's images share "front"/
    "additional" labels (see the frontend's own `toPipelineImages`), so
    `angle` is NOT a safe dict key here.
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


# Maps this service's real checks onto the frontend's fixed 4-value
# vocabulary (blur/distortion/curvature/no_text_detected — src/types/scan.ts).
# distortion/curvature have no backing check yet (explicitly out of MVP
# scope per image_quality.py's own docstring) and can never be returned
# here. "blur" is the only exact semantic match, so it wins whenever it's
# among the failing checks (even alongside e.g. a resolution failure) since
# it's the most actionable reason available; every other real failure
# (darkness, overexposure, minimum_resolution, decodable) defaults to
# no_text_detected, the closest honest description of "this photo can't be
# relied on to contain legible text."
def _frontend_failure_reason(quality: QualityResult) -> str:
    failing_checks = {c.name for c in quality.checks if c.verdict != QualityVerdict.PASS}
    if "blur" in failing_checks:
        return "blur"
    return "no_text_detected"


@router.post("/scans/quality-check")
async def check_scan_image_quality(
    angle: str = Form(...),
    file: UploadFile = File(...),
    _current_user: Profile = Depends(require_permission("scan.create")),
) -> dict:
    """Per-photo pre-check for the Device/Camera capture wizard (03 §2) —
    gives an early Retake verdict before the officer reaches final
    submission, where `create_scan_session_from_images` runs the exact same
    `evaluate_image_quality()` again as the authoritative gate. Never
    persists anything: a rejected photo here leaves no trace, matching that
    same "a failed attempt leaves no trace" rule mobile-handoff's own
    per-image endpoint already follows.
    """
    if angle not in VALID_ANGLES:
        raise HTTPException(status_code=422, detail=f"angle must be one of {VALID_ANGLES}")

    image_bytes = await file.read()
    quality = evaluate_image_quality(image_bytes)

    if quality.overall_verdict == QualityVerdict.RECAPTURE_REQUIRED:
        return {"passed": False, "failureReason": _frontend_failure_reason(quality)}

    return {"passed": True}


@router.post("/scans", status_code=status.HTTP_201_CREATED)
async def create_scan(
    background_tasks: BackgroundTasks,
    metadata: str = Form(...),
    front: UploadFile = File(...),
    back: UploadFile = File(...),
    # Optional: many products carry no printed declarations on a side panel
    # at all, so an officer may skip it entirely — front/back are the only
    # mandatory angles (MANDATORY_ANGLES above).
    side_pdp: UploadFile | None = File(None),
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
        if upload is None:
            continue
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


# --------------------------------------------------------------------- #
# OP-Phase 1 — upload-once intake for device/camera capture.
#
# Generalizes the exact scan-draft/per-image-upload/idempotent-finalize
# pattern Mobile QR Handoff already established (services/mobile_handoff/,
# services/scans/intake.py) to desktop, closing the prior "double upload"
# gap: the wizard used to quality-check a photo (POST /scans/quality-check,
# below — kept for now, feature-flagged out client-side once the frontend
# switches over) and then re-upload the SAME bytes a second time inside
# POST /scans's all-at-once multipart body. `POST /scans` itself is
# UNCHANGED and kept working — e-commerce's `create_scan_session_from_images`
# still calls it directly, out of this phase's scope.
# --------------------------------------------------------------------- #


@router.post("/scans/draft", status_code=status.HTTP_201_CREATED)
def create_scan_draft(
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
) -> dict:
    """Desktop's counterpart to Mobile QR Handoff's implicit
    draft-creation-on-QR-generation — a bare pending `ScanSession`
    (no category/region yet; the wizard's Details step fills those in at
    finalize, same step order mobile already follows)."""
    scan_session = create_pending_scan_session(db, created_by=current_user.id)
    db.commit()
    return {"scanId": str(scan_session.id)}


@router.post("/scans/{scan_id}/images/{angle}")
async def upload_capture_image(
    scan_id: uuid.UUID,
    angle: str,
    file: UploadFile,
    override_reason: str | None = Form(default=None),
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """One network upload per accepted image — the authoritative quality
    decision happens HERE, once, via the same `accept_evidence_image()`
    Mobile QR Handoff's phone-side upload uses. `override_reason` lets an
    officer accept a `RECAPTURE_REQUIRED` photo anyway (e.g. a genuinely
    low-quality but otherwise unobtainable label), persisted and audited,
    never silently — see services/scans/intake.py's own docstring."""
    if angle not in VALID_ANGLES:
        raise HTTPException(status_code=422, detail=f"angle must be one of {VALID_ANGLES}")

    scan_session = get_owned_scan_session(scan_id, current_user, db)
    if is_scan_session_record_verified(db, scan_session.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This record has already been verified and cannot accept new evidence.",
        )

    image_bytes = await file.read()
    acceptance = accept_evidence_image(
        db, settings,
        scan_session_id=scan_session.id, angle=angle,
        file_bytes=image_bytes, content_type=file.content_type or "",
        actor_id=current_user.id, override_reason=override_reason,
    )
    db.commit()

    if acceptance.acceptance_state == AcceptanceState.RECAPTURE_REQUIRED:
        return {
            "acceptanceState": acceptance.acceptance_state.value,
            "failureReason": _frontend_failure_reason(acceptance.quality),
            "checks": [c.model_dump() for c in acceptance.quality.checks],
        }
    return {
        "acceptanceState": acceptance.acceptance_state.value,
        "failureReason": None,
        "checks": [c.model_dump() for c in acceptance.quality.checks],
    }


class FinalizeDraftRequest(BaseModel):
    category: str
    region: str


@router.post("/scans/{scan_id}/finalize", status_code=status.HTTP_201_CREATED)
def finalize_scan_draft(
    scan_id: uuid.UUID,
    payload: FinalizeDraftRequest,
    background_tasks: BackgroundTasks,
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
) -> dict:
    """The officer's own explicit submit click, once Details are filled in
    — mirrors `finalize_mobile_handoff` exactly (including its idempotency
    fix: a second call returns the same result rather than scheduling a
    second concurrent `run_pipeline`), generalized off the token-specific
    handoff object onto a plain owned `ScanSession`."""
    scan_session = get_owned_scan_session(scan_id, current_user, db)
    if is_scan_session_record_verified(db, scan_session.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This record has already been verified and cannot accept new evidence.",
        )

    already_finalized = any(
        s["id"] == "uploading" and s["state"] == "completed" for s in scan_session.stages
    )
    if already_finalized:
        return {
            "id": str(scan_session.id),
            "recordId": str(scan_session.record_id) if scan_session.record_id else None,
            "status": "Processing",
            "createdAt": scan_session.created_at.isoformat()
            if scan_session.created_at
            else datetime.now(timezone.utc).isoformat(),
        }

    images = (
        db.query(EvidenceImage)
        .filter(EvidenceImage.scan_session_id == scan_session.id)
        .filter(EvidenceImage.angle.in_(VALID_ANGLES))
        .all()
    )
    present_angles = {image.angle for image in images}
    missing = [angle for angle in MANDATORY_ANGLES if angle not in present_angles]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Not all required images have been captured yet.", "missingAngles": missing},
        )

    scan_session.category = payload.category
    scan_session.region = payload.region
    quality_summary = "; ".join(
        f"{image.angle}: {(image.quality_result or {}).get('overall_verdict', 'PASS')}"
        for image in images
    )
    scan_session.stages = mark_capture_stages_completed(scan_session.stages, quality_summary)
    db.add(
        AuditEvent(
            actor_id=current_user.id,
            event_type="scan_created",
            entity_type="ScanSession",
            entity_id=scan_session.id,
            detail={},
        )
    )
    db.commit()

    background_tasks.add_task(run_pipeline, scan_session.id)

    return {
        "id": str(scan_session.id),
        "recordId": str(scan_session.record_id) if scan_session.record_id else None,
        "status": "Processing",
        "createdAt": scan_session.created_at.isoformat()
        if scan_session.created_at
        else datetime.now(timezone.utc).isoformat(),
    }


@router.get("/scans/{scan_id}/pipeline")
def get_pipeline(
    scan_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    """A pure DB read — the persisted `stages` column, nothing else. Any
    authenticated user whose scope covers this scan may poll (see
    services/authz/repositories.py::get_visible_scan_session for exactly
    who that is) — it does not require scan.create specifically."""
    scan_session = get_visible_scan_session(db, scan_id, current_user)

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
    current_user: Profile = Depends(require_permission("scan.create")),
) -> dict:
    """Resets the failed stage and returns immediately — the actual
    re-run happens in a BackgroundTask (see jobs/pipeline.py's
    retry_stage() docstring for why this changed in Phase 3). The response
    below reflects the just-persisted `pending` state, not eventual
    completion; GET /scans/{id}/pipeline is the source of truth for
    progress from here."""
    scan_session = get_visible_scan_session(db, scan_id, current_user)

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
    scan_session = get_visible_scan_session(db, scan_id, current_user)

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
