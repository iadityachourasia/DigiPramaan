"""Phase 1.3 — real backends for two mock-only workflow actions: archiving a
record and manually flagging/clearing Needs Review.

`compliance_records.archived_at`/`archived_by` are added alongside the
existing `archived` boolean (kept as-is — the fast filter column) so an
archive action is attributable, the same "who and when, not just what"
discipline `audit_events` already applies elsewhere.

`record_review_flags` is a NEW table rather than a column on
`compliance_records`, because a manual Needs Review escalation is
independent of the checklist-computed state (src/types/compliance.ts's
`needsReviewFlag` can be true even when every checklist row currently
passes) and needs its own who/when/note for both raising AND clearing it —
two write events a single boolean column can't hold. The partial unique
index guarantees at most one ACTIVE flag per record without the
application layer having to enforce that race itself.

revision: 0008_record_workflow
down_revision: 0007_audit_event_columns
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_record_workflow"
down_revision: Union[str, None] = "0007_audit_event_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "compliance_records", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "compliance_records",
        sa.Column("archived_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=True),
    )

    op.create_table(
        "record_review_flags",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "record_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("compliance_records.id"),
            nullable=False,
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="ACTIVE"),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("flagged_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("flagged_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("cleared_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=True),
        sa.Column("cleared_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_record_review_flags_record_id", "record_review_flags", ["record_id"])
    op.create_index(
        "uq_record_review_flags_one_active",
        "record_review_flags",
        ["record_id"],
        unique=True,
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )


def downgrade() -> None:
    op.drop_index("uq_record_review_flags_one_active", table_name="record_review_flags")
    op.drop_index("ix_record_review_flags_record_id", table_name="record_review_flags")
    op.drop_table("record_review_flags")
    op.drop_column("compliance_records", "archived_by")
    op.drop_column("compliance_records", "archived_at")
