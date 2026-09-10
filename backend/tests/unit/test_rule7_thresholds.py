"""
Unit tests for rules/rule7_thresholds.py — the config lookup is pure and
tiny, but the `validated=False` gate is the single most important fact in
Phase 6 (PASS/FAIL must be architecturally unreachable until a real legal
review flips it), so it gets an explicit test of its own.
"""

from __future__ import annotations

from app.services.rules.rule7_thresholds import (
    ACTIVE_RULE_7_VERSION,
    get_required_height_mm,
    get_rule7_threshold_entry,
)


def test_active_version_entry_exists():
    entry = get_rule7_threshold_entry()
    assert entry["normal_mm"] == 4.0
    assert entry["embossed_mm"] == 6.0


def test_shipped_config_is_not_legally_validated():
    """The whole point of this phase's threshold correction: a code
    comment is not legal authority. Must ship False."""
    entry = get_rule7_threshold_entry(ACTIVE_RULE_7_VERSION)
    assert entry["validated"] is False
    assert "source_note" in entry


def test_required_height_mm_embossed_vs_normal():
    assert get_required_height_mm(is_embossed=False) == 4.0
    assert get_required_height_mm(is_embossed=True) == 6.0
