"""
services/ocr/openparser/ — OP-Phase 2's typed config, error taxonomy, and
HTTP client for OpenParser, the same-day key-pool addendum (`pool.py`),
and OP-Phase 3's durable persistence/outbox/worker over `ocr_provider_
jobs`. Not wired into the pipeline yet (Phase 5) and never called from
anywhere in this codebase's own runtime path — see client.py's own
module docstring.
"""

from app.services.ocr.openparser.client import OpenParserClient
from app.services.ocr.openparser.pool import (
    OpenParserAllKeysExhausted,
    OpenParserKeyPool,
    OpenParserUnknownJob,
)
from app.services.ocr.openparser.idempotency import derive_idempotency_key
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
