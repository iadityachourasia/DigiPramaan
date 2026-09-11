"""
Unit tests for core/object_storage.py's client-config split — pure, no
network. Confirms `fast_fail=True` (startup/health-check callers) still gets
the short, no-retry config, while the default (every pipeline/upload/report
caller) gets the tolerant one — see `_FAST_FAIL_CONFIG`'s own docstring for
why sharing one 2s timeout across both broke real pipeline resumes.
"""

from __future__ import annotations

from types import SimpleNamespace

from app.core.object_storage import ensure_bucket_exists, get_s3_client


def _fake_settings() -> SimpleNamespace:
    return SimpleNamespace(
        s3_endpoint_url="https://s3.example.com",
        s3_access_key="key",
        s3_secret_key="secret",
        s3_bucket="bucket",
        s3_region="us-east-1",
        s3_use_ssl=True,
    )


def test_default_client_uses_tolerant_timeout():
    client = get_s3_client(_fake_settings())
    config = client.meta.config
    assert config.connect_timeout == 10
    assert config.read_timeout == 30
    # botocore normalizes `max_attempts` into `total_max_attempts` (attempts
    # including the initial try, i.e. max_attempts + 1) once resolved.
    assert config.retries["total_max_attempts"] == 4


def test_fast_fail_client_uses_short_timeout():
    client = get_s3_client(_fake_settings(), fast_fail=True)
    config = client.meta.config
    assert config.connect_timeout == 2
    assert config.read_timeout == 2
    assert config.retries["total_max_attempts"] == 2


def test_ensure_bucket_exists_uses_fast_fail_client(monkeypatch):
    """`ensure_bucket_exists` must request the fast-fail client — a slow
    startup bucket check would defeat the whole point of the split."""
    seen_fast_fail: list[bool] = []
    real_get_s3_client = get_s3_client

    def spy(settings, *, fast_fail: bool = False):
        seen_fast_fail.append(fast_fail)
        return real_get_s3_client(settings, fast_fail=fast_fail)

    monkeypatch.setattr("app.core.object_storage.get_s3_client", spy)
    ensure_bucket_exists(_fake_settings())

    assert seen_fast_fail == [True]
