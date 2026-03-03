#!/usr/bin/env python
"""
Smoke tests for /process_text endpoint.
Runs in-process via FastAPI TestClient (no external server needed).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def main() -> int:
    root = project_root()
    backend_dir = root / "backend"
    sys.path.insert(0, str(backend_dir))
    os.chdir(str(backend_dir))

    from fastapi.testclient import TestClient  # type: ignore
    import server  # type: ignore

    client = TestClient(server.app)

    tests = []

    # 1) edit_selected basic request
    resp = client.post(
        "/process_text",
        json={
            "mode": "edit_selected",
            "selected_text": "Conclusion: Haiku is not always instant.",
            "instruction": "Delete the word Conclusion.",
            "command": "rewrite",
        },
    )
    payload = resp.json() if resp.status_code == 200 else {}
    tests.append(
        (
            "edit_selected/basic",
            resp.status_code == 200 and isinstance(payload.get("result_text"), str),
        )
    )

    # 2) ask_selected basic request
    resp = client.post(
        "/process_text",
        json={
            "mode": "ask_selected",
            "selected_text": "VoiceScribe supports local transcription and speaker management.",
            "question": "What are the core capabilities?",
        },
    )
    payload = resp.json() if resp.status_code == 200 else {}
    tests.append(
        (
            "ask_selected/basic",
            resp.status_code == 200 and isinstance(payload.get("result_text"), str),
        )
    )

    # 3) selected_text required
    resp = client.post(
        "/process_text",
        json={
            "mode": "ask_selected",
            "selected_text": "",
            "question": "test",
        },
    )
    tests.append(("validation/selected_text_required", resp.status_code == 400))

    failed = [name for name, ok in tests if not ok]
    for name, ok in tests:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")

    if failed:
        print("\nFailed tests:")
        for name in failed:
            print(f"- {name}")
        return 1

    print("\nAll /process_text smoke tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
