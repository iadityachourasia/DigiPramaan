"""
products / product_inspection_links — Product Compliance DNA's identity
model.

Matching (MVP): trusted identifier if ever present, otherwise the exact
normalized composite (legal entity + brand + generic name + normalized net
quantity) hashed into `fingerprint_hash`. No fuzzy/candidate matching for
MVP — an unmatched fingerprint simply becomes a new Product row, never a
silent merge into an existing one.

`ProductInspectionLink` is the ONLY place a ComplianceRecord's product
association lives — `compliance_records` deliberately carries no product
foreign key (see compliance_record.py's own docstring for why). `status`
distinguishes ACTIVE from SUPERSEDED so a later identity correction can
retire one link and add another without ever rewriting the frozen record it
points at.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    legal_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=False
    )
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    generic_name: Mapped[str] = mapped_column(String, nullable=False)
    net_quantity_normalized: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    # SHA-256 of the normalized composite — the MVP Level-2 match key.
    fingerprint_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ProductInspectionLink(Base):
    __tablename__ = "product_inspection_links"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    compliance_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("compliance_records.id"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    match_method: Mapped[str] = mapped_column(String, nullable=False)
    matched_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # ACTIVE | SUPERSEDED — see module docstring.
    status: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE")
