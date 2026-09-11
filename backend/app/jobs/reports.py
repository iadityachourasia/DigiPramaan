"""
jobs/reports.py — async report generation, mirroring jobs/pipeline.py's
own proven shape exactly: a job function that opens its OWN SessionLocal()
(BackgroundTasks runs after the request's own session may already be
closed), persists state after every real transition, and is the SAME
entry point for both the initial run and a manual retry — always resuming
from whatever `status`/`current_stage` is already persisted on the row,
never assuming a fresh start.

`REPORT_STAGE_IDS` matches src/types/report.ts's own `REPORT_STAGE_IDS`
verbatim (collecting -> rendering -> finalising) — this is what lets the
existing ReportProgressTracker.tsx UI (built for Phase 5's mock/multi-
scope reports) show genuinely real progress for a record-scope report
with zero UI changes.
"""

from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import uuid
from pathlib import Path

from app.core.config import Settings, get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, Profile, Report
from app.db.session import SessionLocal
from app.services.reports.images import ReportImagePaths, report_image_workspace
from app.services.reports.schema import ReportSnapshotV2
from app.services.reports.snapshot import build_report_snapshot

REPORT_STAGE_IDS = ["collecting", "rendering", "finalising"]

# repo root: backend/app/jobs/reports.py -> backend/app/jobs -> backend/app
# -> backend -> <repo root>, where scripts/render-report-cli.ts lives.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_RENDERER_SCRIPT = _REPO_ROOT / "scripts" / "render-report-cli.ts"
# A pre-composited, white-matte JPEG — NOT the transparent
# digi-pramaan-logo.png the rest of the app uses. jsPDF's PNG path decodes
# to raw pixels with no compression-worthy passthrough (confirmed: the
# 1296x1296 transparent PNG alone added ~6.8MB to a single-record PDF),
# while its JPEG path embeds the original compressed bytes directly. A
# print report's page is white anyway, so compositing onto white and
# shipping as JPEG loses nothing visually. Same artwork, not a new logo.
_LOGO_PATH = _REPO_ROOT / "public" / "images" / "digi-pramaan-logo-report.jpg"

# Image embedding is slower than the old text-only render, but images are
# already resized server-side before this subprocess ever sees them — this
# is generous headroom for a slow machine or an evidence-heavy record, not
# a mask for a genuinely hung process (there is no existing telemetry to
# calibrate a tighter number against).
_RENDER_TIMEOUT_SECONDS = 180

_FORMAT_STORAGE = {
    "pdf": {"key_attr": "pdf_storage_key", "content_type": "application/pdf"},
    "docx": {
        "key_attr": "docx_storage_key",
        "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
}


def render_via_subprocess(snapshot: ReportSnapshotV2, images: ReportImagePaths) -> tuple[bytes, bytes]:
    """The renderer is a pure rendering layer: it receives exactly this
    JSON (the frozen snapshot + local file paths for the logo and
    already-fetched/optimized evidence images) over stdin and returns
    {pdfBase64, docxBase64} on stdout. No DB, no B2, no business logic —
    every path here was already resolved by report_image_workspace()."""
    payload = {
        "snapshot": snapshot.model_dump(by_alias=True),
        "images": {
            "front": str(images.front) if images.front else None,
            "back": str(images.back) if images.back else None,
            "side_pdp": str(images.side_pdp) if images.side_pdp else None,
            "violationCrops": {k: str(v) for k, v in images.violation_crops.items()},
            # Dimensions of the files actually written to disk (post-
            # resize), keyed the same way as the paths above — lets the
            # DOCX renderer size an ImageRun correctly with zero new
            # image-dimension-reading dependency (jsPDF's PDF path already
            # has getImageProperties() built in).
            "dimensions": {k: list(v) for k, v in images.embedded_dimensions.items()},
        },
        "logoPath": str(_LOGO_PATH),
    }
    result = subprocess.run(
        ["npx", "tsx", str(_RENDERER_SCRIPT)],
        input=json.dumps(payload).encode("utf-8"),
        capture_output=True,
        cwd=str(_REPO_ROOT),
        timeout=_RENDER_TIMEOUT_SECONDS,
        shell=True,  # Windows: npx is a .cmd shim, not directly executable.
    )
    if result.returncode != 0:
        raise RuntimeError(f"Report renderer failed: {result.stderr.decode(errors='replace')[:2000]}")
    decoded = json.loads(result.stdout)
    return base64.b64decode(decoded["pdfBase64"]), base64.b64decode(decoded["docxBase64"])


def _persist_report(db, report: Report, **updates) -> None:
    for key, value in updates.items():
        setattr(report, key, value)
    db.commit()


def generate_report_job(report_id: uuid.UUID) -> None:
    """Resumes from whatever `status` is already persisted — guards
    against double-execution (e.g. a retry racing an in-flight run) by
    only proceeding from PENDING or FAILED."""
    settings = get_settings()
    with SessionLocal() as db:
        report = db.get(Report, report_id)
        if report is None or report.status not in ("PENDING", "FAILED"):
            return

        try:
            _persist_report(db, report, status="GENERATING", current_stage="collecting", error_message=None)

            record = db.get(ComplianceRecord, report.compliance_record_id)
            generator = db.get(Profile, report.generated_by) if report.generated_by else None
            reference_code = (report.frozen_snapshot or {}).get("referenceCode") or str(uuid.uuid4())

            snapshot = build_report_snapshot(
                record, generator, db, settings, report_id=report.id, reference_code=reference_code,
            )

            with report_image_workspace(record, snapshot, db, settings) as images:
                # Patch in the ORIGINAL (pre-resize) pixel dimensions now
                # that images.py has actually opened each file — snapshot.py
                # itself never touches image bytes.
                for ref in snapshot.original_images:
                    dims = images.original_dimensions.get(ref.image_id)
                    if dims:
                        ref.image_width_px, ref.image_height_px = dims

                _persist_report(db, report, current_stage="rendering")
                pdf_bytes, docx_bytes = render_via_subprocess(snapshot, images)

            _persist_report(db, report, current_stage="finalising")

            pdf_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
            docx_sha256 = hashlib.sha256(docx_bytes).hexdigest()
            snapshot.integrity.pdf_sha256 = pdf_sha256
            snapshot.integrity.docx_sha256 = docx_sha256

            pdf_key = f"reports/{report.id}.pdf"
            docx_key = f"reports/{report.id}.docx"
            s3_client = get_s3_client(settings)
            s3_client.put_object(
                Bucket=settings.s3_bucket, Key=pdf_key, Body=pdf_bytes,
                ContentType=_FORMAT_STORAGE["pdf"]["content_type"],
            )
            s3_client.put_object(
                Bucket=settings.s3_bucket, Key=docx_key, Body=docx_bytes,
                ContentType=_FORMAT_STORAGE["docx"]["content_type"],
            )

            _persist_report(
                db, report,
                frozen_snapshot=snapshot.model_dump(by_alias=True),
                pdf_storage_key=pdf_key,
                docx_storage_key=docx_key,
                pdf_sha256=pdf_sha256,
                docx_sha256=docx_sha256,
                status="COMPLETED",
                current_stage=None,
                error_message=None,
            )
        except Exception as exc:  # noqa: BLE001 - a failed row must never look generated
            db.rollback()
            report = db.get(Report, report_id)
            if report is not None:
                _persist_report(db, report, status="FAILED", current_stage=None, error_message=str(exc)[:2000])


def retry_report(report_id: uuid.UUID) -> bool:
    """Resets a FAILED report to PENDING and persists it — does NOT run
    generation itself. Returns False if the report doesn't exist or isn't
    currently FAILED. Mirrors jobs/pipeline.py's retry_stage(): the caller
    (the retry route) schedules generate_report_job() via BackgroundTasks
    after this returns True, the same fast-reset-then-background-task
    handoff the scan pipeline's own retry already uses."""
    with SessionLocal() as db:
        report = db.get(Report, report_id)
        if report is None or report.status != "FAILED":
            return False
        _persist_report(db, report, status="PENDING", current_stage=None, error_message=None)
    return True
