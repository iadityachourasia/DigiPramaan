"""
rules/rule7_thresholds.py — Rule 7's statutory height requirement, kept
STRICTLY SEPARATE from measurement reliability (see checks.py's
check_rule_7_font_size). A frontend code comment is not legal authority: the
4mm/6mm figures below were carried from an earlier, unsourced comment in
this repo's own frontend types and have NOT been independently confirmed
against the authoritative Rule 7 text/version DigiPramaan targets. Until a
documented legal/compliance review sets `validated=True` on an entry, Rule 7
can reach NEEDS_REVIEW from a reliable measurement but never PASS/FAIL —
that is intentional, not a bug to "fix" by flipping the flag without review.

Versioned so a future confirmed threshold (or a different applicable legal
version) can be added without touching the comparison logic in checks.py.
"""

from __future__ import annotations

RULE_7_THRESHOLDS: dict[str, dict] = {
    "legal-metrology-2011-rule7-v1": {
        "normal_mm": 4.0,
        "embossed_mm": 6.0,
        # Do NOT flip based on a code comment, general knowledge, or an LLM's
        # say-so — only a documented legal/compliance sign-off may set this True.
        "validated": False,
        "source_note": (
            "Carried from this repo's own prior (unsourced) FontSizeCheck comment "
            "— needs independent legal confirmation before it can gate a PASS/FAIL."
        ),
    },
}

ACTIVE_RULE_7_VERSION = "legal-metrology-2011-rule7-v1"

INSUFFICIENT_LEGAL_VALIDATION_MESSAGE = (
    "Physical font height measured, but the applicable statutory threshold "
    "requires legal validation."
)


def get_rule7_threshold_entry(version: str = ACTIVE_RULE_7_VERSION) -> dict:
    return RULE_7_THRESHOLDS[version]


def get_required_height_mm(is_embossed: bool, version: str = ACTIVE_RULE_7_VERSION) -> float:
    entry = get_rule7_threshold_entry(version)
    return entry["embossed_mm"] if is_embossed else entry["normal_mm"]
