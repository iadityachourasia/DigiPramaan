"""
api/v1/reports.py — Phase 13's async, evidence-embedding reports:
POST /records/{id}/reports (kick off async generation), GET /reports/{id}
(status + frozen snapshot once COMPLETED), POST /reports/{id}/retry,
GET /reports/{id}/download/{format} (stream the stored artifact — NEVER
regenerates), GET /verify/reports/{id} (public, minimal authenticity
check).

Generation flow: insert a PENDING `Report` row immediately, schedule
`jobs.reports.generate_report_job` via BackgroundTasks, return 202. The
job freezes a ReportSnapshotV2 (services/reports/snapshot.py), fetches and
optimizes real evidence images (services/reports/images.py), renders
PDF+DOCX via an internal HTTP call to the Next.js app's own render route
(F-003 fix, 2026-09-19 — see jobs/reports.py's own module docstring),
uploads both to B2, and writes `frozen_snapshot`/storage keys/hashes/
status="COMPLETED" in one final commit — exactly once, same "written
exactly once" discipline as before, just later in the sequence (after
hashes are knowable) than the old synchronous version.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.api.deps.download_ticket import get_current_user_or_ticket
from app.api.deps.permissions import require_permission
from app.core.config import Settings, get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, Profile, Report
from app.db.session import get_db
from app.jobs.reports import generate_report_job, retry_report
from app.services.authz.repositories import get_visible_record
from app.services.scope import apply_officer_scope
from app.services.tickets.download_ticket import issue_download_ticket

router = APIRouter(tags=["reports"])

_FORMAT_FILES = {
    "pdf": {"key_attr": "pdf_storage_key", "content_type": "application/pdf", "extension": "pdf"},
    "docx": {
        "key_attr": "docx_storage_key",
        "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "extension": "docx",
    },
}


def _report_summary(report: Report) -> dict:
    snapshot = report.frozen_snapshot or {}
    metadata = snapshot.get("reportMetadata", {})
    return {
        "id": str(report.id),
        "complianceRecordId": str(report.compliance_record_id),
        "referenceCode": metadata.get("referenceCode"),
        "generatedAt": report.generated_at.isoformat() if report.generated_at else None,
        "generatedBy": str(report.generated_by) if report.generated_by else None,
        "status": report.status,
        "currentStage": report.current_stage,
        "errorMessage": report.error_message,
        "reportFormatVersion": report.report_format_version,
        "formats": [
            fmt for fmt, meta in _FORMAT_FILES.items() if getattr(report, meta["key_attr"]) is not None
        ],
    }


@router.get("/reports")
def list_reports(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    """Download History's global list (2026-09-20 mock-to-real port) —
    record-scope only, matching the same cut record-scope report
    generation/detail/download already made. Manufacturer/filtered-scope
    multi-record reports need the report-manifest redesign F-003's own
    plan already flagged as separate work."""
    scoped_record_ids = apply_officer_scope(db.query(ComplianceRecord.id), current_user).subquery()
    query = (
        db.query(Report)
        .filter(Report.compliance_record_id.in_(db.query(scoped_record_ids)))
        .order_by(Report.generated_at.desc())
    )
    total = query.count()
    reports = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"reports": [_report_summary(r) for r in reports], "total": total}


@router.post("/records/{record_id}/reports", status_code=status.HTTP_202_ACCEPTED)
def generate_report(
    record_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("report.generate")),
) -> dict:
    record = get_visible_record(db, record_id, current_user)
    if record.verification_status != "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A report can only be generated for a Verified record",
        )

    reference_code = str(uuid.uuid4())
    report = Report(
        compliance_record_id=record.id,
        frozen_snapshot={"referenceCode": reference_code},
        generated_by=current_user.id,
        status="PENDING",
        report_format_version="2.0",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    background_tasks.add_task(generate_report_job, report.id)

    return _report_summary(report)


@router.get("/reports/by-record/{record_id}")
def list_reports_for_record(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> list[dict]:
    owning_record = (
        apply_officer_scope(db.query(ComplianceRecord).filter(ComplianceRecord.id == record_id), current_user)
        .first()
    )
    if owning_record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compliance record not found")

    reports = (
        db.query(Report)
        .filter(Report.compliance_record_id == record_id)
        .order_by(Report.generated_at.desc())
        .all()
    )
    return [_report_summary(r) for r in reports]


def _scoped_report_or_404(report_id: uuid.UUID, db: DbSession, current_user: Profile) -> Report:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    owning_record = (
        apply_officer_scope(
            db.query(ComplianceRecord).filter(ComplianceRecord.id == report.compliance_record_id),
            current_user,
        )
        .first()
    )
    if owning_record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report


@router.get("/reports/{report_id}")
def get_report(
    report_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    report = _scoped_report_or_404(report_id, db, current_user)
    summary = _report_summary(report)
    # The frozen snapshot is only meaningful once generation has actually
    # completed — while PENDING/GENERATING it's just the reference-code
    # placeholder, and a FAILED row has no usable document at all.
    summary["document"] = report.frozen_snapshot if report.status == "COMPLETED" else None
    return summary


@router.post("/reports/{report_id}/retry")
def retry_report_generation(
    report_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(require_permission("report.generate")),
) -> dict:
    report = _scoped_report_or_404(report_id, db, current_user)
    if not retry_report(report.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Only a FAILED report can be retried"
        )
    background_tasks.add_task(generate_report_job, report.id)
    db.refresh(report)
    return _report_summary(report)


def _download_filename(report: Report, extension: str) -> str:
    snapshot = report.frozen_snapshot or {}
    inspection_id = snapshot.get("inspection", {}).get("inspectionId") or str(report.compliance_record_id)
    return f"DigiPramaan_Compliance_Report_{inspection_id}.{extension}"


@router.post("/reports/{report_id}/download-ticket")
def issue_report_download_ticket(
    report_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    """P2 hardening (F-010): replaces the raw session JWT that used to
    travel in `download_report`'s own `?access_token=` query param. Runs
    the SAME scope check `download_report` itself applies (_scoped_report_
    or_404) before minting — a ticket can never be issued for a report the
    caller isn't allowed to see, and requires a real Bearer JWT to call."""
    report = _scoped_report_or_404(report_id, db, current_user)
    ticket = issue_download_ticket(
        settings, resource_id=report.id, kind="report", issued_by=current_user.id
    )
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.download_ticket_ttl_seconds)
    return {"ticket": ticket, "expiresAt": expires_at.isoformat()}


@router.get("/reports/{report_id}/download/{report_format}")
def download_report(
    report_id: uuid.UUID,
    report_format: str,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: Profile = Depends(get_current_user_or_ticket(kind="report", resource_id_param="report_id")),
) -> Response:
    """NEVER regenerates. Reads the stored storage key off the `Report` row
    (written exactly once, at generation time) and streams back the exact
    bytes uploaded then — a re-download months later returns the identical
    artifact, proven by tests/integration/test_reports_immutable.py's
    SHA256 comparison. A row that isn't COMPLETED has no storage key and
    404s here regardless of `status` — a FAILED/PENDING/GENERATING report
    can never be mistaken for a real artifact."""
    report_format = report_format.lower()
    if report_format not in _FORMAT_FILES:
        raise HTTPException(status_code=422, detail=f"Unknown report format: {report_format}")

    report = _scoped_report_or_404(report_id, db, current_user)

    meta = _FORMAT_FILES[report_format]
    storage_key = getattr(report, meta["key_attr"])
    if storage_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"No {report_format} artifact stored for this report"
        )

    s3_client = get_s3_client(settings)
    obj = s3_client.get_object(Bucket=settings.s3_bucket, Key=storage_key)
    body = obj["Body"].read()

    filename = _download_filename(report, meta["extension"])
    return Response(
        content=body,
        media_type=meta["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/verify/reports/{report_id}")
def verify_report(
    report_id: str, db: DbSession = Depends(get_db), settings: Settings = Depends(get_settings)
) -> dict:
    """Public, unauthenticated — no Depends(get_current_user*) at all. A
    `Report.id` is a server-generated gen_random_uuid() (122 bits, never
    derived from another field) and this response is deliberately minimal
    (no product/manufacturer/officer/evidence data), so a bare UUID is the
    entire access-control model here — see Phase 13's plan for the full
    reasoning on why no additional verification token was added. Returns
    200 (never 404/422) for both a genuinely-missing report and a
    malformed ID — `report_id` is deliberately typed `str`, not
    `uuid.UUID`, so a bad ID reaches this function instead of FastAPI's
    own path-validation 422, and the response shape never distinguishes
    the two failure modes.

    F-003 fix (2026-09-19): `authenticity` used to be "VALID" the moment
    `status == COMPLETED", trusting whatever `pdf_sha256` was written at
    generation time without ever looking at the actual stored bytes again.
    Now the real PDF object is re-fetched from B2 and re-hashed on every
    call — "VALID" means the object in storage right now still matches the
    hash recorded at generation, not just that a row says so."""
    try:
        report = db.get(Report, uuid.UUID(report_id))
    except ValueError:
        report = None
    if report is None or report.status != "COMPLETED" or not report.pdf_storage_key:
        return {
            "reportId": report_id,
            "inspectionId": None,
            "generatedAt": None,
            "status": None,
            "pdfSha256": None,
            "authenticity": "NOT_FOUND",
        }

    snapshot = report.frozen_snapshot or {}
    inspection_id = snapshot.get("inspection", {}).get("inspectionId")

    s3_client = get_s3_client(settings)
    try:
        obj = s3_client.get_object(Bucket=settings.s3_bucket, Key=report.pdf_storage_key)
        actual_sha256 = hashlib.sha256(obj["Body"].read()).hexdigest()
        authenticity = "VALID" if actual_sha256 == report.pdf_sha256 else "TAMPERED"
    except Exception:  # noqa: BLE001 - storage unreachable/object missing is never "VALID"
        authenticity = "TAMPERED"

    return {
        "reportId": str(report.id),
        "inspectionId": inspection_id,
        "generatedAt": report.generated_at.isoformat() if report.generated_at else None,
        "status": report.status,
        "pdfSha256": report.pdf_sha256,
        "authenticity": authenticity,
    }
