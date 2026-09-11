"""
mobile_upload_sessions — Phase 10's real Mobile QR Handoff delegated-
capture sessions.

A row here grants a phone that has ONLY the raw token (never persisted —
`token_hash` is a sha256 hex digest, see services/mobile_handoff/tokens.py)
narrow, time-limited authority to upload evidence images for exactly one
`scan_sessions` row — nothing else. No `Profile`/role is involved on the
phone side; `api/deps/mobile_handoff.py`'s `get_active_handoff` is the
only thing that ever resolves a raw token back to this row.

Per-angle capture progress is deliberately NOT duplicated here — it's
derived live from real `EvidenceImage` rows for `scan_session_id` (see
api/v1/mobile_handoff.py's own status-building helper), so this table
never drifts out of sync with the evidence it's meant to describe.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class MobileUploadSession(Base):
    __tablename__ = "mobile_upload_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    scan_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scan_sessions.id"), nullable=False, index=True
    )
    # sha256 hex digest of the raw token — the raw value itself is never
    # written anywhere (not here, not in a log line, not in an audit
    # event). A lookup hashes the caller's token and compares.
    token_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    # ACTIVE | COMPLETED | EXPIRED | REVOKED
    status: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE")
    expires_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_activity_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
