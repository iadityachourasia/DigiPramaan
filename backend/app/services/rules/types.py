"""
rules/types.py — the rule engine's own vocabulary.

RuleStatus is a 5-way verdict, deliberately richer than the frontend's
boolean DeclarationCheck.passed — frontend_adapter.py is the one place that
collapses this down. LegalStatus is NOT a separate enum: the aggregate
functions in aggregate.py return exactly one of "Compliant" / "Non-Compliant"
/ "Needs Review" / "Not Applicable", the same 4 new strings the frontend's
ComplianceStatus type gained for Phase 3 (see src/types/vocabulary.ts) — so
there is no mapping step between internal and frontend-facing status.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class RuleStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    NOT_APPLICABLE = "NOT_APPLICABLE"


class RuleResult(BaseModel):
    rule_id: str
    rule_name: str
    field_id: str | None
    status: RuleStatus
    message: str
    legal_basis: str
    value: str | None = None  # the underlying declaration's value, for the checklist row
