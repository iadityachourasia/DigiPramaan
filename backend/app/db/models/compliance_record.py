"""
compliance_records — the frozen legal artifact.

DELIBERATELY NO PRODUCT FOREIGN KEY. A record's product association is
resolved exclusively through `product_inspection_links` (see product.py) —
never a column here. A stored FK would need updating whenever an officer
corrects a mistaken product match, which is exactly the "rewrite the
verified record" risk this design avoids: correcting identity inserts a new
link and supersedes the old one, and this table is never touched by that.

Immutability (enforced at the application layer, not a DB trigger, given the
MVP timeline): before `verification_status` becomes "Verified", corrections
may update `extraction`/`checklist`/`violations` and re-run rules freely.
Once Verified, the API layer must refuse further writes to those columns —
a later correction or reinspection creates a NEW ComplianceRecord (via a new
ScanSession) rather than mutating this row. `archived` is the one exception,
since archiving is a visibility toggle, not a rewrite of what was decided.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ComplianceRecord(Base):
    __tablename__ = "compliance_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    # Named for the same reason as scan_sessions.record_id's FK: these two
    # columns form a circular reference between the two tables, which
    # drop_all() can only break via a named DROP CONSTRAINT.
    scan_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scan_sessions.id", name="fk_compliance_records_scan_session_id"),
        nullable=True,
    )

    # Observed-as-extracted text only — frozen snapshot of what the package
    # said, never a live pointer to canonical identity.
    product_name_observed: Mapped[str | None] = mapped_column(String, nullable=True)
    manufacturer_name_observed: Mapped[str | None] = mapped_column(String, nullable=True)

    category: Mapped[str | None] = mapped_column(String, nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False, default="Officer-Scanned")
    # Set only when source == "E-commerce-Sourced" — the listing page this
    # record's evidence images came from (Phase 9).
    ecommerce_listing_url: Mapped[str | None] = mapped_column(String, nullable=True)

    verification_status: Mapped[str] = mapped_column(String, nullable=False, default="Extracted")
    compliance_status: Mapped[str] = mapped_column(String, nullable=False, default="Pending")
    compliance_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    compliance_band: Mapped[str | None] = mapped_column(String, nullable=True)

    # ExtractionResult-shaped, DeclarationCheck[]-shaped, Violation[]-shaped
    # respectively — matching the existing frontend types exactly so the
    # checklist/violation-summary UI renders unmodified.
    extraction: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checklist: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    violations: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # The full internal ComplianceEvidenceBundle (StructuredExtraction with
    # manufacturer/packer/importer/brand_owner_or_marketer kept SEPARATE,
    # unlike `extraction`'s collapsed display shape) — persisted so an
    # officer correction can re-run the full rule engine without redoing
    # OCR. Subject to the same application-layer immutability rule as
    # extraction/checklist/violations above.
    evidence_bundle: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    assigned_officer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    scanned_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
    verified_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # migration 0008 (Phase 1.3) — who archived this record and when, kept
    # alongside the pre-existing `archived` fast-filter boolean so the
    # action is attributable, the same "who and when, not just what"
    # discipline audit_events already applies elsewhere.
    archived_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    archived_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True
    )
