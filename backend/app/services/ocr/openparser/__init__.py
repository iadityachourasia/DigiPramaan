"""
services/ocr/openparser/ — OP-Phase 2's typed config, error taxonomy, and
HTTP client for OpenParser, plus the same-day key-pool addendum
(`pool.py`). Not wired into the pipeline yet (Phase 5) and never called
from anywhere in this codebase's own runtime path — see client.py's own
module docstring.
"""

from app.services.ocr.openparser.client import OpenParserClient
from app.services.ocr.openparser.pool import (
    OpenParserAllKeysExhausted,
    OpenParserKeyPool,
    OpenParserUnknownJob,
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
