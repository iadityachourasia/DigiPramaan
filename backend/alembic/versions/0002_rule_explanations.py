"""Phase 6 — add the rule_explanations table.

Deliberately explicit, static DDL (op.create_table/op.create_index/
op.create_unique_constraint, explicit downgrade) rather than
Base.metadata.create_all() — a hand-authored migration that reflects
whatever the models happen to look like at authoring time silently drifts
if models change later. This migration contains only the one table Phase 6
introduces; it does not touch any of the tables 0001 already owns.

revision: 0002_rule_explanations
down_revision: 0001_mvp_schema
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_rule_explanations"
down_revision: Union[str, None] = "0001_mvp_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rule_explanations",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "compliance_record_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("compliance_records.id"), nullable=False,
        ),
        sa.Column("rule_id", sa.String(), nullable=False),
        sa.Column("input_hash", sa.String(), nullable=False),
        sa.Column("explanation", postgresql.JSONB(), nullable=False),
        sa.Column("model_name", sa.String(), nullable=False),
        sa.Column(
            "generated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index(
        "ix_rule_explanations_compliance_record_id",
        "rule_explanations",
        ["compliance_record_id"],
    )
    op.create_unique_constraint(
        "uq_rule_explanations_record_rule",
        "rule_explanations",
        ["compliance_record_id", "rule_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_rule_explanations_record_rule", "rule_explanations", type_="unique")
    op.drop_index("ix_rule_explanations_compliance_record_id", table_name="rule_explanations")
    op.drop_table("rule_explanations")
