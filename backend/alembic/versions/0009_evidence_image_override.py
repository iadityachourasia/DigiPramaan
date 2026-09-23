"""OP-Phase 1 — evidence_images gains an officer-override audit trail.

`overall_verdict` on `quality_result` (JSONB, unchanged) stays the
immutable, measured 3-state fact (PASS/REVIEW/RECAPTURE_REQUIRED) — these
three new columns are the layered human decision on top of it, the same
"never overwrite the automated verdict, layer a resolution on it"
discipline `RuleResult.resolution` already established for Rule 7. An
image is `OVERRIDDEN` (derived at read time, never stored redundantly)
exactly when `override_reason IS NOT NULL`.

revision: 0009_evidence_image_override
down_revision: 0008_record_workflow
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_evidence_image_override"
down_revision: Union[str, None] = "0008_record_workflow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("evidence_images", sa.Column("override_reason", sa.String(), nullable=True))
    op.add_column(
        "evidence_images",
        sa.Column("overridden_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=True),
    )
    op.add_column(
        "evidence_images", sa.Column("overridden_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("evidence_images", "overridden_at")
    op.drop_column("evidence_images", "overridden_by")
    op.drop_column("evidence_images", "override_reason")
