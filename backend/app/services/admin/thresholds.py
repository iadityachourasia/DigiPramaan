"""
services/admin/thresholds.py — Admin Console's configurable-thresholds
page (2026-09-20), backed by the append-only `rule_threshold_versions`
table (a PUT inserts a new row; the current value is whichever row has
the latest `created_at` — see that model's own docstring).

`DEFAULT_THRESHOLDS` mirrors the hardcoded constants `risk/engine.py`
(`_COMPANY_REPEAT_THRESHOLD`/`_REPEAT_WINDOW_DAYS`) and
`company_profile/aggregate.py` (`_REPEAT_VIOLATION_COUNT`/`_DAYS`) already
used before this table existed — so a fresh deployment with no admin
override yet behaves identically to before.

`ocrConfidenceThreshold` is persisted here but deliberately NOT read by
any rule decision anywhere in this codebase yet — applying it needs
rule-set versioning first (a later phase), so wiring it in now would be
silent, undocumented rule-set drift. The admin page's own copy already
states this; this is the backend half of that same honesty.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session as DbSession

from app.db.models import RuleThresholdVersion

DEFAULT_THRESHOLDS: dict = {
    "repeatViolationCount": 3,
    "repeatViolationDays": 90,
    # Persisted only — no rule decision anywhere reads this yet (see this
    # module's own docstring). 70 matches the mock store's own default.
    "ocrConfidenceThreshold": 70,
    "excellentMinimum": 90,
    "goodMinimum": 70,
    "poorMinimum": 40,
}


def get_effective_thresholds(db: DbSession) -> dict:
    latest = (
        db.query(RuleThresholdVersion).order_by(RuleThresholdVersion.created_at.desc()).first()
    )
    if latest is None:
        return dict(DEFAULT_THRESHOLDS)
    return {**DEFAULT_THRESHOLDS, **latest.values}


def set_thresholds(db: DbSession, *, values: dict, created_by: uuid.UUID) -> RuleThresholdVersion:
    """Inserts a new version row — never updates an existing one."""
    version = RuleThresholdVersion(values=values, created_by=created_by)
    db.add(version)
    db.flush()
    return version
