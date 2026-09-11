"""
Safe integration tests for Phase 8's barcode pipeline: real B2-stored images
decoded via the real `detect_barcodes()` I/O path (full-image and cropped-
candidate), real Product DNA trusted-identifier resolution against the real
dev DB, and real `GET /records?barcode=...` search under
`apply_officer_scope()` — including cross-jurisdiction isolation.

Same create-own-rows-and-clean-up discipline as every other integration
test in this suite. Calls service/route functions directly, not over HTTP.
"""

from __future__ import annotations

import datetime
import io
import uuid

import numpy as np
import pytest
import zxingcpp
from PIL import Image

from app.api.v1.records import list_records
from app.core.config import get_settings
from app.core.object_storage import get_s3_client
from app.db.models import (
    ComplianceRecord,
    LegalEntity,
    Product,
    ProductIdentifier,
    ProductInspectionLink,
    Profile,
)
from app.db.session import SessionLocal
from app.services.barcode import detect_barcodes, resolve_barcode_analysis
from app.services.barcode.types import BarcodeDecodeResult
from app.services.product_dna.identity import resolve_product

pytestmark = pytest.mark.integration

_INSPECTOR_ID = uuid.UUID("eefbff7a-2822-4711-b4f7-d5ec5b417424")  # inspector@dp.com — Enforcement Officer, Maharashtra, State


class _FakeOfficer:
    def __init__(self, officer_id: uuid.UUID, region: str):
        self.id = officer_id
        self.role = "Enforcement Officer"
        self.region = region
        self.jurisdiction_level = "State"


@pytest.fixture()
def db():
    with SessionLocal() as session:
        session.info["created_record_ids"] = []
        session.info["created_storage_keys"] = []
        session.info["created_product_ids"] = []
        session.info["created_legal_entity_ids"] = []
        yield session
        session.rollback()

        settings = get_settings()
        s3_client = get_s3_client(settings)
        for key in session.info["created_storage_keys"]:
            try:
                s3_client.delete_object(Bucket=settings.s3_bucket, Key=key)
            except Exception:  # noqa: BLE001 - best-effort cleanup
                pass

        record_ids = session.info["created_record_ids"]
        if record_ids:
            session.query(ProductInspectionLink).filter(
                ProductInspectionLink.compliance_record_id.in_(record_ids)
            ).delete(synchronize_session=False)
            session.query(ComplianceRecord).filter(ComplianceRecord.id.in_(record_ids)).delete(
                synchronize_session=False
            )

        product_ids = session.info["created_product_ids"]
        if product_ids:
            session.query(ProductIdentifier).filter(ProductIdentifier.product_id.in_(product_ids)).delete(
                synchronize_session=False
            )
            session.query(Product).filter(Product.id.in_(product_ids)).delete(synchronize_session=False)

        legal_entity_ids = session.info["created_legal_entity_ids"]
        if legal_entity_ids:
            session.query(LegalEntity).filter(LegalEntity.id.in_(legal_entity_ids)).delete(
                synchronize_session=False
            )
        session.commit()


def _inspector(db) -> Profile:
    return db.get(Profile, _INSPECTOR_ID)


def _search(db, current_user, **overrides) -> dict:
    kwargs = dict(
        query=None, categories=[], regions=[], statuses=[], sources=[], manufacturers=[],
        violation_category_ids=[], date_from=None, date_to=None, brand=None, legal_entity=None,
        barcode=None, page=1, page_size=20,
    )
    kwargs.update(overrides)
    return list_records(db=db, current_user=current_user, **kwargs)


def _real_ean13_image_bytes(value: str, *, on_canvas: bool = False) -> bytes:
    """Generates a real, scannable EAN-13 barcode image via zxing-cpp's own
    encoder — the same library this pipeline decodes with, so this proves
    the actual decode path works against real barcode pixels, not a stub."""
    bc = zxingcpp.create_barcode(value[:-1], format=zxingcpp.EAN13)
    zimg = zxingcpp.write_barcode_to_image(bc, size_hint=400)
    arr = np.array(zimg)
    gray = arr[:, :, 0] if arr.ndim == 3 else arr

    if on_canvas:
        h, w = gray.shape[:2]
        canvas = np.full((900, 900), 255, dtype=np.uint8)
        canvas[300 : 300 + h, 200 : 200 + w] = gray
        pixels = canvas
    else:
        pixels = gray

    buf = io.BytesIO()
    Image.fromarray(pixels).save(buf, format="PNG")
    return buf.getvalue()


def _upload(db, image_bytes: bytes, *, unique: str) -> str:
    settings = get_settings()
    storage_key = f"evidence/test-barcode-{unique}.png"
    get_s3_client(settings).put_object(Bucket=settings.s3_bucket, Key=storage_key, Body=image_bytes)
    db.info["created_storage_keys"].append(storage_key)
    return storage_key


def _fetch(db, storage_key: str) -> bytes:
    settings = get_settings()
    return get_s3_client(settings).get_object(Bucket=settings.s3_bucket, Key=storage_key)["Body"].read()


# --- (1) valid EAN-13 from full image, via a real B2 round trip ----------


def test_full_image_decode_from_real_b2_image(db):
    unique = uuid.uuid4().hex[:8]
    image_bytes = _real_ean13_image_bytes("8901234567814")
    storage_key = _upload(db, image_bytes, unique=unique)

    results = detect_barcodes(_fetch(db, storage_key), image_id="img-1", angle="front")
    full_image_hits = [r for r in results if r.detection_method == "full_image"]
    assert len(full_image_hits) == 1
    assert full_image_hits[0].raw_value == "8901234567814"
    assert full_image_hits[0].checksum_valid is True
    assert full_image_hits[0].normalized_value == "08901234567814"


# --- (2) valid EAN-13 from a detected crop (barcode is a small region of a larger photo) --


def test_cropped_candidate_decode_from_real_b2_image(db):
    unique = uuid.uuid4().hex[:8]
    image_bytes = _real_ean13_image_bytes("8901234567814", on_canvas=True)
    storage_key = _upload(db, image_bytes, unique=unique)

    results = detect_barcodes(_fetch(db, storage_key), image_id="img-2", angle="back")
    crop_hits = [r for r in results if r.detection_method == "cropped_candidate"]
    assert len(crop_hits) >= 1
    assert crop_hits[0].raw_value == "8901234567814"
    assert crop_hits[0].checksum_valid is True
    assert crop_hits[0].bbox is not None
    # bbox should land roughly where the barcode was pasted (200-652, 300-520)
    x0, y0, x1, y1 = crop_hits[0].bbox
    assert 100 < x0 < 300
    assert 250 < y0 < 350


# --- (3) invalid checksum is never trusted --------------------------------


def test_corrupted_barcode_checksum_not_valid(db):
    unique = uuid.uuid4().hex[:8]
    # A real, scannable barcode whose text is a valid EAN-13 as printed —
    # then flip a digit in the decoded text to simulate a corrupted read
    # and confirm resolve_barcode_analysis correctly rejects it.
    image_bytes = _real_ean13_image_bytes("8901234567814")
    storage_key = _upload(db, image_bytes, unique=unique)
    results = detect_barcodes(_fetch(db, storage_key), image_id="img-3", angle="front")
    real_hit = results[0]
    corrupted = real_hit.model_copy(update={"raw_value": "8901234567810", "checksum_valid": False})
    analysis = resolve_barcode_analysis([corrupted])
    assert analysis.status == "none"
    assert analysis.trusted_identifier is None


# --- (9) valid barcode drives exact Product DNA match ---------------------


def test_trusted_identifier_drives_exact_product_match(db):
    unique = uuid.uuid4().hex[:8]
    legal_entity = LegalEntity(name=f"Barcode Test Mfr {unique}", normalized_name=f"barcode test mfr {unique}")
    db.add(legal_entity)
    db.flush()
    db.info["created_legal_entity_ids"].append(legal_entity.id)

    trusted = BarcodeDecodeResult(
        raw_value="8901234567814", normalized_value="08901234567814", symbology="EAN_13",
        checksum_valid=True, source_image_id="img-1", source_angle="front",
        bbox=None, decoder="zxing_full_image", detection_method="full_image",
    )

    # First sighting: resolves via composite (real product data), then
    # attaches the identifier for next time.
    product1, method1 = resolve_product(
        legal_entity.id, "Test Brand", f"Test Product {unique}", "500 g", "Packaged Food", db,
        trusted_identifier=trusted,
    )
    db.info["created_product_ids"].append(product1.id)
    db.commit()
    assert method1 in ("NEW_PRODUCT", "COMPOSITE_FINGERPRINT")

    identifier_row = (
        db.query(ProductIdentifier).filter(ProductIdentifier.normalized_value == "08901234567814").first()
    )
    assert identifier_row is not None
    assert identifier_row.product_id == product1.id

    # Second sighting of the SAME barcode, with deliberately DIFFERENT
    # composite fields (simulating OCR noise on a re-scan) — must still
    # resolve to the exact same Product via the trusted identifier, not a
    # new composite fingerprint.
    product2, method2 = resolve_product(
        legal_entity.id, "Different Brand Text", f"Different Name {unique}", "999 g", "Packaged Food", db,
        trusted_identifier=trusted,
    )
    db.commit()
    assert method2 == "TRUSTED_IDENTIFIER"
    assert product2.id == product1.id


# --- (10) barcode search retrieves historical product/record -------------


def test_barcode_search_retrieves_correct_record_and_respects_scope(db):
    unique = uuid.uuid4().hex[:8]
    legal_entity = LegalEntity(name=f"Barcode Search Mfr {unique}", normalized_name=f"barcode search mfr {unique}")
    db.add(legal_entity)
    db.flush()
    db.info["created_legal_entity_ids"].append(legal_entity.id)

    product = Product(
        legal_entity_id=legal_entity.id, brand="Test Brand", generic_name=f"Barcode Search Product {unique}",
        net_quantity_normalized="500g", category="Packaged Food",
        fingerprint_hash=f"test-fingerprint-{unique}",
    )
    db.add(product)
    db.flush()
    db.info["created_product_ids"].append(product.id)

    # A realistic all-digit GTIN-14 test value — `unique` is a hex string
    # (uuid4().hex), so it's mapped to digits only, never letters, to stay
    # a plausible barcode value rather than an unrealistic mixed string.
    digit_suffix = "".join(str(int(c, 16) % 10) for c in unique[:6])
    normalized_value = f"0890123{digit_suffix}9"
    db.add(ProductIdentifier(
        product_id=product.id, identifier_type="EAN_13",
        normalized_value=normalized_value, raw_value=normalized_value.lstrip("0") or "0",
        checksum_valid=True,
    ))

    record = ComplianceRecord(
        product_name_observed=f"Barcode Search Product {unique}",
        manufacturer_name_observed=f"Barcode Search Mfr {unique}",
        category="Packaged Food", region="Maharashtra", source="Officer-Scanned",
        verification_status="Verified", compliance_status="Compliant",
        compliance_score=100, compliance_band="Excellent", checklist=[], violations=[],
        assigned_officer_id=_INSPECTOR_ID, verified_by=_INSPECTOR_ID,
        verified_at=datetime.datetime.now(datetime.timezone.utc),
        scanned_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(record)
    db.flush()
    db.info["created_record_ids"].append(record.id)
    db.add(ProductInspectionLink(
        compliance_record_id=record.id, product_id=product.id,
        match_method="TRUSTED_IDENTIFIER", status="ACTIVE",
    ))
    db.commit()

    # Search by a prefix of the printed digits — matches raw_value.
    search_digits = normalized_value.lstrip("0")[:6]
    body = _search(db, _inspector(db), barcode=search_digits)
    ids = {r["id"] for r in body["rows"]}
    assert str(record.id) in ids

    # Cross-jurisdiction: a Delhi-scoped officer must never find it.
    outsider = _FakeOfficer(uuid.uuid4(), region="Delhi")
    body_outsider = _search(db, outsider, barcode=search_digits)
    assert str(record.id) not in {r["id"] for r in body_outsider["rows"]}
