"""
rules/types.py — the rule engine's own vocabulary.

RuleStatus is a 5-way verdict, deliberately richer than the frontend's
boolean DeclarationCheck.passed — frontend_adapter.py is the one place that
collapses this down. LegalStatus is NOT a separate enum: the aggregate
functions in aggregate.py return exactly one of "Compliant" / "Non-Compliant"
/ "Needs Review" / "Not Applicable", the same 4 new strings the frontend's
ComplianceStatus type gained for Phase 3 (see src/types/vocabulary.ts) — so
there is no mapping step between internal and frontend-facing status.

Phase 3.1 adds officer resolution: some rules (Rule 7 always, Rule 8/9
sometimes) are legitimately unresolvable by automation alone —
INSUFFICIENT_EVIDENCE/NEEDS_REVIEW is the honest, final automated answer,
not a bug to fix with a better heuristic. `RuleResult.resolution`, when
set (via POST /records/{id}/resolutions), records an officer's PASS/FAIL
judgment call on top of that — `status` itself is NEVER overwritten; only
`effective_status` (what aggregation and the checklist actually use)
reflects the resolution.
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


class RuleResolution(BaseModel):
    """An officer's judgment call resolving a NEEDS_REVIEW/
    INSUFFICIENT_EVIDENCE rule result to a final PASS or FAIL. Callers are
    responsible for only ever constructing this with resolved_status PASS
    or FAIL — it is not itself restricted to those two values so that
    RuleStatus stays the single source of truth for the enum, but every
    call site in this codebase (see api/v1/records.py) validates this
    before constructing one."""
    resolved_status: RuleStatus
    resolved_by: str
    resolved_at: str  # ISO 8601
    note: str


class RuleResult(BaseModel):
    rule_id: str
    rule_name: str
    field_id: str | None
    status: RuleStatus  # the ORIGINAL automated verdict — never overwritten
    message: str
    legal_basis: str
    value: str | None = None  # the underlying declaration's value, for the checklist row
    resolution: RuleResolution | None = None

    @property
    def effective_status(self) -> RuleStatus:
        """What legal-status/score aggregation and the checklist actually
        use: the officer's resolution if one exists, otherwise the
        original automated status."""
        return self.resolution.resolved_status if self.resolution else self.status
