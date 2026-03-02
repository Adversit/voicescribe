#!/usr/bin/env python3
import json
import math
import os
import struct
import tempfile
import time
import uuid
import wave
from pathlib import Path
from urllib import request, error


BASE_URL = os.environ.get("VOICESCRIBE_TEST_URL", "http://127.0.0.1:8765")


def http_get_json(url: str):
    opener = request.build_opener(request.ProxyHandler({}))
    with opener.open(url, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def make_test_wav() -> Path:
    fd, p = tempfile.mkstemp(prefix="voicescribe_real_", suffix=".wav")
    os.close(fd)
    out = Path(p)
    fr = 16000
    sec = 1.0
    n = int(fr * sec)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(fr)
        for i in range(n):
            v = int(0.2 * 32767 * math.sin(2 * math.pi * 440 * i / fr))
            w.writeframes(struct.pack("<h", v))
    return out


def post_multipart_transcribe(audio_path: Path) -> tuple[int, str]:
    boundary = "----VoiceScribeBoundary" + uuid.uuid4().hex
    parts = []

    def add_field(name: str, value: str):
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )

    add_field("engine", "whisper")
    add_field("model", "tiny")
    add_field("language", "zh")
    add_field("enable_diarization", "false")
    add_field("hotwords", "OpenAI,VoiceScribe")
    add_field("enable_ai_refine", "false")

    audio_bytes = audio_path.read_bytes()
    parts.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="audio"; filename="{audio_path.name}"\r\n'
            "Content-Type: audio/wav\r\n\r\n"
        ).encode("utf-8")
    )
    parts.append(audio_bytes)
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(parts)

    req = request.Request(
        BASE_URL.rstrip("/") + "/transcribe",
        method="POST",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    opener = request.build_opener(request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=120) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def main():
    print(f"[INFO] Backend: {BASE_URL}")
    try:
        health = http_get_json(BASE_URL.rstrip("/") + "/health")
    except Exception as e:
        raise SystemExit(f"[FAIL] Cannot reach backend health endpoint: {e}")
    print("[INFO] /health:", json.dumps(health, ensure_ascii=False))
    if health.get("mock_mode"):
        raise SystemExit("[FAIL] Backend is in mock mode, not real inference.")

    wav = make_test_wav()
    try:
        status, body = post_multipart_transcribe(wav)
        print(f"[INFO] /transcribe status={status}")
        print("[INFO] /transcribe body:", body)
        if status != 200:
            raise SystemExit("[FAIL] Transcribe request failed.")
        obj = json.loads(body)
        if "(mock)" in str(obj.get("engine", "")).lower():
            raise SystemExit("[FAIL] Engine result indicates mock mode.")
        print("[PASS] Real inference path is working.")
    finally:
        try:
            wav.unlink(missing_ok=True)
        except Exception:
            pass


if __name__ == "__main__":
    main()
