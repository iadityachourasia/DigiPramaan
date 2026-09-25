"""Unit tests for ocr/provider.py's OcrBlock.model field — additive,
defaults to "" for call sites (existing Paddle/Gemini fixtures, old
persisted data) that don't set it."""

from __future__ import annotations

from app.services.ocr.provider import OcrBlock


def test_model_defaults_to_empty_string_when_omitted() -> None:
    block = OcrBlock(
        image_id="img-1", text="hello", confidence=90.0, bbox=(0.0, 0.0, 1.0, 1.0), provider="paddleocr",
    )
    assert block.model == ""


def test_model_round_trips_when_set() -> None:
    block = OcrBlock(
        image_id="img-1", text="hello", confidence=90.0, bbox=(0.0, 0.0, 1.0, 1.0),
        provider="openparser", model="azure-di-read",
    )
    assert block.model == "azure-di-read"
