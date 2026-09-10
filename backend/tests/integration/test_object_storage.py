"""
Requires a live S3-compatible endpoint — local MinIO (docker-compose) or,
for the MVP, Backblaze B2 — with the configured bucket already reachable
(created by the app's startup hook, app.core.object_storage.
ensure_bucket_exists, when S3_AUTO_CREATE_BUCKET is on; created once in the
B2 console when it's off, per that setting's own docstring). Excluded from
the default `pytest` run; run explicitly with `pytest -m integration`. Must
FAIL, not skip, when explicitly requested and the endpoint is unreachable.
"""

import pytest

from app.core.config import get_settings
from app.core.object_storage import get_s3_client

pytestmark = pytest.mark.integration


def test_head_bucket_succeeds() -> None:
    settings = get_settings()
    client = get_s3_client(settings)
    # Raises botocore.exceptions.ClientError/BotoCoreError on failure —
    # letting it propagate is exactly the "fail, don't skip" behavior wanted.
    client.head_bucket(Bucket=settings.s3_bucket)
