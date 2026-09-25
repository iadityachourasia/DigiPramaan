"""
api/v1/admin.py — Admin Console mock-to-real port (2026-09-20):
GET /admin/team, GET/PUT /admin/thresholds, POST /admin/users/{id}/deactivate,
POST /admin/cases/reassign, POST /admin/users. Every route requires the
`rules.manageThresholds` permission, Admin-only per api/deps/permissions.py's
ROLE_PERMISSIONS — matches the mock store's own `isInAdminScope`'s implicit
Admin-only gate.

Identity comes from the Bearer token only (`current_user`) — never an
`actorId`/`viewerId` request field, the same discipline every other real
endpoint this project has already established.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from app.api.deps.permissions import require_permission
from app.api.v1.auth import _to_user_response
from app.core.config import Settings, get_settings
from app.db.models import CaseStatusHistory, ComplianceRecord, Profile, ViolationCase
from app.db.session import get_db
from app.services.admin.thresholds import get_effective_thresholds, set_thresholds
from app.services.audit import emit
from app.services.auth.supabase_auth import SupabaseAuthError, create_user_as_admin
from app.services.authz.viewer import VALID_ROLES, InvalidViewerProfile, ViewerScope
from app.services.notifications import jurisdiction_recipients, notify, notify_many

router = APIRouter(tags=["admin"], prefix="/admin")


def _admin_scope_profiles(db: DbSession, admin: Profile) -> list[Profile]:
    viewer = ViewerScope.from_profile(admin)
    query = db.query(Profile)
    if not viewer.is_national:
        query = query.filter(Profile.region == viewer.region)
    return query.all()


def _case_load(db: DbSession, user_id: uuid.UUID) -> int:
    unverified = (
        db.query(ComplianceRecord)
        .filter(ComplianceRecord.assigned_officer_id == user_id)
        .filter(ComplianceRecord.verification_status != "Verified")
        .count()
    )
    open_cases = (
        db.query(ViolationCase)
        .join(ComplianceRecord, ComplianceRecord.id == ViolationCase.originating_record_id)
        .filter(ComplianceRecord.assigned_officer_id == user_id)
        .filter(ViolationCase.status != "CLOSED")
        .count()
    )
    return unverified + open_cases


@router.get("/team")
def get_admin_team(
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("rules.manageThresholds")),
) -> dict:
    profiles = _admin_scope_profiles(db, current_user)
    users = []
    for profile in profiles:
        user = _to_user_response(profile).model_dump(by_alias=True)
        user["active"] = profile.active
        user["caseLoad"] = _case_load(db, profile.id)
        user["jurisdictionName"] = profile.jurisdiction_name or "National"
        users.append(user)
    return {"users": users}


@router.get("/thresholds")
def get_thresholds(
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("rules.manageThresholds")),
) -> dict:
    return get_effective_thresholds(db)


class ThresholdsRequest(BaseModel):
    repeat_violation_count: int = Field(alias="repeatViolationCount")
    repeat_violation_days: int = Field(alias="repeatViolationDays")
    ocr_confidence_threshold: int = Field(alias="ocrConfidenceThreshold")
    excellent_minimum: int = Field(alias="excellentMinimum")
    good_minimum: int = Field(alias="goodMinimum")
    poor_minimum: int = Field(alias="poorMinimum")

    model_config = {"populate_by_name": True}


@router.put("/thresholds")
def put_thresholds(
    payload: ThresholdsRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("rules.manageThresholds")),
) -> dict:
    if payload.repeat_violation_count < 1:
        raise HTTPException(status_code=422, detail="repeatViolationCount must be at least 1")
    if not (1 <= payload.repeat_violation_days <= 365):
        raise HTTPException(status_code=422, detail="repeatViolationDays must be between 1 and 365")
    if not (1 <= payload.ocr_confidence_threshold <= 100):
        raise HTTPException(status_code=422, detail="ocrConfidenceThreshold must be between 1 and 100")
    if not (
        100 >= payload.excellent_minimum > payload.good_minimum > payload.poor_minimum >= 0
    ):
        raise HTTPException(
            status_code=422,
            detail="Thresholds must satisfy 100 >= excellentMinimum > goodMinimum > poorMinimum >= 0",
        )

    values = {
        "repeatViolationCount": payload.repeat_violation_count,
        "repeatViolationDays": payload.repeat_violation_days,
        "ocrConfidenceThreshold": payload.ocr_confidence_threshold,
        "excellentMinimum": payload.excellent_minimum,
        "goodMinimum": payload.good_minimum,
        "poorMinimum": payload.poor_minimum,
    }
    set_thresholds(db, values=values, created_by=current_user.id)
    emit(db, "rule_threshold_changed", viewer=current_user, detail=values)
    recipients = jurisdiction_recipients(db, region=None, roles=["Enforcement Officer"]) - {current_user.id}
    notify_many(db, recipients, "rule_thresholds_changed", detail=values)
    db.commit()
    return get_effective_thresholds(db)


@router.post("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("rules.manageThresholds")),
) -> dict:
    if user_id == current_user.id:
        raise HTTPException(status_code=422, detail="You cannot deactivate your own account.")

    target = db.get(Profile, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    admin_scope_ids = {p.id for p in _admin_scope_profiles(db, current_user)}
    if target.id not in admin_scope_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if target.role == "Admin":
        active_admins_in_jurisdiction = [
            p for p in _admin_scope_profiles(db, current_user)
            if p.role == "Admin" and p.active and p.region == target.region
        ]
        if len(active_admins_in_jurisdiction) <= 1:
            raise HTTPException(
                status_code=422, detail="Each jurisdiction must retain one active Admin."
            )

    target.active = False
    emit(db, "user_deactivated", viewer=current_user, entity_type="Profile", entity_id=target.id, detail={})
    db.commit()
    db.refresh(target)

    user = _to_user_response(target).model_dump(by_alias=True)
    user["active"] = target.active
    user["caseLoad"] = _case_load(db, target.id)
    user["jurisdictionName"] = target.jurisdiction_name or "National"
    return user


class ReassignRequest(BaseModel):
    record_id: uuid.UUID = Field(alias="recordId")
    new_officer_user_id: uuid.UUID = Field(alias="newOfficerUserId")

    model_config = {"populate_by_name": True}


@router.post("/cases/reassign", status_code=status.HTTP_200_OK)
def reassign_case(
    payload: ReassignRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("rules.manageThresholds")),
) -> dict:
    viewer = ViewerScope.from_profile(current_user)
    record = db.get(ComplianceRecord, payload.record_id)
    if record is None or (not viewer.is_national and record.region != viewer.region):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    new_officer = db.get(Profile, payload.new_officer_user_id)
    if new_officer is None or new_officer.role != "Enforcement Officer" or not new_officer.active:
        raise HTTPException(status_code=422, detail="Target must be an active Enforcement Officer")
    try:
        officer_scope = ViewerScope.from_profile(new_officer)
    except InvalidViewerProfile as exc:
        raise HTTPException(status_code=422, detail="Target officer has an invalid profile") from exc
    if not officer_scope.is_national and officer_scope.region != record.region:
        raise HTTPException(
            status_code=422, detail="Target officer's jurisdiction does not cover this record's region"
        )

    old_officer_id = record.assigned_officer_id
    record.assigned_officer_id = new_officer.id

    open_case = (
        db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id == record.id)
        .filter(ViolationCase.status != "CLOSED")
        .first()
    )
    if open_case is not None:
        open_case.assigned_officer_id = new_officer.id
        db.add(CaseStatusHistory(
            case_id=open_case.id, from_status=open_case.status, to_status=open_case.status,
            changed_by=current_user.id, changed_at=datetime.now(timezone.utc),
            note=f"Reassigned from {old_officer_id} to {new_officer.id}",
        ))

    emit(
        db, "case_reassigned", viewer=current_user, record=record,
        detail={"fromOfficerId": str(old_officer_id) if old_officer_id else None, "toOfficerId": str(new_officer.id)},
    )
    if new_officer.id != current_user.id:
        notify(
            db, new_officer.id, "case_reassigned_to_you", record=record,
            detail={"fromOfficerId": str(old_officer_id) if old_officer_id else None},
        )
    db.commit()
    return {"status": "ok"}


class CreateUserRequest(BaseModel):
    email: str
    username: str
    full_name: str = Field(alias="fullName")
    password: str
    role: str
    department: str = "Department of Consumer Affairs"
    region: str
    jurisdiction_level: str = Field(alias="jurisdictionLevel")
    jurisdiction_name: str = Field(alias="jurisdictionName")

    model_config = {"populate_by_name": True}


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: CreateUserRequest,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: Profile = Depends(require_permission("rules.manageThresholds")),
) -> dict:
    """Creates a real Supabase Auth account plus its `profiles` row in one
    step — the self-service equivalent of the manual "create in the
    Supabase dashboard, then run seed/demo_profiles.py" process this
    project used before. Needs SUPABASE_SERVICE_ROLE_KEY configured (see
    core/config.py); 503s with a clear message if it isn't, rather than
    the whole app failing to start over a feature most deployments won't
    use."""
    if payload.role not in VALID_ROLES:
        raise HTTPException(
            status_code=422,
            detail=f"role must be one of: {', '.join(sorted(VALID_ROLES))}",
        )
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="password must be at least 6 characters")
    if payload.jurisdiction_level not in ("State", "National"):
        raise HTTPException(status_code=422, detail="jurisdictionLevel must be State or National")

    if db.query(Profile).filter(Profile.email == payload.email).first() is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if db.query(Profile).filter(Profile.username == payload.username).first() is not None:
        raise HTTPException(status_code=409, detail="That username is already taken")

    try:
        auth_user = create_user_as_admin(payload.email, payload.password, settings)
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    user_id = uuid.UUID(auth_user["id"])
    profile = Profile(
        id=user_id,
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        department=payload.department,
        region=payload.region,
        jurisdiction_level=payload.jurisdiction_level,
        jurisdiction_name=payload.jurisdiction_name,
        active=True,
    )
    db.add(profile)
    # Flush the new profile row before notify() references it as a
    # recipient_id — Notification has no ORM relationship() to Profile
    # (only a plain FK column), so unlike every other notify() call site
    # (which always targets an already-committed profile), the unit of
    # work has no dependency edge telling it profiles must insert before
    # notifications here. Without this flush, the two pending INSERTs can
    # be ordered either way, and notifications first violates the FK.
    db.flush()
    emit(
        db, "user_created", viewer=current_user, entity_type="Profile", entity_id=user_id,
        detail={"email": payload.email, "role": payload.role},
    )
    notify(db, user_id, "account_created", detail={"role": payload.role})
    db.commit()
    db.refresh(profile)

    user = _to_user_response(profile).model_dump(by_alias=True)
    user["active"] = profile.active
    user["caseLoad"] = 0
    user["jurisdictionName"] = profile.jurisdiction_name or "National"
    return user
