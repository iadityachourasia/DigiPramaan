"""
product_dna/identity.py — Product Compliance DNA's identity resolution.

Matching tiers, exactly per the existing product.py model's own docstring
(this module implements what that docstring already promised, unchanged):

1. Trusted barcode/GTIN/SKU, if available. NOT implemented — no barcode/
   GTIN/SKU is extracted anywhere in the OCR/extraction pipeline today
   (StructuredExtraction has no such field). Real barcode reading is real
   new OCR/vision work, out of scope for this phase. `match_method`
   reserves the string "TRUSTED_IDENTIFIER" for when that exists; no code
   path produces it yet — documented honestly, not silently faked.
2. Otherwise, the exact normalized composite (legal entity + brand +
   generic name + normalized net quantity), hashed into a SHA-256
   fingerprint. No fuzzy/candidate matching for MVP.
3. Otherwise, a new Product row (`match_method="NEW_PRODUCT"`) — never a
   silent merge into an existing, uncertain match.

ComplianceRecord carries no product FK (see its own docstring) — the ONLY
place this association lives is `ProductInspectionLink`.
"""

from __future__ import annotations

import hashlib
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import LegalEntity, Product
from app.services.normalization import normalize_net_quantity, normalize_text


def resolve_legal_entity(name: str, db: Session) -> LegalEntity:
    """Exact-normalized-name match only (no fuzzy merge — same discipline
    as Product identity). LegalEntity.normalized_name has no unique DB
    constraint (see the model's own docstring), so this is a plain lookup-
    then-insert without a savepoint/race guard — a rare duplicate row from
    a genuine concurrent first-sighting is a known, accepted MVP gap, not
    silently swallowed: it would simply mean two LegalEntity rows for the
    same real company until a future migration adds the constraint."""
    normalized = normalize_text(name)
    existing = db.query(LegalEntity).filter(LegalEntity.normalized_name == normalized).first()
    if existing is not None:
        return existing
    entity = LegalEntity(name=name, normalized_name=normalized)
    db.add(entity)
    db.flush()
    return entity


def compute_fingerprint(
    legal_entity_id: uuid.UUID, brand: str | None, generic_name: str, net_quantity_normalized: str
) -> str:
    composite = "|".join([
        str(legal_entity_id),
        normalize_text(brand) if brand else "",
        normalize_text(generic_name),
        net_quantity_normalized,
    ])
    return hashlib.sha256(composite.encode("utf-8")).hexdigest()


def resolve_product(
    legal_entity_id: uuid.UUID,
    brand: str | None,
    generic_name: str,
    net_quantity_raw: str,
    category: str | None,
    db: Session,
) -> tuple[Product, str]:
    """Returns (product, match_method). `match_method` is one of
    "COMPOSITE_FINGERPRINT" (matched an existing product) or "NEW_PRODUCT"
    (created one) — "TRUSTED_IDENTIFIER" is reserved, see module docstring.

    Race safety: `Product.fingerprint_hash` has a real DB unique
    constraint. Two near-simultaneous verifications of the same new
    product would otherwise both try to insert the same fingerprint — the
    loser's insert is wrapped in `db.begin_nested()` (a Postgres SAVEPOINT),
    so an IntegrityError here rolls back ONLY that failed insert attempt,
    never the caller's already-committed verification or any other
    pending work on this same `db` session. A bare `db.rollback()` would
    have discarded all of that too, which is exactly what this avoids.
    """
    net_quantity_normalized = normalize_net_quantity(net_quantity_raw)
    fingerprint = compute_fingerprint(legal_entity_id, brand, generic_name, net_quantity_normalized)

    existing = db.query(Product).filter(Product.fingerprint_hash == fingerprint).first()
    if existing is not None:
        return existing, "COMPOSITE_FINGERPRINT"

    product = Product(
        legal_entity_id=legal_entity_id,
        brand=brand,
        generic_name=generic_name,
        net_quantity_normalized=net_quantity_normalized,
        category=category,
        fingerprint_hash=fingerprint,
    )
    try:
        with db.begin_nested():
            db.add(product)
            db.flush()
    except IntegrityError:
        existing = db.query(Product).filter(Product.fingerprint_hash == fingerprint).first()
        if existing is not None:
            return existing, "COMPOSITE_FINGERPRINT"
        raise  # a genuinely different failure — do not mask it as a race
    return product, "NEW_PRODUCT"
