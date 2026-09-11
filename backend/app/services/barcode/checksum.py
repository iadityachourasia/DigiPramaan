"""
services/barcode/checksum.py — deterministic checksum validation.

Pure functions, no I/O, no network, no Gemini — this is the ONE source of
truth `checksum_valid` comes from (never taken on faith from the decoder
library, even though zxing-cpp happens to self-report validity too).

EAN-13/EAN-8/UPC-A/GTIN-14 all share one "GTIN mod-10" check-digit
algorithm (weight 3 on the digit immediately left of the check digit,
alternating 3/1 from there) — see `_gtin_mod10_check_digit`. UPC-E is a
compressed 8-character UPC-A (number-system digit + 6 compressed digits +
check digit); its checksum is validated by expanding it to the 12-digit
UPC-A form per the standard GS1 expansion table, then applying the same
algorithm — confirmed against zxing-cpp's own round-trip output during
implementation (e.g. "01234505" expands to UPC-A "012000003455", which
checksums correctly).
"""

from __future__ import annotations


def _gtin_mod10_check_digit(payload_digits: str) -> int:
    """`payload_digits` excludes the check digit itself."""
    total = 0
    weight = 3
    for digit in reversed(payload_digits):
        total += int(digit) * weight
        weight = 4 - weight  # alternates 3, 1, 3, 1, ...
    return (10 - total % 10) % 10


def _validate_gtin_family(digits: str) -> bool:
    """EAN-13 (13), EAN-8 (8), UPC-A (12), GTIN-14 (14) — all one algorithm."""
    payload, check = digits[:-1], digits[-1]
    return _gtin_mod10_check_digit(payload) == int(check)


def expand_upce_to_upca(upce_8: str) -> str | None:
    """Expands an 8-character UPC-E string (number-system digit + 6
    compressed digits + check digit) into its 12-digit UPC-A equivalent,
    per the standard GS1 expansion table. Returns None for a malformed
    input rather than raising — this is a normalization helper, not a
    validator."""
    if len(upce_8) != 8 or not upce_8.isdigit():
        return None
    number_system, compressed, check = upce_8[0], upce_8[1:7], upce_8[7]
    last = compressed[5]

    if last in ("0", "1", "2"):
        manufacturer = number_system + compressed[0:2] + last + "0000" + compressed[2:5]
    elif last == "3":
        manufacturer = number_system + compressed[0:3] + "00000" + compressed[3:5]
    elif last == "4":
        manufacturer = number_system + compressed[0:4] + "00000" + compressed[4:5]
    else:
        manufacturer = number_system + compressed[0:5] + "0000" + last
    return manufacturer + check


def validate_checksum(digits: str, symbology: str) -> bool:
    """`digits` is the raw decoded text (digits only, as zxing-cpp's HRI
    text mode already returns for every symbology this pipeline supports —
    no separate stripping needed here)."""
    if not digits.isdigit():
        return False
    if symbology in ("EAN_13", "EAN_8", "UPC_A"):
        expected_len = {"EAN_13": 13, "EAN_8": 8, "UPC_A": 12}[symbology]
        if len(digits) != expected_len:
            return False
        return _validate_gtin_family(digits)
    if symbology == "ITF":
        # ITF-14 (GTIN-14 carried on an Interleaved 2-of-5 symbol) — same
        # mod-10 algorithm as the rest of the GTIN family. Non-GTIN ITF
        # lengths (used for other, non-product purposes) are not this
        # pipeline's concern — treated as unrecognized, never trusted.
        if len(digits) != 14:
            return False
        return _validate_gtin_family(digits)
    if symbology == "UPC_E":
        if len(digits) != 8:
            return False
        expanded = expand_upce_to_upca(digits)
        return expanded is not None and _validate_gtin_family(expanded)
    return False
