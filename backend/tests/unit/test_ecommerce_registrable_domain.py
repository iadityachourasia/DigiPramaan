"""
Unit tests for the P2 hardening fix (F-009) to
services/ecommerce/category.py::_same_registrable_domain — the eTLD+1
approximation using a small embedded known-multi-label-suffix set,
replacing the old naive "last two labels" comparison.
"""

from __future__ import annotations

from app.services.ecommerce.category import _same_registrable_domain


def test_plain_com_domains_still_match() -> None:
    assert _same_registrable_domain(
        "https://www.example.com/a", "https://shop.example.com/b"
    )


def test_plain_com_domains_still_reject_different_sites() -> None:
    assert not _same_registrable_domain("https://example.com/a", "https://evil.com/b")


def test_co_uk_subdomains_match_each_other() -> None:
    assert _same_registrable_domain(
        "https://shop.example.co.uk/a", "https://www.example.co.uk/b"
    )


def test_co_uk_the_old_bug_two_different_co_uk_sites_no_longer_match() -> None:
    """The direct regression proof: the OLD two-label comparison took
    the last 2 labels ("co.uk") for BOTH of these, incorrectly treating
    two unrelated .co.uk sites as the same site."""
    assert not _same_registrable_domain(
        "https://shop.example.co.uk/a", "https://evil.co.uk/b"
    )


def test_co_in_subdomains_match_each_other() -> None:
    assert _same_registrable_domain(
        "https://shop.example.co.in/a", "https://www.example.co.in/b"
    )


def test_co_in_two_different_sites_do_not_match() -> None:
    assert not _same_registrable_domain(
        "https://shop.example.co.in/a", "https://evil.co.in/b"
    )


def test_com_au_subdomains_match_each_other() -> None:
    assert _same_registrable_domain(
        "https://shop.example.com.au/a", "https://www.example.com.au/b"
    )


def test_missing_hostname_never_matches() -> None:
    assert not _same_registrable_domain("not-a-url", "https://example.com/b")
