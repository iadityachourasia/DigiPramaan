"""
api/v1/products.py — GET /products/{id}/dna, Product Compliance DNA's one
read endpoint. Any authenticated user may read it (matches the existing
GET /scans/{id}/pipeline precedent — no domain-specific permission gate on
a read-only intelligence view); jurisdiction scoping (app.services.scope)
narrows what it actually shows.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from app.api.deps.auth import get_current_user
from app.db.models import Profile
from app.db.session import get_db
from app.services.product_dna.dna import build_product_dna

router = APIRouter(tags=["products"], prefix="/products")


@router.get("/{product_id}/dna")
def get_product_dna(
    product_id: uuid.UUID,
    db: DbSession = Depends(get_db),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    dna = build_product_dna(product_id, db, current_user)
    if dna is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return dna
