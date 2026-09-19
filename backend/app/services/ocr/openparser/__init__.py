"""
services/ocr/openparser/ — OP-Phase 2's typed config, error taxonomy, and
HTTP client for OpenParser, the same-day key-pool addendum (`pool.py`),
OP-Phase 3's durable persistence/outbox/worker over `ocr_provider_jobs`,
OP-Phase 4's normalization adapter (confidence, coordinate mapping,
`OcrElement`), and (OP-Phase 5) `pipeline_bridge.py`, the module
`app/jobs/pipeline.py` calls into when `OCR_PROVIDER` is
`openparser`/`openparser_shadow`. `local_paddle` (the default in every
real deployment today) never reaches any of this — see
`pipeline_bridge.py`'s own module docstring.
"""

from app.services.ocr.openparser.client import OpenParserClient
from app.services.ocr.openparser.pool import (
    OpenParserAllKeysExhausted,
    OpenParserKeyPool,
    OpenParserUnknownJob,
)
from app.services.ocr.openparser.idempotency import derive_idempotency_key
from app.services.ocr.openparser.confidence import OcrConfidence, is_recognition_confidence, map_confidence
from app.services.ocr.openparser.geometry import TransformManifest, map_bbox_to_original_pixels
from app.services.ocr.openparser.normalized_schemas import (
    BBox,
    DocumentPage,
    Element,
    ElementLocation,
    NormalizedConfidence,
    ParsedDocumentStrict,
)
from app.services.ocr.openparser.normalize import (
    NORMALIZATION_ADAPTER_VERSION,
    OcrElement,
    normalize_parsed_document,
    to_legacy_ocr_block,
)
from app.services.ocr.openparser.pipeline_bridge import (
    OpenParserPipelineFailure,
    OpenParserPipelineTimeout,
    resume_openparser_text_extraction,
    run_openparser_text_extraction,
)
from app.services.ocr.openparser.artifacts import ArtifactRef, write_artifact
from app.services.ocr.openparser.persistence import (
    StaleStateError,
    claim_due_reconciliation_work,
    claim_due_submission_work,
    create_job_intent,
    recover_stale_leases,
    transition_state,
)
from app.services.ocr.openparser.worker import (
    ReconciliationCycleResult,
    SubmissionCycleResult,
    run_reconciliation_cycle,
    run_submission_cycle,
)
from app.services.ocr.openparser.errors import (
    OpenParserAuthError,
    OpenParserError,
    OpenParserIdempotencyConflict,
    OpenParserInsufficientCredits,
    OpenParserJobFailed,
    OpenParserJobIndeterminate,
    OpenParserRateLimited,
    OpenParserRedirectRejected,
    OpenParserResponseTooLarge,
    OpenParserServiceUnavailable,
    OpenParserTransportError,
    OpenParserUnprocessable,
)
from app.services.ocr.openparser.schemas import (
    BatchJobAccepted,
    ErrorBody,
    ErrorResponse,
    Job,
    JobAccepted,
    OcrModelCatalogEntry,
    OcrModelsResponse,
    ParsedDocument,
    RawParseResult,
)

__all__ = [
    "OpenParserClient",
    "OpenParserKeyPool",
    "OpenParserAllKeysExhausted",
    "OpenParserUnknownJob",
    "derive_idempotency_key",
    "OcrConfidence",
    "is_recognition_confidence",
    "map_confidence",
    "TransformManifest",
    "map_bbox_to_original_pixels",
    "BBox",
    "DocumentPage",
    "Element",
    "ElementLocation",
    "NormalizedConfidence",
    "ParsedDocumentStrict",
    "NORMALIZATION_ADAPTER_VERSION",
    "OcrElement",
    "normalize_parsed_document",
    "to_legacy_ocr_block",
    "OpenParserPipelineFailure",
    "OpenParserPipelineTimeout",
    "resume_openparser_text_extraction",
    "run_openparser_text_extraction",
    "ArtifactRef",
    "write_artifact",
    "StaleStateError",
    "claim_due_reconciliation_work",
    "claim_due_submission_work",
    "create_job_intent",
    "recover_stale_leases",
    "transition_state",
    "ReconciliationCycleResult",
    "SubmissionCycleResult",
    "run_reconciliation_cycle",
    "run_submission_cycle",
    "OpenParserAuthError",
    "OpenParserError",
    "OpenParserIdempotencyConflict",
    "OpenParserInsufficientCredits",
    "OpenParserJobFailed",
    "OpenParserJobIndeterminate",
    "OpenParserRateLimited",
    "OpenParserRedirectRejected",
    "OpenParserResponseTooLarge",
    "OpenParserServiceUnavailable",
    "OpenParserTransportError",
    "OpenParserUnprocessable",
    "BatchJobAccepted",
    "ErrorBody",
    "ErrorResponse",
    "Job",
    "JobAccepted",
    "OcrModelCatalogEntry",
    "OcrModelsResponse",
    "ParsedDocument",
    "RawParseResult",
]
