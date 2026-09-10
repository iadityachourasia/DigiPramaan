"""
normalization.py — shared text/quantity normalization used by both the
Legal Metrology rule engine (rules/checks.py's Rule 3 bulk-quantity
heuristic) and Product Compliance DNA's identity-fingerprint resolution
(product_dna/identity.py). One shared module so the two never drift.

`parse_quantity_to_base_units` was originally a private copy inside
rules/checks.py (`_parse_quantity_grams_or_ml`) — moved here verbatim and
imported back, rather than duplicated, once Product DNA needed the same
parsing for its own normalized net-quantity fingerprint component.
"""

from __future__ import annotations

import re

_QUANTITY_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b", re.IGNORECASE)


def normalize_text(value: str) -> str:
    """Lowercase, strip punctuation to single spaces, collapse whitespace —
    the one normalization rule every exact-match identity comparison in
    this codebase (LegalEntity.normalized_name, Product's composite
    fingerprint) uses, so two differently-cased/punctuated OCR reads of the
    same real-world name still resolve to the same identity."""
    collapsed = re.sub(r"[^a-z0-9]+", " ", value.strip().lower())
    return re.sub(r"\s+", " ", collapsed).strip()


def parse_quantity_to_base_units(value: str | None) -> float | None:
    """Parses a quantity string like '1 kg' or '500 ml' into a float in
    grams-or-millilitres (the two are treated as the same base-unit scale
    for this MVP's purposes — never converted between each other). Returns
    None when no recognizable metric/SI quantity is found."""
    if not value:
        return None
    match = _QUANTITY_PATTERN.search(value)
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2).lower()
    if unit in ("kg", "l"):
        return amount * 1000
    return amount  # g or ml, already base unit


def normalize_net_quantity(value: str) -> str:
    """A stable normalized string for the Product identity fingerprint:
    the parsed base-unit numeral when parseable (so '1 kg', '1000 g', and
    '1000g' all normalize identically), falling back to plain text
    normalization for anything the quantity parser doesn't recognize
    (e.g. count-based quantities like '12 pieces') rather than failing
    identity resolution outright."""
    grams_or_ml = parse_quantity_to_base_units(value)
    if grams_or_ml is not None:
        return f"{grams_or_ml:g}"
    return normalize_text(value)
