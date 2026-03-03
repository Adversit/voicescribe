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

    # 1) edit_selected basic rewrite
    resp = client.post(
        "/process_text",
        json={
            "mode": "edit_selected",
            "selected_text": "这是一个需要改写的句子。",
            "instruction": "改写一下，让语气自然",
            "command": "rewrite",
        },
    )
    tests.append(("edit_selected/rewrite", resp.status_code == 200 and bool(resp.json().get("result_text"))))

    # 2) edit_selected summarize
    resp = client.post(
        "/process_text",
        json={
            "mode": "edit_selected",
            "selected_text": "第一句。第二句。第三句。",
            "instruction": "总结",
            "command": "summarize",
        },
    )
    tests.append(("edit_selected/summarize", resp.status_code == 200 and bool(resp.json().get("result_text"))))

    # 3) ask_selected
    resp = client.post(
        "/process_text",
        json={
            "mode": "ask_selected",
            "selected_text": "VoiceScribe 支持本地语音转写与说话人管理。",
            "question": "这个系统的核心能力是什么？",
        },
    )
    tests.append(("ask_selected/basic", resp.status_code == 200 and bool(resp.json().get("result_text"))))

    # 4) selected_text required
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
