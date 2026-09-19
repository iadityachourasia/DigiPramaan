"""Admin Console mock-to-real port — profiles gain `active`/`reports_to`,
and a new `rule_threshold_versions` table backs the admin-configurable
thresholds page.

`active` defaults `true` so every existing profile stays exactly as
before. `services/authz/viewer.py::ViewerScope.from_profile` already
reads `getattr(profile, "active", True)` — that module has been waiting
on this exact column since it was written, so deactivation enforcement
needs zero code changes once this lands.

`rule_threshold_versions` is append-only — a PUT never updates an
existing row in place, it inserts a new one; "the current value" is
whichever row has the latest `created_at`. Same "one row is its own
version/progress source of truth" discipline `reports.status`/
`scan_sessions.stages` already use elsewhere in this schema, rather than
a single mutable config row with no history.

revision: 0012_admin_console
down_revision: 0011_auth_rate_limit_hits
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_admin_console"
down_revision: Union[str, None] = "0011_auth_rate_limit_hits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "profiles", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true())
    )
    op.add_column(
        "profiles",
        sa.Column("reports_to", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=True),
    )

    op.create_table(
        "rule_threshold_versions",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("values", postgresql.JSONB(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_rule_threshold_versions_created_at", "rule_threshold_versions", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_rule_threshold_versions_created_at", table_name="rule_threshold_versions")
    op.drop_table("rule_threshold_versions")
    op.drop_column("profiles", "reports_to")
    op.drop_column("profiles", "active")
