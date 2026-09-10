"""
ocr/provider.py — the OcrProvider abstraction.

Kept regardless of which provider ends up primary (per the task's own
instruction) — restoring/adding a provider later is a new file implementing
this Protocol, never a rewrite of callers. `OcrBlock` is the canonical
per-detection shape every provider must normalize into, carrying the exact
evidence fields the structured-extraction step needs to preserve
(image_id, bbox, provider, confidence) — see services/extraction/schema.py.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel


class OcrBlock(BaseModel):
    image_id: str
    text: str
    confidence: float
    bbox: tuple[float, float, float, float]  # x0, y0, x1, y1
    provider: str


class OcrResult(BaseModel):
    blocks: list[OcrBlock]
    provider: str
    duration_ms: float


class OcrProvider(Protocol):
    name: str

    def extract(self, image_bytes: bytes, image_id: str) -> OcrResult: ...
