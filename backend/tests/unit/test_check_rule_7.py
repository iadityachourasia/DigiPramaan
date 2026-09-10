"""
Unit tests for checks.py's check_rule_7_font_size() — pure, no DB/S3.
Exercises every branch against fake FontMeasurementResults. The shipped
config's `validated=False` means PASS/FAIL is architecturally unreachable
today; scenarios (B)/(C) prove the comparison logic itself is correct by
monkeypatching a test-local "validated" threshold, without ever touching
the real shipped (unvalidated) config.
"""

from __future__ import annotations

from app.services.measurement.font_height import FontMeasurementResult
from app.services.rules import checks as checks_module
from app.services.rules.checks import check_rule_7_font_size
from app.services.rules.rule7_thresholds import INSUFFICIENT_LEGAL_VALIDATION_MESSAGE
from app.services.rules.types import RuleStatus


def _measured(height_mm: float, confidence: float = 0.9) -> FontMeasurementResult:
    return FontMeasurementResult(
        status="measured", measured_height_mm=height_mm, confidence=confidence,
        evidence={"field_id": "retailSalePrice"},
    )


# --- (D) no measurement at all ----------------------------------------------

def test_no_measurement_is_insufficient_evidence():
    result = check_rule_7_font_size(measurement=None)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


def test_measurement_insufficient_evidence_status_passthrough():
    measurement = FontMeasurementResult(status="insufficient_evidence", evidence={})
    result = check_rule_7_font_size(measurement)
    assert result.status == RuleStatus.INSUFFICIENT_EVIDENCE


# --- (E) unreliable calibration ---------------------------------------------

def test_insufficient_calibration_is_needs_review():
    measurement = FontMeasurementResult(
        status="insufficient_calibration", evidence={"reason": "calibration line under 40px"}
    )
    result = check_rule_7_font_size(measurement)
    assert result.status == RuleStatus.NEEDS_REVIEW
    assert "40px" in result.message


# --- (F) unreliable geometry -------------------------------------------------

def test_unreliable_geometry_is_needs_review():
    measurement = FontMeasurementResult(
        status="unreliable_geometry", evidence={"reason": "pixels_per_mm 120.00 outside plausible range"}
    )
    result = check_rule_7_font_size(measurement)
    assert result.status == RuleStatus.NEEDS_REVIEW


def test_low_confidence_measurement_is_needs_review():
    measurement = _measured(5.0, confidence=0.2)
    result = check_rule_7_font_size(measurement)
    assert result.status == RuleStatus.NEEDS_REVIEW
    assert "confidence" in result.message.lower()


# --- shipped config: reliable measurement but unvalidated threshold --------

def test_reliable_measurement_against_unvalidated_threshold_is_needs_review():
    measurement = _measured(5.0, confidence=0.95)
    result = check_rule_7_font_size(measurement)
    assert result.status == RuleStatus.NEEDS_REVIEW
    assert result.message == INSUFFICIENT_LEGAL_VALIDATION_MESSAGE


# --- (B)/(C): comparison logic itself, via a test-local validated config --

def test_pass_when_measured_height_meets_validated_threshold(monkeypatch):
    monkeypatch.setattr(
        checks_module, "get_rule7_threshold_entry", lambda *a, **k: {"validated": True}
    )
    monkeypatch.setattr(checks_module, "get_required_height_mm", lambda is_embossed: 4.0)
    measurement = _measured(6.0, confidence=0.95)  # deliberately large text
    result = check_rule_7_font_size(measurement)
    assert result.status == RuleStatus.PASS


def test_fail_when_measured_height_below_validated_threshold(monkeypatch):
    monkeypatch.setattr(
        checks_module, "get_rule7_threshold_entry", lambda *a, **k: {"validated": True}
    )
    monkeypatch.setattr(checks_module, "get_required_height_mm", lambda is_embossed: 4.0)
    measurement = _measured(1.5, confidence=0.95)  # deliberately small text
    result = check_rule_7_font_size(measurement)
    assert result.status == RuleStatus.FAIL


def test_embossed_uses_embossed_threshold(monkeypatch):
    monkeypatch.setattr(
        checks_module, "get_rule7_threshold_entry", lambda *a, **k: {"validated": True}
    )
    monkeypatch.setattr(
        checks_module, "get_required_height_mm", lambda is_embossed: 6.0 if is_embossed else 4.0
    )
    measurement = _measured(5.0, confidence=0.95)  # passes 4mm, fails 6mm
    result = check_rule_7_font_size(measurement, is_embossed=True)
    assert result.status == RuleStatus.FAIL
