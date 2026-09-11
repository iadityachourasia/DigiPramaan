"""
Unit tests for services/mobile_handoff/tokens.py — pure, no I/O.
"""

from __future__ import annotations

from app.services.mobile_handoff.tokens import generate_token, hash_token


def test_generate_token_has_real_entropy_and_is_url_safe():
    token = generate_token()
    assert len(token) >= 32
    # URL-safe base64 alphabet only — this travels inside a URL path segment.
    assert all(c.isalnum() or c in "-_" for c in token)


def test_generate_token_is_never_the_same_twice():
    tokens = {generate_token() for _ in range(100)}
    assert len(tokens) == 100


def test_hash_token_is_deterministic_and_never_equals_the_input():
    token = generate_token()
    hashed = hash_token(token)
    assert hashed == hash_token(token)
    assert hashed != token
    assert len(hashed) == 64  # sha256 hex digest


def test_hash_token_differs_for_different_tokens():
    assert hash_token(generate_token()) != hash_token(generate_token())
