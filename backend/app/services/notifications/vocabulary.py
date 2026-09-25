"""
services/notifications/vocabulary.py — the fixed set of notification types
this backend may write.

Deliberately NOT a mirror of `services/audit/vocabulary.py`'s full 34-entry
ACTIVITY_EVENT_TYPES — a notification is something a specific person should
be TOLD about, not a record of everything that happened. Every pipeline
stage, mobile-handoff step, and login-rate-limit rejection stays in
audit_events only.

Kept in sync by hand with `src/types/notifications.ts`'s `NOTIFICATION_TYPES`
— the same duplication discipline `services/audit/vocabulary.py` documents
for its own TypeScript counterpart, and the same one that produced a real,
confirmed bug earlier (16 activity event types existed on the backend with
no frontend/i18n entry, silently throwing MISSING_MESSAGE on every render).
Update both files in the same change that adds an entry here.
"""

from __future__ import annotations

NOTIFICATION_TYPES = frozenset(
    {
        # A case (yours or newly so) was reassigned to you.
        "case_reassigned_to_you",
        # A record you're the assigned officer for was flagged/cleared by
        # someone else.
        "record_flagged_needs_review",
        "record_needs_review_cleared",
        # A case assigned to you had its status changed by someone else.
        "case_status_changed",
        # Your account was just created — the one trigger where the
        # recipient is the actor's own target, seen on first login.
        "account_created",
        # Broadcast: rule thresholds changed (every active Enforcement
        # Officer, system-wide — thresholds have no per-region scope).
        "rule_thresholds_changed",
        # Broadcast: a record was flagged for enforcement (every active
        # Admin/Reviewer whose jurisdiction covers the record's region).
        "record_flagged_for_enforcement",
    }
)
