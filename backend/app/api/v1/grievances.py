"""
api/v1/grievances.py — Citizen Grievance Portal mock-to-real port
(2026-09-20). The ONE public, unauthenticated, no-account surface in this
product — `POST /grievances` and `GET /grievances/{reference}` require no
Bearer token at all, matching page 11's own "no account, no
form-filling" requirement.

Quality is advisory-only here, never a gate (unlike the officer capture
flow's `accept_evidence_image` — a citizen's only photo must never be
rejected outright; a poor one is still evidence). Rate-limited via the
SAME `auth_rate_limit_hits` table P2's login limiter uses
(`app/services/auth/rate_limit.py::check_and_increment`), a
`"grievance:ip:<ip>"` bucket instead of `"login:..."` — no new table.
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.body_size import read_capped_sync
from app.core.client_ip import resolve_client_ip
from app.core.config import Settings, get_settings
from app.core.object_storage import get_s3_client
from app.db.models import AuditEvent, ComplianceRecord, EvidenceImage, Grievance, RecordReviewFlag, ScanSession
from app.db.session import get_db
from app.jobs.pipeline import initial_stages, run_pipeline
from app.services.audit import emit
from app.services.auth.rate_limit import check_and_increment
from app.services.image_quality import QualityVerdict, evaluate_image_quality

router = APIRouter(tags=["grievances"])

# Matches src/lib/utils/shortCode.ts's SHORT_CODE_ALPHABET exactly — no
# 0/O or 1/I/L, so a reference never misreads when spoken, handwritten, or
# read off a phone screen in a shop.
_SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_REFERENCE_LENGTH = 6
_CONTENT_TYPE_ALLOWLIST = {"image/jpeg", "image/png", "image/webp"}

_RATE_LIMIT_WINDOW_SECONDS = 3600
_RATE_LIMIT_MAX_ATTEMPTS = 5


def _generate_reference() -> str:
    body = "".join(secrets.choice(_SHORT_CODE_ALPHABET) for _ in range(_REFERENCE_LENGTH))
    return f"LM-{body}"


def _rate_limit_or_raise(request: Request, settings: Settings) -> None:
    client_ip = resolve_client_ip(request, settings)
    if not check_and_increment(
        f"grievance:ip:{client_ip}",
        window_seconds=_RATE_LIMIT_WINDOW_SECONDS,
        max_hits=_RATE_LIMIT_MAX_ATTEMPTS,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many submissions. Try again later.",
            headers={"Retry-After": str(_RATE_LIMIT_WINDOW_SECONDS)},
        )


@router.post("/grievances", status_code=status.HTTP_201_CREATED)
def submit_grievance(
    request: Request,
    background_tasks: BackgroundTasks,
    photo: UploadFile = File(...),
    concerns: str = Form(...),  # JSON-encoded list[str] — kept a single form field, not repeated keys
    concern_note: str | None = Form(default=None),
    shop_name_or_location: str | None = Form(default=None),
    submitter_name: str | None = Form(default=None),
    submitter_contact: str | None = Form(default=None),
    website: str | None = Form(default=None),  # honeypot — must always be empty from a real person
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    if website:
        # A real person never sees or fills this field. Report success
        # without doing anything — never tip off a bot that it was caught.
        return {"reference": _generate_reference(), "submittedAt": datetime.now(timezone.utc).isoformat()}

    _rate_limit_or_raise(request, settings)

    if photo.content_type not in _CONTENT_TYPE_ALLOWLIST:
        raise HTTPException(status_code=422, detail="Unsupported image type")
    image_bytes = read_capped_sync(photo, settings.scan_image_max_bytes)

    try:
        concern_list = json.loads(concerns)
        if not isinstance(concern_list, list) or not all(isinstance(c, str) for c in concern_list):
            raise ValueError
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="concerns must be a JSON array of strings") from exc

    quality = evaluate_image_quality(image_bytes)

    scan_session = ScanSession(
        created_by=None,
        category="Other",
        region="Not specified",
        source="Citizen-Reported",
        stages=initial_stages(quality_summary=f"front: {quality.overall_verdict.value}"),
        status="pending",
    )
    db.add(scan_session)
    db.flush()

    ext = "jpg" if photo.content_type == "image/jpeg" else photo.content_type.split("/")[-1]
    storage_key = f"evidence/{scan_session.id}/front-{quality.content_hash[:12]}.{ext}"
    s3_client = get_s3_client(settings)
    try:
        s3_client.put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=image_bytes)
    except (BotoCoreError, ClientError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Evidence storage is temporarily unavailable. Please retry.",
        ) from exc

    db.add(EvidenceImage(
        scan_session_id=scan_session.id, angle="front", storage_key=storage_key,
        content_hash=quality.content_hash, quality_result=quality.model_dump(),
    ))

    reference = _generate_reference()
    db.add(Grievance(
        reference=reference, scan_session_id=scan_session.id,
        concerns=concern_list, concern_note=concern_note,
        shop_name_or_location=shop_name_or_location,
        quality_note=(
            f"The photo looked {quality.reason}." if quality.overall_verdict != QualityVerdict.PASS else None
        ),
        submitter_name=submitter_name, submitter_contact=submitter_contact,
    ))
    emit(
        db, "scan_created", entity_type="ScanSession", entity_id=scan_session.id,
        region=scan_session.region, detail={"source": "Citizen-Reported", "reference": reference},
    )
    db.commit()

    background_tasks.add_task(run_pipeline, scan_session.id)

    return {"reference": reference, "submittedAt": datetime.now(timezone.utc).isoformat()}


def _not_found() -> HTTPException:
    # Uniform response whether the reference doesn't exist at all or
    # exists but something downstream is wrong — never a signal a caller
    # could use to enumerate valid references.
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


@router.get("/grievances/{reference}")
def lookup_grievance(
    reference: str,
    request: Request,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    _rate_limit_or_raise(request, settings)

    normalized = reference.strip().upper()
    grievance = db.query(Grievance).filter(Grievance.reference == normalized).first()
    if grievance is None:
        raise _not_found()

    scan_session = db.get(ScanSession, grievance.scan_session_id)
    if scan_session is None or scan_session.record_id is None:
        # Pipeline hasn't produced a record yet — genuinely "Received",
        # not a lookup failure; the citizen should never see a not-found
        # for a reference just issued to them.
        return {
            "reference": grievance.reference,
            "status": "Received",
            "lastUpdatedAt": grievance.submitted_at.isoformat(),
        }

    record = db.get(ComplianceRecord, scan_session.record_id)
    if record is None:
        return {
            "reference": grievance.reference,
            "status": "Received",
            "lastUpdatedAt": grievance.submitted_at.isoformat(),
        }

    active_flag_exists = (
        db.query(RecordReviewFlag)
        .filter(RecordReviewFlag.record_id == record.id, RecordReviewFlag.status == "ACTIVE")
        .first()
        is not None
    )
    corrected = (
        db.query(AuditEvent)
        .filter(AuditEvent.record_id == record.id, AuditEvent.event_type == "field_corrected")
        .first()
        is not None
    )

    if record.verification_status == "Verified" and not active_flag_exists:
        public_status = "Resolved"
    elif active_flag_exists or corrected:
        public_status = "Under Review"
    else:
        public_status = "Received"

    last_updated = record.verified_at or scan_session.created_at or grievance.submitted_at
    return {
        "reference": grievance.reference,
        "status": public_status,
        "lastUpdatedAt": last_updated.isoformat(),
    }
