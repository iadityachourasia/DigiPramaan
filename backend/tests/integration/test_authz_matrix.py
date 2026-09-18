"""
Integration test: the fail-closed jurisdiction/object-authorization matrix
(Phase 1.1, F-001).

Runs ONLY against a dedicated, disposable `TEST_DATABASE_URL` — never the
shared `DATABASE_URL` — since this test inserts and deletes real
`profiles`/`compliance_records`/`scan_sessions`/`violation_cases`/
`ecommerce_batches` rows. Skips (not fails) when no such URL is
configured, the same discipline `test_alembic_roundtrip.py`'s own
`test_fresh_database_upgrades_to_head_and_matches_models` already
established — this is NOT the `ALLOW_DESTRUCTIVE_DB_TESTS` fallback,
because writing test rows (not tearing down the whole schema) is a much
smaller risk, but still one this test refuses to take against the shared
database under any circumstance.

Exercises the REAL FastAPI app end-to-end — TestClient -> real HTTP
request -> a locally HS256-signed token (the same technique
tests/unit/test_security.py already uses, signed with this environment's
own `supabase_jwt_secret` — never a real Supabase network call) ->
`app.api.deps.auth.get_current_user` -> a real Postgres query — which is
what actually proves `services/authz/repositories.py`'s SQL-level
`record_visibility_filter` predicate executes correctly against a real
database. A mocked-session unit test (tests/unit/test_records_endpoint.py
etc.) cannot prove that; it only proves the Python control flow around a
pre-decided mock return value.
"""

from __future__ import annotations

import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.models import (
    ComplianceRecord,
    EcommerceBatch,
    EvidenceImage,
    LegalEntity,
    Product,
    ProductInspectionLink,
    Profile,
    Report,
    ScanSession,
    ViolationCase,
)
from app.db.models.user_profile import auth_users
from app.db.session import SessionLocal
from app.jobs.pipeline import initial_stages_pending_capture
from app.main import create_app

pytestmark = pytest.mark.integration

RUN_ID = uuid.uuid4().hex[:8]


def _skip_unless_disposable_test_db() -> None:
    settings = get_settings()
    if not settings.test_database_url:
        pytest.skip(
            "Requires a dedicated, disposable TEST_DATABASE_URL — this test writes real "
            "profiles/compliance_records rows and must never run against the shared database."
        )
    if settings.test_database_url != settings.database_url:
        pytest.skip(
            "TEST_DATABASE_URL is configured but DATABASE_URL points somewhere else — "
            "SessionLocal (app.db.session) always connects via DATABASE_URL, so this test "
            "only runs meaningfully when both env vars point at the same disposable database "
            "(matches how this suite is invoked: DATABASE_URL=TEST_DATABASE_URL=<local test db>)."
        )


def _mint_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "aud": "authenticated",
        "iat": now,
        "exp": now + 3600,
    }
    return jwt.encode(claims, settings.supabase_jwt_secret, algorithm="HS256")


def _auth_headers(user_id: uuid.UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {_mint_token(user_id)}"}


class _Fixture:
    """Everything the matrix below needs, created once and torn down once.
    Two regions (Maharashtra, Delhi), five viewers spanning every
    role/jurisdiction combination the matrix exercises, one compliance
    record per region (each with a distinct assigned officer), one case,
    one draft scan session, and one e-commerce batch."""

    def __init__(self) -> None:
        self.db = SessionLocal()
        self.profile_ids: list[uuid.UUID] = []
        self.record_ids: list[uuid.UUID] = []
        self.case_ids: list[uuid.UUID] = []
        self.scan_session_ids: list[uuid.UUID] = []
        self.batch_ids: list[uuid.UUID] = []
        self.report_ids: list[uuid.UUID] = []
        self.evidence_image_ids: list[uuid.UUID] = []
        self.product_link_ids: list[uuid.UUID] = []
        self.product_ids: list[uuid.UUID] = []
        self.legal_entity_ids: list[uuid.UUID] = []

    def _make_profile(self, *, role: str, jurisdiction_level: str, region: str | None) -> uuid.UUID:
        user_id = uuid.uuid4()
        self.db.execute(auth_users.insert().values(id=user_id))
        profile = Profile(
            id=user_id,
            username=f"authz-{RUN_ID}-{len(self.profile_ids)}",
            email=f"authz-{RUN_ID}-{len(self.profile_ids)}@example.invalid",
            full_name="Authz Matrix Test",
            role=role,
            region=region,
            jurisdiction_level=jurisdiction_level,
            jurisdiction_name=region or "National",
        )
        self.db.add(profile)
        self.db.flush()
        self.profile_ids.append(user_id)
        return user_id

    def build(self) -> None:
        self.national_admin = self._make_profile(
            role="Admin", jurisdiction_level="National", region=None
        )
        self.maharashtra_admin = self._make_profile(
            role="Admin", jurisdiction_level="State", region="Maharashtra"
        )
        self.delhi_admin = self._make_profile(
            role="Admin", jurisdiction_level="State", region="Delhi"
        )
        self.maharashtra_officer = self._make_profile(
            role="Enforcement Officer", jurisdiction_level="State", region="Maharashtra"
        )
        self.maharashtra_other_officer = self._make_profile(
            role="Enforcement Officer", jurisdiction_level="State", region="Maharashtra"
        )

        self.maharashtra_record = ComplianceRecord(
            product_name_observed="Test Product MH",
            manufacturer_name_observed="Test Manufacturer",
            category="Packaged Food",
            region="Maharashtra",
            source="Officer-Scanned",
            verification_status="Extracted",
            compliance_status="Needs Review",
            assigned_officer_id=self.maharashtra_officer,
        )
        self.delhi_record = ComplianceRecord(
            product_name_observed="Test Product DL",
            manufacturer_name_observed="Test Manufacturer",
            category="Packaged Food",
            region="Delhi",
            source="Officer-Scanned",
            verification_status="Extracted",
            compliance_status="Needs Review",
            assigned_officer_id=self.national_admin,  # region owner is irrelevant for an Admin viewer
        )
        self.db.add_all([self.maharashtra_record, self.delhi_record])
        self.db.flush()
        self.record_ids.extend([self.maharashtra_record.id, self.delhi_record.id])

        self.maharashtra_case = ViolationCase(
            originating_record_id=self.maharashtra_record.id, status="OPEN"
        )
        self.db.add(self.maharashtra_case)
        self.db.flush()
        self.case_ids.append(self.maharashtra_case.id)

        self.maharashtra_officer_scan = ScanSession(
            created_by=self.maharashtra_officer,
            region="Maharashtra",
            stages=initial_stages_pending_capture(),
            status="pending",
        )
        self.other_officer_scan = ScanSession(
            created_by=self.maharashtra_other_officer,
            region="Maharashtra",
            stages=initial_stages_pending_capture(),
            status="pending",
        )
        self.db.add_all([self.maharashtra_officer_scan, self.other_officer_scan])
        self.db.flush()
        self.scan_session_ids.extend([self.maharashtra_officer_scan.id, self.other_officer_scan.id])

        self.maharashtra_officer_batch = EcommerceBatch(
            source_url="https://example.invalid/category", created_by=self.maharashtra_officer
        )
        self.db.add(self.maharashtra_officer_batch)
        self.db.flush()
        self.batch_ids.append(self.maharashtra_officer_batch.id)

        # Report generation/lookup/retry/download authorization.
        self.maharashtra_report = Report(
            compliance_record_id=self.maharashtra_record.id,
            frozen_snapshot={"referenceCode": "test"},
            status="PENDING",
            report_format_version="2.0",
        )
        self.db.add(self.maharashtra_report)
        self.db.flush()
        self.report_ids.append(self.maharashtra_report.id)

        # Evidence-image authorization — scope must be checked before any
        # object-storage read, so no real B2/MinIO is needed to prove the
        # out-of-scope case 404s.
        self.maharashtra_evidence_image = EvidenceImage(
            scan_session_id=self.maharashtra_officer_scan.id,
            angle="front",
            storage_key="evidence/test/front-nonexistent.jpg",
        )
        self.db.add(self.maharashtra_evidence_image)
        self.db.flush()
        self.evidence_image_ids.append(self.maharashtra_evidence_image.id)

        # Product DNA / Company Profile — visible only through a Verified
        # record's ACTIVE link (see services/product_dna/dna.py and
        # services/company_profile/aggregate.py's own Phase 1.1 fix).
        self.maharashtra_verified_record = ComplianceRecord(
            product_name_observed="Verified Product MH",
            manufacturer_name_observed="Test Manufacturer",
            category="Packaged Food",
            region="Maharashtra",
            source="Officer-Scanned",
            verification_status="Verified",
            compliance_status="Compliant",
            assigned_officer_id=self.maharashtra_officer,
        )
        self.db.add(self.maharashtra_verified_record)
        self.db.flush()
        self.record_ids.append(self.maharashtra_verified_record.id)

        self.legal_entity = LegalEntity(name="Authz Matrix Legal Entity", normalized_name="authz matrix legal entity")
        self.db.add(self.legal_entity)
        self.db.flush()
        self.legal_entity_ids.append(self.legal_entity.id)

        self.product = Product(
            legal_entity_id=self.legal_entity.id,
            generic_name="Test Widget",
            net_quantity_normalized="1kg",
            fingerprint_hash=f"authz-matrix-{RUN_ID}",
        )
        self.db.add(self.product)
        self.db.flush()
        self.product_ids.append(self.product.id)

        self.product_link = ProductInspectionLink(
            compliance_record_id=self.maharashtra_verified_record.id,
            product_id=self.product.id,
            match_method="fingerprint",
        )
        self.db.add(self.product_link)
        self.db.flush()
        self.product_link_ids.append(self.product_link.id)

        self.db.commit()

    def teardown(self) -> None:
        self.db.rollback()
        for model, ids in (
            (ProductInspectionLink, self.product_link_ids),
            (Product, self.product_ids),
            (LegalEntity, self.legal_entity_ids),
            (Report, self.report_ids),
            (EvidenceImage, self.evidence_image_ids),
            (EcommerceBatch, self.batch_ids),
            (ViolationCase, self.case_ids),
            (ScanSession, self.scan_session_ids),
            (ComplianceRecord, self.record_ids),
            (Profile, self.profile_ids),
        ):
            for row_id in ids:
                obj = self.db.get(model, row_id)
                if obj is not None:
                    self.db.delete(obj)
            # Flushed per model, not once at the end — these models have no
            # ORM `relationship()` mappings for SQLAlchemy's unit-of-work to
            # compute a safe cross-model delete order from, so a single
            # flush over every queued delete can violate a FK (e.g.
            # ProductInspectionLink -> ComplianceRecord) depending on
            # unrelated insertion order. Deleting in the FK-safe tuple order
            # above, model by model, sidesteps that entirely.
            self.db.flush()
        for user_id in self.profile_ids:
            self.db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
        self.db.commit()
        self.db.close()


@pytest.fixture()
def fixture():
    _skip_unless_disposable_test_db()
    f = _Fixture()
    f.build()
    try:
        yield f
    finally:
        f.teardown()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(create_app()) as test_client:
        yield test_client


# --------------------------------------------------------------------- #
# GET /records/{id} — same predicate every other test below reuses.
# --------------------------------------------------------------------- #


def test_national_admin_sees_both_regions(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.national_admin)
    for record_id in (fixture.maharashtra_record.id, fixture.delhi_record.id):
        response = client.get(f"/api/v1/records/{record_id}", headers=headers)
        assert response.status_code == 200


def test_state_admin_sees_own_region_not_other(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.maharashtra_admin)
    own = client.get(f"/api/v1/records/{fixture.maharashtra_record.id}", headers=headers)
    other = client.get(f"/api/v1/records/{fixture.delhi_record.id}", headers=headers)
    assert own.status_code == 200
    assert other.status_code == 404


def test_enforcement_officer_sees_only_own_assigned_record(
    client: TestClient, fixture: _Fixture
) -> None:
    # Same region, but assigned to a DIFFERENT officer — must still 404,
    # proving the EO restriction applies on top of the region match, not
    # instead of it.
    headers = _auth_headers(fixture.maharashtra_other_officer)
    response = client.get(f"/api/v1/records/{fixture.maharashtra_record.id}", headers=headers)
    assert response.status_code == 404

    owner_headers = _auth_headers(fixture.maharashtra_officer)
    owner_response = client.get(f"/api/v1/records/{fixture.maharashtra_record.id}", headers=owner_headers)
    assert owner_response.status_code == 200


def test_nonexistent_and_out_of_scope_record_are_indistinguishable(
    client: TestClient, fixture: _Fixture
) -> None:
    """The core F-001 acceptance criterion: a probe cannot tell a real id
    in the wrong scope apart from a made-up id — same status, same body."""
    headers = _auth_headers(fixture.delhi_admin)
    out_of_scope = client.get(f"/api/v1/records/{fixture.maharashtra_record.id}", headers=headers)
    nonexistent = client.get(f"/api/v1/records/{uuid.uuid4()}", headers=headers)

    assert out_of_scope.status_code == 404
    assert nonexistent.status_code == 404
    # requestId is a real per-request UUID (core/logging.py's
    # RequestIdMiddleware) and legitimately differs every call — compare
    # only the parts a probe would actually see as identical.
    assert out_of_scope.json()["error"]["code"] == nonexistent.json()["error"]["code"]
    assert out_of_scope.json()["error"]["message"] == nonexistent.json()["error"]["message"]


# --------------------------------------------------------------------- #
# GET /cases/{id} — visibility follows the originating record's.
# --------------------------------------------------------------------- #


def test_case_visibility_follows_its_record(client: TestClient, fixture: _Fixture) -> None:
    owner_headers = _auth_headers(fixture.maharashtra_officer)
    owner_response = client.get(f"/api/v1/cases/{fixture.maharashtra_case.id}", headers=owner_headers)
    assert owner_response.status_code == 200

    other_headers = _auth_headers(fixture.delhi_admin)
    other_response = client.get(f"/api/v1/cases/{fixture.maharashtra_case.id}", headers=other_headers)
    assert other_response.status_code == 404


# --------------------------------------------------------------------- #
# GET /scans/{id}/pipeline — creator-based visibility for a scan with no
# region-holding record yet.
# --------------------------------------------------------------------- #


def test_scan_session_visible_to_its_own_creator_only_among_officers(
    client: TestClient, fixture: _Fixture
) -> None:
    creator_headers = _auth_headers(fixture.maharashtra_officer)
    creator_response = client.get(
        f"/api/v1/scans/{fixture.maharashtra_officer_scan.id}/pipeline", headers=creator_headers
    )
    assert creator_response.status_code == 200

    other_officer_headers = _auth_headers(fixture.maharashtra_other_officer)
    other_response = client.get(
        f"/api/v1/scans/{fixture.maharashtra_officer_scan.id}/pipeline", headers=other_officer_headers
    )
    assert other_response.status_code == 404


def test_scan_session_visible_to_national_admin(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.national_admin)
    response = client.get(
        f"/api/v1/scans/{fixture.maharashtra_officer_scan.id}/pipeline", headers=headers
    )
    assert response.status_code == 200


# --------------------------------------------------------------------- #
# GET /ecommerce/batch/{id} — creator-or-National (no region of its own).
# --------------------------------------------------------------------- #


def test_ecommerce_batch_visible_to_creator_and_national_not_other_state(
    client: TestClient, fixture: _Fixture
) -> None:
    creator_headers = _auth_headers(fixture.maharashtra_officer)
    creator_response = client.get(
        f"/api/v1/ecommerce/batch/{fixture.maharashtra_officer_batch.id}", headers=creator_headers
    )
    assert creator_response.status_code == 200

    national_headers = _auth_headers(fixture.national_admin)
    national_response = client.get(
        f"/api/v1/ecommerce/batch/{fixture.maharashtra_officer_batch.id}", headers=national_headers
    )
    assert national_response.status_code == 200

    other_state_headers = _auth_headers(fixture.delhi_admin)
    other_state_response = client.get(
        f"/api/v1/ecommerce/batch/{fixture.maharashtra_officer_batch.id}", headers=other_state_headers
    )
    assert other_state_response.status_code == 404


# --------------------------------------------------------------------- #
# Mutations: corrections/verify/resolutions also 404 out of scope, not
# just GET — proving the fix covers write endpoints too, not only reads.
# --------------------------------------------------------------------- #


def test_correction_on_out_of_scope_record_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.post(
        f"/api/v1/records/{fixture.maharashtra_record.id}/corrections",
        json={"field_id": "genericName", "value": "Attempted cross-jurisdiction write"},
        headers=headers,
    )
    assert response.status_code == 404


def test_verify_on_out_of_scope_record_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.post(f"/api/v1/records/{fixture.maharashtra_record.id}/verify", headers=headers)
    assert response.status_code == 404


def test_flag_enforcement_on_out_of_scope_record_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.post(
        f"/api/v1/records/{fixture.maharashtra_record.id}/flag-enforcement", headers=headers
    )
    assert response.status_code == 404


# --------------------------------------------------------------------- #
# Anonymous access — no valid credential at all, on the plainest protected
# read. Every other test in this matrix proves cross-tenant scoping; this
# one proves there is no way to skip authentication entirely.
# --------------------------------------------------------------------- #


def test_anonymous_record_access_is_rejected(client: TestClient, fixture: _Fixture) -> None:
    response = client.get(f"/api/v1/records/{fixture.maharashtra_record.id}")
    assert response.status_code == 401


# --------------------------------------------------------------------- #
# Reports: generation, lookup, retry, download — all four must apply the
# SAME scoped 404 as every other object-level endpoint (Phase 1.1 gap:
# only generate_report used to bypass apply_officer_scope entirely).
# --------------------------------------------------------------------- #


def test_report_generation_on_out_of_scope_record_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.post(f"/api/v1/records/{fixture.maharashtra_record.id}/reports", headers=headers)
    assert response.status_code == 404


def test_report_generation_on_visible_but_unverified_record_is_409_not_404(
    client: TestClient, fixture: _Fixture
) -> None:
    """Scope and business-rule failures must stay distinct: a viewer who
    CAN see the record but it isn't Verified yet gets 409, not a scope 404
    — proving the fix didn't collapse the two checks into one."""
    headers = _auth_headers(fixture.maharashtra_officer)
    response = client.post(f"/api/v1/records/{fixture.maharashtra_record.id}/reports", headers=headers)
    assert response.status_code == 409


def test_report_lookup_on_out_of_scope_report_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.get(f"/api/v1/reports/{fixture.maharashtra_report.id}", headers=headers)
    assert response.status_code == 404


def test_report_retry_on_out_of_scope_report_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.post(f"/api/v1/reports/{fixture.maharashtra_report.id}/retry", headers=headers)
    assert response.status_code == 404


def test_report_download_on_out_of_scope_report_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.get(
        f"/api/v1/reports/{fixture.maharashtra_report.id}/download/pdf", headers=headers
    )
    assert response.status_code == 404


def test_reports_by_record_on_out_of_scope_record_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.get(
        f"/api/v1/reports/by-record/{fixture.maharashtra_record.id}", headers=headers
    )
    assert response.status_code == 404


# --------------------------------------------------------------------- #
# Gemini violation explanations — same object-level gap as report
# generation used to have (Phase 1.1 fix).
# --------------------------------------------------------------------- #


def test_explanation_on_out_of_scope_record_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.post(
        f"/api/v1/records/{fixture.maharashtra_record.id}/violations/rule_7_font_size/explain",
        headers=headers,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------- #
# Evidence-image streaming — scope must be checked BEFORE any B2/S3 read,
# so the out-of-scope case is provable with no object storage running.
# --------------------------------------------------------------------- #


def test_evidence_image_on_out_of_scope_image_is_404(client: TestClient, fixture: _Fixture) -> None:
    headers = _auth_headers(fixture.delhi_admin)
    response = client.get(
        f"/api/v1/evidence-images/{fixture.maharashtra_evidence_image.id}", headers=headers
    )
    assert response.status_code == 404


# --------------------------------------------------------------------- #
# Product DNA / Company Profile — an aggregate must never surface a
# product/entity's metadata when every linked record is out of the
# viewer's scope (Phase 1.1 fix to build_product_dna/build_company_profile).
# --------------------------------------------------------------------- #


def test_product_dna_out_of_scope_is_404(client: TestClient, fixture: _Fixture) -> None:
    visible = client.get(
        f"/api/v1/products/{fixture.product.id}/dna", headers=_auth_headers(fixture.maharashtra_admin)
    )
    assert visible.status_code == 200

    hidden = client.get(
        f"/api/v1/products/{fixture.product.id}/dna", headers=_auth_headers(fixture.delhi_admin)
    )
    assert hidden.status_code == 404


def test_company_profile_out_of_scope_is_404(client: TestClient, fixture: _Fixture) -> None:
    visible = client.get(
        f"/api/v1/companies/{fixture.legal_entity.id}/profile",
        headers=_auth_headers(fixture.maharashtra_admin),
    )
    assert visible.status_code == 200

    hidden = client.get(
        f"/api/v1/companies/{fixture.legal_entity.id}/profile",
        headers=_auth_headers(fixture.delhi_admin),
    )
    assert hidden.status_code == 404


def test_company_list_never_surfaces_out_of_scope_entity(client: TestClient, fixture: _Fixture) -> None:
    """The collection endpoint (GET /companies) must never include an
    entity whose only linked records are out of the viewer's scope —
    proven directly by name, not just by a later per-entity 404."""
    response = client.get("/api/v1/companies", headers=_auth_headers(fixture.delhi_admin))
    assert response.status_code == 200
    names = {row["name"] for row in response.json()}
    assert fixture.legal_entity.name not in names


# --------------------------------------------------------------------- #
# Malformed profiles must not make a COLLECTION endpoint fail open. Since
# Phase 1.1, such a profile is rejected at authentication time — it never
# even reaches the list handler — which is the strongest form of this
# guarantee: there is no code path left where a scoping filter is simply
# skipped for bad data.
# --------------------------------------------------------------------- #


def test_malformed_profile_cannot_list_records_unscoped(client: TestClient, fixture: _Fixture) -> None:
    db = fixture.db
    malformed_id = uuid.uuid4()
    db.execute(auth_users.insert().values(id=malformed_id))
    profile = Profile(
        id=malformed_id,
        username=f"authz-{RUN_ID}-malformed",
        email=f"authz-{RUN_ID}-malformed@example.invalid",
        full_name="Malformed Profile",
        role="Admin",
        region=None,
        jurisdiction_level=None,  # never provisioned — the exact F-001 gap
        jurisdiction_name=None,
    )
    db.add(profile)
    db.commit()
    try:
        response = client.get("/api/v1/records", headers=_auth_headers(malformed_id))
        assert response.status_code == 401
    finally:
        db.delete(db.get(Profile, malformed_id))
        db.flush()
        db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": malformed_id})
        db.commit()
