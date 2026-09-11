"""
services/barcode/normalize.py — canonical GTIN-14 form.

A GS1 GTIN can be printed as an 8, 12, 13, or 14-digit symbol depending on
symbology, but they all identify a product the same way once left-zero-
padded to 14 digits (GS1's own canonical indicator-digit convention —
GTIN-14 is not a distinct "bigger" identifier, it's the padded form of the
others). Normalizing to this one 14-digit string is what lets
`ProductIdentifier.normalized_value` be a single indexed/unique column
regardless of which symbology was printed on a given package, and what
lets an officer's typed search match any of them.

Deliberately its own small module rather than reusing
`services/normalization.py`'s `parse_quantity_to_base_units` — that
function is unit-of-measure parsing (kg/g/L/mL), a different concern from
digit-padding; the only thing shared is the general "normalize before
comparing, never guess" philosophy documented there.
"""

from __future__ import annotations

_PAD_LENGTH_BY_SYMBOLOGY = {
    "EAN_8": 14 - 8,
    "UPC_A": 14 - 12,
    "UPC_E": 14 - 8,  # normalized from the raw 8-char UPC-E form, not its UPC-A expansion
    "EAN_13": 14 - 13,
    "ITF": 14 - 14,
}


def normalize_gtin(raw_digits: str, symbology: str) -> str | None:
    """Returns the left-zero-padded 14-digit form, or None if `raw_digits`
    isn't a plain digit string of the length that symbology. Never guesses
    at a length correction — a decoder returning an unexpected length for
    its own reported symbology is treated as unusable, not silently coerced."""
    if not raw_digits.isdigit():
        return None
    pad = _PAD_LENGTH_BY_SYMBOLOGY.get(symbology)
    if pad is None:
        return None
    expected_len = 14 - pad
    if len(raw_digits) != expected_len:
        return None
    return raw_digits.zfill(14)
