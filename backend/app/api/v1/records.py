"""
api/v1/records.py — POST /records/{id}/corrections, POST /records/{id}/verify,
POST /records/{id}/resolutions.

All three enforce the immutability rule stated in
db/models/compliance_record.py's own docstring: before verification,
corrections/resolutions may update extraction/checklist/violations and
re-run rules freely; once Verified, further writes to those columns are
refused (409), and a later correction/reinspection must create a NEW
ComplianceRecord via a new ScanSession — already guaranteed by Phase 2's
derive_record_id() being a pure hash of scan_session_id, so no code here
needs to enforce that part.

Officer identity comes from the authenticated Profile
(Depends(get_current_user)/require_permission), never a client-supplied
userId field — a deliberate improvement over the old frontend mock's
convention of trusting a body field for who made a change.

Phase 3.1 adds POST /records/{id}/resolutions: some rule results are
legitimately unresolvable by automation (Rule 7 always; Rule 8/9
sometimes) — this lets an officer resolve a NEEDS_REVIEW/
INSUFFICIENT_EVIDENCE RuleResult to a final PASS/FAIL without ever
overwriting the original automated verdict (see rules/types.py's
RuleResult.resolution / effective_status).

Phase 4 adds: GET /records/{id} (a plain read, so the new Product DNA/Case
Detail frontend pages can discover a record's productId/activeCaseId
without triggering a mutation), POST /records/{id}/flag-enforcement
(Compliance Follow-Through case creation/reuse), and
POST /records/{id}/retry-enrichment (re-runs the post-verification
intelligence loop for an already-Verified record whose Product DNA/Risk
linkage previously failed or was skipped — see services/intelligence_loop.py).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy import cast as sa_cast
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.api.deps.permissions import require_permission
from app.db.models import (
    AuditEvent,
    CaseStatusHistory,
    ComplianceRecord,
    LegalEntity,
    Product,
    ProductIdentifier,
    Profile,
    ProductInspectionLink,
    RecordReviewFlag,
    ViolationCase,
)
from app.db.session import get_db
from app.services.audit import emit
from app.services.authz.repositories import get_visible_record
from app.services.extraction.schema import ComplianceEvidenceBundle, ExtractedField
from app.services.intelligence_loop import (
    EnrichmentSkipped,
    recompute_risk_for_record_subjects,
    run_post_verification_loop,
)
from app.services.rules.aggregate import compute_compliance_score, compute_legal_status
from app.services.records.serialize import to_frontend_record
from app.services.rules.apply import reapply_rules
from app.services.rules.frontend_adapter import to_checklist_and_violations
from app.services.rules.types import RuleResolution, RuleStatus
from app.services.scope import apply_officer_scope

router = APIRouter(tags=["records"], prefix="/records")
logger = structlog.get_logger(__name__)

# The 7 existing DeclarationFieldIds a correction may target, mapped to the
# StructuredExtraction attribute that actually backs them. `manufacturerDetails`
# is the one deliberate simplification: it writes through to the primary
# `manufacturer` field only, never packer/importer/brand_owner_or_marketer —
# an officer cannot use this endpoint to reassign WHICH of the 4 legal roles
# a name belongs to, only to correct the manufacturer's own name/value. A
# richer correction UI naming the specific role is out of Phase 3 scope.
_FRONTEND_TO_INTERNAL_FIELD = {
    "manufacturerDetails": "manufacturer",
    "genericName": "generic_name",
    "netQuantity": "net_quantity",
    "manufactureDate": "manufacture_or_import_date",
    "retailSalePrice": "mrp",
    "countryOfOrigin": "country_of_origin",
    "consumerCareDetails": "consumer_care",
}


class CorrectionRequest(BaseModel):
    field_id: str
    value: str


class ResolutionRequest(BaseModel):
    rule_id: str
    resolved_status: str  # "PASS" or "FAIL" only — validated below
    note: str


@router.post("/{record_id}/corrections")
def correct_declaration(
    record_id: uuid.UUID,
    body: CorrectionRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("verification.confirm")),
) -> dict:
    record = get_visible_record(db, record_id, current_user, for_update=True)
    if record.verification_status == "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record is Verified — corrections require a new inspection",
        )
    if body.field_id not in _FRONTEND_TO_INTERNAL_FIELD:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown or uncorrectable fieldId: {body.field_id}",
        )
    if record.evidence_bundle is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No evidence bundle available for this record yet",
        )

    bundle = ComplianceEvidenceBundle.model_validate(record.evidence_bundle)
    internal_attr = _FRONTEND_TO_INTERNAL_FIELD[body.field_id]
    current_field: ExtractedField | None = getattr(bundle.structured_extraction, internal_attr)
    old_value = current_field.value if current_field else None
    updated_field = ExtractedField(
        value=body.value,
        not_detected=False,
        evidence=current_field.evidence if current_field else [],
        extraction_confidence=current_field.extraction_confidence if current_field else 0.0,
        corrected=True,
        corrected_by=str(current_user.id),
    )
    setattr(bundle.structured_extraction, internal_attr, updated_field)

    # Re-run the ENTIRE rule engine via the shared helper (also used by
    # Phase 6's calibration endpoint) rather than computing which rules are
    # "affected" by one field — these are pure, cheap functions, and
    # re-running all of them is simpler and safer than partial invalidation.
    result = reapply_rules(record, bundle)
    extraction_result = result["extraction_result"]
    for decl in extraction_result["declarations"]:
        if decl["fieldId"] == body.field_id:
            decl["corrected"] = True
            decl["correctedByUserId"] = str(current_user.id)

    record.evidence_bundle = bundle.model_dump()
    record.extraction = extraction_result
    record.checklist = result["checklist"]
    record.violations = result["violations"]
    record.compliance_status = result["legal_status"]
    record.compliance_score = result["score_result"]["value"]
    record.compliance_band = result["score_result"]["band"]
    record.product_name_observed = extraction_result["declarations"][1]["value"]
    record.manufacturer_name_observed = extraction_result["declarations"][0]["value"]
    emit(
        db, "field_corrected", viewer=current_user, record=record,
        detail={"fieldId": body.field_id, "oldValue": old_value, "newValue": body.value},
    )
    db.commit()
    db.refresh(record)

    return to_frontend_record(record, db)


@router.post("/{record_id}/verify")
def verify_record(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("verification.confirm")),
) -> dict:
    record = get_visible_record(db, record_id, current_user, for_update=True)
    if record.verification_status == "Verified":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Record is already Verified")

    # Phase 3.1: block verification on UNRESOLVED review/evidence issues
    # only — a checklist row with `passed: false` and no `violationCategoryId`
    # is exactly a still-open NEEDS_REVIEW/INSUFFICIENT_EVIDENCE item (see
    # frontend_adapter.py's mapping). A row with `passed: false` AND a
    # `violationCategoryId` is a CONFIRMED failure (automated or
    # officer-resolved) — that's a legitimate, verifiable NON_COMPLIANT
    # finding, not something blocking verification; the whole point of this
    # system is to let an officer verify "yes, this is genuinely
    # non-compliant." This also naturally never blocks on NOT_APPLICABLE
    # rules (e.g. a domestic product's countryOfOrigin), since those never
    # appear in the checklist at all.
    blocked_fields = [
        c["fieldId"] for c in (record.checklist or [])
        if not c["passed"] and "violationCategoryId" not in c
    ]
    if blocked_fields:
        # A record with an unresolved review item is not an error, just not
        # verifiable yet — 200 with the blocking field list, no mutation.
        # Resolve it via POST /records/{id}/resolutions, or correct the
        # underlying field, then verify again.
        return {"record": to_frontend_record(record, db), "blockedFields": blocked_fields}

    record.verification_status = "Verified"
    record.verified_by = current_user.id
    record.verified_at = datetime.now(timezone.utc)
    # extraction/checklist/violations/compliance_status/compliance_score/
    # compliance_band already reflect the current real state (computed by
    # the pipeline and kept current by every correction) — no
    # recomputation on verify, just the freeze.
    emit(db, "confirm_and_verify", viewer=current_user, record=record)
    db.commit()
    db.refresh(record)

    # Phase 4 intelligence loop — the ONLY place this runs (see
    # services/intelligence_loop.py's own docstring on why). Runs AFTER
    # the commit above, on its own: a failure here must never undo or
    # block a verification that has already legally happened. Never
    # silent, though — an EnrichmentSkipped (no usable manufacturer/generic
    # name/quantity) or a genuine exception both get recorded as an
    # AuditEvent so the gap is visible and POST .../retry-enrichment can
    # complete it later.
    try:
        run_post_verification_loop(record, db)
    except Exception as exc:  # noqa: BLE001 - best-effort enrichment, see docstring
        db.rollback()
        db.add(AuditEvent(
            actor_id=current_user.id, event_type="intelligence_enrichment_failed",
            entity_type="ComplianceRecord", entity_id=record.id,
            detail={"error": str(exc), "skipped": isinstance(exc, EnrichmentSkipped)},
        ))
        db.commit()
        logger.warning("intelligence_enrichment_failed", record_id=str(record.id), error=str(exc))

    db.refresh(record)
    return {"record": to_frontend_record(record, db), "blockedFields": []}


@router.post("/{record_id}/resolutions")
def resolve_review_item(
    record_id: uuid.UUID,
    body: ResolutionRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("verification.confirm")),
) -> dict:
    """Officer resolution for a rule the automated engine legitimately
    could not decide (Rule 7 always; Rule 8/9 sometimes) — resolves it to
    a final PASS or FAIL WITHOUT overwriting the original automated
    RuleResult.status. Only rules currently NEEDS_REVIEW/
    INSUFFICIENT_EVIDENCE (by their own unresolved `status`, not
    `effective_status` — re-resolving an already-resolved item is allowed,
    the officer may change their mind) can be targeted."""
    record = get_visible_record(db, record_id, current_user, for_update=True)
    if record.verification_status == "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record is Verified — resolutions require a new inspection",
        )
    if record.evidence_bundle is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No evidence bundle available for this record yet",
        )
    if body.resolved_status not in ("PASS", "FAIL"):
        raise HTTPException(
            status_code=422,
            detail="resolved_status must be exactly 'PASS' or 'FAIL'",
        )

    bundle = ComplianceEvidenceBundle.model_validate(record.evidence_bundle)
    rule_result = next((r for r in bundle.rule_results if r.rule_id == body.rule_id), None)
    if rule_result is None:
        raise HTTPException(status_code=404, detail=f"Unknown rule_id: {body.rule_id}")
    if rule_result.status not in (RuleStatus.NEEDS_REVIEW, RuleStatus.INSUFFICIENT_EVIDENCE):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Rule '{body.rule_id}' is automated status {rule_result.status.value} — only "
                "NEEDS_REVIEW/INSUFFICIENT_EVIDENCE rules can be officer-resolved"
            ),
        )

    rule_result.resolution = RuleResolution(
        resolved_status=RuleStatus(body.resolved_status),
        resolved_by=str(current_user.id),
        resolved_at=datetime.now(timezone.utc).isoformat(),
        note=body.note,
    )

    legal_status = compute_legal_status(bundle.rule_results)
    score_result = compute_compliance_score(bundle.rule_results)
    checklist, violations = to_checklist_and_violations(bundle.rule_results)
    if legal_status == "Not Applicable":
        violations = []

    record.evidence_bundle = bundle.model_dump()
    record.checklist = checklist
    record.violations = violations
    record.compliance_status = legal_status
    record.compliance_score = score_result["value"]
    record.compliance_band = score_result["band"]
    emit(
        db, "rule_resolved", viewer=current_user, record=record,
        detail={"ruleId": body.rule_id, "resolvedStatus": body.resolved_status, "note": body.note},
    )
    db.commit()
    db.refresh(record)

    return to_frontend_record(record, db)


@router.get("")
def list_records(
    query: str | None = None,
    categories: list[str] = Query(default=[]),
    regions: list[str] = Query(default=[]),
    statuses: list[str] = Query(default=[]),
    sources: list[str] = Query(default=[]),
    manufacturers: list[str] = Query(default=[]),
    violation_category_ids: list[str] = Query(default=[], alias="violationCategoryIds"),
    date_from: str | None = Query(default=None, alias="dateFrom"),
    date_to: str | None = Query(default=None, alias="dateTo"),
    brand: str | None = None,
    legal_entity: str | None = Query(default=None, alias="legalEntity"),
    barcode: str | None = None,
    include_archived: bool = Query(default=False, alias="includeArchived"),
    page: int = 1,
    page_size: int = Query(default=20, alias="pageSize"),
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    """Phase 5 added this as a real backend for the Records list, scoped
    via apply_officer_scope() (Phase 4's own choke point) so an Enforcement
    Officer never sees another officer's records here either — that scope
    check always runs FIRST, before any of Phase 7's new filters below.

    Phase 7: real server-side search, replacing the frontend's prior
    fetch-200-then-filter-in-memory approach (which made `totalCount`
    wrong and silently missed matches past row 200). `brand`/`legalEntity`
    use an INNER join through ProductInspectionLink(ACTIVE)->Product-
    >LegalEntity — a record with no product link yet (unverified, or
    Phase 4 enrichment skipped/failed) has no brand/legal-entity to match
    and is correctly excluded from that specific search, not a bug.

    Phase 8: `barcode` joins the same way, one join further through
    ProductIdentifier — matched as a digit substring against both the
    normalized (GTIN-14, zero-padded) and raw decoded value, so typing the
    printed digits (e.g. "890...") matches regardless of the symbology's
    original length or the normalized form's leading zeros."""
    db_query = apply_officer_scope(db.query(ComplianceRecord), current_user)

    # Archived records are excluded by default everywhere; `includeArchived`
    # is only honored for an Admin (matches the mock's own Admin-only
    # archive-view behavior) — any other role passing it is silently
    # treated as false rather than 403ing on a harmless query param.
    if not (include_archived and current_user.role == "Admin"):
        db_query = db_query.filter(ComplianceRecord.archived.is_(False))

    if query:
        like = f"%{query}%"
        db_query = db_query.filter(
            or_(
                ComplianceRecord.product_name_observed.ilike(like),
                ComplianceRecord.manufacturer_name_observed.ilike(like),
            )
        )
    if categories:
        db_query = db_query.filter(ComplianceRecord.category.in_(categories))
    if regions:
        db_query = db_query.filter(ComplianceRecord.region.in_(regions))
    if statuses:
        db_query = db_query.filter(ComplianceRecord.compliance_status.in_(statuses))
    if sources:
        db_query = db_query.filter(ComplianceRecord.source.in_(sources))
    if manufacturers:
        db_query = db_query.filter(ComplianceRecord.manufacturer_name_observed.in_(manufacturers))
    if violation_category_ids:
        db_query = db_query.filter(
            or_(*(
                ComplianceRecord.violations.op("@>")(sa_cast([{"categoryId": vcid}], PG_JSONB))
                for vcid in violation_category_ids
            ))
        )
    if date_from:
        parsed = _parse_date_boundary(date_from)
        if parsed is not None:
            db_query = db_query.filter(ComplianceRecord.scanned_at >= parsed)
    if date_to:
        parsed = _parse_date_boundary(date_to)
        if parsed is not None:
            db_query = db_query.filter(ComplianceRecord.scanned_at <= parsed)
    if brand or legal_entity or barcode:
        db_query = db_query.join(
            ProductInspectionLink,
            (ProductInspectionLink.compliance_record_id == ComplianceRecord.id)
            & (ProductInspectionLink.status == "ACTIVE"),
        ).join(Product, Product.id == ProductInspectionLink.product_id)
        if brand:
            db_query = db_query.filter(Product.brand.ilike(f"%{brand}%"))
        if legal_entity:
            db_query = db_query.join(LegalEntity, LegalEntity.id == Product.legal_entity_id).filter(
                LegalEntity.name.ilike(f"%{legal_entity}%")
            )
        if barcode:
            digits = "".join(c for c in barcode if c.isdigit())
            if digits:
                db_query = db_query.join(
                    ProductIdentifier, ProductIdentifier.product_id == Product.id
                ).filter(
                    or_(
                        ProductIdentifier.normalized_value.like(f"%{digits}%"),
                        ProductIdentifier.raw_value.like(f"%{digits}%"),
                    )
                )

    total_count = db_query.count()
    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)
    rows = (
        db_query.order_by(ComplianceRecord.scanned_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "rows": [to_frontend_record(r, db) for r in rows],
        "totalCount": total_count,
        "page": page,
        "pageSize": page_size,
    }


def _parse_date_boundary(value: str):
    from datetime import datetime as _datetime

    try:
        return _datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/{record_id}")
def get_record(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    """Plain read, upgraded to the full frontend ComplianceRecord shape
    (to_frontend_record()) so the real Record Detail page (page 6) can use
    it too. Object-scoped via get_visible_record (Phase 1.1) — a probe for
    an out-of-jurisdiction record id gets the same 404 as a nonexistent
    one."""
    record = get_visible_record(db, record_id, current_user)
    return to_frontend_record(record, db)


@router.post("/{record_id}/flag-enforcement")
def flag_for_enforcement(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("record.flagForEnforcement")),
) -> dict:
    """Compliance Follow-Through's entry point: creates a new case, or
    returns the existing active one — never a second concurrent case for
    the same record. Requires the record to already be Verified; Follow-
    Through operates on confirmed findings, not provisional extractions."""
    record = get_visible_record(db, record_id, current_user, for_update=True)
    if record.verification_status != "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record must be Verified before it can be flagged for enforcement",
        )

    existing = (
        db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id == record_id)
        .filter(ViolationCase.status != "CLOSED")
        .first()
    )
    if existing is not None:
        return _case_summary(existing)

    case = ViolationCase(originating_record_id=record_id, status="OPEN", assigned_officer_id=current_user.id)
    try:
        with db.begin_nested():
            db.add(case)
            db.flush()
    except IntegrityError:
        # The DB's own partial unique index (uq_one_open_case_per_record)
        # is the final backstop against a genuine race — a savepoint here
        # unwinds only this failed insert, never the record lookup above.
        existing = (
            db.query(ViolationCase)
            .filter(ViolationCase.originating_record_id == record_id)
            .filter(ViolationCase.status != "CLOSED")
            .first()
        )
        if existing is not None:
            return _case_summary(existing)
        raise

    db.add(CaseStatusHistory(
        case_id=case.id, from_status=None, to_status="OPEN",
        changed_by=current_user.id, note="Flagged for enforcement.",
    ))
    db.commit()
    db.refresh(case)

    try:
        recompute_risk_for_record_subjects(record, db)
    except Exception:  # noqa: BLE001 - best-effort; case creation itself already committed
        db.rollback()

    return _case_summary(case)


def _case_summary(case: ViolationCase) -> dict:
    return {
        "id": str(case.id),
        "status": case.status,
        "originatingRecordId": str(case.originating_record_id),
        "createdAt": case.created_at.isoformat() if case.created_at else None,
    }


@router.post("/{record_id}/retry-enrichment")
def retry_enrichment(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("verification.confirm")),
) -> dict:
    """Re-runs the post-verification intelligence loop for an already-
    Verified record whose Product DNA/Risk linkage previously failed or
    was skipped (see verify_record's AuditEvent on failure, and
    _record_response's enrichmentStatus). Safe to call repeatedly:
    resolve_legal_entity/resolve_product/the ProductInspectionLink guard
    are all idempotent by construction."""
    record = get_visible_record(db, record_id, current_user, for_update=True)
    if record.verification_status != "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a Verified record can have its intelligence enrichment retried",
        )

    try:
        run_post_verification_loop(record, db)
    except Exception as exc:  # noqa: BLE001 - see verify_record's identical handling
        db.rollback()
        db.add(AuditEvent(
            actor_id=current_user.id, event_type="intelligence_enrichment_failed",
            entity_type="ComplianceRecord", entity_id=record.id,
            detail={"error": str(exc), "skipped": isinstance(exc, EnrichmentSkipped)},
        ))
        db.commit()
        logger.warning("intelligence_enrichment_retry_failed", record_id=str(record.id), error=str(exc))

    db.refresh(record)
    return to_frontend_record(record, db)


class ReviewFlagRequest(BaseModel):
    flag: bool
    note: str | None = None


class BulkReviewFlagRequest(BaseModel):
    record_ids: list[uuid.UUID] = Field(alias="recordIds")
    flag: bool

    model_config = {"populate_by_name": True}


@router.post("/{record_id}/archive")
def archive_record(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("record.archive")),
) -> dict:
    """Phase 1.3's real backend for the mock-only archive action — sets
    the pre-existing `archived` fast-filter boolean plus who/when
    (migration 0008), and excludes the record from GET /records' default
    listing (see list_records' own includeArchived handling)."""
    record = get_visible_record(db, record_id, current_user, for_update=True)
    record.archived = True
    record.archived_at = datetime.now(timezone.utc)
    record.archived_by = current_user.id
    emit(db, "record_archived", viewer=current_user, record=record)
    db.commit()
    db.refresh(record)
    return to_frontend_record(record, db)


def _set_review_flag(
    db: DbSession, record: ComplianceRecord, current_user: Profile, *, flag: bool, note: str | None
) -> None:
    active = (
        db.query(RecordReviewFlag)
        .filter(RecordReviewFlag.record_id == record.id)
        .filter(RecordReviewFlag.status == "ACTIVE")
        .first()
    )
    if flag:
        if active is not None:
            # Idempotent — re-flagging an already-flagged record updates the
            # note (if a new one was given) rather than creating a second
            # ACTIVE row (migration 0008's own partial unique index would
            # refuse that anyway).
            if note is not None:
                active.note = note
        else:
            db.add(RecordReviewFlag(
                record_id=record.id, status="ACTIVE", note=note, flagged_by=current_user.id,
            ))
        emit(db, "flagged_needs_review", viewer=current_user, record=record, detail={"note": note})
    else:
        if active is not None:
            active.status = "CLEARED"
            active.cleared_by = current_user.id
            active.cleared_at = datetime.now(timezone.utc)
        emit(db, "needs_review_cleared", viewer=current_user, record=record)


@router.post("/bulk/review-flag")
def bulk_set_review_flag(
    body: BulkReviewFlagRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("record.bulkStatusChange")),
) -> dict:
    """Registered BEFORE the parameterized /{record_id}/review-flag below —
    otherwise that route's `record_id: uuid.UUID` path param would greedily
    match the literal segment "bulk" first (same template shape, and
    FastAPI/Starlette try routes in registration order), and reject it with
    a UUID-parsing 422 before this handler is ever reached.

    ATOMIC CONTRACT (chosen deliberately for this government workflow over
    a partial-success/multi-status one): every recordId is pre-authorized
    and row-locked FIRST; only once every one of them is confirmed visible
    are any writes applied, and every write plus every audit event lands in
    ONE final commit. A single out-of-scope or nonexistent id fails the
    WHOLE request (404) with no partial state change — an officer bulk-
    flagging 50 records never has to reconcile which 41 of them silently
    took effect. `skipped` in the response is therefore always `[]` on
    success; it stays in the response shape only so a future, explicitly
    approved partial-success contract could reuse it without a breaking
    change — this endpoint never populates it today."""
    if len(body.record_ids) > 100:
        raise HTTPException(status_code=422, detail="At most 100 recordIds per bulk request")
    if not body.record_ids:
        return {"updated": [], "skipped": []}

    # De-duplicate while preserving order — a caller sending the same id
    # twice must not double-flag or double-emit for it.
    seen: set[uuid.UUID] = set()
    unique_ids = [rid for rid in body.record_ids if not (rid in seen or seen.add(rid))]

    records = [get_visible_record(db, record_id, current_user, for_update=True) for record_id in unique_ids]

    for record in records:
        _set_review_flag(db, record, current_user, flag=body.flag, note=None)
    db.commit()

    updated = []
    for record in records:
        db.refresh(record)
        updated.append(to_frontend_record(record, db))

    return {"updated": updated, "skipped": []}


@router.post("/{record_id}/review-flag")
def set_review_flag(
    record_id: uuid.UUID,
    body: ReviewFlagRequest,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("record.flagNeedsReview")),
) -> dict:
    """Phase 1.3 — the manual Needs Review escalation's real backend
    (record_review_flags, migration 0008), independent of the checklist-
    computed signal (both are OR'd together in to_frontend_record)."""
    record = get_visible_record(db, record_id, current_user, for_update=True)
    _set_review_flag(db, record, current_user, flag=body.flag, note=body.note)
    db.commit()
    db.refresh(record)
    return to_frontend_record(record, db)
