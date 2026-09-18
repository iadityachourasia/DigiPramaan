"""
openparser_schema.py — loads `OCR_API_OPENAPI.yaml` (repo root) once and
validates instances against its own `components.schemas` definitions.

NOT a hand-mirrored Pydantic freeze like `schemas_v0.py` — that file exists
because the internal `/api/records` contract has no machine-readable
source of truth. OpenParser's contract is the opposite: 117 real
JSON-Schema-2020-12 definitions already live in the YAML file itself, so
re-mirroring them by hand here would just be a second copy to keep in
sync, and a drift risk `schemas_v0.py`'s approach doesn't have. This
module validates directly against the parsed document instead.

See docs/internal/adr/0001-openparser-ocr-migration.md for the decision
to add `jsonschema` as a dev-only dependency for this rather than
hand-rolling a validator.
"""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "OCR_API_OPENAPI.yaml"

# Recorded in docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md and
# re-verified at the start of OP-Phase 0 (2026-09-18) — see
# test_openapi_contract.py::test_openapi_file_matches_recorded_checksum,
# which recomputes this on every run so silent contract drift fails loudly
# rather than being caught only by manual inspection.
RECORDED_CONTRACT_SHA256 = "750d37b8455d6e8349400ef370a0d3f0f518751f95f7a0ebbc6284f9f19f98d7"


@lru_cache(maxsize=1)
def load_contract() -> dict[str, Any]:
    """The full parsed OpenAPI document. Cached — every test in this
    package can call this freely without re-parsing a 6000-line YAML file
    per test."""
    return yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))


def contract_sha256() -> str:
    return hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()


def schema(name: str) -> dict[str, Any]:
    """Raw JSON-Schema dict for `components.schemas.<name>`, unresolved
    (its own `$ref`s still point at sibling schemas) — the validator
    resolves those at validation time via the registry in `validate_against`."""
    schemas = load_contract()["components"]["schemas"]
    if name not in schemas:
        raise KeyError(f"No schema named {name!r} under components.schemas")
    return schemas[name]


_CONTRACT_URI = "urn:openparser-contract"


@lru_cache(maxsize=1)
def _registry() -> Registry:
    """A `referencing` Registry holding the full document under a fixed,
    non-empty URI. Deliberately NOT the empty-string URI: `validate_against`
    below validates a small per-call wrapper schema that is itself an
    anonymous (`$id`-less) resource at URI "" — if the root document were
    ALSO registered at "", the wrapper would shadow it and every
    `#/components/schemas/...` lookup would search the one-line wrapper
    instead of the real document. An absolute-URI `$ref` (`urn:...#/...`)
    always looks up the OTHER named resource directly, sidestepping that
    collision entirely. The root document is OpenAPI, not a JSON Schema
    itself (no `$schema` keyword `Resource.from_contents` could
    auto-detect), so the draft-2020-12 specification is given explicitly."""
    contract = load_contract()
    resource = Resource(contents=contract, specification=DRAFT202012)
    return Registry().with_resource(uri=_CONTRACT_URI, resource=resource)


def _format_checker() -> FormatChecker:
    """jsonschema's `format` keyword is opt-in: `Draft202012Validator`
    checks a format string's *type* (string) but not its *content* unless
    a `format_checker` is passed to it explicitly. Even then, a specific
    format name (`uri`, `date-time`, ...) is a silent no-op unless a
    backing package is importable for it — with `rfc3339-validator` and
    `rfc3986-validator` installed (`backend/pyproject.toml`'s dev extra),
    jsonschema's own `_format.py` registers both automatically at import
    time; nothing here needs to import them directly. This function exists
    so every call site gets the same, verified-non-empty checker rather
    than each constructing `Draft202012Validator.FORMAT_CHECKER` inline
    and silently getting an empty one if the packages were ever removed."""
    checker = Draft202012Validator.FORMAT_CHECKER
    missing = {"uri", "date-time"} - set(checker.checkers)
    if missing:
        raise RuntimeError(
            f"format checker(s) {sorted(missing)} not registered — "
            "is rfc3339-validator / rfc3986-validator installed? "
            "(pip install -e '.[dev]' from backend/)"
        )
    return checker


def validate_against(schema_name: str, instance: Any) -> None:
    """Validates `instance` against `components.schemas.<schema_name>`,
    resolving any local `$ref` it contains and enforcing the `format`
    keyword (`uri`, `date-time`, etc. — see `_format_checker()`) rather
    than only structural shape. Raises `jsonschema.exceptions.
    ValidationError` (a readable, path-annotated message) on failure —
    callers don't need to catch it, pytest reports it directly.

    Deliberately validates against a one-line `{"$ref": "urn:openparser-
    contract#/components/schemas/<name>"}` wrapper rather than the target
    schema dict directly — see `_registry()`'s own comment for why a bare
    fragment ref would instead resolve against the wrapper itself."""
    validator = Draft202012Validator(
        {"$ref": f"{_CONTRACT_URI}#/components/schemas/{schema_name}"},
        registry=_registry(),
        format_checker=_format_checker(),
    )
    validator.validate(instance)


def iter_schema_names() -> list[str]:
    return sorted(load_contract()["components"]["schemas"].keys())


# --- RFC 6901 JSON Pointer resolution (correction: the original walker
# split on "/" without decoding escape sequences, so a segment containing
# a literal "/" or "~" — encoded as "~1"/"~0" — would never have resolved
# correctly. No schema name in this specific contract happens to need
# escaping today, but the walker must be correct independent of that; a
# future schema/property name could contain either character. ------------

# A "~" not immediately followed by "0" or "1" is not a valid RFC 6901
# escape sequence.
_MALFORMED_POINTER_ESCAPE = re.compile(r"~(?![01])")


def decode_json_pointer_segment(segment: str) -> str:
    """RFC 6901 §4: decode by first transforming every `~1` to `/`, THEN
    every `~0` to `~` — that order matters and reversing it silently
    produces the wrong string for a segment containing both. Rejects any
    `~` not immediately followed by `0` or `1` as malformed, since a
    silently-ignored bad escape would resolve to the wrong property
    instead of failing loudly."""
    malformed = _MALFORMED_POINTER_ESCAPE.search(segment)
    if malformed:
        raise ValueError(
            f"malformed JSON Pointer escape sequence in segment {segment!r} "
            f"at index {malformed.start()}"
        )
    return segment.replace("~1", "/").replace("~0", "~")


def resolve_local_ref(document: dict[str, Any], ref: str) -> Any:
    """Resolves a `$ref` STRING VALUE (e.g. `"#/components/schemas/Job"`)
    against `document` by walking RFC 6901-decoded JSON Pointer segments.

    Only root-relative local references (`#/...`) are accepted. Anything
    else — a relative file path, an absolute URL, a bare `#`, a
    fragment-less external document — is rejected outright with
    `ValueError`, never silently followed or silently ignored. This
    contract is expected to define no external references at all; a
    non-local `$ref` appearing anywhere is itself a fact worth failing on.
    """
    if not ref.startswith("#/"):
        raise ValueError(f"external or non-pointer $ref rejected: {ref!r}")

    node: Any = document
    pointer = ref[2:]  # strip the leading "#/"
    segments = pointer.split("/") if pointer else []
    for raw_segment in segments:
        segment = decode_json_pointer_segment(raw_segment)
        if not isinstance(node, dict) or segment not in node:
            raise ValueError(
                f"$ref {ref!r} does not resolve — missing segment "
                f"{segment!r} (raw {raw_segment!r})"
            )
        node = node[segment]
    return node
