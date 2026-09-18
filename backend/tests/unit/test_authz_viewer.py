"""
Unit tests for `ViewerScope.from_profile` — the fail-closed validation
core every object-visibility check (services/authz/repositories.py) and
`api/deps/auth.py`'s authentication gate are built on.
"""

from __future__ import annotations

import uuid

import pytest

from app.services.authz.viewer import InvalidViewerProfile, ViewerScope

USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")


class _Profile:
    def __init__(self, **kwargs) -> None:
        self.id = kwargs.get("id", USER_ID)
        self.role = kwargs.get("role", "Admin")
        self.jurisdiction_level = kwargs.get("jurisdiction_level", "National")
        self.region = kwargs.get("region", None)
        if "active" in kwargs:
            self.active = kwargs["active"]


def test_national_profile_is_valid_with_no_region_scoping() -> None:
    scope = ViewerScope.from_profile(_Profile(jurisdiction_level="National", region="Delhi"))
    assert scope.is_national is True
    # A National profile's own `region` (a posting) is deliberately never
    # carried into the scope — it is not a jurisdiction boundary.
    assert scope.region is None


def test_state_profile_with_region_is_valid() -> None:
    scope = ViewerScope.from_profile(
        _Profile(role="Enforcement Officer", jurisdiction_level="State", region="Maharashtra")
    )
    assert scope.is_national is False
    assert scope.region == "Maharashtra"
    assert scope.is_enforcement_officer is True


def test_state_profile_with_empty_region_is_rejected() -> None:
    with pytest.raises(InvalidViewerProfile):
        ViewerScope.from_profile(_Profile(jurisdiction_level="State", region=""))


def test_state_profile_with_none_region_is_rejected() -> None:
    with pytest.raises(InvalidViewerProfile):
        ViewerScope.from_profile(_Profile(jurisdiction_level="State", region=None))


def test_missing_jurisdiction_level_is_rejected() -> None:
    with pytest.raises(InvalidViewerProfile):
        ViewerScope.from_profile(_Profile(jurisdiction_level=None))


def test_unrecognized_jurisdiction_level_is_rejected() -> None:
    with pytest.raises(InvalidViewerProfile):
        ViewerScope.from_profile(_Profile(jurisdiction_level="District"))


@pytest.mark.parametrize("role", ["Enforcement Officer", "Admin", "Reviewer"])
def test_every_real_role_is_accepted(role: str) -> None:
    ViewerScope.from_profile(_Profile(role=role, jurisdiction_level="National"))


def test_unrecognized_role_is_rejected() -> None:
    with pytest.raises(InvalidViewerProfile):
        ViewerScope.from_profile(_Profile(role="Superuser"))


def test_deactivated_profile_is_rejected() -> None:
    with pytest.raises(InvalidViewerProfile):
        ViewerScope.from_profile(_Profile(active=False))


def test_profile_with_no_active_attribute_at_all_is_treated_as_active() -> None:
    """`Profile` carries no `active` column yet (added in Phase 1.5) — a
    profile with no such attribute must read as active, not be rejected
    for a column that does not exist yet."""
    profile = _Profile()
    assert not hasattr(profile, "active")
    ViewerScope.from_profile(profile)  # must not raise


def test_scope_is_frozen() -> None:
    scope = ViewerScope.from_profile(_Profile())
    with pytest.raises(Exception):  # noqa: B017 - pydantic's own frozen-model error type
        scope.role = "Reviewer"
