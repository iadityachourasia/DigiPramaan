"""OP-Phase 4 — the versioned adapter, `ParsedDocumentStrict -> OcrElement`.
Uses the real OP-Phase-0 `canonical_result_openparser1.json` fixture (2
elements, one with confidence, one without). Pure functions, no DB."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from types import SimpleNamespace

from app.services.ocr.openparser.geometry import TransformManifest
from app.services.ocr.openparser.normalize import (
    NORMALIZATION_ADAPTER_VERSION,
    normalize_parsed_document,
)
from app.services.ocr.openparser.normalized_schemas import ParsedDocumentStrict

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "contract" / "fixtures" / "openparser"


def _fake_job(**overrides) -> SimpleNamespace:
    base = dict(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        evidence_image_id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        angle="front",
        provider="openparser",
        model_id="paddleocr-vl-1.6",
        output_format="openparser@1",
        profile_version="openparser-quality-max-v1",
        provider_job_id="opj_example",
        input_sha256="a" * 64,
        canonical_result_sha256="b" * 64,
        input_width_px=1600,
        input_height_px=1200,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _load_document() -> ParsedDocumentStrict:
    raw = json.loads((FIXTURES_DIR / "canonical_result_openparser1.json").read_text(encoding="utf-8"))
    return ParsedDocumentStrict.model_validate(raw)


def test_two_elements_normalize_to_exactly_two_ocr_elements_no_collapsing() -> None:
    document = _load_document()
    elements = normalize_parsed_document(document, job=_fake_job(), transform=TransformManifest())
    assert len(elements) == 2
    ids = {e.provider_element_id for e in elements}
    assert ids == {"el_text_net_qty", "el_text_mrp"}


def test_confidence_present_element_keeps_its_score_and_scope() -> None:
    document = _load_document()
    elements = normalize_parsed_document(document, job=_fake_job(), transform=TransformManifest())
    with_confidence = next(e for e in elements if e.provider_element_id == "el_text_net_qty")
    assert with_confidence.confidence is not None
    assert with_confidence.confidence.score == 0.87
    assert with_confidence.confidence.scope == "recognition"


def test_confidence_absent_element_stays_none_and_is_not_dropped() -> None:
    document = _load_document()
    elements = normalize_parsed_document(document, job=_fake_job(), transform=TransformManifest())
    without_confidence = next(e for e in elements if e.provider_element_id == "el_text_mrp")
    assert without_confidence.confidence is None
    assert without_confidence.text == "MRP: Rs 120 inclusive of all taxes"


def test_provenance_and_hashes_are_carried_from_the_job() -> None:
    document = _load_document()
    job = _fake_job()
    elements = normalize_parsed_document(document, job=job, transform=TransformManifest())
    element = elements[0]
    assert element.provider == "openparser"
    assert element.model == "paddleocr-vl-1.6"
    assert element.output_format == "openparser@1"
    assert element.profile_version == "openparser-quality-max-v1"
    assert element.provider_job_id == "opj_example"
    assert element.attempt_id == str(job.id)
    assert element.image_id == str(job.evidence_image_id)
    assert element.angle == "front"
    assert element.input_sha256 == "a" * 64
    assert element.canonical_result_sha256 == "b" * 64
    assert element.adapter_version == NORMALIZATION_ADAPTER_VERSION


def test_bbox_mapping_succeeds_when_job_has_original_dimensions() -> None:
    document = _load_document()
    elements = normalize_parsed_document(
        document, job=_fake_job(input_width_px=1600, input_height_px=1200), transform=TransformManifest()
    )
    element = next(e for e in elements if e.provider_element_id == "el_text_net_qty")
    assert element.bbox_original_px == (120.0, 340.0, 520.0, 380.0)


def test_bbox_mapping_refuses_when_job_lacks_original_dimensions() -> None:
    document = _load_document()
    elements = normalize_parsed_document(
        document, job=_fake_job(input_width_px=None, input_height_px=None), transform=TransformManifest()
    )
    assert all(e.bbox_original_px is None for e in elements)


def test_local_element_id_is_deterministic() -> None:
    document = _load_document()
    job = _fake_job()
    first = normalize_parsed_document(document, job=job, transform=TransformManifest())
    second = normalize_parsed_document(document, job=job, transform=TransformManifest())
    assert [e.element_id for e in first] == [e.element_id for e in second]
