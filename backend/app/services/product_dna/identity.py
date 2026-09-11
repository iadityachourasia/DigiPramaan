"""
product_dna/identity.py — Product Compliance DNA's identity resolution.

Matching tiers, exactly per the existing product.py model's own docstring:

1. Trusted barcode/GTIN, if a checksum-valid one was decoded (Phase 8 —
   see services/barcode/'s own docstrings for how that value is decided;
   it is NEVER Gemini-decided). Looked up in `ProductIdentifier` by its
   normalized (GTIN-14) value; on a hit, `match_method="TRUSTED_IDENTIFIER"`.
   On a miss (first sighting of this barcode), falls through to tier 2 to
   determine the Product, then attaches the identifier for every future
   sighting — `match_method` still reports what tier 2 actually did
   (`COMPOSITE_FINGERPRINT`/`NEW_PRODUCT`), staying honest about how THIS
   particular call was resolved rather than overclaiming trust on a first
   sighting.
2. Otherwise, the exact normalized composite (legal entity + brand +
   generic name + normalized net quantity), hashed into a SHA-256
   fingerprint. No fuzzy/candidate matching for MVP.
3. Otherwise, a new Product row (`match_method="NEW_PRODUCT"`) — never a
   silent merge into an existing, uncertain match.

No fuzzy automatic merge anywhere in this file, in either tier.

ComplianceRecord carries no product FK (see its own docstring) — the ONLY
place this association lives is `ProductInspectionLink`.
"""

from __future__ import annotations

import datetime
import hashlib
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import LegalEntity, Product, ProductIdentifier
from app.services.barcode.types import BarcodeDecodeResult
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
    trusted_identifier: BarcodeDecodeResult | None = None,
) -> tuple[Product, str]:
    """Returns (product, match_method). `match_method` is one of
    "TRUSTED_IDENTIFIER" (an existing `ProductIdentifier` row matched),
    "COMPOSITE_FINGERPRINT" (matched an existing product by the tier-2
    composite), or "NEW_PRODUCT" (created one).

    `trusted_identifier`, when passed (a checksum-valid, already-resolved
    `BarcodeDecodeResult` — see services/barcode/resolve.py), is looked up
    first. A hit skips the composite path entirely, per this module's own
    "no fuzzy automatic merge" rule — a real barcode match is exact, not a
    signal to blend into. A miss falls through to the unchanged composite
    logic below, then attaches the identifier to whichever product that
    resolves to, so the SAME barcode seen again always hits this fast path.

    Race safety (composite path, unchanged): `Product.fingerprint_hash` has
    a real DB unique constraint. Two near-simultaneous verifications of the
    same new product would otherwise both try to insert the same
    fingerprint — the loser's insert is wrapped in `db.begin_nested()` (a
    Postgres SAVEPOINT), so an IntegrityError here rolls back ONLY that
    failed insert attempt, never the caller's already-committed
    verification or any other pending work on this same `db` session. A
    bare `db.rollback()` would have discarded all of that too, which is
    exactly what this avoids. The same savepoint discipline covers the new
    `ProductIdentifier` insert below, guarding its own unique constraint on
    `normalized_value` against the identical race.
    """
    if trusted_identifier is not None:
        existing_identifier = (
            db.query(ProductIdentifier)
            .filter(ProductIdentifier.normalized_value == trusted_identifier.normalized_value)
            .first()
        )
        if existing_identifier is not None:
            existing_identifier.last_seen_at = datetime.datetime.now(datetime.timezone.utc)
            product = db.get(Product, existing_identifier.product_id)
            if product is not None:
                return product, "TRUSTED_IDENTIFIER"
            # The identifier row outlived its product somehow (should not
            # happen — no cascade delete exists) — fall through to the
            # composite path rather than raise, so a corrupted identity
            # link can never block a legitimate inspection from resolving.

    net_quantity_normalized = normalize_net_quantity(net_quantity_raw)
    fingerprint = compute_fingerprint(legal_entity_id, brand, generic_name, net_quantity_normalized)

    existing = db.query(Product).filter(Product.fingerprint_hash == fingerprint).first()
    if existing is not None:
        product, match_method = existing, "COMPOSITE_FINGERPRINT"
    else:
        product_row = Product(
            legal_entity_id=legal_entity_id,
            brand=brand,
            generic_name=generic_name,
            net_quantity_normalized=net_quantity_normalized,
            category=category,
            fingerprint_hash=fingerprint,
        )
        try:
            with db.begin_nested():
                db.add(product_row)
                db.flush()
            product, match_method = product_row, "NEW_PRODUCT"
        except IntegrityError:
            existing = db.query(Product).filter(Product.fingerprint_hash == fingerprint).first()
            if existing is None:
                raise  # a genuinely different failure — do not mask it as a race
            product, match_method = existing, "COMPOSITE_FINGERPRINT"

    if trusted_identifier is not None:
        try:
            with db.begin_nested():
                db.add(ProductIdentifier(
                    product_id=product.id,
                    identifier_type=trusted_identifier.symbology,
                    normalized_value=trusted_identifier.normalized_value,
                    raw_value=trusted_identifier.raw_value,
                    checksum_valid=True,
                ))
                db.flush()
        except IntegrityError:
            # A concurrent call already attached this exact identifier
            # (same race the composite path guards against) — the value is
            # now recorded either way, nothing further to do.
            pass

    return product, match_method
