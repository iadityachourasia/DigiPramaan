"""
schemas_v0.py — a hand-mirrored Pydantic model of the CURRENT
`GET /api/records` contract, as defined by:

  - src/types/compliance.ts  (ComplianceRecord, DeclarationCheck, Violation,
                               ComplianceScore, Evidence, RecordsPage)
  - src/types/scan.ts        (ExtractionResult, ExtractedDeclaration,
                               FontSizeCheck, UploadedImage)

This is NOT generated — there is no shared codegen pipeline between the
TypeScript source and this Python contract yet. It must be updated by hand
whenever those TS types change, in the same change that regenerates
`fixtures/records_page_v0.json`. Phase 2's real implementation is what this
contract exists to hold accountable; it is superseded once that lands.

`extra="forbid"` everywhere deliberately: this is meant to be an exact
freeze of today's shape, not a loose approximation. A field this schema
doesn't know about should fail the contract test, not pass silently.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict

_STRICT = ConfigDict(extra="forbid")


class UploadedImage(BaseModel):
    model_config = _STRICT
    id: str
    fileName: str
    url: str
    sizeBytes: int
    angle: Literal["front", "back", "side_pdp", "additional", "other"]
    altText: str


class DeclarationCheck(BaseModel):
    model_config = _STRICT
    fieldId: str
    passed: bool
    value: str | None
    violationCategoryId: str | None = None
    detail: str | None = None


class Violation(BaseModel):
    model_config = _STRICT
    categoryId: str
    category: str
    legalBasis: str
    detail: str | None = None


class ComplianceScore(BaseModel):
    model_config = _STRICT
    value: int
    band: Literal["Excellent", "Good", "Poor", "Critical"]
    breakdownByCategory: dict[str, int]


class ExtractedDeclaration(BaseModel):
    model_config = _STRICT
    fieldId: str
    value: str | None
    notDetected: bool
    confidence: int
    band: Literal["High", "Medium", "Low"]
    corrected: bool
    correctedByUserId: str | None = None
    sourceEngine: Literal["paddleocr", "gemini_fallback", "manual"]
    sourceImageAngle: Literal["front", "back", "side_pdp"]


class FontSizeCheck(BaseModel):
    model_config = _STRICT
    fieldId: Literal["netQuantity", "retailSalePrice"]
    measuredHeightMm: float
    requiredHeightMm: float
    embossed: bool
    passed: bool


class ExtractionResult(BaseModel):
    model_config = _STRICT
    scanId: str
    processingStatus: Literal["Queued", "Processing", "Completed", "Failed"]
    overallConfidence: int
    declarations: list[ExtractedDeclaration]
    fontSizeChecks: list[FontSizeCheck]
    failureReason: str | None = None


class Evidence(BaseModel):
    model_config = _STRICT
    id: str
    image: UploadedImage
    caption: str
    attachedAt: str
    attachedByUserId: str


class AuditEvent(BaseModel):
    model_config = _STRICT
    id: str
    type: str
    at: str
    byUserId: str | None = None
    byUserName: str | None = None
    note: str | None = None


class ComplianceRecordV0(BaseModel):
    model_config = _STRICT
    id: str
    scanId: str
    productName: str
    manufacturerName: str
    category: str
    region: str
    source: Literal["Officer-Scanned", "Citizen-Reported", "E-commerce-Sourced"]
    verificationStatus: Literal["Extracted", "Verified"]
    complianceStatus: Literal["Pending", "Compliant", "Non-Compliant", "Needs Review"]
    needsReviewFlag: bool
    needsReviewByUserId: str | None = None
    needsReviewNote: str | None = None
    flaggedForEnforcement: bool
    checklist: list[DeclarationCheck]
    violations: list[Violation]
    complianceScore: ComplianceScore | None = None
    extraction: ExtractionResult
    evidence: list[Evidence]
    auditTrail: list[AuditEvent]
    thumbnail: UploadedImage
    capturedImages: list[UploadedImage]
    ecommerceListingUrl: str | None = None
    batchId: str | None = None
    citizenReport: dict | None = None
    assignedOfficerUserId: str | None = None
    scannedAt: str
    lastUpdatedAt: str
    archived: bool


class RecordsPageV0(BaseModel):
    model_config = _STRICT
    rows: list[ComplianceRecordV0]
    totalCount: int
    page: int
    pageSize: int
