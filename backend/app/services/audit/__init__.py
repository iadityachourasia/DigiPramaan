"""
services/audit/ — the shared audit-event writing core (Phase 1.2).

`emit()` is the one place an `AuditEvent` row is constructed; every
mutation that changes something an officer or the system does should call
it in the same transaction as the change itself. `ACTIVITY_EVENT_TYPES`
is the fixed vocabulary of recognized event types, kept in sync by hand
with `src/types/history.ts`.
"""

from app.services.audit.emit import emit
from app.services.audit.vocabulary import ACTIVITY_EVENT_TYPES, ACTIVITY_TO_AUDIT_TYPE

__all__ = ["ACTIVITY_EVENT_TYPES", "ACTIVITY_TO_AUDIT_TYPE", "emit"]
