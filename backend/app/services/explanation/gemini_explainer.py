"""
explanation/gemini_explainer.py — Phase 6's Gemini violation explanation
service. Mirrors ocr/gemini.py's client-construction and schema-constrained-
generation pattern exactly (genai.Client, response_schema=, response.parsed,
a dedicated *UnavailableError type) — the established pattern for every
Gemini call in this codebase.

THE HARD BOUNDARY, ENFORCED BY CODE STRUCTURE, NOT JUST THE PROMPT
---------------------------------------------------------------------
`explain_violation()` below is a pure function of its `ExplanationRequest`
input plus the Gemini API — it has no import of, and no call into,
anything that writes `ComplianceRecord.compliance_status`/`checklist`/
`violations`/`compliance_score`, or constructs a `RuleResolution`. Its
return value (`ExplanationOutput`) is handed back to the caller (api/v1/
explanations.py) purely for display and for insertion into a
`RuleExplanation` row — there is no code path anywhere by which this
function's output could alter an already-decided rule verdict, even if the
model's output were adversarial or malformed (a malformed/unparseable
response raises `GeminiExplanationError`, exactly like ocr/gemini.py's
`GeminiUnavailableError` — it never silently degrades into "no violation").

The input given to Gemini is deliberately narrow: only the rule id, the
ALREADY-DECIDED status (including any officer resolution), the legal basis,
the deterministic reason, the observed evidence, the expected requirement,
and image/evidence metadata (never raw pixels). The prompt states this
explicitly and asks Gemini to say so (`insufficientContext=True`) rather
than guess when that's not enough to explain fully.
"""

from __future__ import annotations

from pydantic import BaseModel


class ImageMetadata(BaseModel):
    image_id: str | None = None
    image_angle: str | None = None


class OfficerResolution(BaseModel):
    resolved_status: str
    resolved_by: str
    note: str


class ExplanationRequest(BaseModel):
    rule_id: str
    rule_name: str
    rule_status: str  # the ALREADY-DECIDED effective_status — never re-derived here
    legal_basis: str
    message: str  # the deterministic rule-engine reason
    evidence: dict
    expected_requirement: str | None = None
    image_metadata: ImageMetadata | None = None
    officer_resolution: OfficerResolution | None = None


class ExplanationOutput(BaseModel):
    summary: str
    whatWasFound: str
    whatIsMissingOrWrong: str
    legalContext: str
    evidenceExplanation: str
    officerGuidance: str
    insufficientContext: bool = False


class GeminiExplanationError(Exception):
    """Raised when GEMINI_API_KEY is unset, the API call fails, or the
    response isn't schema-valid — callers must surface this as a failed
    explanation attempt, never silently fabricate one."""


_EXPLANATION_PROMPT = """You are explaining an ALREADY-DECIDED Legal \
Metrology compliance rule result to a government enforcement officer, in \
India. The result below is authoritative and FINAL — you are not deciding, \
re-deciding, second-guessing, or being asked your opinion on compliance. \
Do not state or imply any status other than the one given. Do not invent \
legal requirements, evidence, or facts not given below. If the information \
given is not enough to explain some part of this fully and honestly, set \
insufficientContext to true and say what's missing in `summary` rather than \
guessing.

Rule: {rule_id} — {rule_name}
Legal basis: {legal_basis}
Authoritative status (already decided, do not change): {rule_status}
Deterministic reason given by the rule engine: {message}
Expected requirement: {expected_requirement}
Observed evidence: {evidence}
Image/evidence metadata: {image_metadata}
Officer resolution (if any — an officer's own judgment call already made \
on top of the automated status): {officer_resolution}

Return structured JSON matching the required schema exactly: summary, \
whatWasFound, whatIsMissingOrWrong, legalContext, evidenceExplanation, \
officerGuidance, insufficientContext.
"""


def _build_prompt(request: ExplanationRequest) -> str:
    return _EXPLANATION_PROMPT.format(
        rule_id=request.rule_id,
        rule_name=request.rule_name,
        legal_basis=request.legal_basis,
        rule_status=request.rule_status,
        message=request.message,
        expected_requirement=request.expected_requirement or "not specified",
        evidence=request.evidence,
        image_metadata=request.image_metadata.model_dump() if request.image_metadata else "none",
        officer_resolution=request.officer_resolution.model_dump() if request.officer_resolution else "none",
    )


def _get_client(api_key: str):
    from google import genai

    return genai.Client(api_key=api_key)


def explain_violation(request: ExplanationRequest, settings) -> ExplanationOutput:
    if not settings.gemini_api_key:
        raise GeminiExplanationError("GEMINI_API_KEY is not set")

    client = _get_client(settings.gemini_api_key)
    prompt = _build_prompt(request)

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[prompt],
            config={
                "response_mime_type": "application/json",
                "response_schema": ExplanationOutput,
            },
        )
    except Exception as exc:  # noqa: BLE001 - any Gemini SDK/network failure
        raise GeminiExplanationError(f"Gemini explanation call failed: {exc}") from exc

    parsed: ExplanationOutput | None = response.parsed
    if parsed is None:
        raise GeminiExplanationError("Gemini did not return schema-valid structured output")
    return parsed
