from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    # Entering as a context manager is deliberate, not stylistic: only this
    # form runs the app's lifespan (startup/shutdown) events. A bare
    # `TestClient(create_app())` silently skips them — which once let a
    # startup-crashing bug in the object-storage bucket-creation hook pass
    # every automated test while crashing the real `uvicorn` process.
    with TestClient(create_app()) as test_client:
        yield test_client
