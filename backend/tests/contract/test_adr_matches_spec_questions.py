"""
Deterministic documentation check: ADR 0001's §14 "unresolved vendor/
compliance questions" table must stay byte-for-byte identical, in wording,
punctuation, and order, to §22 of the source migration specification
(`docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md`).

This exists because the ADR's own claim is "verbatim from spec §22" — a
claim that was false for questions 1 and 9 until a 2026-09-18 correction
(the ADR had silently added words the source doesn't have: "existing"
before "keys", "the" before "exact", and a comma after "PNG/JPEG" that
the source doesn't have). A prose claim of "verbatim" with no check
behind it can silently drift the next time either document is edited;
this test is that check. Pure text comparison — no HTTP, no OpenAPI
contract, kept in `tests/contract/` anyway since it's the same
"freeze a document against its own source of truth" discipline
`test_records_contract.py` already applies to a JSON fixture.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SPEC_PATH = REPO_ROOT / "docs" / "internal" / "OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md"
ADR_PATH = REPO_ROOT / "docs" / "internal" / "adr" / "0001-openparser-ocr-migration.md"

_SPEC_SECTION_HEADING = "## 22. Mandatory questions for OpenParser before production"
_NUMBERED_ITEM = re.compile(r"^(\d+)\.\s+(.*\S)\s*$")
_ADR_TABLE_ROW = re.compile(r"^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*\|\s*\|\s*\|\s*\|\s*$")


def _extract_spec_questions() -> dict[int, str]:
    """§22's numbered list — everything between its own heading and the
    next `## ` heading (or end of file)."""
    text = SPEC_PATH.read_text(encoding="utf-8")
    start = text.index(_SPEC_SECTION_HEADING) + len(_SPEC_SECTION_HEADING)
    rest = text[start:]
    next_heading = rest.find("\n## ")
    section = rest if next_heading == -1 else rest[:next_heading]

    questions: dict[int, str] = {}
    for line in section.splitlines():
        match = _NUMBERED_ITEM.match(line)
        if match:
            questions[int(match.group(1))] = match.group(2)
    return questions


def _extract_adr_questions() -> dict[int, str]:
    """ADR §14's table rows — matches the exact 6-column shape
    `| # | Question | Answer | Answered by | Date | Evidence |` with the
    last four cells blank (unanswered)."""
    text = ADR_PATH.read_text(encoding="utf-8")
    questions: dict[int, str] = {}
    for line in text.splitlines():
        match = _ADR_TABLE_ROW.match(line)
        if match:
            questions[int(match.group(1))] = match.group(2)
    return questions


def test_spec_section_22_has_exactly_12_numbered_questions() -> None:
    questions = _extract_spec_questions()
    assert sorted(questions.keys()) == list(range(1, 13)), (
        f"expected questions numbered 1..12 in spec §22, found {sorted(questions.keys())}"
    )


def test_adr_table_has_exactly_12_rows() -> None:
    questions = _extract_adr_questions()
    assert sorted(questions.keys()) == list(range(1, 13)), (
        f"expected 12 rows numbered 1..12 in ADR §14, found {sorted(questions.keys())}"
    )


def test_adr_questions_are_byte_for_byte_identical_to_spec() -> None:
    spec_questions = _extract_spec_questions()
    adr_questions = _extract_adr_questions()
    mismatches = []
    for number in range(1, 13):
        spec_text = spec_questions.get(number)
        adr_text = adr_questions.get(number)
        if spec_text != adr_text:
            mismatches.append(
                f"Q{number}:\n  spec: {spec_text!r}\n  adr:  {adr_text!r}"
            )
    assert not mismatches, (
        "ADR §14 question wording has drifted from spec §22 — fix the ADR "
        "table to match exactly:\n" + "\n".join(mismatches)
    )
