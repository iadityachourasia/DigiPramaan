"""
Unit tests for services/barcode/checksum.py — pure, no I/O. Real,
well-known valid check-digit examples plus deliberately corrupted check
digits for the invalid path. Values cross-checked against zxing-cpp's own
generate-then-decode round trip during implementation (see detect.py's docstring).
"""

from __future__ import annotations

from app.services.barcode.checksum import expand_upce_to_upca, validate_checksum


def test_valid_ean13():
    assert validate_checksum("8901234567814", "EAN_13") is True


def test_invalid_ean13_wrong_check_digit():
    assert validate_checksum("8901234567810", "EAN_13") is False


def test_ean13_wrong_length_is_invalid():
    assert validate_checksum("890123456781", "EAN_13") is False  # 12 digits, not 13


def test_valid_ean8():
    assert validate_checksum("96385074", "EAN_8") is True


def test_valid_upc_a():
    assert validate_checksum("036000291452", "UPC_A") is True


def test_invalid_upc_a():
    assert validate_checksum("036000291459", "UPC_A") is False


def test_valid_gtin14_itf():
    assert validate_checksum("00012345678905", "ITF") is True


def test_valid_upc_e():
    assert validate_checksum("01234505", "UPC_E") is True
    assert validate_checksum("04252614", "UPC_E") is True


def test_invalid_upc_e():
    assert validate_checksum("01234509", "UPC_E") is False


def test_non_digit_string_is_invalid():
    assert validate_checksum("890123ABCD814", "EAN_13") is False


def test_unrecognized_symbology_is_invalid():
    assert validate_checksum("8901234567814", "CODE_128") is False


def test_upce_expansion_matches_known_value():
    assert expand_upce_to_upca("01234505") == "012000003455"


def test_upce_expansion_rejects_wrong_length():
    assert expand_upce_to_upca("0123450") is None
