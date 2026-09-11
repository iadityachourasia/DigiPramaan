"""Unit tests for services/barcode/normalize.py — pure GTIN-14 padding."""

from __future__ import annotations

from app.services.barcode.normalize import normalize_gtin


def test_ean13_pads_to_14():
    assert normalize_gtin("8901234567814", "EAN_13") == "08901234567814"


def test_upc_a_pads_to_14():
    assert normalize_gtin("036000291452", "UPC_A") == "00036000291452"


def test_ean8_pads_to_14():
    assert normalize_gtin("96385074", "EAN_8") == "00000096385074"


def test_upc_e_pads_to_14_from_raw_8_digit_form():
    assert normalize_gtin("01234505", "UPC_E") == "00000001234505"


def test_gtin14_itf_unchanged():
    assert normalize_gtin("00012345678905", "ITF") == "00012345678905"


def test_wrong_length_for_symbology_returns_none():
    assert normalize_gtin("890123456781", "EAN_13") is None  # 12 digits, EAN-13 needs 13


def test_non_digit_input_returns_none():
    assert normalize_gtin("890123456781X", "EAN_13") is None


def test_unrecognized_symbology_returns_none():
    assert normalize_gtin("8901234567814", "CODE_128") is None
