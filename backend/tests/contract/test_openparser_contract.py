"""
OpenParser OCR migration, OP-Phase 0 — contract validation.

Loads `OCR_API_OPENAPI.yaml` (repo root), proves every local `$ref` it
contains resolves via a correct RFC 6901 JSON Pointer decoder (not a bare
`"/".split()`), locks in the specific structural facts the migration's
design decisions depend on (confidence is optional/scoped everywhere, the
job status enum and batch-parent derivation rule, the canonical-vs-raw
result split, the idempotency header), proves the exact operation ->
response-component -> body-schema mapping for the operations the
migration will actually call (resolving each `$ref` hop explicitly rather
than assuming a body shape), proves the validator genuinely rejects
invalid data (not just accepts valid data), and validates every
checked-in fixture under `fixtures/openparser/` against its named schema.

No HTTP client, no network call, ever — this package validates a
contract document and static fixtures only. See
docs/internal/adr/0001-openparser-ocr-migration.md for the design
decisions this test suite exists to hold accountable, and
docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md for the full
Phase 0-9 migration plan this is the first phase of.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
from jsonschema.exceptions import ValidationError

from tests.contract.openparser_schema import (
    RECORDED_CONTRACT_SHA256,
    _format_checker,
    contract_sha256,
    decode_json_pointer_segment,
    load_contract,
    resolve_local_ref,
    validate_against,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "openparser"


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


def _schemas() -> dict:
    return load_contract()["components"]["schemas"]


def _responses() -> dict:
    return load_contract()["components"]["responses"]


# --- Contract integrity ------------------------------------------------

def test_openapi_file_matches_recorded_checksum() -> None:
    """The spec doc's own instruction #4: if this ever differs, STOP and
    reconcile the contract analysis/fixtures/ADR before writing any
    runtime code — silent drift must fail loudly, not be caught only by
    manual inspection."""
    assert contract_sha256() == RECORDED_CONTRACT_SHA256, (
        "OCR_API_OPENAPI.yaml has changed since docs/internal/"
        "OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md was authored — "
        "reconcile the spec, this test suite, and the ADR before proceeding."
    )


def test_openapi_loads_and_is_valid_yaml() -> None:
    contract = load_contract()
    assert contract["openapi"] == "3.1.0"
    assert "info" in contract
    assert "paths" in contract
    assert "components" in contract


# --- RFC 6901 JSON Pointer decoding --------------------------------------

@pytest.mark.parametrize(
    ("raw", "decoded"),
    [
        ("Confidence", "Confidence"),
        ("a~1b", "a/b"),
        ("a~0b", "a~b"),
        ("a~1b~0c", "a/b~c"),
        ("~1~1", "//"),
        ("~0~0", "~~"),
    ],
)
def test_decode_json_pointer_segment_examples(raw: str, decoded: str) -> None:
    assert decode_json_pointer_segment(raw) == decoded


def test_decode_json_pointer_segment_decodes_tilde_one_before_tilde_zero() -> None:
    """Order matters per RFC 6901 §4: decode `~1` -> `/` FIRST, then
    `~0` -> `~`. Reversing the order would turn a literal `~1` sequence
    (itself produced by decoding `~01` -> `~` + `1`) into a spurious `/`."""
    assert decode_json_pointer_segment("~01") == "~1"


@pytest.mark.parametrize("malformed", ["~", "~2", "foo~", "~x", "a~b~1"])
def test_decode_json_pointer_segment_rejects_malformed_escape(malformed: str) -> None:
    with pytest.raises(ValueError, match="malformed JSON Pointer escape"):
        decode_json_pointer_segment(malformed)


def test_resolve_local_ref_resolves_real_schema_pointer() -> None:
    contract = load_contract()
    resolved = resolve_local_ref(contract, "#/components/schemas/Confidence")
    assert resolved == _schemas()["Confidence"]


@pytest.mark.parametrize(
    "external_ref",
    [
        "other.yaml#/components/schemas/Foo",
        "https://example.com/schema.json#/Foo",
        "#",
        "components/schemas/Foo",
    ],
)
def test_resolve_local_ref_rejects_external_or_non_pointer_reference(external_ref: str) -> None:
    with pytest.raises(ValueError, match="external or non-pointer"):
        resolve_local_ref(load_contract(), external_ref)


def _collect_refs(node: object, refs: list[str]) -> None:
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            refs.append(ref)
        for value in node.values():
            _collect_refs(value, refs)
    elif isinstance(node, list):
        for item in node:
            _collect_refs(item, refs)


def test_every_local_ref_resolves_with_correct_pointer_decoding() -> None:
    """Walks every `$ref` string anywhere in the ENTIRE loaded OpenAPI
    document — not just `components`/`paths` (the original version of
    this test scoped the walk to those two top-level keys only, which
    would silently skip a `$ref` placed under `info`, `servers`, `tags`,
    `webhooks`, or any other top-level section; nothing in the OpenAPI
    spec forbids a `$ref` there, so the walk must not assume one won't
    appear). Rejects any ref that isn't a local root-relative pointer, and
    resolves each one through the same RFC 6901-decoding path real
    clients would need (not a naive `"/".split()`)."""
    contract = load_contract()
    refs: list[str] = []
    _collect_refs(contract, refs)
    assert refs, "expected at least one $ref in the contract"

    for ref in refs:
        resolve_local_ref(contract, ref)  # raises ValueError on any failure


def test_ref_walk_covers_the_whole_document_not_just_components_and_paths() -> None:
    """Guards the correction itself: confirms the full-document walk finds
    at least as many refs as a components-and-paths-only walk would have,
    so a future edit can't silently narrow the walk back down without a
    test noticing. (Equal counts are fine — it only proves nothing is
    LOST, not that refs exist outside components/paths today; none
    currently do, which is itself worth recording rather than assuming.)"""
    contract = load_contract()
    full_refs: list[str] = []
    _collect_refs(contract, full_refs)

    scoped_refs: list[str] = []
    _collect_refs(contract["components"], scoped_refs)
    _collect_refs(contract["paths"], scoped_refs)

    assert len(full_refs) >= len(scoped_refs)


# --- Structural facts the migration design depends on -------------------

def test_confidence_schema_shape() -> None:
    confidence = _schemas()["Confidence"]
    assert set(confidence["required"]) == {"score", "scope", "calibrated"}
    assert confidence["additionalProperties"] is False
    assert set(confidence["properties"]) == {
        "score", "scope", "calibrated", "source_value", "source_scale",
    }
    assert confidence["properties"]["scope"]["enum"] == [
        "detection", "recognition", "classification", "geometry", "answer", "quality",
    ]
    assert confidence["properties"]["calibrated"]["default"] is False


def test_confidence_never_required_on_any_attachment_point() -> None:
    """The formal proof (not just inspection) that confidence is
    omittable everywhere it appears — every schema with a `confidence`
    property must never list it in that schema's own `required[]`."""
    schemas = _schemas()
    checked = 0
    for name, definition in schemas.items():
        properties = definition.get("properties")
        if not isinstance(properties, dict) or "confidence" not in properties:
            continue
        checked += 1
        required = definition.get("required", [])
        assert "confidence" not in required, (
            f"{name}.confidence is required — contradicts the optional-confidence design"
        )
    assert checked >= 5, "expected several schemas to carry a confidence property"


def test_job_status_enum_and_batch_derivation_rule_documented() -> None:
    job_status = _schemas()["JobStatus"]
    assert job_status["enum"] == ["queued", "running", "succeeded", "failed", "indeterminate"]
    # Canary for the single most important, easy-to-miss business rule in
    # the whole contract: a batch parent with any failed + any succeeded
    # child closes as `succeeded`, not `failed`. If this description
    # keyword ever disappears from a future contract revision, this
    # assertion fails as an early warning rather than the rule silently
    # being un-documented.
    assert "mixed" in job_status["description"].lower()
    assert "succeeded" in job_status["description"]


def test_document_element_oneof_has_13_members_matching_kind_enum() -> None:
    document_element = _schemas()["DocumentElement"]
    refs = [entry["$ref"] for entry in document_element["oneOf"]]
    assert len(refs) == 13
    kind_enum = _schemas()["DocumentElementKind"]["enum"]
    assert len(kind_enum) == 13


def test_parsed_document_required_fields_and_output_format_const() -> None:
    parsed_document = _schemas()["ParsedDocument"]
    assert parsed_document["properties"]["output_format"]["const"] == "openparser@1"
    assert set(parsed_document["required"]) == {
        "output_format", "document_id", "provenance", "text", "markdown",
        "pages", "elements", "text_annotations", "relations", "assets",
    }


def test_raw_parse_result_required_fields_and_output_format_const() -> None:
    raw_result = _schemas()["RawParseResult"]
    assert raw_result["properties"]["output_format"]["const"] == "raw"
    assert set(raw_result["required"]) == {"output_format", "provider", "model", "profile", "result"}


def test_job_required_fields_include_nullable_completed_at_and_pipeline_fields() -> None:
    """`completed_at`/`pipeline_id`/`pipeline_version` are all REQUIRED
    keys on `Job` even though their values are nullable — a fixture (or a
    future client) must send `null` explicitly, never omit the key."""
    job = _schemas()["Job"]
    assert set(job["required"]) == {
        "id", "operation", "status", "output_format", "created_at",
        "updated_at", "completed_at", "pipeline_id", "pipeline_version",
    }


def test_job_accepted_is_a_distinct_narrower_schema_than_job() -> None:
    """`JobAccepted` (the literal `POST /parse/async` 202 body) is NOT the
    same schema as `Job` (the `GET /jobs/{id}` body) — it has no
    `completed_at`/`pipeline_id`/`pipeline_version`/`result` fields at
    all, and `additionalProperties: false` forbids sending them."""
    job_accepted = _schemas()["JobAccepted"]
    assert set(job_accepted["required"]) == {
        "id", "operation", "status", "output_format", "created_at", "updated_at",
    }
    assert job_accepted["additionalProperties"] is False
    assert "completed_at" not in job_accepted["properties"]


def test_idempotency_key_header_required_on_parse_admission_operations() -> None:
    contract = load_contract()
    param = contract["components"]["parameters"]["IdempotencyKey"]
    assert param["name"] == "Idempotency-Key"
    assert param["in"] == "header"
    assert param["required"] is True
    assert param["schema"]["minLength"] == 1
    assert param["schema"]["maxLength"] == 256

    for path in ("/parse/async", "/parse/batch"):
        operation = contract["paths"][path]["post"]
        refs = [p.get("$ref") for p in operation.get("parameters", [])]
        assert "#/components/parameters/IdempotencyKey" in refs, (
            f"POST {path} does not require Idempotency-Key"
        )


def test_admission_limits_documented_in_info_description() -> None:
    description = load_contract()["info"]["description"]
    assert "50 MiB per file" in description
    assert "100 million" in description
    assert "100 MiB aggregate batch" in description


# --- Operation -> response-component -> body-schema mapping -------------
#
# Every helper here RESOLVES the actual reference chain the contract
# defines rather than assuming a body shape. A path's response entry is
# either (a) `{"$ref": "#/components/responses/X"}` — resolve that first
# to reach the response object — or (b) an inline response object with
# its own `content` directly. Either way, the schema `$ref` inside
# `content["application/json"]["schema"]` is what's asserted.

def _response_object(contract: dict, path: str, method: str, status: str) -> dict:
    entry = contract["paths"][path][method]["responses"][status]
    if "$ref" in entry:
        return resolve_local_ref(contract, entry["$ref"])
    return entry


def _response_schema_ref(contract: dict, path: str, method: str, status: str) -> str:
    response_object = _response_object(contract, path, method, status)
    schema_node = response_object["content"]["application/json"]["schema"]
    assert "$ref" in schema_node, (
        f"{method.upper()} {path} {status} response schema is inline, not a named $ref: {schema_node!r}"
    )
    return schema_node["$ref"]


def test_get_models_ocr_200_maps_to_ocr_models_response() -> None:
    contract = load_contract()
    assert (
        _response_schema_ref(contract, "/models/ocr", "get", "200")
        == "#/components/schemas/OcrModelsResponse"
    )


def test_post_parse_async_202_maps_to_job_accepted() -> None:
    contract = load_contract()
    # The path's 202 entry is itself `$ref: '#/components/responses/JobAccepted'`
    # — a RESPONSE component, distinct from the SCHEMA of the same name.
    # Confirm both hops explicitly rather than assuming they line up.
    entry = contract["paths"]["/parse/async"]["post"]["responses"]["202"]
    assert entry == {"$ref": "#/components/responses/JobAccepted"}
    assert (
        _response_schema_ref(contract, "/parse/async", "post", "202")
        == "#/components/schemas/JobAccepted"
    )


def test_post_parse_batch_202_maps_to_batch_job_accepted() -> None:
    contract = load_contract()
    entry = contract["paths"]["/parse/batch"]["post"]["responses"]["202"]
    assert entry == {"$ref": "#/components/responses/BatchJobAccepted"}
    assert (
        _response_schema_ref(contract, "/parse/batch", "post", "202")
        == "#/components/schemas/BatchJobAccepted"
    )


def test_get_job_by_id_200_maps_to_job_schema() -> None:
    contract = load_contract()
    assert (
        _response_schema_ref(contract, "/jobs/{id}", "get", "200")
        == "#/components/schemas/Job"
    )


def test_get_job_result_200_maps_to_parse_result() -> None:
    contract = load_contract()
    assert (
        _response_schema_ref(contract, "/jobs/{id}/result", "get", "200")
        == "#/components/schemas/ParseResult"
    )
    # ParseResult is itself anyOf(ParsedDocument, RawParseResult) — confirm
    # that union rather than assuming it.
    parse_result = _schemas()["ParseResult"]
    any_of_refs = {entry["$ref"] for entry in parse_result["anyOf"]}
    assert any_of_refs == {
        "#/components/schemas/ParsedDocument",
        "#/components/schemas/RawParseResult",
    }


@pytest.mark.parametrize(
    "response_component_name",
    [
        "MalformedRequest", "Unauthorized", "Forbidden", "FileNotFound",
        "InsufficientCredits", "IdempotencyConflict", "PipelineNameConflict",
        "LimitExceeded", "UnsupportedMediaType", "UnprocessableConfig",
        "UnprocessableOrSyncFailed", "SyncTerminalIndeterminate", "RateLimited",
        "ServiceUnavailable", "JobNotFound", "JobNotTerminal",
        "ParseResultUnavailable", "JobSourceUnavailable", "PipelineNotFound",
    ],
)
def test_error_response_components_resolve_to_error_response_schema(
    response_component_name: str,
) -> None:
    contract = load_contract()
    response_object = resolve_local_ref(
        contract, f"#/components/responses/{response_component_name}"
    )
    schema_ref = response_object["content"]["application/json"]["schema"]["$ref"]
    assert schema_ref == "#/components/schemas/ErrorResponse"


def test_rate_limited_and_service_unavailable_declare_retry_after_header() -> None:
    responses = _responses()
    for name in ("RateLimited", "ServiceUnavailable"):
        header = responses[name]["headers"]["Retry-After"]
        assert header["schema"]["type"] == "integer"
        assert header["schema"]["minimum"] == 1

    # And confirm the operations that can actually return these statuses
    # reference the SAME response components (not a duplicated inline copy).
    contract = load_contract()
    for path in ("/parse/async", "/parse/batch"):
        operation = contract["paths"][path]["post"]
        assert operation["responses"]["429"] == {"$ref": "#/components/responses/RateLimited"}
        assert operation["responses"]["503"] == {"$ref": "#/components/responses/ServiceUnavailable"}


# --- Negative validator canaries: prove rejection, not just acceptance --

def test_validator_rejects_confidence_score_above_one() -> None:
    with pytest.raises(ValidationError, match="maximum"):
        validate_against("Confidence", {"score": 1.5, "scope": "recognition", "calibrated": False})


def test_validator_rejects_invalid_confidence_scope() -> None:
    with pytest.raises(ValidationError, match="is not one of"):
        validate_against(
            "Confidence", {"score": 0.5, "scope": "not_a_real_scope", "calibrated": False}
        )


def test_validator_rejects_unknown_additional_property() -> None:
    with pytest.raises(ValidationError, match="Additional properties"):
        validate_against(
            "Confidence",
            {"score": 0.5, "scope": "recognition", "calibrated": False, "bogus_field": "x"},
        )


def test_validator_rejects_missing_required_field() -> None:
    with pytest.raises(ValidationError, match="required"):
        # `calibrated` omitted — required even though it has a JSON-Schema
        # `default`; jsonschema does not apply defaults during validation.
        validate_against("Confidence", {"score": 0.5, "scope": "recognition"})


# --- Format enforcement (`uri`, `date-time`) -----------------------------
#
# jsonschema does not enforce the `format` keyword's CONTENT unless a
# `format_checker` is supplied and a backing package is importable for
# that specific format name — see openparser_schema.py's `_format_checker()`.
# These tests prove enforcement is actually wired in, not just present in
# the schema text.

def test_format_checker_registers_uri_and_date_time() -> None:
    """Direct, mechanism-level proof — checks the `FormatChecker` object
    itself rather than going through a full schema, so this can't be
    accidentally satisfied by some OTHER keyword (see the note below on
    why that matters for `created_at`)."""
    checker = _format_checker()
    assert checker.conforms("2026-09-18T10:00:00Z", "date-time") is True
    assert checker.conforms("not-a-real-timestamp", "date-time") is False
    assert checker.conforms("https://example.com/x", "uri") is True
    assert checker.conforms("not a uri at all ::", "uri") is False


def test_date_time_field_rejects_malformed_timestamp_end_to_end() -> None:
    """`created_at` carries BOTH `format: date-time` AND an explicit
    `pattern` regex (confirmed by reading the schema below) — a
    sufficiently garbled string like `"not-a-real-timestamp"` is rejected
    by the `pattern` keyword alone, with or without a format checker
    attached. This test is honest about that: it proves the field is
    end-to-end enforced (garbage is rejected, full stop), not that
    `format_checker` specifically is what catches THIS input — that
    isolated claim belongs to `test_format_checker_registers_uri_and_date_time`
    above, which checks the mechanism directly rather than through a
    field that has a second, independently-sufficient guard."""
    created_at_schema = load_contract()["components"]["schemas"]["Job"]["properties"]["created_at"]
    assert created_at_schema["format"] == "date-time"
    assert "pattern" in created_at_schema
    with pytest.raises(ValidationError):
        validate_against("JobAccepted", {
            "id": "opj_x", "operation": "parse", "status": "queued",
            "output_format": "openparser@1",
            "created_at": "not-a-real-timestamp",
            "updated_at": "2026-09-18T10:00:00Z",
        })


def test_uri_format_is_enforced_by_the_validator() -> None:
    """The contract's only `format: uri` usage is
    `OcrModelCatalogEntry.benchmark.source_url` (confirmed by a single
    grep hit in OCR_API_OPENAPI.yaml) — exercising it means validating a
    full, otherwise-valid catalog entry, since `benchmark` has no
    standalone named schema of its own."""
    entry = _valid_catalog_entry(source_url="not a uri at all ::")
    with pytest.raises(ValidationError, match="not a 'uri'|source_url"):
        validate_against("OcrModelsResponse", {"data": [entry]})


def test_uri_format_accepts_a_well_formed_url() -> None:
    entry = _valid_catalog_entry(source_url="https://example.com/benchmarks/paddleocr-vl-1.6")
    validate_against("OcrModelsResponse", {"data": [entry]})  # must not raise


def _valid_catalog_entry(*, source_url: str) -> dict:
    """A minimal-but-schema-complete `OcrModelCatalogEntry`, with
    `benchmark` populated (the fixture in models_catalog.json leaves it
    `null`, which is valid but skips exercising `source_url`'s `uri`
    format — this helper exists specifically to populate it)."""
    return {
        "id": "paddleocr-vl-1.6",
        "label": "PaddleOCR-VL 1.6",
        "is_default": True,
        "provider": {"key": "paddleocr", "label": "PaddleOCR-VL"},
        "guidance": {
            "summary": "Vision-language document parsing model.",
            "best_for": "Dense multilingual layouts.",
            "trade_off": "Per-text recognition confidence is not always available.",
            "output": "Semantic document graph.",
        },
        "benchmark": {
            "score": 0.91,
            "version": "2026-01",
            "qualification": "internal benchmark suite",
            "source_url": source_url,
        },
        "output_summary": "openparser@1 document graph plus optional raw provider envelope.",
        "capabilities": {
            "parse": True, "extract_source": True, "markdown": True, "regions": True,
            "options": {},
        },
        "option_defaults": {},
        "option_controls": [],
        "pricing": {"usd_per_page": 0.001, "basis": "customer_retail"},
        "availability": "available",
    }


# --- Fixture validation ---------------------------------------------------

@pytest.mark.parametrize(
    ("fixture_name", "schema_name"),
    [
        ("models_catalog.json", "OcrModelsResponse"),
        ("batch_admission_accepted.json", "BatchJobAccepted"),
        ("async_admission_accepted.json", "JobAccepted"),
        ("error_response.json", "ErrorResponse"),
        ("job_queued.json", "Job"),
        ("job_running.json", "Job"),
        ("job_succeeded.json", "Job"),
        ("job_failed.json", "Job"),
        ("job_indeterminate.json", "Job"),
        ("batch_mixed_success.json", "Job"),
        ("canonical_result_openparser1.json", "ParsedDocument"),
        ("raw_result_paddleocr_vl.json", "RawParseResult"),
        ("confidence_present_recognition.json", "TextElement"),
        ("confidence_absent.json", "TextElement"),
        ("confidence_layout_detection_only.json", "TextElement"),
        ("confidence_calibrated_false.json", "Confidence"),
        ("confidence_scope_detection.json", "Confidence"),
        ("confidence_scope_recognition.json", "Confidence"),
        ("confidence_scope_classification.json", "Confidence"),
        ("confidence_scope_geometry.json", "Confidence"),
        ("confidence_scope_answer.json", "Confidence"),
        ("confidence_scope_quality.json", "Confidence"),
    ],
)
def test_fixture_validates_against_schema(fixture_name: str, schema_name: str) -> None:
    validate_against(schema_name, _fixture(fixture_name))


def test_async_admission_fixture_matches_job_accepted_shape_exactly() -> None:
    """Guards against the fixture accidentally being `Job`-shaped (with
    extra fields `JobAccepted`'s `additionalProperties: false` forbids) —
    schema validation alone would already catch that, but this asserts
    the intent directly."""
    fixture = _fixture("async_admission_accepted.json")
    assert set(fixture.keys()) == {
        "id", "operation", "status", "output_format", "created_at", "updated_at",
    }
    assert fixture["operation"] == "parse"
    assert fixture["status"] == "queued"


def test_error_response_fixture_has_expected_error_code() -> None:
    fixture = _fixture("error_response.json")
    assert fixture["error"]["code"] == "rate_limited"
    assert fixture["error"]["retryable"] is True


def test_confidence_present_fixture_has_recognition_scope() -> None:
    element = _fixture("confidence_present_recognition.json")
    assert element["confidence"]["scope"] == "recognition"


def test_confidence_absent_fixture_omits_confidence_key() -> None:
    element = _fixture("confidence_absent.json")
    assert "confidence" not in element


def test_confidence_layout_only_fixture_has_detection_scope() -> None:
    """Represents PaddleOCR-VL's real split: a layout detector can fire
    (this element exists, with a detection-scoped confidence) while
    recognition produced no usable text — never the other way around."""
    element = _fixture("confidence_layout_detection_only.json")
    assert element["confidence"]["scope"] == "detection"


def test_confidence_calibrated_false_fixture_is_explicit_not_defaulted() -> None:
    confidence = _fixture("confidence_calibrated_false.json")
    assert set(confidence.keys()) == {"score", "scope", "calibrated"}
    assert confidence["calibrated"] is False


@pytest.mark.parametrize(
    "scope", ["detection", "recognition", "classification", "geometry", "answer", "quality"],
)
def test_confidence_scope_fixture_has_matching_scope_value(scope: str) -> None:
    confidence = _fixture(f"confidence_scope_{scope}.json")
    assert confidence["scope"] == scope


def test_batch_mixed_success_fixture_matches_documented_derivation_rule() -> None:
    """Parent status `succeeded` with one failed + two succeeded children
    — the exact "mixed success/failure closes as parent succeeded" rule
    from JobStatus's own description, exercised end-to-end against real
    schema validation without any derivation code existing yet."""
    job = _fixture("batch_mixed_success.json")
    assert job["status"] == "succeeded"
    assert job["summary"]["failed"] == 1
    assert job["summary"]["succeeded"] == 2
    statuses = [child["status"] for child in job["children"]["items"]]
    assert statuses.count("failed") == 1
    assert statuses.count("succeeded") == 2


def test_fixtures_directory_has_no_orphan_files() -> None:
    """Every fixture must be exercised by at least one test above — a
    fixture added and never wired up would silently rot."""
    referenced: set[str] = set()
    source = Path(__file__).read_text(encoding="utf-8")
    referenced.update(re.findall(r'"([a-z0-9_]+\.json)"', source))

    on_disk = {p.name for p in FIXTURES_DIR.glob("*.json")}
    orphans = on_disk - referenced
    assert not orphans, f"fixture(s) never referenced by a test: {sorted(orphans)}"
