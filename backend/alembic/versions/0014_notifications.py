"""Notifications & Alerts — a new `notifications` table, distinct from the
existing `audit_events` (which has no recipient/read-state concept). No
stored English text: `type` + `detail` only, resolved to human copy
client-side via i18n, matching audit_events' own design.

revision: 0014_notifications
down_revision: 0013_grievances
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_notifications"
down_revision: Union[str, None] = "0013_grievances"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "recipient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"),
            nullable=False,
        ),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column(
            "record_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("compliance_records.id"),
            nullable=True,
        ),
        sa.Column("entity_type", sa.String(), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_notifications_type", "notifications", ["type"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])
    op.create_index("ix_notifications_recipient_read", "notifications", ["recipient_id", "read_at"])
    op.create_index("ix_notifications_recipient_created", "notifications", ["recipient_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_notifications_recipient_created", table_name="notifications")
    op.drop_index("ix_notifications_recipient_read", table_name="notifications")
    op.drop_index("ix_notifications_created_at", table_name="notifications")
    op.drop_index("ix_notifications_type", table_name="notifications")
    op.drop_table("notifications")
