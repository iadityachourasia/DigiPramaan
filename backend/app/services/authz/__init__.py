"""
services/authz/ — the fail-closed authorization core (Phase 1.1).

`viewer.py` turns an authenticated `Profile` row into a `ViewerScope` —
explicit, validated, and the only representation of "who is asking" the
predicates in `repositories.py` are built from. A profile that cannot
produce a valid `ViewerScope` (inactive, unknown role, missing or
malformed jurisdiction data) is rejected at authentication time
(`api/deps/auth.py`), never silently treated as unscoped/National — see
`InvalidViewerProfile`'s own docstring for why that direction of failure
matters here specifically.

`repositories.py` is the ONE place a protected object (a compliance
record, scan session, case, e-commerce batch) is loaded from the database
for anything beyond a collection listing — every route handler that used
to call `db.get(Model, id)` directly on one of these models calls a
`get_visible_*` function here instead, and gets the identical 404 whether
the id does not exist or simply is not visible to this viewer.
"""

from app.services.authz.repositories import (
    get_visible_batch,
    get_visible_case,
    get_visible_record,
    get_visible_scan_session,
)
from app.services.authz.viewer import InvalidViewerProfile, ViewerScope

__all__ = [
    "InvalidViewerProfile",
    "ViewerScope",
    "get_visible_batch",
    "get_visible_case",
    "get_visible_record",
    "get_visible_scan_session",
]
