"""
services/mobile_handoff/service.py — the non-token-auth business logic
shared by the officer-side and phone-side Mobile QR Handoff endpoints
(api/v1/mobile_handoff.py): creating a pending scan session, deriving
live per-angle upload status from real EvidenceImage rows (never a
duplicated stored field), and the shared "is this scan's record already
Verified" immutability check every mutating handoff endpoint runs.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session as DbSession

from app.db.models import ComplianceRecord, EvidenceImage, ScanSession
from app.jobs.pipeline import initial_stages_pending_capture

REQUIRED_ANGLES = ("front", "back", "side_pdp")


def create_pending_scan_session(db: DbSession, created_by: uuid.UUID) -> ScanSession:
    """The Mobile QR Handoff's own scan-session-creation path — deliberately
    NOT `create_scan_session_from_images()` (scans.py), which requires
    images already in hand and quality-checks them synchronously. Here,
    no image exists yet: category/region are filled in later by
    `finalize` once the officer's Details step is reached (see this
    feature's plan for why the wizard's own step order makes that
    necessary), and uploading/qualityCheck stay pending until then too."""
    scan_session = ScanSession(
        created_by=created_by,
        category=None,
        region=None,
        stages=initial_stages_pending_capture(),
        status="pending",
    )
    db.add(scan_session)
    db.flush()  # assigns scan_session.id without committing yet
    return scan_session


def build_angle_status(db: DbSession, scan_session_id: uuid.UUID) -> dict[str, str]:
    """Derived live from real EvidenceImage rows — never a second,
    independently-updatable source of truth for "has this angle arrived."
    "received" as soon as a row exists, regardless of its quality verdict
    (a REVIEW-quality image still counts as received; the officer sees
    the same quality signal on desktop that device/camera capture would
    have shown)."""
    present_angles = {
        row.angle
        for row in db.query(EvidenceImage.angle)
        .filter(EvidenceImage.scan_session_id == scan_session_id)
        .filter(EvidenceImage.angle.in_(REQUIRED_ANGLES))
        .all()
    }
    return {angle: ("received" if angle in present_angles else "waiting") for angle in REQUIRED_ANGLES}


def is_scan_session_record_verified(db: DbSession, scan_session_id: uuid.UUID) -> bool:
    """True once this scan's produced record has been officer-verified —
    at that point the record is immutable (records.py's own convention),
    so no handoff may be created for it and no further image may replace
    its evidence."""
    record = (
        db.query(ComplianceRecord)
        .filter(ComplianceRecord.scan_session_id == scan_session_id)
        .first()
    )
    return record is not None and record.verification_status == "Verified"
