"""Phase 10 — add the mobile_upload_sessions table (real Mobile QR
Handoff, replacing the prior in-memory mock).

Deliberately explicit, static DDL (op.create_table/op.create_index,
explicit downgrade) rather than Base.metadata.create_all(), same
discipline as every prior migration in this repo. This migration
contains only the one table Phase 10 introduces; it does not touch any
table 0001-0004 already own.

revision: 0005_mobile_upload_sessions
down_revision: 0004_ecommerce_sourcing
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_mobile_upload_sessions"
down_revision: Union[str, None] = "0004_ecommerce_sourcing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mobile_upload_sessions",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "scan_session_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scan_sessions.id"), nullable=False,
        ),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="ACTIVE"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"), nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_mobile_upload_sessions_scan_session_id",
        "mobile_upload_sessions",
        ["scan_session_id"],
    )
    op.create_unique_constraint(
        "uq_mobile_upload_sessions_token_hash",
        "mobile_upload_sessions",
        ["token_hash"],
    )
    op.create_index(
        "ix_mobile_upload_sessions_token_hash",
        "mobile_upload_sessions",
        ["token_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_mobile_upload_sessions_token_hash", table_name="mobile_upload_sessions")
    op.drop_constraint(
        "uq_mobile_upload_sessions_token_hash", "mobile_upload_sessions", type_="unique"
    )
    op.drop_index(
        "ix_mobile_upload_sessions_scan_session_id", table_name="mobile_upload_sessions"
    )
    op.drop_table("mobile_upload_sessions")
