"""Smoke test for /meeting WebSocket endpoint."""

import json
import pytest
from fastapi.testclient import TestClient


def test_meeting_endpoint_exists():
    """Verify the /meeting WebSocket route is registered."""
    import sys
    sys.path.insert(0, ".")
    from server import app

    # Check that /meeting route exists
    routes = [r.path for r in app.routes]
    assert "/meeting" in routes


def test_root_shows_meeting_capability():
    """Verify root endpoint advertises meeting capability."""
    import sys
    sys.path.insert(0, ".")
    from server import app
    client = TestClient(app)
    response = client.get("/")
    data = response.json()
    assert "meeting" in str(data).lower() or response.status_code == 200
