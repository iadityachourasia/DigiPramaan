"""
object_storage.py — a thin, shared boto3 client factory for the
S3-compatible (MinIO) endpoint.

Phase 0 scope only: constructing a client and creating the configured bucket
idempotently at startup. No upload/presign flow — that's Phase 5+.
"""

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

# botocore's own defaults (60s connect timeout, several retries) mean a
# single unreachable-MinIO call can block for a long time — multiplied by
# every test that touches app startup, or by an operator staring at a slow
# /health/ready. A short, explicit timeout with no retries makes "MinIO is
# unreachable" fail fast and predictably instead. Used ONLY for the startup
# bucket check and the health-check endpoint below — never for pipeline
# image fetches or uploads, which need to tolerate real network latency
# instead of crashing a background job on a transient B2 hiccup (this was
# the exact cause of a pipeline resume dying mid-run with nothing persisted,
# found during Phase 8's real-image validation).
_FAST_FAIL_CONFIG = BotoConfig(connect_timeout=2, read_timeout=2, retries={"max_attempts": 1})

# The default for every other caller (pipeline fetches, scan uploads, report
# generation, font-height measurement): tolerant enough to survive a real B2
# network blip via a small retry budget, instead of the 2s/2s/no-retry
# config above meant only for "is the endpoint even reachable" checks.
_DEFAULT_CONFIG = BotoConfig(connect_timeout=10, read_timeout=30, retries={"max_attempts": 3})


def get_s3_client(settings, *, fast_fail: bool = False):
    """`fast_fail=True` is for startup/health-check callers that want a
    quick, no-retry answer to "is object storage reachable" — see
    `_FAST_FAIL_CONFIG`'s own docstring. Every other caller should use the
    default (tolerant) config."""
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        use_ssl=settings.s3_use_ssl,
        config=_FAST_FAIL_CONFIG if fast_fail else _DEFAULT_CONFIG,
    )


def ensure_bucket_exists(settings) -> None:
    """Idempotent: creates the configured bucket if it doesn't exist yet, so
    a fresh `docker compose up` is self-sufficient with no manual `mc mb`
    step. Never raises on a connectivity failure — startup must not crash
    because MinIO happens to be briefly unavailable (or absent, as on a
    machine with no Docker at all); /health/ready is what reports that, not
    app boot. A totally unreachable endpoint raises `BotoCoreError`
    (e.g. `EndpointConnectionError`), which is distinct from `ClientError`
    (a reachable endpoint that reports "no such bucket") — both must be
    caught here, or an unreachable MinIO takes the whole app down with it.
    """
    client = get_s3_client(settings, fast_fail=True)
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except (ClientError, BotoCoreError):
        try:
            client.create_bucket(Bucket=settings.s3_bucket)
        except (ClientError, BotoCoreError):
            pass  # Surfaced by /health/ready instead of failing startup.
