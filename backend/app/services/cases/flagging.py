"""
services/cases/flagging.py — the one place a ComplianceRecord becomes (or
reuses) a ViolationCase, extracted from api/v1/records.py::flag_for_
enforcement (2026-09-20) so the per-record route and the new
per-company bulk route (api/v1/companies.py) share one implementation
rather than the bulk version reimplementing it.

Also closes a real gap the single-record route had: no `flagged_for_
enforcement` AuditEvent was ever emitted (confirmed by grep before this
file existed — the vocabulary entry existed but nothing ever wrote it).
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.db.models import CaseStatusHistory, ComplianceRecord, Profile, ViolationCase
from app.services.audit import emit
from app.services.intelligence_loop import recompute_risk_for_record_subjects


def flag_record_for_enforcement(
    db: DbSession, record: ComplianceRecord, actor: Profile
) -> tuple[ViolationCase, bool]:
    """Returns `(case, was_newly_created)`. Requires the record to already
    be Verified; raises `HTTPException(409)` otherwise — the same
    contract the single-record route already had."""
    if record.verification_status != "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record must be Verified before it can be flagged for enforcement",
        )

    existing = (
        db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id == record.id)
        .filter(ViolationCase.status != "CLOSED")
        .first()
    )
    if existing is not None:
        return existing, False

    case = ViolationCase(originating_record_id=record.id, status="OPEN", assigned_officer_id=actor.id)
    try:
        with db.begin_nested():
            db.add(case)
            db.flush()
    except IntegrityError:
        # The DB's own partial unique index (uq_one_open_case_per_record)
        # is the final backstop against a genuine race.
        existing = (
            db.query(ViolationCase)
            .filter(ViolationCase.originating_record_id == record.id)
            .filter(ViolationCase.status != "CLOSED")
            .first()
        )
        if existing is not None:
            return existing, False
        raise

    db.add(CaseStatusHistory(
        case_id=case.id, from_status=None, to_status="OPEN",
        changed_by=actor.id, note="Flagged for enforcement.",
    ))
    emit(db, "flagged_for_enforcement", viewer=actor, record=record, detail={"caseId": str(case.id)})
    db.commit()
    db.refresh(case)

    try:
        recompute_risk_for_record_subjects(record, db)
    except Exception:  # noqa: BLE001 - best-effort; case creation itself already committed
        db.rollback()

    return case, True
