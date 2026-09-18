"""
tests/contract/openparser_fakes.py — deterministic fakes shared by every
OP-Phase 2 client test. Built on `httpx.MockTransport` (a real subclass of
`httpx.BaseTransport`, so it exercises `OpenParserClient`'s own
`transport=` injection point exactly as production code's default path
would use a real one) rather than `respx`'s global `@respx.mock` — each
test gets its own isolated fake with no process-wide monkeypatching, and
responses are built from the OP-Phase-0 fixture JSON files on disk, never
re-typed inline.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import httpx

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "openparser"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES_DIR / f"{name}.json").read_text(encoding="utf-8"))


def fixture_response(name: str, *, status: int = 200, headers: dict[str, str] | None = None) -> httpx.Response:
    return httpx.Response(status, json=load_fixture(name), headers=headers or {})


def error_response(
    *,
    status: int,
    code: str,
    message: str,
    retryable: bool,
    request_id: str = "req_test_0001",
    retry_after: float | str | None = None,
    details: dict | None = None,
) -> httpx.Response:
    body: dict = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
            "retryable": retryable,
        }
    }
    if details is not None:
        body["error"]["details"] = details
    headers = {}
    if retry_after is not None:
        headers["retry-after"] = str(retry_after)
    return httpx.Response(status, json=body, headers=headers)


class FakeSequence:
    """Returns queued `httpx.Response`s in order, one per request received
    — a `KeyError`-free way to script "first call fails, second succeeds"
    without a stateful mock library. Every `httpx.Request` actually sent
    is recorded so a test can assert on headers/method/path without a
    second real call."""

    def __init__(self, responses: list[httpx.Response] | None = None) -> None:
        self.responses: list[httpx.Response] = list(responses or [])
        self.requests: list[httpx.Request] = []

    def queue(self, response: httpx.Response) -> "FakeSequence":
        self.responses.append(response)
        return self

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if not self.responses:
            raise AssertionError(
                f"FakeSequence exhausted — unexpected {request.method} {request.url}"
            )
        return self.responses.pop(0)


def transport_for(fake: FakeSequence) -> httpx.MockTransport:
    return httpx.MockTransport(fake)


def transport_from_handler(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


class FakeClock:
    """Monotonic-shaped but fully deterministic — advances only when
    `advance()` is called (e.g. from a paired `FakeSleeper`), never from
    wall-clock time. Starts at an arbitrary fixed epoch so tests never
    depend on `time.monotonic()`'s actual value."""

    def __init__(self, start: float = 1_000.0) -> None:
        self.now = start

    def advance(self, seconds: float) -> None:
        self.now += seconds

    def __call__(self) -> float:
        return self.now


class FakeSleeper:
    """Records every requested delay instead of actually sleeping, and
    advances a paired `FakeClock` by the same amount — so a test can both
    assert exact backoff delays AND prove zero wall-clock time elapsed."""

    def __init__(self, clock: FakeClock | None = None) -> None:
        self.clock = clock
        self.delays: list[float] = []

    def __call__(self, seconds: float) -> None:
        self.delays.append(seconds)
        if self.clock is not None:
            self.clock.advance(seconds)


def zero_jitter() -> float:
    return 0.0
