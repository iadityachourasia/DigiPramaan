"""
body_size.py — P2 hardening (2026-09-19, F-006/N-16): request-size guards
for multipart file uploads.

Two layers, used together:
  - `max_body_size(max_bytes)`: a dependency factory that fast-fails on a
    declared `Content-Length` that already exceeds the cap, before any
    read starts — the cheap path for a client sending an honest header.
  - `read_capped`/`read_capped_sync`: the real defense against a client
    that omits or lies about `Content-Length`, or streams chunked with no
    length at all — reads in bounded chunks and raises the instant the
    running total crosses the cap, never buffering the full oversized
    body first.

`read_capped` is for `async def` handlers (uses `UploadFile.read()`).
`read_capped_sync` is for plain `def` handlers (FastAPI threadpools the
whole body, so `UploadFile.file.read()` — the underlying sync
`SpooledTemporaryFile`'s own read — is used directly, matching the N-16
fix's own conversion of those handlers to plain `def`).
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, UploadFile, status

from app.core.config import Settings, get_settings

_CHUNK_SIZE = 256 * 1024


def max_body_size(settings_field: str):
    """Dependency factory. `settings_field` names a `Settings` int field
    (e.g. "scan_image_max_bytes") read at request time — not a literal
    byte count — so the cap stays env-tunable like every other limit in
    `Settings`, rather than being frozen at route-declaration time."""

    def _check(request: Request, settings: Settings = Depends(get_settings)) -> None:
        max_bytes = getattr(settings, settings_field)
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                declared = int(content_length)
            except ValueError:
                return
            if declared > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Request body exceeds the {max_bytes} byte limit",
                )

    return _check


def _too_large(max_bytes: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=f"File exceeds the {max_bytes} byte limit",
    )


async def read_capped(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise _too_large(max_bytes)
        chunks.append(chunk)
    return b"".join(chunks)


def read_capped_sync(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = file.file.read(_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise _too_large(max_bytes)
        chunks.append(chunk)
    return b"".join(chunks)
