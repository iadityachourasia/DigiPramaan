"""
services/ocr/openparser/normalized_schemas.py — OP-Phase 4's strict
nested models for reading a `ParsedDocument`'s actual structure.

Deliberately separate from `schemas.py`'s `ParsedDocument`, which is
lenient on purpose (`extra="allow"`, `pages`/`elements` untyped) — Phase 2
never needed to read into them, only pass them through. Phase 4 is the
first consumer that needs `pages[].elements[].locations[].bbox`, so it
gets its own strict models here, matching `OCR_API_OPENAPI.yaml`'s real
`Confidence`/`CoordinateUnit`/`DocumentPage`/element/location/bbox shapes
field-for-field.

`tests/contract/test_openparser_normalized_schema.py` cross-checks these
against the real jsonschema validator (`tests/contract/
openparser_schema.py::validate_against`) over every existing fixture —
the same discipline `schemas.py`'s own docstring established for Phase 2's
models, so the two never silently drift apart.

Top-level models keep `extra="allow"` so an unmodeled provider field never
causes a validation failure; the fields listed below are the ones this
phase actually reads.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Lenient(BaseModel):
    model_config = ConfigDict(extra="allow")


class NormalizedConfidence(BaseModel):
    """Mirrors `OCR_API_OPENAPI.yaml`'s `Confidence` schema (components.
    schemas.Confidence) field-for-field — see that schema's own
    `required: [score, scope, calibrated]`."""

    model_config = ConfigDict(extra="forbid")

    score: float
    scope: Literal["detection", "recognition", "classification", "geometry", "answer", "quality"]
    calibrated: bool = False
    source_value: float | None = None
    source_scale: Literal["zero_to_one", "zero_to_hundred", "log_probability", "unknown"] | None = None


class BBox(BaseModel):
    model_config = ConfigDict(extra="forbid")

    left: float
    top: float
    right: float
    bottom: float


class ElementLocation(_Lenient):
    page_number: int
    bbox: BBox | None = None


class Element(_Lenient):
    id: str
    kind: str
    role: str | None = None
    text: str | None = None
    locations: list[ElementLocation] = []
    confidence: NormalizedConfidence | None = None


class DocumentPage(_Lenient):
    number: int
    width: float
    height: float
    unit: Literal["pixel", "point", "inch", "normalized"]
    rotation_degrees: float = 0.0


class ParsedDocumentStrict(_Lenient):
    output_format: Literal["openparser@1"]
    document_id: str
    pages: list[DocumentPage] = []
    elements: list[Element] = []
