"""
services/ocr/openparser/schemas.py — minimal Pydantic models for exactly
the response shapes this client parses.

Deliberately NOT a full mirror of all 117 schemas in `OCR_API_OPENAPI.yaml`
— `Job` alone has extraction-review, batch-pagination, and pipeline fields
this OCR-only Phase 2 client never reads. Every model below types only the
fields the client actually branches on and sets `model_config =
{"extra": "allow"}`, so an unmodeled contract field never causes a
validation failure — it just isn't accessible as an attribute. Phase 4
(normalization) is where `ParsedDocument`'s/`RawParseResult`'s own
elements/pages get a real typed model, once there's a caller that needs
them.

`tests/contract/test_openparser_client_schemas.py` proves every model here
accepts every OP-Phase-0 fixture the REAL jsonschema validator
(`tests/contract/openparser_schema.py::validate_against`) also accepts —
the two are checked against each other, never left to drift apart by hand.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class _Lenient(BaseModel):
    model_config = ConfigDict(extra="allow")


class OcrModelCatalogEntry(_Lenient):
    id: str
    label: str
    is_default: bool = False


class OcrModelsResponse(_Lenient):
    data: list[OcrModelCatalogEntry]


class JobAccepted(_Lenient):
    id: str
    operation: Literal["parse", "extract"]
    status: Literal["queued", "running", "succeeded", "failed", "indeterminate"]
    output_format: str
    created_at: str
    updated_at: str


class BatchJobAccepted(_Lenient):
    id: str
    operation: Literal["parse_batch", "extract_batch"]
    status: Literal["queued", "running", "succeeded", "failed", "indeterminate"]
    output_format: str
    created_at: str
    updated_at: str
    child_count: int | None = None


class JobFailure(_Lenient):
    code: str | None = None
    message: str | None = None
    retryable: bool | None = None


class Job(_Lenient):
    """`result` is left untyped (`dict | None`) on purpose — see module
    docstring. `error` is populated only for a terminal `failed`/
    `indeterminate` job."""

    id: str
    operation: Literal["parse", "extract", "parse_batch", "extract_batch"]
    status: Literal["queued", "running", "succeeded", "failed", "indeterminate"]
    output_format: str
    created_at: str
    updated_at: str
    completed_at: str | None = None
    error: JobFailure | None = None
    result: dict[str, Any] | None = None
    summary: dict[str, Any] | None = None
    children: dict[str, Any] | None = None


class ParsedDocument(_Lenient):
    """`GET /jobs/{id}/result` with `output_format=openparser@1`. Elements/
    pages are read straight off the model via `.model_extra` until Phase 4
    gives them a real typed shape — nothing in Phase 2 inspects them."""

    output_format: Literal["openparser@1"]
    document_id: str


class RawParseResult(_Lenient):
    """`GET /jobs/{id}/result` with `output_format=raw` — a provider-
    specific envelope this client never interprets, only passes through."""

    output_format: Literal["raw"]


class ErrorBody(_Lenient):
    code: str
    message: str
    request_id: str
    retryable: bool
    details: dict[str, Any] | None = None


class ErrorResponse(_Lenient):
    error: ErrorBody
