"""
Unit tests for services/audit/vocabulary.py — the fixed activity event
vocabulary and its coarse per-record projection.
"""

from __future__ import annotations

from app.services.audit.vocabulary import ACTIVITY_EVENT_TYPES, ACTIVITY_TO_AUDIT_TYPE

_COARSE_AUDIT_EVENT_TYPES = {
    "Scanned", "Extracted", "Corrected", "Verified",
    "Report Generated", "Flagged for Enforcement", "Flagged as Needs Review",
}


def test_every_activity_type_has_exactly_one_coarse_mapping_entry() -> None:
    assert set(ACTIVITY_TO_AUDIT_TYPE.keys()) == ACTIVITY_EVENT_TYPES


def test_every_non_null_mapping_is_a_real_coarse_type() -> None:
    """src/types/compliance.ts's AuditEventType is a fixed 7-value union —
    a typo'd or invented string here would silently drop out of the
    frontend's own AuditEventType union at the type-check boundary, never
    caught until the field is actually rendered."""
    mapped = {v for v in ACTIVITY_TO_AUDIT_TYPE.values() if v is not None}
    assert mapped <= _COARSE_AUDIT_EVENT_TYPES


def test_35_event_types_currently_defined() -> None:
    """A change-detector on purpose — forces this test file to be touched
    (and test_every_activity_type_has_exactly_one_coarse_mapping_entry to
    actually run against the new entry) whenever the vocabulary grows.
    29 -> 32: OP-Phase 1 adds evidence_image_uploaded/evidence_image_replaced/
    evidence_override_submitted (services/scans/intake.py).
    32 -> 34: P2 hardening adds login_rate_limited/refresh_rate_limited
    (services/auth/rate_limit.py).
    34 -> 35: Admin Console create-user adds user_created (api/v1/admin.py)."""
    assert len(ACTIVITY_EVENT_TYPES) == 35
