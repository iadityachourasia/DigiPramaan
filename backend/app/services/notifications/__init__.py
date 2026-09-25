"""
services/notifications/ — the per-recipient notification pipeline.

`notify()`/`notify_many()` are the only places a `Notification` row is
constructed, called right alongside the matching `services/audit/emit()`
call at each trigger site — same transaction, same commit, so a
notification can never exist for a mutation that didn't happen. See
notify.py's own docstring for why this is a sibling to `emit()` rather than
derived from `audit_events` at read time.
"""

from app.services.notifications.notify import notify, notify_many
from app.services.notifications.recipients import jurisdiction_recipients
from app.services.notifications.vocabulary import NOTIFICATION_TYPES

__all__ = ["NOTIFICATION_TYPES", "notify", "notify_many", "jurisdiction_recipients"]
