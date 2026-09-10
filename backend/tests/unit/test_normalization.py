"""Unit tests for app/services/normalization.py — pure, no mocking."""

from __future__ import annotations

from app.services.normalization import normalize_net_quantity, normalize_text, parse_quantity_to_base_units


def test_normalize_text_lowercases_and_strips_punctuation() -> None:
    assert normalize_text("Sahyadri Foods Pvt. Ltd.") == "sahyadri foods pvt ltd"


def test_normalize_text_collapses_whitespace() -> None:
    assert normalize_text("  Acme   Corp  ") == "acme corp"


def test_normalize_text_is_stable_across_equivalent_inputs() -> None:
    assert normalize_text("ACME CORP") == normalize_text("Acme Corp.") == normalize_text(" acme  corp ")


def test_parse_quantity_kg_converts_to_grams() -> None:
    assert parse_quantity_to_base_units("1 kg") == 1000.0


def test_parse_quantity_l_converts_to_ml() -> None:
    assert parse_quantity_to_base_units("1 L") == 1000.0


def test_parse_quantity_grams_stays_as_is() -> None:
    assert parse_quantity_to_base_units("500 g") == 500.0


def test_parse_quantity_unrecognized_returns_none() -> None:
    assert parse_quantity_to_base_units("12 pieces") is None
    assert parse_quantity_to_base_units(None) is None


def test_normalize_net_quantity_equivalent_forms_match() -> None:
    assert normalize_net_quantity("1 kg") == normalize_net_quantity("1000 g") == normalize_net_quantity("1000g")


def test_normalize_net_quantity_falls_back_to_text_for_unparseable_values() -> None:
    assert normalize_net_quantity("12 Pieces") == normalize_text("12 Pieces")
