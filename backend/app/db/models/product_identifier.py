"""
product_identifiers — Phase 8's trusted barcode/GTIN identity table.

`normalized_value` (the GTIN-14 padded form, see services/barcode/normalize.py)
is globally unique: a real barcode identifies exactly one Product, never two —
this is what `resolve_product()` (product_dna/identity.py) looks up before
falling back to the composite-fingerprint match already in `Product`.
`checksum_valid` is always True for a row that exists here — an
invalid-checksum decode is never promoted to a trusted identifier or given a
row in this table, it stays evidence-only inside the record's own
`evidence_bundle.barcode_analysis` (see extraction/schema.py).
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ProductIdentifier(Base):
    __tablename__ = "product_identifiers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    # "EAN_13" | "EAN_8" | "UPC_A" | "UPC_E" | "ITF" — the symbology first
    # seen for this identifier (informational; lookups always key off
    # normalized_value, which is symbology-independent).
    identifier_type: Mapped[str] = mapped_column(String, nullable=False)
    # GTIN-14, left-zero-padded — the canonical, globally-unique lookup key.
    normalized_value: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    raw_value: Mapped[str] = mapped_column(String, nullable=False)
    checksum_valid: Mapped[bool] = mapped_column(Boolean, nullable=False)
    first_seen_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
