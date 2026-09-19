"""OP-Phase 7 — the shadow comparison harness's pure summary math and a
mocked-session row-building smoke test. No DB, no network, no live
OpenParser/Gemini call."""

from __future__ import annotations

import datetime
import uuid

from app.services.ocr.openparser.shadow_comparison import (
    ShadowComparisonRow,
    summarize_shadow_comparison,
)


def _row(**overrides) -> ShadowComparisonRow:
    base = dict(
        scan_session_id=uuid.uuid4(),
        evidence_image_id=uuid.uuid4(),
        angle="front",
        paddle_block_count=4,
        openparser_local_state="normalized",
        openparser_element_count=4,
        openparser_elements_with_confidence=3,
        openparser_elements_missing_confidence=1,
        openparser_poll_count=2,
        openparser_duration_ms=1500.0,
        openparser_last_error_code=None,
        openparser_last_error_message=None,
    )
    base.update(overrides)
    return ShadowComparisonRow(**base)


def test_empty_rows_returns_a_zeroed_summary_not_an_error() -> None:
    summary = summarize_shadow_comparison([])
    assert summary.row_count == 0
    assert summary.terminal_success_rate == 0.0
    assert summary.mean_paddle_block_count is None
    assert summary.mean_duration_ms is None


def test_all_terminal_success_summary_math() -> None:
    rows = [_row(), _row(paddle_block_count=6, openparser_element_count=5, openparser_elements_with_confidence=5, openparser_elements_missing_confidence=0)]
    summary = summarize_shadow_comparison(rows)

    assert summary.row_count == 2
    assert summary.terminal_success_rate == 1.0
    assert summary.mean_paddle_block_count == 5.0  # (4+6)/2
    assert summary.mean_openparser_element_count == 4.5  # (4+5)/2
    assert summary.missing_confidence_rate == 1 / 9  # 1 missing out of 9 total known
    assert summary.mean_poll_count == 2.0
    assert summary.mean_duration_ms == 1500.0


def test_a_failed_job_lowers_terminal_success_rate_and_is_excluded_from_element_counts() -> None:
    rows = [
        _row(),
        _row(
            openparser_local_state="failed",
            openparser_element_count=None,
            openparser_elements_with_confidence=None,
            openparser_elements_missing_confidence=None,
            openparser_last_error_code="provider_error",
            openparser_last_error_message="terminal failure",
        ),
    ]
    summary = summarize_shadow_comparison(rows)

    assert summary.row_count == 2
    assert summary.terminal_success_rate == 0.5
    assert summary.mean_openparser_element_count == 4.0  # only the successful row counted


def test_missing_confidence_rate_is_none_when_no_confidence_data_exists() -> None:
    rows = [
        _row(openparser_elements_with_confidence=None, openparser_elements_missing_confidence=None)
    ]
    summary = summarize_shadow_comparison(rows)
    assert summary.missing_confidence_rate is None


def test_duration_average_ignores_rows_with_no_known_duration() -> None:
    rows = [_row(openparser_duration_ms=1000.0), _row(openparser_duration_ms=None)]
    summary = summarize_shadow_comparison(rows)
    assert summary.mean_duration_ms == 1000.0  # the None row is excluded, not averaged as 0


def test_cost_and_paddle_latency_are_explicitly_reported_unavailable() -> None:
    summary = summarize_shadow_comparison([_row()])
    assert summary.cost_data_available is False
    assert summary.paddle_latency_available is False


# --- _openparser_duration_ms (module-private, imported directly) -----------


def test_openparser_duration_ms_none_when_timestamps_missing() -> None:
    from app.services.ocr.openparser.shadow_comparison import _openparser_duration_ms
    from types import SimpleNamespace

    job = SimpleNamespace(provider_created_at=None, provider_completed_at=None)
    assert _openparser_duration_ms(job) is None


def test_openparser_duration_ms_computed_when_both_present() -> None:
    from app.services.ocr.openparser.shadow_comparison import _openparser_duration_ms
    from types import SimpleNamespace

    start = datetime.datetime(2026, 9, 19, 10, 0, 0, tzinfo=datetime.timezone.utc)
    end = start + datetime.timedelta(seconds=2)
    job = SimpleNamespace(provider_created_at=start, provider_completed_at=end)
    assert _openparser_duration_ms(job) == 2000.0
