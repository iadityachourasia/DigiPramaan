"""
Freezes the current GET /api/records contract. Loads the checked-in fixture
(a real response captured from the live Next.js dev server against its
static seed data) and validates it parses with zero errors against the
hand-mirrored schema. Never touches the network — fast, and never flaky.

This is the regression net Phase 2's real implementation must satisfy.
"""

import json
from pathlib import Path

from tests.contract.schemas_v0 import RecordsPageV0

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "records_page_v0.json"


def test_fixture_file_exists() -> None:
    assert FIXTURE_PATH.exists(), (
        "records_page_v0.json is missing — regenerate it from a live "
        "`npm run dev` + `GET /api/records?pageSize=5` before running this test."
    )


def test_records_page_matches_frozen_contract() -> None:
    raw = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    page = RecordsPageV0.model_validate(raw)

    assert page.totalCount >= len(page.rows)
    assert page.page == 1
    assert len(page.rows) > 0

    # Spot-check the specific record types the seed data actually exercises,
    # so this test also documents which real cases the fixture covers.
    verified = [r for r in page.rows if r.verificationStatus == "Verified"]
    assert verified, "fixture should include at least one Verified record"
    assert any(r.complianceScore is not None for r in verified)

    non_compliant = [r for r in page.rows if r.complianceStatus == "Non-Compliant"]
    assert non_compliant, "fixture should include at least one Non-Compliant record"
    assert any(r.violations for r in non_compliant)
