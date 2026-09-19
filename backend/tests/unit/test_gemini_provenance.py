"""OP-Phase 6 — `gemini_provenance.py`, built and tested but not wired
into any live call path yet (see the module's own docstring)."""

from __future__ import annotations

from app.services.ocr.gemini_provenance import build_structuring_provenance


def test_hash_is_deterministic_for_identical_response_text() -> None:
    a = build_structuring_provenance(
        prompt_version="v1", gemini_model="gemini-2.5-flash",
        response_json_text='{"manufacturer": {"value": "X"}}', validator_version="v1",
    )
    b = build_structuring_provenance(
        prompt_version="v1", gemini_model="gemini-2.5-flash",
        response_json_text='{"manufacturer": {"value": "X"}}', validator_version="v1",
    )
    assert a.response_sha256 == b.response_sha256


def test_hash_changes_when_response_text_changes() -> None:
    a = build_structuring_provenance(
        prompt_version="v1", gemini_model="gemini-2.5-flash",
        response_json_text='{"manufacturer": {"value": "X"}}', validator_version="v1",
    )
    b = build_structuring_provenance(
        prompt_version="v1", gemini_model="gemini-2.5-flash",
        response_json_text='{"manufacturer": {"value": "Y"}}', validator_version="v1",
    )
    assert a.response_sha256 != b.response_sha256


def test_carries_prompt_model_and_validator_version_through() -> None:
    provenance = build_structuring_provenance(
        prompt_version="structuring-prompt-v2", gemini_model="gemini-3.6-flash",
        response_json_text="{}", validator_version="grounding-v1",
    )
    assert provenance.prompt_version == "structuring-prompt-v2"
    assert provenance.gemini_model == "gemini-3.6-flash"
    assert provenance.validator_version == "grounding-v1"
