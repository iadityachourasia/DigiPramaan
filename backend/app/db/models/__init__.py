"""
db/models — every table imported here so Base.metadata sees them, which is
what makes alembic/env.py's autogenerate (and the one hand-authored initial
migration) actually reflect the full schema. Import the package, not
individual modules, from anywhere that needs Base.metadata populated.
"""

from app.db.models.audit_event import AuditEvent
from app.db.models.case import CaseStatusHistory, ViolationCase
from app.db.models.compliance_record import ComplianceRecord
from app.db.models.legal_entity import LegalEntity
from app.db.models.mobile_handoff import MobileUploadSession
from app.db.models.product import Product, ProductInspectionLink
from app.db.models.product_identifier import ProductIdentifier
from app.db.models.report import Report
from app.db.models.risk_alert import RiskAlert
from app.db.models.rule_explanation import RuleExplanation
from app.db.models.scan import EcommerceBatch, EvidenceImage, ScanSession
from app.db.models.user_profile import Profile

__all__ = [
    "AuditEvent",
    "CaseStatusHistory",
    "ViolationCase",
    "ComplianceRecord",
    "LegalEntity",
    "MobileUploadSession",
    "Product",
    "ProductInspectionLink",
    "ProductIdentifier",
    "Report",
    "RiskAlert",
    "RuleExplanation",
    "EcommerceBatch",
    "EvidenceImage",
    "ScanSession",
    "Profile",
]
