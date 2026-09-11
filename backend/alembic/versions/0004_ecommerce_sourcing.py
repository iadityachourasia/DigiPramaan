"""Phase 9 — real E-commerce Listing Scanner: a batches table plus sourcing
columns on scan_sessions/compliance_records.

Deliberately explicit, static DDL (op.create_table/op.add_column/
op.create_index, explicit downgrade) rather than Base.metadata.create_all(),
same discipline as 0002_rule_explanations.py / 0003_product_identifiers.py.
This migration only touches scan_sessions/compliance_records (additive
columns) and creates the one new ecommerce_batches table — no other table
0001/0002/0003 already own is modified.

revision: 0004_ecommerce_sourcing
down_revision: 0003_product_identifiers
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_ecommerce_sourcing"
down_revision: Union[str, None] = "0003_product_identifiers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ecommerce_batches",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column("source_url", sa.String(), nullable=False),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"), nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )

    op.add_column(
        "scan_sessions",
        sa.Column("source", sa.String(), nullable=False, server_default="Officer-Scanned"),
    )
    op.add_column(
        "scan_sessions",
        sa.Column("ecommerce_listing_url", sa.String(), nullable=True),
    )
    op.add_column(
        "scan_sessions",
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ecommerce_batches.id"), nullable=True),
    )
    op.create_index("ix_scan_sessions_batch_id", "scan_sessions", ["batch_id"])

    op.add_column(
        "compliance_records",
        sa.Column("ecommerce_listing_url", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("compliance_records", "ecommerce_listing_url")
    op.drop_index("ix_scan_sessions_batch_id", table_name="scan_sessions")
    op.drop_column("scan_sessions", "batch_id")
    op.drop_column("scan_sessions", "ecommerce_listing_url")
    op.drop_column("scan_sessions", "source")
    op.drop_table("ecommerce_batches")
