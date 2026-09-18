"""
Unit tests for core/errors.py — the _STATUS_TO_CODE mapping and the
dict-shaped HTTPException detail handling.

Found via real end-to-end testing: a 400 from scans.py's duplicate-image
rejection was coming back as {"code": "INTERNAL_ERROR", "message":
"{'error': 'One or more images failed the quality check.', ...}"} instead
of a clean VALIDATION_ERROR with a readable message — misleading for a
client-caused, retryable failure.
"""

from __future__ import annotations

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException

from app.core.errors import _split_detail, register_exception_handlers


def _make_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/plain-400")
    def plain_400():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bad input.")

    @app.get("/dict-400")
    def dict_400():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "One or more images failed the quality check.", "duplicateAngles": ["front", "back"]},
        )

    @app.get("/413")
    def too_large():
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large.")

    return app


def test_plain_string_400_maps_to_validation_error():
    client = TestClient(_make_app())
    response = client.get("/plain-400")
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "Bad input."
    assert "details" not in body["error"]


def test_dict_detail_400_extracts_clean_message_and_keeps_extra_fields():
    client = TestClient(_make_app())
    response = client.get("/dict-400")
    body = response.json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert body["message"] == "One or more images failed the quality check."
    assert "{'error':" not in body["message"]
    assert body["details"]["duplicateAngles"] == ["front", "back"]


def test_413_maps_to_validation_error():
    client = TestClient(_make_app())
    response = client.get("/413")
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_split_detail_plain_string():
    message, extra = _split_detail("Bad input.")
    assert message == "Bad input."
    assert extra is None


def test_split_detail_dict_with_error_key():
    message, extra = _split_detail({"error": "Nope.", "missingAngles": ["side_pdp"]})
    assert message == "Nope."
    assert extra == {"missingAngles": ["side_pdp"]}


def test_split_detail_dict_without_error_key_falls_back_to_str():
    message, extra = _split_detail({"reason": "no error key here"})
    assert message == str({"reason": "no error key here"})
    assert extra is None
