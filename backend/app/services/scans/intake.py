"""
services/scans/intake.py — accept_evidence_image(), the ONE authoritative
quality+storage decision point for a single evidence photo, shared by
desktop upload-once capture (api/v1/scans.py, OP-Phase 1) and Mobile QR
Handoff (api/v1/mobile_handoff.py, Phase 10 — refactored onto this in the
same change). Extracted from mobile_handoff.py's own
`upload_mobile_image`, which had this exact logic inline before there was
a second caller.

ONE NETWORK UPLOAD PER ACCEPTED IMAGE: this function is called exactly
once per image the client sends — never re-checked or re-uploaded later.
`evaluate_image_quality()`'s verdict here is final; `POST /scans` (the
older, all-at-once multipart endpoint used by e-commerce intake) still
re-evaluates quality itself, since it never calls this function.

THE MEASURED VERDICT IS NEVER OVERWRITTEN: `quality_result.overall_verdict`
(PASS/REVIEW/RECAPTURE_REQUIRED) is what `evaluate_image_quality()` found,
permanently. `override_reason`/`overridden_by`/`overridden_at` are a
separate, layered human decision — the same "never overwrite the automated
verdict, layer a resolution on top of it" discipline
`rules/types.py::RuleResult.resolution` already established for Rule 7.
`AcceptanceState` (PASS / PASS_WITH_WARNINGS / RECAPTURE_REQUIRED /
OVERRIDDEN) is derived from the two together, at read time, by
`_acceptance_state()` below — never stored as its own column.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import StrEnum

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from app.core.config import Settings
from app.core.object_storage import get_s3_client
from app.db.models import AuditEvent, EvidenceImage
from app.services.image_quality import QualityResult, QualityVerdict, evaluate_image_quality

CONTENT_TYPE_ALLOWLIST = {"image/jpeg", "image/png", "image/webp"}
EXTENSION_BY_CONTENT_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class AcceptanceState(StrEnum):
    PASS = "PASS"
    PASS_WITH_WARNINGS = "PASS_WITH_WARNINGS"
    RECAPTURE_REQUIRED = "RECAPTURE_REQUIRED"
    OVERRIDDEN = "OVERRIDDEN"


class EvidenceAcceptance(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    acceptance_state: AcceptanceState
    quality: QualityResult
    is_replacement: bool
    # None exactly when acceptance_state == RECAPTURE_REQUIRED — a refused
    # image is never persisted, matching the pre-existing "a failed
    # attempt leaves no trace" rule this codebase already documents in
    # three places (quality-check endpoint, mobile upload, this one).
    evidence_image: EvidenceImage | None


def _acceptance_state(verdict: QualityVerdict, override_reason: str | None) -> AcceptanceState:
    if verdict == QualityVerdict.RECAPTURE_REQUIRED:
        return AcceptanceState.OVERRIDDEN if override_reason else AcceptanceState.RECAPTURE_REQUIRED
    if verdict == QualityVerdict.REVIEW:
        return AcceptanceState.PASS_WITH_WARNINGS
    return AcceptanceState.PASS


def accept_evidence_image(
    db: DbSession,
    settings: Settings,
    *,
    scan_session_id: uuid.UUID,
    angle: str,
    file_bytes: bytes,
    content_type: str,
    actor_id: uuid.UUID | None,
    override_reason: str | None = None,
    event_type_uploaded: str = "evidence_image_uploaded",
    event_type_replaced: str = "evidence_image_replaced",
) -> EvidenceAcceptance:
    """Validates content-type/size, runs the real quality check, and — if
    accepted (PASS, PASS_WITH_WARNINGS, or a RECAPTURE_REQUIRED image the
    caller supplied `override_reason` for) — uploads to B2 and persists an
    `EvidenceImage` row, deleting any prior row for this exact
    (scan_session_id, angle) first (append/supersede replacement, never
    accumulating). Raises `HTTPException` for a malformed request
    (unsupported type, oversized); a genuinely bad PHOTO (not a bad
    request) is returned as `RECAPTURE_REQUIRED` with no exception, so the
    caller can offer Retake or Override.

    `actor_id=None` is valid — the mobile phone side has no `Profile` to
    attribute an AuditEvent to (see mobile_handoff.py's own precedent)."""
    if content_type not in CONTENT_TYPE_ALLOWLIST:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported image type")

    max_bytes = settings.mobile_upload_max_mb * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds the {settings.mobile_upload_max_mb}MB limit",
        )

    quality = evaluate_image_quality(file_bytes)
    acceptance_state = _acceptance_state(quality.overall_verdict, override_reason)

    if acceptance_state == AcceptanceState.RECAPTURE_REQUIRED:
        return EvidenceAcceptance(
            acceptance_state=acceptance_state, quality=quality, is_replacement=False, evidence_image=None
        )

    existing = (
        db.query(EvidenceImage)
        .filter(EvidenceImage.scan_session_id == scan_session_id)
        .filter(EvidenceImage.angle == angle)
        .first()
    )
    is_replacement = existing is not None

    s3_client = get_s3_client(settings)
    ext = EXTENSION_BY_CONTENT_TYPE[content_type]
    storage_key = f"evidence/{scan_session_id}/{angle}-{quality.content_hash[:12]}.{ext}"

    try:
        s3_client.put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=file_bytes)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Evidence storage is temporarily unavailable. Please retry.",
        ) from exc

    if existing is not None:
        old_key = existing.storage_key
        db.delete(existing)
        db.flush()
        try:
            s3_client.delete_object(Bucket=settings.s3_bucket, Key=old_key)
        except (BotoCoreError, ClientError):
            pass  # orphaned object, not incorrect data — best-effort cleanup

    now = datetime.now(timezone.utc)
    evidence_image = EvidenceImage(
        scan_session_id=scan_session_id,
        angle=angle,
        storage_key=storage_key,
        content_hash=quality.content_hash,
        quality_result=quality.model_dump(),
        **(
            {"override_reason": override_reason, "overridden_by": actor_id, "overridden_at": now}
            if acceptance_state == AcceptanceState.OVERRIDDEN
            else {}
        ),
    )
    db.add(evidence_image)
    db.flush()

    db.add(
        AuditEvent(
            actor_id=actor_id,
            event_type=event_type_replaced if is_replacement else event_type_uploaded,
            entity_type="ScanSession",
            entity_id=scan_session_id,
            detail={"angle": angle, "acceptanceState": acceptance_state.value},
        )
    )
    if acceptance_state == AcceptanceState.OVERRIDDEN:
        db.add(
            AuditEvent(
                actor_id=actor_id,
                event_type="evidence_override_submitted",
                entity_type="ScanSession",
                entity_id=scan_session_id,
                detail={"angle": angle, "reason": override_reason},
            )
        )

    return EvidenceAcceptance(
        acceptance_state=acceptance_state, quality=quality, is_replacement=is_replacement,
        evidence_image=evidence_image,
    )
