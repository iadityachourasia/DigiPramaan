"""
api/v1/mobile_handoff.py — the real Mobile QR Handoff backend (Phase 10),
replacing the prior same-server in-memory mock
(src/lib/server/mobile-session-store.ts on the frontend).

Two very different trust levels share this file:
  - Officer-side routes (`/scans/mobile-handoff`, `/scans/{id}/mobile-handoff/*`)
    require a real, Supabase-JWT-authenticated `Profile`
    (`require_permission("scan.create")`), and are scope-checked so an
    officer can only manage a handoff for a scan session THEY created.
  - Phone-side routes (`/mobile-handoff/{token}*`) require only the raw
    handoff token (`get_active_handoff`, api/deps/mobile_handoff.py) —
    no `Profile`, no role, no access to anything beyond the image slots
    of the one scan session the token was minted for.

`create_pending_scan_session`/`build_angle_status`/
`is_scan_session_record_verified` (services/mobile_handoff/) hold the
non-token business logic; this file wires them to routes, B2 upload
(reusing `get_s3_client`, the exact storage-key convention
`create_scan_session_from_images` already uses), and the real quality
gate (`evaluate_image_quality` — no separate "mobile quality" path).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session as DbSession

from app.api.deps.mobile_handoff import get_active_handoff
from app.api.deps.permissions import require_permission
from app.core.config import Settings, get_settings
from app.db.models import AuditEvent, EvidenceImage, MobileUploadSession, Profile, ScanSession
from app.db.session import get_db
from app.jobs.pipeline import mark_capture_stages_completed, run_pipeline
from app.services.scans import AcceptanceState, accept_evidence_image
from app.services.mobile_handoff import (
    ALL_ANGLES,
    MANDATORY_ANGLES,
    build_angle_status,
    create_pending_scan_session,
    generate_token,
    get_owned_scan_session,
    hash_token,
    is_scan_session_record_verified,
)

router = APIRouter(tags=["mobile-handoff"])


class FinalizeRequest(BaseModel):
    category: str
    region: str
    manufacturer_name: str | None = Field(default=None, alias="manufacturerName")

    model_config = ConfigDict(populate_by_name=True)


class CreateHandoffRequest(BaseModel):
    """`scan_id` is omitted on the wizard's first "Upload from Mobile"
    click (a brand new pending scan is created) and supplied on
    "Regenerate QR" (the desktop panel's own explicit action) — the
    officer may already have real EvidenceImage rows captured under that
    scan session, which a fresh scan_session would orphan."""

    scan_id: uuid.UUID | None = Field(default=None, alias="scanId")

    model_config = ConfigDict(populate_by_name=True)


# --------------------------------------------------------------------- #
# Officer-side (real Profile auth)
# --------------------------------------------------------------------- #


@router.post("/scans/mobile-handoff", status_code=status.HTTP_201_CREATED)
def create_mobile_handoff(
    payload: CreateHandoffRequest = CreateHandoffRequest(),
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Creates a bare pending ScanSession (no category/region yet — the
    Scan Capture Wizard's own step order fills those in later, at
    `finalize`) and its MobileUploadSession together — UNLESS
    `payload.scan_id` names an existing, owned, not-yet-verified scan
    (the "Regenerate QR" case), in which case only a fresh
    MobileUploadSession is created for it, revoking any prior ACTIVE one
    first, so already-captured images are never orphaned. Returns the
    raw token exactly once, inside `mobileUrl` — never `token_hash`."""
    if payload.scan_id is not None:
        scan_session = get_owned_scan_session(payload.scan_id, current_user, db)
        if is_scan_session_record_verified(db, scan_session.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This record has already been verified and cannot accept new evidence.",
            )
        prior_active = (
            db.query(MobileUploadSession)
            .filter(MobileUploadSession.scan_session_id == scan_session.id)
            .filter(MobileUploadSession.status == "ACTIVE")
            .first()
        )
        if prior_active is not None:
            prior_active.status = "REVOKED"
            prior_active.revoked_at = datetime.now(timezone.utc)
    else:
        scan_session = create_pending_scan_session(db, created_by=current_user.id)

    raw_token = generate_token()
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.mobile_handoff_expiry_minutes
    )
    handoff = MobileUploadSession(
        scan_session_id=scan_session.id,
        token_hash=hash_token(raw_token),
        status="ACTIVE",
        expires_at=expires_at,
        created_by=current_user.id,
    )
    db.add(handoff)
    db.flush()

    db.add(
        AuditEvent(
            actor_id=current_user.id,
            event_type="mobile_handoff_created",
            entity_type="ScanSession",
            entity_id=scan_session.id,
            detail={"handoffId": str(handoff.id)},
        )
    )
    db.commit()

    return {
        "handoffId": str(handoff.id),
        "scanId": str(scan_session.id),
        # Matches the existing frontend route exactly (ROUTES.scanMobile,
        # src/lib/constants/routes.ts) — the already-built `(capture)/
        # scan/mobile/[token]/page.tsx` page, not a new path.
        "mobileUrl": f"{settings.frontend_base_url}/scan/mobile/{raw_token}",
        "expiresAt": handoff.expires_at.isoformat(),
        "status": handoff.status,
    }


@router.get("/scans/{scan_id}/mobile-handoff/status")
def get_mobile_handoff_status(
    scan_id: uuid.UUID,
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
) -> dict:
    scan_session = get_owned_scan_session(scan_id, current_user, db)
    handoff = (
        db.query(MobileUploadSession)
        .filter(MobileUploadSession.scan_session_id == scan_session.id)
        .order_by(MobileUploadSession.created_at.desc())
        .first()
    )
    if handoff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No handoff for this scan")

    return {
        "handoffId": str(handoff.id),
        "status": handoff.status,
        "expiresAt": handoff.expires_at.isoformat(),
        "angles": build_angle_status(db, scan_session.id),
    }


@router.post("/scans/{scan_id}/mobile-handoff/revoke")
def revoke_mobile_handoff(
    scan_id: uuid.UUID,
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
) -> dict:
    scan_session = get_owned_scan_session(scan_id, current_user, db)
    handoff = (
        db.query(MobileUploadSession)
        .filter(MobileUploadSession.scan_session_id == scan_session.id)
        .filter(MobileUploadSession.status == "ACTIVE")
        .first()
    )
    if handoff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active handoff for this scan")

    handoff.status = "REVOKED"
    handoff.revoked_at = datetime.now(timezone.utc)
    db.add(
        AuditEvent(
            actor_id=current_user.id,
            event_type="mobile_handoff_revoked",
            entity_type="ScanSession",
            entity_id=scan_session.id,
            detail={"handoffId": str(handoff.id)},
        )
    )
    db.commit()
    return {"status": handoff.status}


@router.post("/scans/{scan_id}/mobile-handoff/finalize", status_code=status.HTTP_201_CREATED)
def finalize_mobile_handoff(
    scan_id: uuid.UUID,
    payload: FinalizeRequest,
    background_tasks: BackgroundTasks,
    current_user: Profile = Depends(require_permission("scan.create")),
    db: DbSession = Depends(get_db),
) -> dict:
    """The officer's own explicit "Continue" click, once the Details step
    is filled in — the mobile-handoff counterpart to
    `create_scan_session_from_images()`'s tail: mark uploading/
    qualityCheck completed, schedule run_pipeline. Never auto-triggered
    the instant front+back land (matches device/camera mode, which also
    always waits for an explicit officer submit). Only front/back are
    mandatory; side_pdp is optional and included if present."""
    scan_session = get_owned_scan_session(scan_id, current_user, db)

    if is_scan_session_record_verified(db, scan_session.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This record has already been verified and cannot accept new evidence.",
        )

    # OP-Phase 1 idempotency fix: a second finalize call for an
    # already-finalized draft (double-click, retried request) must return
    # the same result, never schedule a second concurrent run_pipeline —
    # `stages` (not `status`, which run_pipeline never transitions) is the
    # one persisted signal finalize already ran once.
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
        .filter(EvidenceImage.angle.in_(ALL_ANGLES))
        .all()
    )
    present_angles = {image.angle for image in images}
    # Only front/back gate completion — side_pdp is optional (many products
    # carry no printed declarations on a side panel at all), but any
    # side_pdp image the officer DID capture still gets included above so
    # it flows into quality_summary and the pipeline like any other angle.
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
            event_type="mobile_handoff_finalized",
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


# --------------------------------------------------------------------- #
# Phone-side (raw token auth only — see api/deps/mobile_handoff.py)
# --------------------------------------------------------------------- #


@router.get("/mobile-handoff/{token}")
def get_handoff_for_token(
    handoff: MobileUploadSession = Depends(get_active_handoff),
    db: DbSession = Depends(get_db),
) -> dict:
    """Minimal, non-identifying status — never officer identity,
    category, region, or anything beyond what the phone UI needs.
    `expiresAt` is included since the desktop panel's own countdown
    reads it from this same call (see scans.ts's pollMobileSession)."""
    return {
        "scanSessionId": str(handoff.scan_session_id),
        "status": handoff.status,
        "expiresAt": handoff.expires_at.isoformat(),
        "angles": build_angle_status(db, handoff.scan_session_id),
    }


@router.post("/mobile-handoff/{token}/images/{angle}")
async def upload_mobile_image(
    angle: str,
    file: UploadFile,
    handoff: MobileUploadSession = Depends(get_active_handoff),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    if angle not in ALL_ANGLES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported angle")

    if is_scan_session_record_verified(db, handoff.scan_session_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This record has already been verified and cannot accept new evidence.",
        )

    image_bytes = await file.read()
    acceptance = accept_evidence_image(
        db, settings,
        scan_session_id=handoff.scan_session_id, angle=angle,
        file_bytes=image_bytes, content_type=file.content_type or "",
        actor_id=None,  # phone side has no Profile to attribute to
        event_type_uploaded="mobile_image_uploaded",
        event_type_replaced="mobile_image_replaced",
    )
    if acceptance.acceptance_state == AcceptanceState.RECAPTURE_REQUIRED:
        # Not persisted — a rejected image leaves no EvidenceImage row,
        # matching device/camera mode's own "a failed attempt leaves no
        # trace" rule. The phone shows Retake locally from this response.
        return {
            "passed": False,
            "failureReason": acceptance.quality.reason,
            "checks": [c.model_dump() for c in acceptance.quality.checks],
        }

    # accept_evidence_image() already queued the mobile_image_uploaded/
    # _replaced AuditEvent (via the event_type_* overrides above) — only
    # the handoff-specific bookkeeping happens here.
    handoff.last_activity_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "passed": True,
        "failureReason": None,
        "checks": [c.model_dump() for c in acceptance.quality.checks],
    }


@router.post("/mobile-handoff/{token}/complete")
def complete_mobile_handoff(
    handoff: MobileUploadSession = Depends(get_active_handoff),
    db: DbSession = Depends(get_db),
) -> dict:
    """Phone-side "I'm done" — tells the phone it can show its own
    completion screen. Never starts the pipeline itself; that's the
    officer's own explicit "Continue" click (`finalize`, above)."""
    angles = build_angle_status(db, handoff.scan_session_id)
    missing = [angle for angle in MANDATORY_ANGLES if angles.get(angle) != "received"]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Not all required images have been captured yet.", "missingAngles": missing},
        )

    handoff.status = "COMPLETED"
    handoff.completed_at = datetime.now(timezone.utc)
    db.add(
        AuditEvent(
            actor_id=None,
            event_type="mobile_handoff_completed",
            entity_type="ScanSession",
            entity_id=handoff.scan_session_id,
            detail={"handoffId": str(handoff.id)},
        )
    )
    db.commit()
    return {"status": handoff.status}
