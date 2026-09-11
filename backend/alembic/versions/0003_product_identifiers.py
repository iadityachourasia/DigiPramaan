"""Phase 8 — add the product_identifiers table.

Deliberately explicit, static DDL (op.create_table/op.create_index/
op.create_unique_constraint, explicit downgrade) rather than
Base.metadata.create_all(), same discipline as 0002_rule_explanations.py.
This migration contains only the one table Phase 8 introduces; it does not
touch any table 0001/0002 already own.

revision: 0003_product_identifiers
down_revision: 0002_rule_explanations
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_product_identifiers"
down_revision: Union[str, None] = "0002_rule_explanations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_identifiers",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "product_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"), nullable=False,
        ),
        sa.Column("identifier_type", sa.String(), nullable=False),
        sa.Column("normalized_value", sa.String(), nullable=False),
        sa.Column("raw_value", sa.String(), nullable=False),
        sa.Column("checksum_valid", sa.Boolean(), nullable=False),
        sa.Column(
            "first_seen_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "last_seen_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index(
        "ix_product_identifiers_product_id",
        "product_identifiers",
        ["product_id"],
    )
    op.create_unique_constraint(
        "uq_product_identifiers_normalized_value",
        "product_identifiers",
        ["normalized_value"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_product_identifiers_normalized_value", "product_identifiers", type_="unique")
    op.drop_index("ix_product_identifiers_product_id", table_name="product_identifiers")
    op.drop_table("product_identifiers")
