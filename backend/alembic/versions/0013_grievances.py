"""Citizen Grievance Portal mock-to-real port — a new `grievances` table,
plus `scan_sessions.created_by` becomes nullable (with a CHECK) for the
one real exception: a citizen-submitted scan has no signed-in officer to
attribute it to.

No new rate-limit table — the portal reuses `auth_rate_limit_hits`
(P2's login limiter) with a `"grievance:ip:<ip>"` bucket-key prefix
instead of `"login:..."`. Same table, same upsert function
(`app/services/auth/rate_limit.py::check_and_increment`), a different
caller.

revision: 0013_grievances
down_revision: 0012_admin_console
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_grievances"
down_revision: Union[str, None] = "0012_admin_console"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("scan_sessions", "created_by", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.create_check_constraint(
        "ck_scan_sessions_created_by_or_citizen_reported",
        "scan_sessions",
        "created_by IS NOT NULL OR source = 'Citizen-Reported'",
    )

    op.create_table(
        "grievances",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("reference", sa.String(), nullable=False),
        sa.Column(
            "scan_session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scan_sessions.id"),
            nullable=False,
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("concerns", postgresql.JSONB(), nullable=True),
        sa.Column("concern_note", sa.String(), nullable=True),
        sa.Column("shop_name_or_location", sa.String(), nullable=True),
        sa.Column("quality_note", sa.String(), nullable=True),
        sa.Column("submitter_name", sa.String(), nullable=True),
        sa.Column("submitter_contact", sa.String(), nullable=True),
    )
    op.create_index("ix_grievances_reference", "grievances", ["reference"], unique=True)
    op.create_index("ix_grievances_scan_session_id", "grievances", ["scan_session_id"])


def downgrade() -> None:
    op.drop_index("ix_grievances_scan_session_id", table_name="grievances")
    op.drop_index("ix_grievances_reference", table_name="grievances")
    op.drop_table("grievances")
    op.drop_constraint("ck_scan_sessions_created_by_or_citizen_reported", "scan_sessions", type_="check")
    op.alter_column("scan_sessions", "created_by", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
