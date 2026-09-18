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
PDF+DOCX via the Node subprocess renderer, uploads both to B2, and writes
`frozen_snapshot`/storage keys/hashes/status="COMPLETED" in one final
commit — exactly once, same "written exactly once" discipline as before,
just later in the sequence (after hashes are knowable) than the old
synchronous version.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user, get_current_user_from_bearer_or_query
from app.api.deps.permissions import require_permission
from app.core.config import Settings, get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, Profile, Report
from app.db.session import get_db
from app.jobs.reports import generate_report_job, retry_report
from app.services.authz.repositories import get_visible_record
from app.services.scope import apply_officer_scope

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


@router.get("/reports/{report_id}/download/{report_format}")
def download_report(
    report_id: uuid.UUID,
    report_format: str,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: Profile = Depends(get_current_user_from_bearer_or_query),
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
def verify_report(report_id: str, db: DbSession = Depends(get_db)) -> dict:
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
    the two failure modes."""
    try:
        report = db.get(Report, uuid.UUID(report_id))
    except ValueError:
        report = None
    if report is None or report.status != "COMPLETED":
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
    return {
        "reportId": str(report.id),
        "inspectionId": inspection_id,
        "generatedAt": report.generated_at.isoformat() if report.generated_at else None,
        "status": report.status,
        "pdfSha256": report.pdf_sha256,
        "authenticity": "VALID",
    }
