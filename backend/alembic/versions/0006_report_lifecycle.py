"""Phase 13 — add async generation lifecycle + integrity columns to
`reports` (the Advanced Regulatory Report upgrade).

Report generation moves from a single synchronous call to a real
BackgroundTasks job with a persisted status/stage, so the existing
report-progress UI can poll genuine progress instead of a faked terminal
state. `pdf_sha256`/`docx_sha256` are computed once the rendered bytes
exist and stored for the new public verification page and the Digital
Integrity report section. `report_format_version` distinguishes rows
built against the pre-Phase-13 loose-dict snapshot ("1.0", the default
for every existing row) from the new `ReportSnapshotV2` shape ("2.0").

`status` defaults to "COMPLETED" specifically so every pre-existing row
backfills correctly with no separate UPDATE — they really were
successfully generated, just under the old synchronous path. New rows
always explicitly set status="PENDING" in application code; the
server_default only ever fires for this historical backfill.

revision: 0006_report_lifecycle
down_revision: 0005_mobile_upload_sessions
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_report_lifecycle"
down_revision: Union[str, None] = "0005_mobile_upload_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column("status", sa.String(), nullable=False, server_default="COMPLETED"),
    )
    op.add_column("reports", sa.Column("current_stage", sa.String(), nullable=True))
    op.add_column(
        "reports",
        sa.Column("report_format_version", sa.String(), nullable=False, server_default="1.0"),
    )
    op.add_column("reports", sa.Column("pdf_sha256", sa.String(), nullable=True))
    op.add_column("reports", sa.Column("docx_sha256", sa.String(), nullable=True))
    op.add_column("reports", sa.Column("error_message", sa.String(), nullable=True))
    op.create_index("ix_reports_status", "reports", ["status"])


def downgrade() -> None:
    op.drop_index("ix_reports_status", table_name="reports")
    op.drop_column("reports", "error_message")
    op.drop_column("reports", "docx_sha256")
    op.drop_column("reports", "pdf_sha256")
    op.drop_column("reports", "report_format_version")
    op.drop_column("reports", "current_stage")
    op.drop_column("reports", "status")
