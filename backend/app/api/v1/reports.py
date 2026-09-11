"""
api/v1/reports.py — Phase 5's immutable reports: POST /records/{id}/reports
(generate), GET /reports/by-record/{record_id} (history), GET /reports/{id}
(metadata + frozen_snapshot, for preview), GET /reports/{id}/download/{format}
(stream the stored artifact — NEVER regenerates).

Generation flow: freeze a ReportDocument snapshot from real DB data
(services/reports/snapshot.py) -> render PDF+DOCX via the existing Node
renderer, invoked as a subprocess (scripts/render-report-cli.ts, reusing
report-render.ts's renderPdf/renderDocx verbatim) -> upload both to B2 (same
boto3 client/pattern as scans.py's evidence upload) -> insert one `Report`
row. `frozen_snapshot`/the two storage keys are written exactly once here;
nothing else in this file ever touches them again except to read them back.
"""

from __future__ import annotations

import base64
import json
import subprocess
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user, get_current_user_from_bearer_or_query
from app.api.deps.permissions import require_permission
from app.core.config import Settings, get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, Profile, Report
from app.db.session import get_db
from app.services.reports.snapshot import build_report_document
from app.services.scope import apply_officer_scope

router = APIRouter(tags=["reports"])

# repo root: backend/app/api/v1/reports.py -> backend/app/api/v1 -> backend/app
# -> backend -> <repo root>, where scripts/render-report-cli.ts lives (the
# frontend's own directory, since that's where the Node renderer/its
# dependencies are installed).
_REPO_ROOT = Path(__file__).resolve().parents[4]
_RENDERER_SCRIPT = _REPO_ROOT / "scripts" / "render-report-cli.ts"

_FORMAT_FILES = {
    "pdf": {"key_attr": "pdf_storage_key", "content_type": "application/pdf", "extension": "pdf"},
    "docx": {
        "key_attr": "docx_storage_key",
        "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "extension": "docx",
    },
}


def _render_pdf_and_docx(document: dict) -> tuple[bytes, bytes]:
    result = subprocess.run(
        ["npx", "tsx", str(_RENDERER_SCRIPT)],
        input=json.dumps(document).encode("utf-8"),
        capture_output=True,
        cwd=str(_REPO_ROOT),
        timeout=60,
        shell=True,  # Windows: npx is a .cmd shim, not directly executable.
    )
    if result.returncode != 0:
        raise RuntimeError(f"Report renderer failed: {result.stderr.decode(errors='replace')[:2000]}")
    payload = json.loads(result.stdout)
    return base64.b64decode(payload["pdfBase64"]), base64.b64decode(payload["docxBase64"])


def _report_summary(report: Report) -> dict:
    return {
        "id": str(report.id),
        "complianceRecordId": str(report.compliance_record_id),
        "referenceCode": report.frozen_snapshot.get("referenceCode"),
        "generatedAt": report.generated_at.isoformat() if report.generated_at else None,
        "generatedBy": str(report.generated_by) if report.generated_by else None,
        "formats": [
            fmt for fmt, meta in _FORMAT_FILES.items() if getattr(report, meta["key_attr"]) is not None
        ],
    }


@router.post("/records/{record_id}/reports", status_code=status.HTTP_201_CREATED)
def generate_report(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: Profile = Depends(require_permission("report.generate")),
) -> dict:
    record = db.get(ComplianceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compliance record not found")
    if record.verification_status != "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A report can only be generated for a Verified record",
        )

    document = build_report_document(record, current_user, base_url=settings.cors_origin_list[0], db=db)

    try:
        pdf_bytes, docx_bytes = _render_pdf_and_docx(document)
    except Exception as exc:  # noqa: BLE001 - surfaced as a clean 502, not a stack trace
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Report rendering failed: {exc}"
        ) from exc

    report = Report(compliance_record_id=record.id, frozen_snapshot=document, generated_by=current_user.id)
    db.add(report)
    db.flush()  # assigns report.id without committing yet

    pdf_key = f"reports/{report.id}.pdf"
    docx_key = f"reports/{report.id}.docx"
    s3_client = get_s3_client(settings)
    s3_client.put_object(
        Bucket=settings.s3_bucket, Key=pdf_key, Body=pdf_bytes, ContentType=_FORMAT_FILES["pdf"]["content_type"]
    )
    s3_client.put_object(
        Bucket=settings.s3_bucket, Key=docx_key, Body=docx_bytes, ContentType=_FORMAT_FILES["docx"]["content_type"]
    )
    report.pdf_storage_key = pdf_key
    report.docx_storage_key = docx_key
    db.commit()
    db.refresh(report)

    return _report_summary(report)


@router.get("/reports/by-record/{record_id}")
def list_reports_for_record(
    record_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> list[dict]:
    """Phase 7: closes a real gap — this previously applied no officer
    scope at all, so any authenticated user could pull another
    jurisdiction's report history by record id. Now 404s (not 403, to
    avoid confirming the record exists) unless the underlying record is
    within this officer's scope, same apply_officer_scope() choke point
    every other record-scoped read uses."""
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
    """Phase 7: closes the same class of gap `list_reports_for_record` was
    fixed for — a `Report` row's own id was previously enough to read or
    download it, with no check that the underlying record is within this
    officer's scope. Every `Report`-by-id read now goes through this."""
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
    return {**_report_summary(report), "document": report.frozen_snapshot}


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
    artifact, proven by tests/integration/test_reports_immutable.py's SHA256
    comparison."""
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

    return Response(
        content=body,
        media_type=meta["content_type"],
        headers={"Content-Disposition": f'attachment; filename="report-{report_id}.{meta["extension"]}"'},
    )
