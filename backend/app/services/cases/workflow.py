"""
cases/workflow.py — Compliance Follow-Through's case-status state machine.
Pure and deterministic: no DB, no I/O, independently testable.

Task's own diagram is a strict linear pipeline
(OPEN -> ACTION_REQUIRED -> REINSPECTION_REQUIRED -> RESOLVED -> CLOSED,
matching violation_cases' own module docstring exactly). This transition
table is a pragmatic, documented superset of that: early closure (a case
opened in error) and re-opening (a failed reinspection sends RESOLVED/
REINSPECTION_REQUIRED back to ACTION_REQUIRED) are both real workflow
needs — while CLOSED stays strictly terminal, consistent with the
project's established "reinspection creates a new record, never mutates a
closed one" philosophy already applied to ComplianceRecord itself. A case
that needs to reopen after CLOSED requires a fresh
POST /records/{id}/flag-enforcement call (a new case), never a transition
out of CLOSED.
"""

from __future__ import annotations

CASE_STATUSES = frozenset({
    "OPEN", "ACTION_REQUIRED", "REINSPECTION_REQUIRED", "RESOLVED", "CLOSED",
})

_TRANSITIONS: dict[str, frozenset[str]] = {
    "OPEN": frozenset({"ACTION_REQUIRED", "CLOSED"}),
    "ACTION_REQUIRED": frozenset({"REINSPECTION_REQUIRED", "RESOLVED", "CLOSED"}),
    "REINSPECTION_REQUIRED": frozenset({"RESOLVED", "ACTION_REQUIRED", "CLOSED"}),
    "RESOLVED": frozenset({"CLOSED", "REINSPECTION_REQUIRED"}),
    "CLOSED": frozenset(),
}


def validate_transition(from_status: str, to_status: str) -> bool:
    return to_status in _TRANSITIONS.get(from_status, frozenset())
