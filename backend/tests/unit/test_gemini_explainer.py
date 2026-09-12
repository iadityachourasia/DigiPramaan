"""
Unit tests for explanation/gemini_explainer.py.

(J) is the important one: a structural assertion that the explanation
module has no import of, and no callable reference to, anything that
writes compliance_status/checklist/violations/compliance_score/resolution.
This is checked at the AST/source level, not just "we didn't call it in
this test" — a behavioral test alone can't prove absence of a code path.
"""

from __future__ import annotations

import ast
import inspect
from unittest.mock import MagicMock, patch

from app.services.explanation import gemini_explainer
from app.services.explanation.gemini_explainer import (
    ExplanationOutput,
    ExplanationRequest,
    GeminiExplanationError,
    _build_prompt,
    explain_violation,
)

_FORBIDDEN_NAMES = {
    "compliance_status", "checklist", "violations", "compliance_score",
    "RuleResolution", "compute_legal_status", "compute_compliance_score",
    "to_checklist_and_violations", "carry_forward_resolutions",
}


def test_explanation_module_has_no_authoritative_write_capability():
    """(J) — a static, AST-level check that no name anywhere in this
    module's source references anything that could mutate the rule
    engine's own authoritative state."""
    source = inspect.getsource(gemini_explainer)
    tree = ast.parse(source)
    referenced_names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    referenced_attrs = {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)}
    all_names = referenced_names | referenced_attrs
    forbidden_hits = all_names & _FORBIDDEN_NAMES
    assert not forbidden_hits, f"gemini_explainer.py references forbidden authoritative-state names: {forbidden_hits}"


def test_prompt_states_result_is_already_decided_and_final():
    request = ExplanationRequest(
        rule_id="rule_7_font_size", rule_name="Numeral/letter height", rule_status="FAIL",
        legal_basis="Rule 7", message="Measured height 2.00mm is below the required 4.0mm minimum.",
        evidence={"measured_height_mm": 2.0},
    )
    prompt = _build_prompt(request)
    assert "ALREADY-DECIDED" in prompt
    assert "FAIL" in prompt
    assert "do not change" in prompt.lower() or "not deciding" in prompt.lower()


def test_prompt_includes_officer_resolution_when_present():
    from app.services.explanation.gemini_explainer import OfficerResolution

    request = ExplanationRequest(
        rule_id="rule_8_pdp_presence", rule_name="PDP presence", rule_status="PASS",
        legal_basis="Rule 8", message="Officer confirmed presence.", evidence={},
        officer_resolution=OfficerResolution(resolved_status="PASS", resolved_by="officer-1", note="Confirmed in person"),
    )
    prompt = _build_prompt(request)
    assert "Confirmed in person" in prompt


def test_explain_violation_raises_when_api_key_missing():
    settings = MagicMock(gemini_api_keys=[])
    request = ExplanationRequest(
        rule_id="rule_7_font_size", rule_name="x", rule_status="FAIL",
        legal_basis="Rule 7", message="x", evidence={},
    )
    try:
        explain_violation(request, settings)
        assert False, "expected GeminiExplanationError"
    except GeminiExplanationError:
        pass


def test_explain_violation_returns_parsed_output():
    settings = MagicMock(gemini_api_keys=["fake-key"], gemini_model="gemini-test")
    fake_output = ExplanationOutput(
        summary="s", whatWasFound="f", whatIsMissingOrWrong="m", legalContext="l",
        evidenceExplanation="e", officerGuidance="g", insufficientContext=False,
    )
    fake_response = MagicMock(parsed=fake_output)
    fake_client = MagicMock()
    fake_client.models.generate_content.return_value = fake_response

    request = ExplanationRequest(
        rule_id="rule_7_font_size", rule_name="x", rule_status="FAIL",
        legal_basis="Rule 7", message="x", evidence={},
    )
    with patch.object(gemini_explainer, "_get_client", return_value=fake_client):
        result = explain_violation(request, settings)
    assert result == fake_output
