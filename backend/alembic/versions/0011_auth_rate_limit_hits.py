"""P2 hardening (2026-09-19, F-010) — auth_rate_limit_hits.

A fixed-window counter table for login/refresh rate limiting. See
app/db/models/auth_rate_limit_hit.py's own docstring for the full design
rationale (no Redis, upsert-based, opportunistic cleanup).

revision: 0011_auth_rate_limit_hits
down_revision: 0010_ocr_provider_jobs
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_auth_rate_limit_hits"
down_revision: Union[str, None] = "0010_ocr_provider_jobs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "auth_rate_limit_hits",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("bucket_key", sa.String(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("hit_count >= 0", name="ck_auth_rate_limit_hits_hit_count_non_negative"),
    )
    op.create_index(
        "uq_auth_rate_limit_hits_bucket_window",
        "auth_rate_limit_hits",
        ["bucket_key", "window_start"],
        unique=True,
    )
    op.create_index(
        "ix_auth_rate_limit_hits_window_start", "auth_rate_limit_hits", ["window_start"]
    )


def downgrade() -> None:
    op.drop_index("ix_auth_rate_limit_hits_window_start", table_name="auth_rate_limit_hits")
    op.drop_index("uq_auth_rate_limit_hits_bucket_window", table_name="auth_rate_limit_hits")
    op.drop_table("auth_rate_limit_hits")
