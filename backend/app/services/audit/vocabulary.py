"""
services/audit/vocabulary.py — the fixed set of activity event types this
backend may emit.

Verbatim from `src/types/history.ts`'s `ACTIVITY_EVENT_TYPES`, PLUS the
event types that only ever existed on the backend side before Phase 1.2
(the six `mobile_handoff_*`/`mobile_image_*` types api/v1/mobile_handoff.py
already emitted, and `intelligence_enrichment_failed` from
api/v1/records.py), PLUS four new types Phase 1.2 introduces for mutations
that previously logged nothing at all: `rule_resolved`, `calibration_
submitted`, `case_status_changed`, `user_deactivated`.

Kept in sync by hand across the language boundary — the same duplication
discipline `api/deps/permissions.py`'s `ROLE_PERMISSIONS` and
`services/authz/viewer.py`'s `VALID_ROLES` already document for their own
TypeScript counterparts. `src/types/history.ts` is updated to match in
the same change that adds an entry here (see that file's own comment
pointing back to this one).
"""

from __future__ import annotations

ACTIVITY_EVENT_TYPES = frozenset(
    {
        # --- src/types/history.ts's own 18, verbatim ---
        "scan_created",
        "image_quality_failed",
        "image_quality_passed",
        "ocr_completed",
        "ocr_fallback_used",
        "ocr_retried",
        "llm_structuring_completed",
        "rule_engine_completed",
        "field_corrected",
        "confirm_and_verify",
        "flagged_needs_review",
        "needs_review_cleared",
        "flagged_for_enforcement",
        "report_generated",
        "report_downloaded",
        "record_archived",
        "case_reassigned",
        "rule_threshold_changed",
        # --- pre-existing, backend-only (Mobile QR Handoff, Phase 10) ---
        "mobile_handoff_created",
        "mobile_handoff_revoked",
        "mobile_handoff_finalized",
        "mobile_image_uploaded",
        "mobile_image_replaced",
        "mobile_handoff_completed",
        "intelligence_enrichment_failed",
        # --- new, Phase 1.2 ---
        "rule_resolved",
        "calibration_submitted",
        "case_status_changed",
        "user_deactivated",
        # --- new, OP-Phase 1 — desktop upload-once intake
        # (services/scans/intake.py), shared with (but distinct from) the
        # mobile_image_* pair above, which the phone-side flow keeps using
        # unchanged. ---
        "evidence_image_uploaded",
        "evidence_image_replaced",
        "evidence_override_submitted",
        # --- new, P2 hardening (2026-09-19) — login/refresh rate limiting
        # (app/services/auth/rate_limit.py). Emitted only on a 429
        # rejection, never per attempt (would be high-volume noise). ---
        "login_rate_limited",
        "refresh_rate_limited",
    }
)


# Verbatim from src/types/history.ts's `ACTIVITY_TO_AUDIT_TYPE` (its own 18
# entries), plus one entry per backend-only/new type added above — every
# key in ACTIVITY_EVENT_TYPES must appear here exactly once, checked by
# tests/unit/test_audit_vocabulary.py. `None` means "not part of the
# coarse, 7-value per-record audit trail" (src/types/compliance.ts's
# AuditEventType) — a real, deliberate choice for a technical/system event
# (a pipeline stage completing) or an event whose subject is not a
# ComplianceRecord at all, not an oversight. services/records/serialize.py's
# _audit_trail() is the ONE place this mapping is used.
ACTIVITY_TO_AUDIT_TYPE: dict[str, str | None] = {
    "scan_created": "Scanned",
    "image_quality_failed": None,
    "image_quality_passed": None,
    "ocr_completed": "Extracted",
    "ocr_fallback_used": None,
    "ocr_retried": None,
    "llm_structuring_completed": None,
    "rule_engine_completed": None,
    "field_corrected": "Corrected",
    "confirm_and_verify": "Verified",
    "flagged_needs_review": "Flagged as Needs Review",
    "needs_review_cleared": None,
    "flagged_for_enforcement": "Flagged for Enforcement",
    "report_generated": "Report Generated",
    "report_downloaded": None,
    "record_archived": None,
    "case_reassigned": None,
    "rule_threshold_changed": None,
    "mobile_handoff_created": None,
    "mobile_handoff_revoked": None,
    "mobile_handoff_finalized": None,
    "mobile_image_uploaded": None,
    "mobile_image_replaced": None,
    "mobile_handoff_completed": None,
    "intelligence_enrichment_failed": None,
    "rule_resolved": None,
    "calibration_submitted": None,
    "case_status_changed": None,
    "user_deactivated": None,
    "evidence_image_uploaded": None,
    "evidence_image_replaced": None,
    "evidence_override_submitted": None,
    "login_rate_limited": None,
    "refresh_rate_limited": None,
}
