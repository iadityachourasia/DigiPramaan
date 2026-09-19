"""MVP schema — all 12 tables (11 domain tables + reports)

Revision ID: 0001_mvp_schema
Revises:
Create Date: 2026-09-10
Rewritten: 2026-09-19 (F-004 fix — see below)

WHY THIS WAS REWRITTEN FROM create_all()/drop_all() TO EXPLICIT DDL:

This migration was originally authored calling `Base.metadata.create_all()`/
`drop_all()` against the live `app.db.models` Table objects, scoped to the
tables this project owns (see the Correction Log at the bottom of this
docstring for the original rationale). That worked for the one database that
was actually migrated with it (Supabase, incrementally, alongside every
model change) but was never actually safe: `create_all()` always reflects
whatever `app.db.models` CURRENTLY says, not a frozen snapshot of 2026-09-10.
Migrations 0002-0010 each add tables/columns/indexes via ordinary
`op.create_table`/`op.add_column`/`op.create_index` — completely reasonable
on their own — but every one of those assumed 0001 had NOT already created
what they were about to add. On a genuinely empty database, `alembic upgrade
head` collided the first time: 0002's `op.create_table("rule_explanations")`
raised `DuplicateTable`, because 0001's `create_all()` (reflecting the
CURRENT models, which by then included `RuleExplanation`) had already
created it. Confirmed live against a freshly dropped-and-recreated
`digipramaan_test`, 2026-09-19.

The already-migrated real Supabase database is completely unaffected by this
rewrite: Alembic only tracks "has revision 0001_mvp_schema run," never its
literal contents, and the revision id is unchanged.

WHAT'S IN THIS FILE vs. WHAT ISN'T: exactly the 12 tables this project owned
as of 2026-09-10, with exactly the columns/indexes that existed as of then —
NOT the current shape of any table a later migration also touches. Verified
by cross-referencing every `op.add_column`/`op.create_table`/`op.create_index`
call in 0002-0010 against the current models, table by table:
  - Tables added later, NOT here: `rule_explanations` (0002),
    `product_identifiers` (0003), `ecommerce_batches` (0004),
    `mobile_upload_sessions` (0005), `record_review_flags` (0008),
    `ocr_provider_jobs` (0010).
  - `scan_sessions`: NOT `source`/`ecommerce_listing_url`/`batch_id`
    (0004, which also owns `ix_scan_sessions_batch_id`).
  - `compliance_records`: NOT `ecommerce_listing_url` (0004), NOT
    `archived_at`/`archived_by` (0008).
  - `reports`: NOT `status`/`current_stage`/`report_format_version`/
    `pdf_sha256`/`docx_sha256`/`error_message` (0006, which also owns
    `ix_reports_status`) — this table's `status` column server-defaults to
    `'COMPLETED'` today only because 0006 added it that way; 0001 never
    defines a `status` column for `reports` at all.
  - `audit_events`: NOT `actor_role`/`region`/`record_id`/`request_id`
    (0007, which also owns `ix_audit_events_record_id` and
    `ix_audit_events_region_created_at`).
  - `evidence_images`: NOT `override_reason`/`overridden_by`/
    `overridden_at` (0009).
  - `compliance_records.evidence_bundle` (JSONB) is the one deliberate
    exception: added to the model after 2026-09-10 but never given its own
    migration (folded back into this file, per the original docstring's own
    "fold it back until a genuinely new table is needed" rule) — no later
    migration adds it, so it correctly stays here unchanged.

CIRCULAR FK: `scan_sessions.record_id` <-> `compliance_records.id` is a
genuine two-way reference (a scan produces a record; a record remembers
which scan produced it). `create_all()` resolved this automatically; explicit
DDL needs it done by hand — `scan_sessions` is created first with `record_id`
nullable and NO foreign key, `compliance_records` is created next (its own
`scan_session_id` FK to `scan_sessions` works immediately), then
`fk_scan_sessions_record_id` is added via a separate `op.create_foreign_key`
call once both tables exist. `downgrade()` drops that constraint before
dropping either table, mirroring the same names the current models already
use (`app/db/models/scan.py`'s own module docstring documents this same
circularity from the model side).

Every column/type/default/nullable/index/constraint below was generated from
the REAL current SQLAlchemy `Table` objects
(`sqlalchemy.schema.CreateTable(table).compile(dialect=postgresql.dialect())`
and `table.indexes`) with the later-added columns/tables/indexes above
mechanically removed — never hand-typed from memory, to keep transcription-
error risk low. `alembic check` (no autogenerate diff against current
models, run after 0001-0010 all apply) is the final proof this file plus
0002-0010 together reconstruct exactly today's schema, not an approximation.

Correction Log
--------------
2026-09-19 — rewritten from create_all()/drop_all() to explicit DDL (F-004
fix, `docs/internal/PRODUCTION_READINESS_STATUS_AND_ROADMAP.md` Phase R1.3).
The original create_all()-based rationale (avoiding hand-transcription
drift) is preserved in git history; it's superseded by the "generate from
real Table objects, verify with `alembic check`" approach described above,
which gets the same anti-drift guarantee without the fresh-database
collision this version fixes.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_mvp_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("department", sa.String(), nullable=True),
        sa.Column("region", sa.String(), nullable=True),
        sa.Column("jurisdiction_level", sa.String(), nullable=True),
        sa.Column("jurisdiction_name", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["id"], ["auth.users.id"]),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )

    op.create_table(
        "legal_entities",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("normalized_name", sa.String(), nullable=False),
    )
    op.create_index("ix_legal_entities_normalized_name", "legal_entities", ["normalized_name"])

    op.create_table(
        "products",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "legal_entity_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("legal_entities.id"), nullable=False,
        ),
        sa.Column("brand", sa.String(), nullable=True),
        sa.Column("generic_name", sa.String(), nullable=False),
        sa.Column("net_quantity_normalized", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("fingerprint_hash", sa.String(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.UniqueConstraint("fingerprint_hash"),
    )

    # scan_sessions: `record_id` deliberately nullable, no FK yet — see the
    # circular-FK note in this file's module docstring.
    op.create_table(
        "scan_sessions",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"), nullable=False,
        ),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("region", sa.String(), nullable=True),
        sa.Column("record_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("stages", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )

    op.create_table(
        "compliance_records",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "scan_session_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scan_sessions.id", name="fk_compliance_records_scan_session_id"),
            nullable=True,
        ),
        sa.Column("product_name_observed", sa.String(), nullable=True),
        sa.Column("manufacturer_name_observed", sa.String(), nullable=True),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("region", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("verification_status", sa.String(), nullable=False),
        sa.Column("compliance_status", sa.String(), nullable=False),
        sa.Column("compliance_score", sa.Integer(), nullable=True),
        sa.Column("compliance_band", sa.String(), nullable=True),
        sa.Column("extraction", postgresql.JSONB(), nullable=True),
        sa.Column("checklist", postgresql.JSONB(), nullable=True),
        sa.Column("violations", postgresql.JSONB(), nullable=True),
        # Phase 3 addendum (folded in, never its own migration) — see
        # module docstring.
        sa.Column("evidence_bundle", postgresql.JSONB(), nullable=True),
        sa.Column(
            "assigned_officer_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"), nullable=True,
        ),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "verified_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"), nullable=True,
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False),
    )

    # The other half of the circular FK — see module docstring.
    op.create_foreign_key(
        "fk_scan_sessions_record_id",
        "scan_sessions",
        "compliance_records",
        ["record_id"],
        ["id"],
    )

    op.create_table(
        "violation_cases",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "originating_record_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("compliance_records.id"), nullable=False,
        ),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "assigned_officer_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"), nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_one_open_case_per_record",
        "violation_cases",
        ["originating_record_id"],
        unique=True,
        postgresql_where=sa.text("status <> 'CLOSED'"),
    )

    op.create_table(
        "case_status_history",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column(
            "case_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("violation_cases.id"), nullable=False,
        ),
        sa.Column("from_status", sa.String(), nullable=True),
        sa.Column("to_status", sa.String(), nullable=False),
        sa.Column(
            "changed_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"), nullable=True,
        ),
        sa.Column(
            "changed_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column("note", sa.String(), nullable=True),
    )
    op.create_index("ix_case_status_history_case_id", "case_status_history", ["case_id"])

    op.create_table(
        "product_inspection_links",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "compliance_record_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("compliance_records.id"), nullable=False,
        ),
        sa.Column(
            "product_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"), nullable=False,
        ),
        sa.Column("match_method", sa.String(), nullable=False),
        sa.Column(
            "matched_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column("status", sa.String(), nullable=False),
    )
    op.create_index(
        "ix_product_inspection_links_product_id", "product_inspection_links", ["product_id"]
    )
    op.create_index(
        "ix_product_inspection_links_compliance_record_id",
        "product_inspection_links",
        ["compliance_record_id"],
    )

    # reports: NOT status/current_stage/report_format_version/pdf_sha256/
    # docx_sha256/error_message (0006) — see module docstring.
    op.create_table(
        "reports",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "compliance_record_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("compliance_records.id"), nullable=False,
        ),
        sa.Column("frozen_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("pdf_storage_key", sa.String(), nullable=True),
        sa.Column("docx_storage_key", sa.String(), nullable=True),
        sa.Column(
            "generated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "generated_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"), nullable=True,
        ),
    )
    op.create_index("ix_reports_compliance_record_id", "reports", ["compliance_record_id"])

    op.create_table(
        "risk_alerts",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column("subject_type", sa.String(), nullable=False),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_id", sa.String(), nullable=False),
        sa.Column("score_contribution", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("evidence_record_ids", postgresql.JSONB(), nullable=True),
        sa.Column("scope_level", sa.String(), nullable=True),
        sa.Column("scope_jurisdiction_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index("ix_risk_alerts_subject_id", "risk_alerts", ["subject_id"])

    # evidence_images: NOT override_reason/overridden_by/overridden_at
    # (0009) — see module docstring.
    op.create_table(
        "evidence_images",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column(
            "scan_session_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scan_sessions.id"), nullable=False,
        ),
        sa.Column("angle", sa.String(), nullable=False),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("content_hash", sa.String(), nullable=True),
        sa.Column("quality_result", postgresql.JSONB(), nullable=True),
        sa.Column(
            "uploaded_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index("ix_evidence_images_scan_session_id", "evidence_images", ["scan_session_id"])

    # audit_events: NOT actor_role/region/record_id/request_id (0007) —
    # see module docstring.
    op.create_table(
        "audit_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_table("audit_events")

    op.drop_index("ix_evidence_images_scan_session_id", table_name="evidence_images")
    op.drop_table("evidence_images")

    op.drop_index("ix_risk_alerts_subject_id", table_name="risk_alerts")
    op.drop_table("risk_alerts")

    op.drop_index("ix_reports_compliance_record_id", table_name="reports")
    op.drop_table("reports")

    op.drop_index(
        "ix_product_inspection_links_compliance_record_id",
        table_name="product_inspection_links",
    )
    op.drop_index("ix_product_inspection_links_product_id", table_name="product_inspection_links")
    op.drop_table("product_inspection_links")

    op.drop_index("ix_case_status_history_case_id", table_name="case_status_history")
    op.drop_table("case_status_history")

    op.drop_index("uq_one_open_case_per_record", table_name="violation_cases")
    op.drop_table("violation_cases")

    # Drop the circular FK before either table it spans.
    op.drop_constraint("fk_scan_sessions_record_id", "scan_sessions", type_="foreignkey")

    op.drop_table("compliance_records")
    op.drop_table("scan_sessions")
    op.drop_table("products")
    op.drop_index("ix_legal_entities_normalized_name", table_name="legal_entities")
    op.drop_table("legal_entities")
    op.drop_table("profiles")
