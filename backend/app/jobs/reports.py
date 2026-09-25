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

F-003 fix (2026-09-19): rendering used to shell out to `npx tsx
scripts/render-report-cli.ts` — a repo-root Node/TypeScript script the
backend's own Docker image never includes (its build context is
`backend/` only; there is no Node in the deployed container at all). The
renderer code (src/lib/server/report-render-v2/) already lives inside the
Next.js app, which already has a working, already-deployed Node runtime
(Vercel) — so the fix isn't "add Node to the Python container," it's
"call the Node runtime that's already running" via a small internal HTTP
endpoint (`POST {frontend_base_url}/api/internal/render-report`,
`src/app/api/internal/render-report/route.ts`), authenticated with a
shared secret (`internal_render_secret`) neither side logs.
"""

from __future__ import annotations

import base64
import hashlib
import uuid

import httpx

from app.core.config import Settings, get_settings
from app.core.object_storage import get_s3_client
from app.db.models import ComplianceRecord, Profile, Report
from app.db.session import SessionLocal
from app.services.reports.images import ReportImagePaths, report_image_workspace
from app.services.reports.schema import ReportSnapshotV2
from app.services.reports.snapshot import build_report_snapshot

REPORT_STAGE_IDS = ["collecting", "rendering", "finalising"]

# Image embedding is slower than the old text-only render, and now
# includes an HTTP round trip — this is generous headroom for a slow
# render or an evidence-heavy record, not a mask for a genuinely hung
# process (there is no existing telemetry to calibrate a tighter number
# against).
_RENDER_TIMEOUT_SECONDS = 180.0

_FORMAT_STORAGE = {
    "pdf": {"key_attr": "pdf_storage_key", "content_type": "application/pdf"},
    "docx": {
        "key_attr": "docx_storage_key",
        "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
}


def _b64_or_none(path) -> str | None:
    if path is None:
        return None
    return base64.b64encode(path.read_bytes()).decode("ascii")


def render_via_http(
    snapshot: ReportSnapshotV2, images: ReportImagePaths, settings: Settings
) -> tuple[bytes, bytes]:
    """Calls the Next.js app's internal render route — a pure rendering
    layer with no DB/B2/business logic of its own, same contract the old
    subprocess had, just over HTTP instead of stdin/stdout: the frozen
    snapshot plus the already-fetched/optimized evidence images (now sent
    as base64 bytes, since the renderer no longer shares a filesystem
    with this process) in, {pdfBase64, docxBase64} out. The logo asset is
    resolved by the route itself, from the Next.js app's own `public/`
    directory — one fewer thing to send over the wire."""
    if not settings.internal_render_secret:
        raise RuntimeError("INTERNAL_RENDER_SECRET is not configured")

    payload = {
        "snapshot": snapshot.model_dump(by_alias=True),
        "images": {
            # image_id -> base64 bytes. Every captured/recaptured evidence
            # image for the record's scan session, not just one per angle
            # — see ReportImagePaths' own docstring for why this replaced
            # the old front/back/side_pdp singleton fields.
            "byImageId": {k: _b64_or_none(v) for k, v in images.by_image_id.items()},
            "violationCrops": {k: _b64_or_none(v) for k, v in images.violation_crops.items()},
            # Dimensions of the files actually resized, keyed the same way
            # as the image bytes above — lets the DOCX renderer size an
            # ImageRun correctly with zero new image-dimension-reading
            # dependency (jsPDF's PDF path already has getImageProperties()
            # built in).
            "dimensions": {k: list(v) for k, v in images.embedded_dimensions.items()},
        },
    }
    url = f"{settings.frontend_base_url.rstrip('/')}/api/internal/render-report"
    try:
        response = httpx.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.internal_render_secret.get_secret_value()}"},
            timeout=_RENDER_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Report renderer request failed: {exc}") from exc

    if response.status_code != 200:
        # Never echo response headers/body verbatim — could theoretically
        # reflect the Authorization header back in a misconfigured proxy.
        raise RuntimeError(f"Report renderer returned HTTP {response.status_code}")
    decoded = response.json()
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
                pdf_bytes, docx_bytes = render_via_http(snapshot, images, settings)

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
