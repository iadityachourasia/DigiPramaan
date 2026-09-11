"""
Safe integration tests for bulk-mode e-commerce scanning: 3 listing URLs,
one deliberately fetch-failing, asserting the 2 succeeding ScanSessions
share one real EcommerceBatch row and the failing one never affects the
others' derived status — the same "partial failure structurally impossible
to get wrong" guarantee the original mock store's own docstring names.

Network mocked via respx; DNS resolution for the fake test domain
monkeypatched to a safe public IP (see test_ecommerce_scan_endpoint.py's
identical fixture and its own docstring on why this must NOT be global).
"""

from __future__ import annotations

import io
import socket
import uuid

import httpx
import pytest
import respx
from fastapi import BackgroundTasks
from PIL import Image

from app.api.v1.ecommerce import EcommerceBatchRequest, create_ecommerce_batch, get_ecommerce_batch
from app.core.config import get_settings
from app.core.object_storage import get_s3_client
from app.db.models import EcommerceBatch, EvidenceImage, ScanSession
from app.db.session import SessionLocal

pytestmark = pytest.mark.integration

_INSPECTOR_ID = uuid.UUID("eefbff7a-2822-4711-b4f7-d5ec5b417424")  # inspector@dp.com


class _FakeOfficer:
    def __init__(self):
        self.id = _INSPECTOR_ID
        self.role = "Enforcement Officer"
        self.region = "Maharashtra"
        self.jurisdiction_level = "State"


@pytest.fixture()
def db():
    with SessionLocal() as session:
        session.info["created_batch_ids"] = []
        session.info["created_storage_keys"] = []
        yield session
        session.rollback()

        settings = get_settings()
        s3_client = get_s3_client(settings)
        for key in session.info["created_storage_keys"]:
            try:
                s3_client.delete_object(Bucket=settings.s3_bucket, Key=key)
            except Exception:  # noqa: BLE001 - best-effort cleanup
                pass

        batch_ids = session.info["created_batch_ids"]
        if batch_ids:
            scan_ids = [
                row.id
                for row in session.query(ScanSession.id).filter(ScanSession.batch_id.in_(batch_ids)).all()
            ]
            if scan_ids:
                session.query(EvidenceImage).filter(EvidenceImage.scan_session_id.in_(scan_ids)).delete(
                    synchronize_session=False
                )
                session.query(ScanSession).filter(ScanSession.id.in_(scan_ids)).delete(
                    synchronize_session=False
                )
            session.query(EcommerceBatch).filter(EcommerceBatch.id.in_(batch_ids)).delete(
                synchronize_session=False
            )
        session.commit()


def _sharp_label_bytes(seed: int) -> bytes:
    img = Image.new("RGB", (800, 800), color=(255, 255, 255))
    pixels = img.load()
    for y in range(0, 800, 4):
        for x in range(800):
            pixels[x, y] = (0, 0, 0)
    pixels[0, 0] = (seed % 255, 0, 0)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _safe_dns(monkeypatch):
    real_getaddrinfo = socket.getaddrinfo

    def fake_getaddrinfo(host, *args, **kwargs):
        if host == "shop.example.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        return real_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


def _mock_good_listing(url: str, image_url: str, seed: int) -> None:
    html = f"""
    <html><head>
      <meta property="og:title" content="Widget {seed}">
      <meta property="og:image" content="{image_url}">
    </head><body></body></html>
    """
    respx.get(url).mock(return_value=httpx.Response(200, headers={"content-type": "text/html"}, text=html))
    respx.get(image_url).mock(
        return_value=httpx.Response(
            200, headers={"content-type": "image/jpeg"}, content=_sharp_label_bytes(seed)
        )
    )


@respx.mock
def test_batch_partial_failure_does_not_affect_other_listings(db):
    good_url_1 = "https://shop.example.com/products/widget-1"
    good_image_1 = "https://shop.example.com/images/widget-1.jpg"
    good_url_2 = "https://shop.example.com/products/widget-2"
    good_image_2 = "https://shop.example.com/images/widget-2.jpg"
    bad_url = "https://shop.example.com/products/widget-broken"

    _mock_good_listing(good_url_1, good_image_1, seed=1)
    _mock_good_listing(good_url_2, good_image_2, seed=2)
    respx.get(bad_url).mock(return_value=httpx.Response(404))

    payload = EcommerceBatchRequest(
        sourceUrl="https://shop.example.com/category/widgets",
        selectedUrls=[good_url_1, bad_url, good_url_2],
        category="Packaged Food",
        region="Maharashtra",
    )
    result = create_ecommerce_batch(
        payload,
        background_tasks=BackgroundTasks(),
        current_user=_FakeOfficer(),
        db=db,
        settings=get_settings(),
    )

    batch_id = uuid.UUID(result["batch"]["id"])
    db.info["created_batch_ids"].append(batch_id)

    # Exactly 2 ScanSessions — the failing URL produced none.
    sessions = db.query(ScanSession).filter(ScanSession.batch_id == batch_id).all()
    assert len(sessions) == 2
    listing_urls = {s.ecommerce_listing_url for s in sessions}
    assert listing_urls == {good_url_1, good_url_2}
    for session in sessions:
        assert session.source == "E-commerce-Sourced"

    for session in sessions:
        images = db.query(EvidenceImage).filter(EvidenceImage.scan_session_id == session.id).all()
        db.info["created_storage_keys"].extend(img.storage_key for img in images)

    # GET /ecommerce/batch/{id}'s own derived-status view agrees.
    fetched = get_ecommerce_batch(batch_id, db=db, _current_user=_FakeOfficer())
    assert len(fetched["batch"]["listings"]) == 2
    assert {listing["listingUrl"] for listing in fetched["batch"]["listings"]} == {good_url_1, good_url_2}
    assert all(listing["status"] == "scanning" for listing in fetched["batch"]["listings"])


def test_get_batch_404_for_unknown_id(db):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        get_ecommerce_batch(uuid.uuid4(), db=db, _current_user=_FakeOfficer())
    assert exc_info.value.status_code == 404
