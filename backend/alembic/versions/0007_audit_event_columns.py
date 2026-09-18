"""Phase 1.2 — audit_events gains actor_role/region/record_id/request_id,
the columns the Activity Log (api/v1/activity.py, Phase 1.4) and the real
per-record audit trail (records/serialize.py) both need.

`actor_role`/`region` are denormalized copies of facts true AT THE TIME
the event happened — never joined live against `profiles`/
`compliance_records` at read time, the same "an event is a historical
fact, and correcting a record's region later should not silently rewrite
where past events are recorded as having happened" discipline the
frontend's own `ActivityEvent.region` (src/types/history.ts) already
documents. `record_id` is additive alongside the existing `entity_id`
(which stays polymorphic — a mobile handoff event's entity is a
ScanSession, not a ComplianceRecord) so a per-record audit-trail query
never has to branch on `entity_type`.

revision: 0007_audit_event_columns
down_revision: 0006_report_lifecycle
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_audit_event_columns"
down_revision: Union[str, None] = "0006_report_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audit_events", sa.Column("actor_role", sa.String(), nullable=True))
    op.add_column("audit_events", sa.Column("region", sa.String(), nullable=True))
    op.add_column(
        "audit_events",
        sa.Column("record_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("audit_events", sa.Column("request_id", sa.String(), nullable=True))

    op.create_index("ix_audit_events_record_id", "audit_events", ["record_id"])
    op.create_index("ix_audit_events_region_created_at", "audit_events", ["region", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_region_created_at", table_name="audit_events")
    op.drop_index("ix_audit_events_record_id", table_name="audit_events")
    op.drop_column("audit_events", "request_id")
    op.drop_column("audit_events", "record_id")
    op.drop_column("audit_events", "region")
    op.drop_column("audit_events", "actor_role")
