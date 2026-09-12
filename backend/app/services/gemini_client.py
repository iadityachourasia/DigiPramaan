"""
gemini_client.py — shared multi-key fallback for every Gemini call in this
codebase (ocr/gemini.py's structuring + OCR fallback,
explanation/gemini_explainer.py's violation explanations).

Gemini's free-tier quota (20 requests/day) is enforced per Google Cloud
project (confirmed from the API's own error payload: quotaId
"GenerateRequestsPerDayPerProjectPerModel-FreeTier"), so a backup against
quota exhaustion is simply more keys from separate projects —
Settings.gemini_api_keys splits GEMINI_API_KEY on commas, the same
convention cors_origins/cors_origin_list already uses.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


def call_with_key_fallback(api_keys: list[str], call: Callable[[str], T]) -> T:
    """Tries each key in order, moving to the next only once `call` raises —
    a bad key and an exhausted-quota key look identical to the caller and
    both warrant trying the next one. Raises the LAST failure once every
    key has been tried; raises immediately if the list is empty."""
    if not api_keys:
        raise RuntimeError("No Gemini API keys configured")

    last_exc: Exception | None = None
    for key in api_keys:
        try:
            return call(key)
        except Exception as exc:  # noqa: BLE001 - any key-specific failure, try the next key
            last_exc = exc
            continue
    assert last_exc is not None
    raise last_exc
