"""
Safe integration tests for the real E-commerce Listing Scanner backend
(Phase 9): a real `POST /ecommerce/scan`-equivalent call against a fetched
(mocked-over-respx) listing page, uploading real images to B2 and creating
a real ScanSession/EvidenceImage row set — and the security-critical
negative case: an SSRF attempt creates NOTHING.

Network is mocked via respx (no real third-party site — deterministic,
matching this project's own dev-loop discipline), with `socket.getaddrinfo`
monkeypatched so `ssrf_guard`'s real DNS-resolution check sees a safe
public IP for the fake test domain. `create_ecommerce_scan` is called
directly (not over real HTTP), same style every other integration test in
this suite already uses (`create_own_rows_and_clean_up`).
"""

from __future__ import annotations

import io
import socket
import uuid

import httpx
import pytest
import respx
from fastapi import BackgroundTasks, HTTPException
from PIL import Image

from app.api.v1.ecommerce import EcommerceScanRequest, create_ecommerce_scan
from app.core.config import get_settings
from app.core.object_storage import get_s3_client
from app.db.models import EvidenceImage, ScanSession
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
        session.info["created_scan_ids"] = []
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

        scan_ids = session.info["created_scan_ids"]
        if scan_ids:
            session.query(EvidenceImage).filter(EvidenceImage.scan_session_id.in_(scan_ids)).delete(
                synchronize_session=False
            )
            session.query(ScanSession).filter(ScanSession.id.in_(scan_ids)).delete(synchronize_session=False)
        session.commit()


def _sharp_label_bytes() -> bytes:
    img = Image.new("RGB", (800, 800), color=(255, 255, 255))
    pixels = img.load()
    for y in range(0, 800, 4):
        for x in range(800):
            pixels[x, y] = (0, 0, 0)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _safe_dns(monkeypatch):
    """Only fakes resolution for this test's own fake domains — every other
    hostname (critically, the real Supabase Postgres pooler this same test
    connects to) falls through to the REAL socket.getaddrinfo. An
    unconditional fake would silently break the real DB connection."""
    real_getaddrinfo = socket.getaddrinfo

    def fake_getaddrinfo(host, *args, **kwargs):
        if host == "internal.evil.example":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 0))]
        if host == "shop.example.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        return real_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


@respx.mock
def test_real_ecommerce_scan_creates_session_and_evidence_images(db):
    listing_url = "https://shop.example.com/products/real-widget"
    image_url = "https://shop.example.com/images/widget.jpg"
    html = f"""
    <html><head>
      <meta property="og:title" content="Integration Test Widget">
      <meta property="og:description" content="A widget for testing.">
      <meta property="og:image" content="{image_url}">
    </head><body></body></html>
    """
    respx.get(listing_url).mock(
        return_value=httpx.Response(200, headers={"content-type": "text/html"}, text=html)
    )
    respx.get(image_url).mock(
        return_value=httpx.Response(
            200, headers={"content-type": "image/jpeg"}, content=_sharp_label_bytes()
        )
    )

    payload = EcommerceScanRequest(url=listing_url, category="Packaged Food", region="Maharashtra")
    result = create_ecommerce_scan(
        payload,
        background_tasks=BackgroundTasks(),  # never awaited — run_pipeline deliberately never executes here
        current_user=_FakeOfficer(),
        db=db,
        settings=get_settings(),
    )

    assert result["id"]
    scan_id = uuid.UUID(result["id"])
    db.info["created_scan_ids"].append(scan_id)

    session = db.get(ScanSession, scan_id)
    assert session is not None
    assert session.source == "E-commerce-Sourced"
    assert session.ecommerce_listing_url == listing_url

    images = db.query(EvidenceImage).filter(EvidenceImage.scan_session_id == scan_id).all()
    assert len(images) == 1
    assert images[0].angle == "front"
    db.info["created_storage_keys"].extend(img.storage_key for img in images)

    # Confirm the upload is real — fetch it back from B2.
    s3_client = get_s3_client(get_settings())
    obj = s3_client.get_object(Bucket=get_settings().s3_bucket, Key=images[0].storage_key)
    assert obj["Body"].read() == _sharp_label_bytes()


@respx.mock
def test_ssrf_attempt_creates_no_scan_session(db):
    """The security-critical assertion: a URL that resolves to a
    disallowed address must be rejected BEFORE any ScanSession row is
    created — not merely fail later."""
    evil_url = "http://internal.evil.example/secret"

    before_count = db.query(ScanSession).filter(ScanSession.ecommerce_listing_url == evil_url).count()

    payload = EcommerceScanRequest(url=evil_url, category="Packaged Food", region="Maharashtra")
    with pytest.raises(HTTPException) as exc_info:
        create_ecommerce_scan(
            payload,
            background_tasks=BackgroundTasks(),
            current_user=_FakeOfficer(),
            db=db,
            settings=get_settings(),
        )

    assert exc_info.value.status_code == 422
    after_count = db.query(ScanSession).filter(ScanSession.ecommerce_listing_url == evil_url).count()
    assert after_count == before_count == 0
