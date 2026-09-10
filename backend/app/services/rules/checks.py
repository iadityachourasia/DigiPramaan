"""
rules/checks.py — pure, deterministic Legal Metrology (Packaged Commodities)
Rules 2011 checks. Every function here takes only in-memory data
(StructuredExtraction fields, scan metadata, and — as of Phase 3.1 —
per-image quality verdicts and the total OCR block count) and returns a
RuleResult — no DB, no network, no I/O, and never a Gemini/LLM call
deciding compliance.

CORE PRINCIPLE (revised in Phase 3.1), applied to every mandatory-
declaration presence check (Rule 6(a)-(d), Rule 6/6(2) consumer care,
Rule 10 address, and the country-of-origin/import case): a missing field
is NOT automatically NEEDS_REVIEW. It is:

- FAIL, when the field is genuinely absent AND the evidence available to
  search for it was adequate — i.e. the image the field is expected on
  passed quality review (not just accepted-but-borderline) and the scan
  overall found enough OCR text to trust that a real search happened. A
  single failed OCR block is never enough on its own to declare absence;
  see _evidence_adequate()'s own docstring for exactly what "adequate"
  means here.
- NEEDS_REVIEW / INSUFFICIENT_EVIDENCE, when the evidence was ambiguous,
  incomplete, unreadable, cropped, or the relevant image was only
  borderline-quality (REVIEW, not PASS) — i.e. we cannot honestly tell
  whether the field is absent or just missed.
- NOT_APPLICABLE, for a field that's conditional (e.g. country_of_origin
  with no import evidence) and genuinely doesn't apply here.

Rule 7 (numeral/letter height) is the one rule that ALWAYS returns
INSUFFICIENT_EVIDENCE: no physical calibration hardware exists at MVP, and
a millimetre measurement is never fabricated from a 2D photograph. Phase
3.1 adds a backend-supported officer-resolution mechanism (RuleResult's
own `resolution` field, resolved via POST /records/{id}/resolutions) for
exactly this kind of legitimately-unresolvable-by-automation case.
"""

from __future__ import annotations

import re

from app.services.extraction.schema import EvidenceRef, ExtractedField, StructuredExtraction
from app.services.rules.types import RuleResult, RuleStatus

_TAX_INCLUSIVE_PATTERN = re.compile(
    r"incl(usive|\.)?\s*(of)?\s*(all\s*)?tax", re.IGNORECASE
)
_PIN_CODE_PATTERN = re.compile(r"\b\d{6}\b")
_PHONE_PATTERN = re.compile(r"(\b1800[\d\-\s]{6,}\b)|(\b\d{10}\b)")
_EMAIL_PATTERN = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
_STANDARD_UNIT_PATTERN = re.compile(
    r"\b\d+(\.\d+)?\s*(kg|g|mg|l|ml)\b", re.IGNORECASE
)
_ALLOWED_LANGUAGES = {"english", "hindi", "bilingual", "en", "hi", "hindi and english", "hindi, english"}

# Bulk/institutional exemption threshold used only by Rule 3's conservative
# heuristic (see check_rule_3_applicability) — grams/millilitres.
_BULK_EXEMPTION_THRESHOLD_G = 25_000

# Below this many total OCR blocks across the whole scan, treat the search
# as too thin to trust an "absent" conclusion regardless of per-image
# quality — a proxy for "OCR barely read anything here," distinct from
# per-image blur/darkness/resolution (which image_quality.py already
# checks). Matches jobs/pipeline.py's own FALLBACK_MIN_BLOCKS threshold —
# duplicated as a local constant rather than imported, to keep this module
# free of any dependency on the pipeline/job-orchestration layer.
_MIN_BLOCKS_FOR_ADEQUATE_SEARCH = 3

# Which image angle a field is expected to appear on — used only to decide
# whether "adequate evidence" existed to search for it, per the module
# docstring's CORE PRINCIPLE. Not a claim that a field can ONLY appear on
# this angle (OCR evidence itself is angle-tagged per-block, not per-field);
# this is a coarse, documented heuristic for the presence/absence judgment
# call specifically, nothing else in the rule engine depends on it.
_FIELD_EXPECTED_ANGLE: dict[str, str] = {
    "manufacturer": "front",
    "generic_name": "front",
    "net_quantity": "front",
    "mrp": "front",
    "manufacture_or_import_date": "back",
    "consumer_care": "back",
    "address": "back",
    "country_of_origin": "back",
}


def _evidence_adequate(
    image_quality_results: list | None, total_ocr_blocks: int, internal_field_name: str
) -> bool:
    """True only when BOTH: the scan as a whole found enough OCR text to
    trust that a real search happened (not just a near-empty read), AND
    the specific image the field is expected on passed quality review
    outright (PASS, not merely accepted-but-borderline REVIEW). Either
    condition failing means the absence is ambiguous, not confirmed —
    NEEDS_REVIEW territory, never FAIL. `image_quality_results` items are
    ImageQualitySummary-shaped (`.angle`, `.overall_verdict`)."""
    if total_ocr_blocks < _MIN_BLOCKS_FOR_ADEQUATE_SEARCH:
        return False
    angle = _FIELD_EXPECTED_ANGLE.get(internal_field_name)
    if angle is None:
        return False
    return any(
        iq.angle == angle and iq.overall_verdict == "PASS"
        for iq in (image_quality_results or [])
    )


def _check_presence(
    field: ExtractedField | None, field_id: str, rule_id: str, rule_name: str, legal_basis: str,
    evidence_adequate: bool,
) -> RuleResult:
    if field is not None and not field.not_detected:
        return RuleResult(
            rule_id=rule_id, rule_name=rule_name, field_id=field_id,
            status=RuleStatus.PASS, legal_basis=legal_basis, value=field.value,
            message=f"{rule_name} detected.",
        )
    if evidence_adequate:
        return RuleResult(
            rule_id=rule_id, rule_name=rule_name, field_id=field_id,
            status=RuleStatus.FAIL, legal_basis=legal_basis, value=None,
            message=f"{rule_name} not found despite a clear, adequately-searched image — "
                    "treated as genuinely absent, not an OCR miss.",
        )
    return RuleResult(
        rule_id=rule_id, rule_name=rule_name, field_id=field_id,
        status=RuleStatus.NEEDS_REVIEW, legal_basis=legal_basis, value=None,
        message=f"{rule_name} not detected, but the available evidence was ambiguous, incomplete, "
                "or borderline-quality — confirm in person before treating this as a violation.",
    )


def check_rule_6a_manufacturer(manufacturer: ExtractedField | None, evidence_adequate: bool) -> RuleResult:
    return _check_presence(
        manufacturer, "manufacturerDetails", "rule_6a_manufacturer",
        "Manufacturer/packer/importer details", "Rule 6(a)", evidence_adequate,
    )


def check_rule_6b_generic_name(generic_name: ExtractedField | None, evidence_adequate: bool) -> RuleResult:
    return _check_presence(
        generic_name, "genericName", "rule_6b_generic_name",
        "Generic/common name of the commodity", "Rule 6(b)", evidence_adequate,
    )


def check_rule_6c_net_quantity(net_quantity: ExtractedField | None, evidence_adequate: bool) -> RuleResult:
    return _check_presence(
        net_quantity, "netQuantity", "rule_6c_net_quantity",
        "Net quantity declaration", "Rule 6(c)", evidence_adequate,
    )


def check_rule_6d_manufacture_date(manufacture_date: ExtractedField | None, evidence_adequate: bool) -> RuleResult:
    return _check_presence(
        manufacture_date, "manufactureDate", "rule_6d_manufacture_date",
        "Month/year of manufacture, packing, or import", "Rule 6(d)", evidence_adequate,
    )


def check_rule_6e_mrp(mrp: ExtractedField | None, evidence_adequate: bool) -> RuleResult:
    """Rule 6(e) presence + Rule 2(m)'s substantive requirement that the
    retail sale price be declared inclusive of all taxes, combined into one
    result since both back the same `retailSalePrice` checklist row."""
    if mrp is None or mrp.not_detected:
        if evidence_adequate:
            return RuleResult(
                rule_id="rule_6e_mrp", rule_name="Retail sale price (MRP)", field_id="retailSalePrice",
                status=RuleStatus.FAIL, legal_basis="Rule 6(e)/2(m)", value=None,
                message="MRP not found despite a clear, adequately-searched image — treated as genuinely absent.",
            )
        return RuleResult(
            rule_id="rule_6e_mrp", rule_name="Retail sale price (MRP)", field_id="retailSalePrice",
            status=RuleStatus.NEEDS_REVIEW, legal_basis="Rule 6(e)/2(m)", value=None,
            message="MRP not detected, but the available evidence was ambiguous or borderline-quality — "
                    "confirm in person before treating this as a violation.",
        )
    if not _TAX_INCLUSIVE_PATTERN.search(mrp.value or ""):
        return RuleResult(
            rule_id="rule_6e_mrp", rule_name="Retail sale price (MRP)", field_id="retailSalePrice",
            status=RuleStatus.FAIL, legal_basis="Rule 6(e)/2(m)", value=mrp.value,
            message=f"MRP declared as '{mrp.value}' but does not state it is inclusive of all taxes, "
                    "as Rule 2(m) requires.",
        )
    return RuleResult(
        rule_id="rule_6e_mrp", rule_name="Retail sale price (MRP)", field_id="retailSalePrice",
        status=RuleStatus.PASS, legal_basis="Rule 6(e)/2(m)", value=mrp.value,
        message="MRP detected and states inclusive of all taxes.",
    )


def check_rule_6_consumer_care(consumer_care: ExtractedField | None, evidence_adequate: bool) -> RuleResult:
    """Rule 6's baseline requirement: consumer care details must be present
    at all. Completeness (a real phone/email) is Rule 6(2), checked
    separately by check_rule_6_2_consumer_care_completeness — the frontend
    adapter merges the two into one checklist row."""
    return _check_presence(
        consumer_care, "consumerCareDetails", "rule_6_consumer_care",
        "Consumer care/complaint details", "Rule 6", evidence_adequate,
    )


def check_rule_6_2_consumer_care_completeness(
    consumer_care: ExtractedField | None, evidence_adequate: bool
) -> RuleResult:
    if consumer_care is None or consumer_care.not_detected:
        if evidence_adequate:
            # The presence check above already fails this as genuinely
            # absent — 6(2)'s completeness requirement fails the same way,
            # since there's nothing to be complete.
            return RuleResult(
                rule_id="rule_6_2_consumer_care_completeness", rule_name="Consumer care contact completeness",
                field_id="consumerCareDetails", status=RuleStatus.FAIL, legal_basis="Rule 6(2)", value=None,
                message="No consumer care details found despite a clear, adequately-searched image.",
            )
        return RuleResult(
            rule_id="rule_6_2_consumer_care_completeness", rule_name="Consumer care contact completeness",
            field_id="consumerCareDetails", status=RuleStatus.NEEDS_REVIEW, legal_basis="Rule 6(2)",
            value=None, message="No consumer care details detected, but evidence was ambiguous or "
                                 "borderline-quality — completeness not assessable yet.",
        )
    value = consumer_care.value or ""
    if not (_PHONE_PATTERN.search(value) or _EMAIL_PATTERN.search(value)):
        return RuleResult(
            rule_id="rule_6_2_consumer_care_completeness", rule_name="Consumer care contact completeness",
            field_id="consumerCareDetails", status=RuleStatus.FAIL, legal_basis="Rule 6(2)", value=value,
            message=f"Consumer care details ('{value}') present but missing a phone number or email — "
                    "Rule 6(2) requires a real means of contact.",
        )
    return RuleResult(
        rule_id="rule_6_2_consumer_care_completeness", rule_name="Consumer care contact completeness",
        field_id="consumerCareDetails", status=RuleStatus.PASS, legal_basis="Rule 6(2)", value=value,
        message="Consumer care details include a phone number or email.",
    )


def check_country_of_origin(
    country_of_origin: ExtractedField | None, importer: ExtractedField | None, evidence_adequate: bool
) -> RuleResult:
    """Only evaluated when there's evidence of an import — matches the
    extraction layer's own documented convention (the Gemini structuring
    prompt already treats country_of_origin as import-only)."""
    has_import_evidence = importer is not None and not importer.not_detected and bool(importer.value)
    if not has_import_evidence:
        return RuleResult(
            rule_id="country_of_origin", rule_name="Country of origin", field_id="countryOfOrigin",
            status=RuleStatus.NOT_APPLICABLE, legal_basis="Rule 6 (imports only)", value=None,
            message="No importer detected — country of origin is only required for imported goods.",
        )
    if country_of_origin is None or country_of_origin.not_detected:
        if evidence_adequate:
            return RuleResult(
                rule_id="country_of_origin", rule_name="Country of origin", field_id="countryOfOrigin",
                status=RuleStatus.FAIL, legal_basis="Rule 6 (imports only)", value=None,
                message="An importer was detected but country of origin was not found despite a clear, "
                        "adequately-searched image — treated as genuinely absent.",
            )
        return RuleResult(
            rule_id="country_of_origin", rule_name="Country of origin", field_id="countryOfOrigin",
            status=RuleStatus.NEEDS_REVIEW, legal_basis="Rule 6 (imports only)", value=None,
            message="An importer was detected but country of origin was not, and evidence was ambiguous "
                    "or borderline-quality — confirm in person.",
        )
    return RuleResult(
        rule_id="country_of_origin", rule_name="Country of origin", field_id="countryOfOrigin",
        status=RuleStatus.PASS, legal_basis="Rule 6 (imports only)", value=country_of_origin.value,
        message="Country of origin detected for an imported product.",
    )


def check_rule_10_address(address: ExtractedField | None, evidence_adequate: bool) -> RuleResult:
    if address is None or address.not_detected:
        if evidence_adequate:
            return RuleResult(
                rule_id="rule_10_address", rule_name="Complete manufacturer/packer/importer address",
                field_id="addressCompleteness", status=RuleStatus.FAIL, legal_basis="Rule 10", value=None,
                message="Address not found despite a clear, adequately-searched image — treated as genuinely absent.",
            )
        return RuleResult(
            rule_id="rule_10_address", rule_name="Complete manufacturer/packer/importer address",
            field_id="addressCompleteness", status=RuleStatus.NEEDS_REVIEW, legal_basis="Rule 10", value=None,
            message="Address not detected, but the available evidence was ambiguous or borderline-quality — "
                    "confirm in person before treating this as a violation.",
        )
    if not _PIN_CODE_PATTERN.search(address.value or ""):
        return RuleResult(
            rule_id="rule_10_address", rule_name="Complete manufacturer/packer/importer address",
            field_id="addressCompleteness", status=RuleStatus.FAIL, legal_basis="Rule 10", value=address.value,
            message=f"Address ('{address.value}') present but no recognizable 6-digit PIN code found.",
        )
    return RuleResult(
        rule_id="rule_10_address", rule_name="Complete manufacturer/packer/importer address",
        field_id="addressCompleteness", status=RuleStatus.PASS, legal_basis="Rule 10", value=address.value,
        message="Address detected with a recognizable PIN code.",
    )


def check_rules_11_13_quantity_unit(
    net_quantity: ExtractedField | None, quantity_unit_expression: ExtractedField | None
) -> RuleResult:
    """Rules 11-13 (quantity semantics, standard/SI units, prohibited
    misleading quantity wording) combined into ONE check, per the task's
    own single-bullet phrasing — MVP scope is the standard-unit-expression
    check only, not per-commodity multi-piece semantics."""
    net_qty_missing = net_quantity is None or net_quantity.not_detected
    unit_missing = quantity_unit_expression is None or quantity_unit_expression.not_detected

    if net_qty_missing and unit_missing:
        return RuleResult(
            rule_id="rules_11_13_quantity_unit", rule_name="Quantity/unit expression",
            field_id="quantityUnitExpression", status=RuleStatus.NEEDS_REVIEW, legal_basis="Rules 11-13",
            value=None, message="Neither net quantity nor a unit expression was detected — confirm in person.",
        )
    if unit_missing:
        return RuleResult(
            rule_id="rules_11_13_quantity_unit", rule_name="Quantity/unit expression",
            field_id="quantityUnitExpression", status=RuleStatus.NEEDS_REVIEW, legal_basis="Rules 11-13",
            value=net_quantity.value if net_quantity else None,
            message="Net quantity detected but its unit expression was not separately confirmed — "
                    "cannot verify standard-unit compliance from OCR text alone.",
        )
    if not _STANDARD_UNIT_PATTERN.search(quantity_unit_expression.value or ""):
        return RuleResult(
            rule_id="rules_11_13_quantity_unit", rule_name="Quantity/unit expression",
            field_id="quantityUnitExpression", status=RuleStatus.FAIL, legal_basis="Rules 11-13",
            value=quantity_unit_expression.value,
            message=f"Unit expression ('{quantity_unit_expression.value}') does not use a standard "
                    "metric/SI unit (g, kg, mg, ml, l).",
        )
    return RuleResult(
        rule_id="rules_11_13_quantity_unit", rule_name="Quantity/unit expression",
        field_id="quantityUnitExpression", status=RuleStatus.PASS, legal_basis="Rules 11-13",
        value=quantity_unit_expression.value,
        message="Quantity expressed in a standard metric/SI unit.",
    )


def check_rule_9_language(language_detected: str | None) -> RuleResult:
    """'Basic' language/readability check per the task's own wording — text
    identification only, never a real legibility/contrast/prominence
    assessment, so this never FAILs, only NEEDS_REVIEW or PASS."""
    if language_detected is None or language_detected.strip().lower() not in _ALLOWED_LANGUAGES:
        return RuleResult(
            rule_id="rule_9_language", rule_name="Language/readability", field_id="languageReadability",
            status=RuleStatus.NEEDS_REVIEW, legal_basis="Rule 9", value=language_detected,
            message="Declaration language could not be confirmed as English/Hindi from OCR text — "
                    "verify legibility, prominence, and language in person.",
        )
    return RuleResult(
        rule_id="rule_9_language", rule_name="Language/readability", field_id="languageReadability",
        status=RuleStatus.PASS, legal_basis="Rule 9", value=language_detected,
        message=f"Declarations detected in {language_detected}.",
    )


def _side_pdp_evidence(extraction: StructuredExtraction) -> list[EvidenceRef]:
    """Every EvidenceRef across every field whose image_angle is
    'side_pdp' — shared by check_rule_8_pdp_presence and the evidence
    bundle's pdp_declarations_detected builder so the same field-iteration
    scan isn't duplicated."""
    fields: list[ExtractedField | None] = [
        extraction.manufacturer, extraction.packer, extraction.importer,
        extraction.brand_owner_or_marketer, extraction.generic_name, extraction.net_quantity,
        extraction.manufacture_or_import_date, extraction.mrp, extraction.consumer_care,
        extraction.country_of_origin, extraction.address, extraction.quantity_unit_expression,
    ]
    evidence: list[EvidenceRef] = []
    for field in fields:
        if field is None:
            continue
        evidence.extend(e for e in field.evidence if e.image_angle == "side_pdp")
    return evidence


def check_rule_8_pdp_presence(extraction: StructuredExtraction) -> RuleResult:
    if _side_pdp_evidence(extraction):
        return RuleResult(
            rule_id="rule_8_pdp_presence", rule_name="Principal display panel declaration presence",
            field_id="pdpDeclarationPresence", status=RuleStatus.PASS, legal_basis="Rule 8",
            message="OCR found declaration text on the side/PDP image.",
        )
    return RuleResult(
        rule_id="rule_8_pdp_presence", rule_name="Principal display panel declaration presence",
        field_id="pdpDeclarationPresence", status=RuleStatus.NEEDS_REVIEW, legal_basis="Rule 8",
        message="No OCR evidence from the side/PDP image — this does not necessarily mean the PDP "
                "itself lacks declarations; confirm in person.",
    )


def check_rule_7_font_size() -> RuleResult:
    """ALWAYS INSUFFICIENT_EVIDENCE. No physical calibration hardware
    exists at MVP — a millimetre measurement is never fabricated from a
    photograph. This is a hard, deliberate requirement, not a placeholder
    to fill in later without calibration hardware to back it."""
    return RuleResult(
        rule_id="rule_7_font_size", rule_name="Numeral/letter height (MRP/net quantity)",
        field_id="fontSize", status=RuleStatus.INSUFFICIENT_EVIDENCE, legal_basis="Rule 7",
        message="Font/numeral height cannot be measured from a photograph without physical "
                "calibration — requires manual verification with a scale.",
    )


def check_rule_6_3_stub() -> RuleResult:
    """Optional per the task ('only if time remains'). Minimal, honestly
    labeled stub — no mechanism exists to detect sticker overlays or label
    alterations from a single photograph, so this never fabricates a real
    verdict. Always NOT_APPLICABLE, which the frontend adapter excludes
    from the checklist entirely — this has zero visible effect until a
    real check is built."""
    return RuleResult(
        rule_id="rule_6_3_sticker", rule_name="Sticker/label alteration restriction",
        field_id="stickerAlterationRestriction", status=RuleStatus.NOT_APPLICABLE, legal_basis="Rule 6(3)",
        message="Not assessed in MVP — no mechanism exists to detect sticker overlays or label "
                "alterations from a photograph.",
    )


def _parse_quantity_grams_or_ml(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b", value, re.IGNORECASE)
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2).lower()
    if unit == "kg":
        return amount * 1000
    if unit == "l":
        return amount * 1000
    return amount  # g or ml, already base unit


def check_rule_3_applicability(
    category: str | None, net_quantity: ExtractedField | None
) -> RuleResult:
    """Conservative MVP heuristic — defaults to APPLICABLE (PASS) absent
    clear contrary evidence; never assumes an exemption without positive
    evidence, since this is a legal-compliance system and erring toward
    requiring compliance is the safer failure mode. Explicitly does NOT
    implement Rule 5/Second Schedule category logic — this heuristic is
    the entire Rule 3 implementation for MVP.

    NOTE on meaning: unlike every other rule, this result's PASS means
    "applies normally, not exempt" and NOT_APPLICABLE means "exempt." The
    frontend adapter never renders this result as a checklist row — it
    only feeds compute_legal_status's short-circuit.
    """
    if category in ("Industrial", "Institutional"):
        return RuleResult(
            rule_id="rule_3_applicability", rule_name="Rule 3 applicability", field_id="rule3Applicability",
            status=RuleStatus.NOT_APPLICABLE, legal_basis="Rule 3",
            message=f"Category '{category}' suggests a Rule 3 exemption (industrial/institutional use).",
        )

    grams = _parse_quantity_grams_or_ml(net_quantity.value if net_quantity else None)
    if grams is not None and grams > _BULK_EXEMPTION_THRESHOLD_G:
        return RuleResult(
            rule_id="rule_3_applicability", rule_name="Rule 3 applicability", field_id="rule3Applicability",
            status=RuleStatus.NOT_APPLICABLE, legal_basis="Rule 3",
            message="Bulk/institutional pack size (>25kg/25L) suggests a Rule 3 exemption — verify in person.",
        )

    return RuleResult(
        rule_id="rule_3_applicability", rule_name="Rule 3 applicability", field_id="rule3Applicability",
        status=RuleStatus.PASS, legal_basis="Rule 3",
        message="No evidence of a Rule 3 exemption — the Rules apply normally.",
    )


def run_all_rule_checks(
    extraction: StructuredExtraction,
    category: str | None = None,
    image_quality_results: list | None = None,
    total_ocr_blocks: int = 0,
) -> list[RuleResult]:
    """The single orchestration function that knows the full rule roster.
    Kept separate from each individual pure check so tests (and officer
    corrections, which re-run everything cheaply) can call this OR any one
    check in isolation.

    `image_quality_results`/`total_ocr_blocks` feed the presence checks'
    adequate-evidence judgment (see module docstring's CORE PRINCIPLE) —
    both default to "nothing," which _evidence_adequate() always treats as
    inadequate, so calling this without them degrades safely to NEEDS_REVIEW
    everywhere rather than ever fabricating a FAIL from missing context."""
    def _adequate(field_name: str) -> bool:
        return _evidence_adequate(image_quality_results, total_ocr_blocks, field_name)

    return [
        check_rule_3_applicability(category, extraction.net_quantity),
        check_rule_6a_manufacturer(extraction.manufacturer, _adequate("manufacturer")),
        check_rule_6b_generic_name(extraction.generic_name, _adequate("generic_name")),
        check_rule_6c_net_quantity(extraction.net_quantity, _adequate("net_quantity")),
        check_rule_6d_manufacture_date(extraction.manufacture_or_import_date, _adequate("manufacture_or_import_date")),
        check_rule_6e_mrp(extraction.mrp, _adequate("mrp")),
        check_rule_6_consumer_care(extraction.consumer_care, _adequate("consumer_care")),
        check_rule_6_2_consumer_care_completeness(extraction.consumer_care, _adequate("consumer_care")),
        check_country_of_origin(extraction.country_of_origin, extraction.importer, _adequate("country_of_origin")),
        check_rule_10_address(extraction.address, _adequate("address")),
        check_rules_11_13_quantity_unit(extraction.net_quantity, extraction.quantity_unit_expression),
        check_rule_9_language(extraction.language_detected),
        check_rule_8_pdp_presence(extraction),
        check_rule_7_font_size(),
        check_rule_6_3_stub(),
    ]
