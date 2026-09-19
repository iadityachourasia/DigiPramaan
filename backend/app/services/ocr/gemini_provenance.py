"""
services/ocr/gemini_provenance.py — OP-Phase 6's structuring-provenance
model. Built and tested but DELIBERATELY NOT CALLED from `ocr/gemini.py`
or `jobs/pipeline.py` yet: persisting it would need `_call_structure`
(gemini.py) to also capture and thread through Gemini's raw response
text, a real signature change to a function with exactly one caller
today. Deferred to whenever a caller actually needs the persisted
provenance, the same "build now, wire later" discipline every OpenParser
phase this project has used.
"""

from __future__ import annotations

import hashlib

from pydantic import BaseModel


class StructuringProvenance(BaseModel):
    prompt_version: str
    gemini_model: str
    response_sha256: str
    validator_version: str


def build_structuring_provenance(
    *, prompt_version: str, gemini_model: str, response_json_text: str, validator_version: str
) -> StructuringProvenance:
    """Pure — hashes the exact raw response text a caller captured
    (never re-serializes the parsed object, which could silently differ
    from what the API actually sent, e.g. field ordering or whitespace)."""
    response_sha256 = hashlib.sha256(response_json_text.encode("utf-8")).hexdigest()
    return StructuringProvenance(
        prompt_version=prompt_version,
        gemini_model=gemini_model,
        response_sha256=response_sha256,
        validator_version=validator_version,
    )
