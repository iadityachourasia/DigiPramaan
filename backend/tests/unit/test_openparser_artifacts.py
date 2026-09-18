"""OP-Phase 3 — the content-addressed artifact writer. Uses a fake S3
client (records put_object calls) — no real B2/MinIO needed for these
pure-logic assertions."""

from __future__ import annotations

import hashlib
from types import SimpleNamespace

from app.services.ocr.openparser.artifacts import write_artifact


class _FakeS3Client:
    def __init__(self) -> None:
        self.put_calls: list[dict] = []

    def put_object(self, **kwargs) -> None:
        self.put_calls.append(kwargs)


def _settings() -> SimpleNamespace:
    return SimpleNamespace(s3_bucket="evidence-bucket")


def test_storage_key_is_content_addressed() -> None:
    client = _FakeS3Client()
    data = b'{"hello":"world"}'
    ref = write_artifact(
        client, _settings(), job_id="job-1", kind="canonical-result", content_type="application/json", data=data
    )
    digest = hashlib.sha256(data).hexdigest()
    assert ref.storage_key == f"ocr-artifacts/job-1/canonical-result-{digest[:12]}.json"
    assert ref.sha256 == digest
    assert ref.byte_count == len(data)


def test_repeat_write_of_identical_bytes_resolves_to_the_same_key() -> None:
    client = _FakeS3Client()
    data = b'{"a":1}'
    first = write_artifact(
        client, _settings(), job_id="job-2", kind="raw-result", content_type="application/json", data=data
    )
    second = write_artifact(
        client, _settings(), job_id="job-2", kind="raw-result", content_type="application/json", data=data
    )
    assert first.storage_key == second.storage_key
    assert len(client.put_calls) == 2  # both writes happen; the key is just naturally idempotent


def test_different_bytes_never_collide_on_one_key() -> None:
    client = _FakeS3Client()
    a = write_artifact(
        client, _settings(), job_id="job-3", kind="raw-result", content_type="application/json", data=b"one"
    )
    b = write_artifact(
        client, _settings(), job_id="job-3", kind="raw-result", content_type="application/json", data=b"two"
    )
    assert a.storage_key != b.storage_key


def test_put_object_uses_the_configured_bucket_and_content_type() -> None:
    client = _FakeS3Client()
    write_artifact(
        client, _settings(), job_id="job-4", kind="canonical-result", content_type="application/json", data=b"{}"
    )
    call = client.put_calls[0]
    assert call["Bucket"] == "evidence-bucket"
    assert call["ContentType"] == "application/json"
    assert call["Key"].startswith("ocr-artifacts/job-4/canonical-result-")
