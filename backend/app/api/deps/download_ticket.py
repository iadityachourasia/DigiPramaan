"""
deps/download_ticket.py — P2 hardening (2026-09-19, F-010):
`get_current_user_or_ticket(kind=)`, a dependency FACTORY (it needs to
know which `kind` the route expects, so it returns a callable rather than
being a bare dependency itself).

A real Bearer JWT still works unchanged (whatever already calls the
report-download route directly with a header keeps working exactly as
before) — `?ticket=` is the NEW fallback path, checked only when no
Bearer credential is present, verified against `resource_id`/`kind`
matching the route's own path parameter (so a ticket minted for one
report can never be replayed against a different one), then the
ISSUING profile is loaded as `current_user` so every downstream
authorization/audit call site needs zero changes.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

# Reuses the exact "verify token -> load profile -> check viewer scope"
# logic get_current_user/get_current_user_from_bearer_or_query already
# use for the Bearer-header path, rather than duplicating it.
from app.api.deps.auth import _resolve_profile
from app.core.config import Settings, get_settings
from app.db.models import Profile
from app.db.session import get_db
from app.services.tickets.download_ticket import TicketError, TicketKind, verify_download_ticket

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_or_ticket(kind: TicketKind, resource_id_param: str):
    """`resource_id_param` names the route's own path parameter (e.g.
    "report_id", "image_id") — read from FastAPI's own path_params so this
    factory works across routes with differently-named resource ids
    without hardcoding one."""

    def _dependency(
        request: Request,
        ticket: str | None = None,
        credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
        db: Session = Depends(get_db),
        settings: Settings = Depends(get_settings),
    ) -> Profile:
        if credentials is not None:
            return _resolve_profile(credentials.credentials, db, settings)

        if ticket is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing bearer token or ticket query param",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            claims = verify_download_ticket(settings, ticket)
        except TicketError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

        if claims.kind != kind:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ticket is for a different resource kind")

        path_resource_id = request.path_params.get(resource_id_param)
        try:
            if path_resource_id is not None and uuid.UUID(str(path_resource_id)) != claims.resource_id:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ticket does not match this resource")
        except ValueError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ticket does not match this resource")

        profile = db.get(Profile, claims.issued_by)
        if profile is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ticket issuer no longer has a profile")
        return profile

    return _dependency
