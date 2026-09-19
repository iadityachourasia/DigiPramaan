"""OP-Phase 4 — confidence mapping (spec §6.4). Pure functions, no DB,
no network. Reuses the OP-Phase-0 confidence fixtures."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.ocr.openparser.confidence import (
    OcrConfidence,
    is_recognition_confidence,
    map_confidence,
)

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "contract" / "fixtures" / "openparser"

# Bare Confidence-object fixtures.
_BARE_CONFIDENCE_FIXTURES = [
    "confidence_calibrated_false.json",
    "confidence_scope_answer.json",
    "confidence_scope_classification.json",
    "confidence_scope_detection.json",
    "confidence_scope_geometry.json",
    "confidence_scope_quality.json",
    "confidence_scope_recognition.json",
]


def _load(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


def test_missing_confidence_stays_none() -> None:
    assert map_confidence(None) is None


@pytest.mark.parametrize("fixture_name", _BARE_CONFIDENCE_FIXTURES)
def test_every_bare_confidence_fixture_round_trips_exactly(fixture_name: str) -> None:
    raw = _load(fixture_name)
    mapped = map_confidence(raw)
    assert isinstance(mapped, OcrConfidence)
    assert mapped.score == raw["score"]
    assert mapped.scope == raw["scope"]
    assert mapped.calibrated == raw.get("calibrated", False)
    assert mapped.source_value == raw.get("source_value")
    assert mapped.source_scale == raw.get("source_scale")


def test_detection_scope_is_never_relabeled_as_recognition() -> None:
    raw = _load("confidence_scope_detection.json")
    mapped = map_confidence(raw)
    assert mapped is not None
    assert mapped.scope == "detection"
    assert is_recognition_confidence(mapped) is False


def test_recognition_scope_is_recognized_as_such() -> None:
    raw = _load("confidence_scope_recognition.json")
    mapped = map_confidence(raw)
    assert is_recognition_confidence(mapped) is True


@pytest.mark.parametrize(
    "fixture_name",
    ["confidence_scope_answer.json", "confidence_scope_classification.json",
     "confidence_scope_geometry.json", "confidence_scope_quality.json"],
)
def test_non_recognition_non_detection_scopes_are_not_recognition_confidence(fixture_name: str) -> None:
    mapped = map_confidence(_load(fixture_name))
    assert is_recognition_confidence(mapped) is False


def test_element_with_confidence_present_maps_it() -> None:
    element = _load("confidence_present_recognition.json")
    mapped = map_confidence(element.get("confidence"))
    assert mapped is not None
    assert mapped.score == 0.83
    assert mapped.scope == "recognition"


def test_element_with_confidence_absent_maps_to_none() -> None:
    element = _load("confidence_absent.json")
    assert "confidence" not in element
    assert map_confidence(element.get("confidence")) is None


def test_layout_detection_only_element_stays_detection_scope() -> None:
    element = _load("confidence_layout_detection_only.json")
    mapped = map_confidence(element.get("confidence"))
    assert mapped is not None
    assert mapped.scope == "detection"
    assert is_recognition_confidence(mapped) is False


def test_malformed_confidence_raises_loudly() -> None:
    with pytest.raises(Exception):
        map_confidence({"score": 2.5, "scope": "not-a-real-scope"})
