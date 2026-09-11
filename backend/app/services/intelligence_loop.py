"""
intelligence_loop.py — the ONE place all four Phase 4 USPs connect after a
record becomes VERIFIED:

  verified record -> ProductInspectionLink (Product DNA)
                   -> Company Profile aggregates (nothing to update here —
                      it's computed live from verified records on every
                      read, see company_profile/aggregate.py's own docstring)
                   -> risk recompute for the product and its legal entity
                      (Smart Risk; Follow-Through's case state is picked up
                      naturally by R4 next time this runs, or immediately
                      when a case is created/transitioned — see
                      api/v1/cases.py and the flag-enforcement endpoint,
                      which also call recompute_and_persist_risk directly)

Called from exactly one place: api/v1/records.py's verify_record(), AFTER
the commit that sets verification_status="Verified" — never before, never
on the early "blocked" return path, and never from anywhere else (the
pipeline itself never reaches "Verified" — see jobs/pipeline.py). This is
what makes "unverified records never affect DNA/Profile/Risk" true by
construction: there is exactly one call site, and it is gated behind a
successful verification.

Failure handling: best-effort. A bug here must never prevent an officer
from completing a legally-significant verification (the record is already
Verified by the time this runs) — but a silent failure would leave a
Verified record permanently, invisibly disconnected from its own
intelligence. The caller (verify_record) wraps this in try/except and, on
failure, records an AuditEvent so the gap is observable and
POST /records/{id}/retry-enrichment can be used to complete it later.
"""

from __future__ import annotations

import datetime

from sqlalchemy.orm import Session

from app.db.models import ComplianceRecord, Product, ProductInspectionLink, ViolationCase
from app.services.extraction.schema import ComplianceEvidenceBundle
from app.services.product_dna.identity import resolve_legal_entity, resolve_product
from app.services.risk.engine import evaluate_company_rules, evaluate_product_rules
from app.services.risk.persist import compute_scope_stamp, recompute_and_persist_risk


class EnrichmentSkipped(Exception):
    """Raised (and caught internally) when the record's evidence_bundle
    lacks enough identity signal to link — e.g. an officer resolved
    rule_6a_manufacturer's NEEDS_REVIEW verdict to PASS via /resolutions
    without ever supplying an actual manufacturer name. Not a bug, not
    retried automatically — logged the same way a real failure would be,
    since it's an equally real "this record has no DNA link" state an
    officer should be able to see and decide what to do about."""


def run_post_verification_loop(record: ComplianceRecord, db: Session) -> None:
    if record.evidence_bundle is None:
        raise EnrichmentSkipped("No evidence_bundle on this record.")

    bundle = ComplianceEvidenceBundle.model_validate(record.evidence_bundle)
    extraction = bundle.structured_extraction

    manufacturer_name = extraction.manufacturer.value if extraction.manufacturer else None
    generic_name = extraction.generic_name.value if extraction.generic_name else None
    if not manufacturer_name or not generic_name:
        raise EnrichmentSkipped(
            "Manufacturer or generic name unavailable (not_detected, resolved without a value) "
            "— cannot resolve Product identity."
        )

    brand = (
        extraction.brand_owner_or_marketer.value
        if extraction.brand_owner_or_marketer and not extraction.brand_owner_or_marketer.not_detected
        else None
    )
    net_quantity_raw = extraction.net_quantity.value if extraction.net_quantity else None
    if not net_quantity_raw:
        raise EnrichmentSkipped("Net quantity unavailable — cannot resolve Product identity.")

    legal_entity = resolve_legal_entity(manufacturer_name, db)
    trusted_identifier = (
        bundle.barcode_analysis.trusted_identifier
        if bundle.barcode_analysis is not None and bundle.barcode_analysis.status == "trusted"
        else None
    )
    product, match_method = resolve_product(
        legal_entity.id, brand, generic_name, net_quantity_raw, record.category, db,
        trusted_identifier=trusted_identifier,
    )

    existing_link = (
        db.query(ProductInspectionLink)
        .filter(ProductInspectionLink.compliance_record_id == record.id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .first()
    )
    if existing_link is None:
        db.add(ProductInspectionLink(
            compliance_record_id=record.id, product_id=product.id,
            match_method=match_method, status="ACTIVE",
        ))
        db.flush()

    _recompute_risk_for_subjects(product.id, legal_entity.id, db)
    db.commit()


def _recompute_risk_for_subjects(product_id, legal_entity_id, db: Session) -> None:
    """Global (unscoped) recompute — the audit-of-record copy. See
    risk/persist.py's own docstring for why the scoped "current risk
    summary" shown in a read is a completely separate, live recomputation
    that never touches these persisted rows."""
    product_records = (
        db.query(ComplianceRecord)
        .join(ProductInspectionLink, ProductInspectionLink.compliance_record_id == ComplianceRecord.id)
        .filter(ProductInspectionLink.product_id == product_id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .filter(ComplianceRecord.verification_status == "Verified")
        .all()
    )
    product_open_cases = (
        db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id.in_([r.id for r in product_records]))
        .filter(ViolationCase.status != "CLOSED")
        .count()
        if product_records else 0
    )
    product_triggered = evaluate_product_rules(product_records, product_open_cases)
    scope_level, scope_jurisdiction_id = compute_scope_stamp(product_records)
    recompute_and_persist_risk("PRODUCT", product_id, product_triggered, scope_level, scope_jurisdiction_id, db)

    company_rows = (
        db.query(ComplianceRecord, Product.id)
        .join(ProductInspectionLink, ProductInspectionLink.compliance_record_id == ComplianceRecord.id)
        .join(Product, Product.id == ProductInspectionLink.product_id)
        .filter(Product.legal_entity_id == legal_entity_id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .filter(ComplianceRecord.verification_status == "Verified")
        .all()
    )
    company_records = [r for r, _ in company_rows]
    product_id_by_record = {r.id: pid for r, pid in company_rows}
    company_open_cases = (
        db.query(ViolationCase)
        .filter(ViolationCase.originating_record_id.in_([r.id for r in company_records]))
        .filter(ViolationCase.status != "CLOSED")
        .count()
        if company_records else 0
    )
    company_triggered = evaluate_company_rules(company_records, product_id_by_record, company_open_cases)
    company_scope_level, company_scope_jid = compute_scope_stamp(company_records)
    recompute_and_persist_risk(
        "COMPANY", legal_entity_id, company_triggered, company_scope_level, company_scope_jid, db
    )


def recompute_risk_for_record_subjects(record: ComplianceRecord, db: Session) -> None:
    """Called from case creation/transition (api/v1/cases.py,
    flag-enforcement) so R4 (open-case) reflects the current case state
    immediately, not only at the next verification. No-op if this record
    was never linked to a product (enrichment pending/failed/skipped)."""
    link = (
        db.query(ProductInspectionLink)
        .filter(ProductInspectionLink.compliance_record_id == record.id)
        .filter(ProductInspectionLink.status == "ACTIVE")
        .first()
    )
    if link is None:
        return
    product = db.get(Product, link.product_id)
    if product is None:
        return
    _recompute_risk_for_subjects(product.id, product.legal_entity_id, db)
    db.commit()
