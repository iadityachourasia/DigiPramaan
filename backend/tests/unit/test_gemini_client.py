"""
Unit tests for gemini_client.call_with_key_fallback — the shared multi-key
retry helper backing every Gemini call (ocr/gemini.py, gemini_explainer.py).
"""

from __future__ import annotations

import pytest

from app.services.gemini_client import call_with_key_fallback


def test_returns_first_key_result_without_trying_others():
    attempted: list[str] = []

    def call(key: str) -> str:
        attempted.append(key)
        return f"ok:{key}"

    result = call_with_key_fallback(["key1", "key2", "key3"], call)

    assert result == "ok:key1"
    assert attempted == ["key1"]


def test_falls_back_to_next_key_on_failure():
    attempted: list[str] = []

    def call(key: str) -> str:
        attempted.append(key)
        if key != "key3":
            raise RuntimeError(f"{key} exhausted")
        return f"ok:{key}"

    result = call_with_key_fallback(["key1", "key2", "key3"], call)

    assert result == "ok:key3"
    assert attempted == ["key1", "key2", "key3"]


def test_raises_last_failure_once_every_key_is_exhausted():
    def call(key: str) -> str:
        raise RuntimeError(f"{key} exhausted")

    with pytest.raises(RuntimeError, match="key3 exhausted"):
        call_with_key_fallback(["key1", "key2", "key3"], call)


def test_raises_immediately_when_no_keys_configured():
    with pytest.raises(RuntimeError, match="No Gemini API keys configured"):
        call_with_key_fallback([], lambda key: "unreachable")
