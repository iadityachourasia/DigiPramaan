"""
api/v1/cases.py — Compliance Follow-Through: GET /cases, GET /cases/{id},
POST /cases/{id}/transition. Case *creation* (from Flag for Enforcement)
lives in api/v1/records.py's POST /records/{id}/flag-enforcement, next to
the record it originates from, not here.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from app.api.deps.permissions import require_permission
from app.db.models import CaseStatusHistory, ComplianceRecord, Profile, ProductInspectionLink, ViolationCase
from app.db.session import get_db
from app.services.audit import emit
from app.services.authz.repositories import get_visible_case
from app.services.cases.workflow import CASE_STATUSES, validate_transition
from app.services.intelligence_loop import recompute_risk_for_record_subjects
from app.services.notifications import notify
from app.services.scope import apply_officer_scope

router = APIRouter(tags=["cases"], prefix="/cases")


class TransitionRequest(BaseModel):
    to_status: str
    note: str | None = None


def _case_response(case: ViolationCase, db: DbSession, include_history: bool = False) -> dict:
    record = db.get(ComplianceRecord, case.originating_record_id)
    link = (
        db.query(ProductInspectionLink)
        .filter(ProductInspectionLink.compliance_record_id == case.originating_record_id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .first()
    )
    body = {
        "id": str(case.id),
        "status": case.status,
        "originatingRecordId": str(case.originating_record_id),
        "productId": str(link.product_id) if link else None,
        "assignedOfficerId": str(case.assigned_officer_id) if case.assigned_officer_id else None,
        "createdAt": case.created_at.isoformat() if case.created_at else None,
        "resolvedAt": case.resolved_at.isoformat() if case.resolved_at else None,
        "closedAt": case.closed_at.isoformat() if case.closed_at else None,
        "record": {
            "id": str(record.id),
            "productName": record.product_name_observed,
            "manufacturerName": record.manufacturer_name_observed,
            "complianceStatus": record.compliance_status,
            "region": record.region,
        } if record else None,
    }
    if include_history:
        history = (
            db.query(CaseStatusHistory)
            .filter(CaseStatusHistory.case_id == case.id)
            .order_by(CaseStatusHistory.changed_at)
            .all()
        )
        body["history"] = [
            {
                "fromStatus": h.from_status,
                "toStatus": h.to_status,
                "changedBy": str(h.changed_by) if h.changed_by else None,
                "changedAt": h.changed_at.isoformat() if h.changed_at else None,
                "note": h.note,
            }
            for h in history
        ]
    return body


@router.get("")
def list_cases(
    status_filter: str | None = None,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("record.flagForEnforcement")),
) -> list[dict]:
    query = (
        db.query(ViolationCase)
        .join(ComplianceRecord, ComplianceRecord.id == ViolationCase.originating_record_id)
    )
    query = apply_officer_scope(query, current_user)
    if status_filter:
        query = query.filter(ViolationCase.status == status_filter)
    cases = query.order_by(ViolationCase.created_at.desc()).all()
    return [_case_response(c, db) for c in cases]


@router.get("/{case_id}")
def get_case(
    case_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("record.flagForEnforcement")),
) -> dict:
    case = get_visible_case(db, case_id, current_user)
    return _case_response(case, db, include_history=True)


@router.post("/{case_id}/transition")
def transition_case(
    case_id: uuid.UUID,
    body: TransitionRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("record.flagForEnforcement")),
) -> dict:
    case = get_visible_case(db, case_id, current_user, for_update=True)
    if body.to_status not in CASE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown case status: {body.to_status}")
    if not validate_transition(case.status, body.to_status):
        raise HTTPException(
            status_code=422,
            detail=f"Cannot transition from {case.status} to {body.to_status}",
        )

    from_status = case.status
    case.status = body.to_status
    now = datetime.now(timezone.utc)
    if body.to_status == "RESOLVED":
        case.resolved_at = now
    if body.to_status == "CLOSED":
        case.closed_at = now

    db.add(CaseStatusHistory(
        case_id=case.id, from_status=from_status, to_status=body.to_status,
        changed_by=current_user.id, note=body.note,
    ))

    # No AuditEvent was ever emitted for this — the "case_status_changed"
    # vocabulary entry has existed since Phase 1.2 with nothing writing it
    # (confirmed by grep before this fix).
    record = db.get(ComplianceRecord, case.originating_record_id)
    emit(
        db, "case_status_changed", viewer=current_user, record=record,
        entity_type="ViolationCase", entity_id=case.id,
        detail={"fromStatus": from_status, "toStatus": body.to_status},
    )
    if case.assigned_officer_id and case.assigned_officer_id != current_user.id:
        notify(
            db, case.assigned_officer_id, "case_status_changed",
            record=record, entity_type="ViolationCase", entity_id=case.id,
            detail={"fromStatus": from_status, "toStatus": body.to_status},
        )

    db.commit()
    db.refresh(case)

    # R4 (open enforcement case) depends on live case state — recompute
    # immediately rather than waiting for the next verification.
    if record is not None:
        try:
            recompute_risk_for_record_subjects(record, db)
        except Exception:  # noqa: BLE001 - best-effort, never block a transition on this
            db.rollback()

    return _case_response(case, db, include_history=True)
