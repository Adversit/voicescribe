#!/usr/bin/env python3
import argparse
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import uuid
import wave
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib import error, parse, request


DEFAULT_BASE_URL = os.environ.get("VOICESCRIBE_TEST_URL", "http://127.0.0.1:8765")
DEFAULT_AUDIO = os.environ.get(
    "VOICESCRIBE_TEST_AUDIO",
    str(
        Path(__file__).resolve().parents[2]
        / "docs"
        / "20260313135647-信通院云大所市场部预定的会议-纯音频-1.m4a"
    ),
)
DEFAULT_LANGUAGE = os.environ.get("VOICESCRIBE_REAL_LANGUAGE", "zh")
DEFAULT_HOTWORDS = os.environ.get("VOICESCRIBE_REAL_HOTWORDS", "OpenAI,VoiceScribe")
DEFAULT_RESULT_FILE = (
    Path(__file__).resolve().parents[2]
    / "logs"
    / "system-tests"
    / "test_real_inference_results.jsonl"
)
DEFAULT_BATCH_AUDIO_DIR = (
    Path(__file__).resolve().parents[2]
    / "logs"
    / "system-tests"
    / "audio"
)
DEFAULT_STREAM_TRANSCRIPT_DIR = (
    Path(__file__).resolve().parents[2]
    / "logs"
    / "system-tests"
    / "transcripts"
    / "stream"
)
DEFAULT_FFMPEG = (
    Path(__file__).resolve().parents[2]
    / "tools"
    / "ffmpeg"
    / "bin"
    / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
)

BATCH_SUPPORTED_ENGINES = {
    "whisper",
    "whispercpp",
    "funasr",
    "parakeet",
    "firered",
    "qwen3asr",
    "firered2",
}
STREAM_ENGINE_CANDIDATES = [
    ("funasr", "paraformer-zh-streaming"),
    ("funasr", "paraformer-zh"),
    ("funasr", "seaco-paraformer"),
    ("firered", "firered-aed-l"),
]


@dataclass
class TestResult:
    kind: str
    target: str
    status: str
    detail: str
    artifacts: dict[str, Any] = field(default_factory=dict)


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _validate_stream_artifacts(
    *,
    started: dict[str, Any],
    utterance_events: list[dict[str, Any]],
    speaker_active_events: list[dict[str, Any]],
    session_end: dict[str, Any] | None,
    first_utterance_latency_s: float | None,
) -> tuple[bool, str, dict[str, Any]]:
    if session_end is None:
        return False, "missing session_end", {}
    if not utterance_events:
        return False, "no utterance events", {}

    issues: list[str] = []
    unique_speaker_ids: set[str] = set()
    prev_start: float | None = None
    prev_end: float | None = None

    for index, item in enumerate(utterance_events, start=1):
        text = str(item.get("text", "")).strip()
        speaker = str(item.get("speaker", "")).strip()
        speaker_id = str(item.get("speaker_id", "")).strip()
        start = _as_float(item.get("start"))
        end = _as_float(item.get("end"))

        if not text:
            issues.append(f"utterance#{index} empty text")
        if not speaker:
            issues.append(f"utterance#{index} empty speaker")
        if not speaker_id:
            issues.append(f"utterance#{index} empty speaker_id")
        if start is None or end is None:
            issues.append(f"utterance#{index} missing start/end")
            continue
        if end <= start:
            issues.append(f"utterance#{index} non-positive duration")
        if prev_start is not None and start < prev_start:
            issues.append(f"utterance#{index} start not monotonic")
        if prev_end is not None and end < prev_end:
            issues.append(f"utterance#{index} end not monotonic")
        prev_start = start
        prev_end = end
        if speaker_id:
            unique_speaker_ids.add(speaker_id)

    active_nonempty = sum(
        1
        for item in speaker_active_events
        if str(item.get("speaker", "")).strip() and str(item.get("speaker_id", "")).strip()
    )
    if active_nonempty == 0:
        issues.append("no non-empty speaker_active events")

    session_duration = _as_float(session_end.get("duration"))
    if session_duration is None or session_duration <= 0:
        issues.append(f"invalid session_end duration: {session_end.get('duration')}")

    transcript_text = "\n".join(
        str(item.get("text", "")).strip()
        for item in utterance_events
        if str(item.get("text", "")).strip()
    )
    artifacts = {
        "started": started,
        "utterances": utterance_events,
        "speaker_active": speaker_active_events,
        "session_end": session_end,
        "first_utterance_latency_s": None
        if first_utterance_latency_s is None
        else round(first_utterance_latency_s, 3),
        "unique_speaker_ids": sorted(unique_speaker_ids),
        "transcript_text": transcript_text,
    }
    if first_utterance_latency_s is None:
        issues.append("missing first utterance latency")

    detail = (
        f"utterances={len(utterance_events)} "
        f"speaker_events={active_nonempty}/{len(speaker_active_events)} "
        f"unique_speakers={len(unique_speaker_ids)} "
        f"latency_s={artifacts['first_utterance_latency_s']} "
        f"speaker_backend={started.get('speaker_backend')}"
    )
    if issues:
        return False, f"{detail} issues={'; '.join(issues[:4])}", artifacts
    return True, detail, artifacts


def http_get_json(url: str, timeout: int = 20) -> Any:
    opener = request.build_opener(request.ProxyHandler({}))
    with opener.open(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_form(
    url: str,
    fields: dict[str, str],
    timeout: int = 120,
) -> tuple[int, str]:
    boundary = "----VoiceScribeBoundary" + uuid.uuid4().hex
    parts: list[bytes] = []

    for name, value in fields.items():
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )

    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(parts)
    req = request.Request(
        url,
        method="POST",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    opener = request.build_opener(request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def post_multipart_transcribe(
    base_url: str,
    audio_path: Path,
    engine: str,
    model: str,
    language: str,
    hotwords: str,
    enable_diarization: bool,
    enable_ai_refine: bool,
    speaker_model: str,
    timeout: int,
) -> tuple[int, str]:
    boundary = "----VoiceScribeBoundary" + uuid.uuid4().hex
    parts: list[bytes] = []

    def add_field(name: str, value: str) -> None:
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )

    add_field("engine", engine)
    add_field("model", model)
    add_field("language", language)
    add_field("enable_diarization", str(enable_diarization).lower())
    add_field("hotwords", hotwords)
    add_field("enable_ai_refine", str(enable_ai_refine).lower())
    add_field("speaker_model", speaker_model)

    content_type = "audio/mp4" if audio_path.suffix.lower() in {".m4a", ".mp4"} else "audio/wav"
    parts.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="audio"; filename="{audio_path.name}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode("utf-8")
    )
    parts.append(audio_path.read_bytes())
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(parts)

    req = request.Request(
        base_url.rstrip("/") + "/transcribe",
        method="POST",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    opener = request.build_opener(request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="VoiceScribe real-model capability-aware test"
    )
    parser.add_argument("--url", default=DEFAULT_BASE_URL, help="Backend base URL")
    parser.add_argument(
        "--audio",
        default=DEFAULT_AUDIO,
        help="Real audio file used for batch/stream tests",
    )
    parser.add_argument(
        "--mode",
        choices=["all", "batch", "stream"],
        default="all",
        help="Run batch tests, stream tests, or both",
    )
    parser.add_argument("--engine", default="", help="Optional single engine override")
    parser.add_argument("--model", default="", help="Optional single model override")
    parser.add_argument(
        "--speaker-model",
        default="",
        help="Optional single speaker model override for stream/batch diarization",
    )
    parser.add_argument("--language", default=DEFAULT_LANGUAGE)
    parser.add_argument("--hotwords", default=DEFAULT_HOTWORDS)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument(
        "--batch-seconds",
        type=float,
        default=60.0,
        help="Max seconds to keep for non-stream batch tests; use 0 for the full file",
    )
    parser.add_argument(
        "--batch-offset-seconds",
        type=float,
        default=None,
        help="Start offset in seconds for batch audio slicing; default uses 3600s for the bundled meeting audio",
    )
    parser.add_argument(
        "--stream-seconds",
        type=float,
        default=30.0,
        help="Max decoded seconds to feed into /stream per speaker model",
    )
    parser.add_argument(
        "--enable-diarization",
        action="store_true",
        help="Enable diarization during batch tests",
    )
    parser.add_argument(
        "--result-file",
        default=str(DEFAULT_RESULT_FILE),
        help="Append each model result to this JSONL file as soon as it finishes",
    )
    parser.add_argument(
        "--batch-output",
        default="",
        help="Optional persistent WAV path for the preprocessed batch audio",
    )
    return parser.parse_args()


def require_backend_ready(
    base_url: str,
    timeout: int,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    try:
        health = http_get_json(base_url.rstrip("/") + "/health", timeout=timeout)
    except Exception as exc:
        raise SystemExit(
            "[FAIL] Cannot reach backend health endpoint: "
            f"{exc}\n[HINT] Start the real backend with scripts\\windows\\start_backend.bat."
        )

    print("[INFO] /health:", json.dumps(health, ensure_ascii=False))
    if health.get("mock_mode"):
        raise SystemExit(
            "[FAIL] Backend is in mock mode.\n"
            "[HINT] Use scripts\\windows\\start_backend.bat or scripts\\windows\\dev.bat "
            "with the voicescribe conda environment."
        )

    engines = http_get_json(base_url.rstrip("/") + "/engines", timeout=timeout)
    models = http_get_json(base_url.rstrip("/") + "/models", timeout=timeout)
    return health, engines, models


def build_engine_map(engines: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["name"]: item for item in engines}


def build_downloaded_models(models: list[dict[str, Any]]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for item in models:
        if not item.get("available"):
            continue
        result.setdefault(item["engine"], []).append(item["model"])
    for model_names in result.values():
        model_names.sort()
    return result


def resolve_ffmpeg() -> str:
    if DEFAULT_FFMPEG.exists():
        return str(DEFAULT_FFMPEG)
    return "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"


def decode_audio_to_pcm16(
    audio_path: Path,
    seconds: float,
    offset_seconds: float = 0.0,
) -> bytes:
    ffmpeg = resolve_ffmpeg()
    cmd = [ffmpeg, "-y", "-i", str(audio_path)]
    if offset_seconds > 0:
        cmd.extend(["-ss", str(offset_seconds)])
    cmd.extend(["-ac", "1", "-ar", "16000", "-f", "s16le"])
    if seconds > 0:
        cmd.extend(["-t", str(seconds)])
    cmd.append("pipe:1")

    try:
        completed = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        if not completed.stdout:
            raise RuntimeError("ffmpeg returned empty PCM stream")
        return completed.stdout
    except FileNotFoundError as exc:
        try:
            import torch
            import torchaudio

            info = torchaudio.info(str(audio_path))
            load_kwargs: dict[str, int] = {
                "frame_offset": int(info.sample_rate * max(offset_seconds, 0.0)),
            }
            if seconds > 0:
                load_kwargs["num_frames"] = int(info.sample_rate * seconds)
            waveform, sample_rate = torchaudio.load(str(audio_path), **load_kwargs)
            if waveform.ndim == 1:
                waveform = waveform.unsqueeze(0)
            if waveform.shape[0] > 1:
                waveform = waveform.mean(dim=0, keepdim=True)
            if sample_rate != 16000:
                waveform = torchaudio.functional.resample(waveform, sample_rate, 16000)
            pcm = (
                waveform.squeeze(0)
                .clamp(-1.0, 1.0)
                .mul(32767.0)
                .to(torch.int16)
                .cpu()
                .numpy()
                .tobytes()
            )
            if not pcm:
                raise RuntimeError("torchaudio returned empty PCM stream")
            return pcm
        except Exception as torchaudio_exc:
            raise RuntimeError(
                f"ffmpeg not found in PATH and torchaudio fallback failed: {torchaudio_exc}"
            ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"ffmpeg decode failed: {stderr}") from exc


def _write_pcm16_wav(path: Path, pcm_bytes: bytes, sample_rate: int = 16000) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)


def chunk_pcm(pcm_bytes: bytes, chunk_ms: int = 320) -> list[bytes]:
    bytes_per_sample = 2
    sample_rate = 16000
    chunk_samples = int(sample_rate * chunk_ms / 1000)
    chunk_size = chunk_samples * bytes_per_sample
    return [pcm_bytes[i : i + chunk_size] for i in range(0, len(pcm_bytes), chunk_size)]


def build_batch_audio(
    audio_path: Path,
    seconds: float,
    offset_seconds: float = 0.0,
    output_path: Path | None = None,
) -> tuple[Path, bool]:
    if seconds <= 0 and offset_seconds <= 0:
        return audio_path, False

    if output_path is not None and output_path.exists():
        return output_path, False

    pcm_bytes = decode_audio_to_pcm16(audio_path, seconds, offset_seconds)
    if output_path is None:
        fd, temp_path = tempfile.mkstemp(prefix="voicescribe_batch_", suffix=".wav")
        os.close(fd)
        out_path = Path(temp_path)
        cleanup = True
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        out_path = output_path
        cleanup = False
    try:
        _write_pcm16_wav(out_path, pcm_bytes)
    except Exception:
        out_path.unlink(missing_ok=True)
        raise
    return out_path, cleanup


def run_batch_test(
    *,
    base_url: str,
    audio_path: Path,
    engine_name: str,
    model_name: str,
    engine_meta: dict[str, Any],
    speaker_model: str,
    language: str,
    hotwords: str,
    timeout: int,
    enable_diarization: bool,
) -> TestResult:
    target = f"{engine_name}/{model_name}"
    if model_name == "paraformer-zh-streaming":
        return TestResult("batch", target, "SKIP", "流式专用模型，不纳入 L4 非流式批量测试")
    if engine_name not in BATCH_SUPPORTED_ENGINES:
        return TestResult("batch", target, "SKIP", "当前测试计划未覆盖该非流式引擎")
    if not engine_meta.get("available"):
        return TestResult("batch", target, "FAIL", "后端环境中该引擎不可用")
    if model_name not in engine_meta.get("models", []):
        return TestResult("batch", target, "FAIL", "后端未注册该模型")

    load_fields = {
        "engine": engine_name,
        "model": model_name,
        "enable_diarization": str(enable_diarization).lower(),
        "speaker_model": speaker_model,
    }
    status, body = post_form(
        base_url.rstrip("/") + "/load",
        load_fields,
        timeout=timeout,
    )
    if status != 200:
        return TestResult("batch", target, "FAIL", f"/load {status}: {body}")

    status, body = post_multipart_transcribe(
        base_url=base_url,
        audio_path=audio_path,
        engine=engine_name,
        model=model_name,
        language=language,
        hotwords=hotwords,
        enable_diarization=enable_diarization,
        enable_ai_refine=False,
        speaker_model=speaker_model,
        timeout=timeout,
    )
    if status != 200:
        return TestResult("batch", target, "FAIL", f"/transcribe {status}: {body}")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return TestResult("batch", target, "FAIL", f"/transcribe returned non-JSON: {body[:200]}")

    text = str(payload.get("text", "")).strip()
    duration = payload.get("duration", 0)
    if not text:
        return TestResult("batch", target, "FAIL", "转写文本为空")
    if duration is not None:
        try:
            duration_value = float(duration)
        except (TypeError, ValueError):
            return TestResult("batch", target, "FAIL", f"duration 非法: {duration}")
        if duration_value <= 0:
            return TestResult("batch", target, "FAIL", f"duration 非法: {duration_value}")
    return TestResult("batch", target, "PASS", f"text_len={len(text)} duration={duration}")


async def run_stream_once(
    *,
    base_url: str,
    engine_name: str,
    model_name: str,
    speaker_model: str,
    pcm_bytes: bytes,
    hotwords: str,
    timeout: int,
) -> TestResult:
    try:
        import websockets
    except ImportError as exc:
        return TestResult("stream", f"{engine_name}/{model_name}@{speaker_model}", "FAIL", f"missing websockets: {exc}")

    target = f"{engine_name}/{model_name}@{speaker_model}"
    ws_url = (
        base_url.rstrip("/")
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        + "/stream"
    )
    try:
        async with websockets.connect(
            ws_url,
            open_timeout=timeout,
            ping_interval=None,
            ping_timeout=None,
            close_timeout=timeout,
            max_size=None,
        ) as ws:
            utterance_events: list[dict[str, Any]] = []
            speaker_active_events: list[dict[str, Any]] = []
            first_utterance_latency_s: float | None = None
            await ws.send(
                json.dumps(
                    {
                        "action": "start",
                        "engine": engine_name,
                        "model": model_name,
                        "speakers_enabled": True,
                        "speaker_model": speaker_model,
                        "hotwords": hotwords,
                        "enable_ai_refine": False,
                        "enable_ai_summary": False,
                    }
                )
            )
            started = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
            if started.get("type") != "started":
                return TestResult("stream", target, "FAIL", f"unexpected start payload: {started}")
            if started.get("speaker_model") != speaker_model:
                return TestResult("stream", target, "FAIL", f"speaker_model mismatch: {started}")
            loop = asyncio.get_running_loop()
            started_at = loop.time()

            async def receive_until_end() -> dict[str, Any]:
                nonlocal first_utterance_latency_s
                while True:
                    message = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                    msg_type = message.get("type")
                    if msg_type == "error":
                        return {"error": f"stream error: {message.get('message')}", "session_end": None}
                    if msg_type == "utterance":
                        utterance_events.append(message)
                        if first_utterance_latency_s is None:
                            first_utterance_latency_s = loop.time() - started_at
                    if msg_type == "speaker_active":
                        speaker_active_events.append(message)
                    if msg_type == "session_end":
                        return {"error": None, "session_end": message}

            receiver_task = asyncio.create_task(receive_until_end())
            try:
                for chunk in chunk_pcm(pcm_bytes):
                    await ws.send(chunk)
                    await asyncio.sleep(0)
                await ws.send(json.dumps({"action": "end"}))
                receive_result = await receiver_task
            finally:
                if not receiver_task.done():
                    receiver_task.cancel()

            if receive_result["error"]:
                _, detail, artifacts = _validate_stream_artifacts(
                    started=started,
                    utterance_events=utterance_events,
                    speaker_active_events=speaker_active_events,
                    session_end=receive_result["session_end"],
                    first_utterance_latency_s=first_utterance_latency_s,
                )
                return TestResult(
                    "stream",
                    target,
                    "FAIL",
                    receive_result["error"] if not utterance_events else f"{receive_result['error']} | {detail}",
                    artifacts=artifacts,
                )

            ok, detail, artifacts = _validate_stream_artifacts(
                started=started,
                utterance_events=utterance_events,
                speaker_active_events=speaker_active_events,
                session_end=receive_result["session_end"],
                first_utterance_latency_s=first_utterance_latency_s,
            )
            return TestResult(
                "stream",
                target,
                "PASS" if ok else "FAIL",
                detail,
                artifacts=artifacts,
            )
    except Exception as exc:
        return TestResult("stream", target, "FAIL", str(exc))


def post_reload_speaker_models(
    base_url: str,
    speaker_model: str,
    timeout: int,
) -> tuple[int, str]:
    query = parse.urlencode(
        {
            "preload": "true",
            "enable_streaming": "true",
            "enable_diarization": "true",
            "speaker_model": speaker_model,
        }
    )
    return post_form(
        base_url.rstrip("/") + "/speakers/reload-models?" + query,
        {},
        timeout=timeout,
    )


def choose_stream_targets(downloaded: dict[str, list[str]]) -> list[tuple[str, str]]:
    targets: list[tuple[str, str]] = []
    for engine_name, model_name in STREAM_ENGINE_CANDIDATES:
        if model_name in downloaded.get(engine_name, []):
            targets.append((engine_name, model_name))
    return targets


def print_matrix(title: str, results: list[TestResult]) -> None:
    print()
    print(f"[RESULT] {title}")
    for item in results:
        print(f"  - [{item.status}] {item.target}: {item.detail}")


def summarize_and_exit(results: list[TestResult]) -> None:
    passed = sum(1 for item in results if item.status == "PASS")
    failed = [item for item in results if item.status == "FAIL"]
    skipped = sum(1 for item in results if item.status == "SKIP")
    print()
    print(f"[SUMMARY] pass={passed} fail={len(failed)} skip={skipped}")
    if failed:
        for item in failed:
            print(f"  [FAIL] {item.kind} {item.target}: {item.detail}")
        raise SystemExit(1)


def _default_batch_offset(audio_path: Path, cli_value: float | None) -> float:
    if cli_value is not None:
        return cli_value
    if audio_path.resolve() == Path(DEFAULT_AUDIO).resolve():
        return 3600.0
    return 0.0


def _default_batch_output(
    audio_path: Path,
    seconds: float,
    offset_seconds: float,
    cli_value: str,
) -> Path | None:
    if cli_value:
        return Path(cli_value).expanduser().resolve()
    if seconds <= 0 and offset_seconds <= 0:
        return None

    safe_stem = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in audio_path.stem)
    seconds_tag = "full" if seconds <= 0 else str(int(seconds) if float(seconds).is_integer() else seconds).replace(".", "p")
    offset_tag = str(int(offset_seconds) if float(offset_seconds).is_integer() else offset_seconds).replace(".", "p")
    return (
        DEFAULT_BATCH_AUDIO_DIR
        / f"{safe_stem}_offset{offset_tag}s_len{seconds_tag}s_16k_mono.wav"
    )


def _inspect_wav(path: Path) -> tuple[int, int, float]:
    with wave.open(str(path), "rb") as wf:
        sample_rate = wf.getframerate()
        channels = wf.getnchannels()
        duration = wf.getnframes() / float(sample_rate or 1)
    return sample_rate, channels, duration


def append_result(result_file: Path, item: TestResult) -> None:
    result_file.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "kind": item.kind,
        "target": item.target,
        "status": item.status,
        "detail": item.detail,
    }
    with result_file.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def emit_result(item: TestResult, result_file: Path) -> None:
    print(f"[RESULT] [{item.status}] {item.kind} {item.target}: {item.detail}")
    append_result(result_file, item)


def _safe_target_stem(target: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in target)


def write_stream_transcript(
    transcript_dir: Path,
    item: TestResult,
    *,
    audio_path: Path,
) -> None:
    if item.kind != "stream":
        return
    if not item.artifacts:
        return

    transcript_dir.mkdir(parents=True, exist_ok=True)
    stem = _safe_target_stem(item.target)
    txt_path = transcript_dir / f"{stem}.txt"
    json_path = transcript_dir / f"{stem}.json"

    utterances = item.artifacts.get("utterances", [])
    transcript_text = "\n".join(
        str(msg.get("text", "")).strip() for msg in utterances if str(msg.get("text", "")).strip()
    )
    payload = {
        "target": item.target,
        "status": item.status,
        "detail": item.detail,
        "audio_path": str(audio_path),
        "started": item.artifacts.get("started"),
        "utterances": utterances,
        "speaker_active": item.artifacts.get("speaker_active", []),
        "session_end": item.artifacts.get("session_end"),
        "transcript_text": transcript_text,
    }
    txt_path.write_text(transcript_text, encoding="utf-8")
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[INFO] Stream transcript saved: {txt_path}")


def main() -> None:
    args = parse_args()
    base_url = args.url.rstrip("/")
    audio_path = Path(args.audio).expanduser().resolve()
    result_file = Path(args.result_file).expanduser().resolve()
    stream_transcript_dir = DEFAULT_STREAM_TRANSCRIPT_DIR.resolve()
    batch_offset_seconds = _default_batch_offset(audio_path, args.batch_offset_seconds)
    batch_output_path = _default_batch_output(
        audio_path,
        args.batch_seconds,
        batch_offset_seconds,
        args.batch_output,
    )

    print(f"[INFO] Backend: {base_url}")
    print(f"[INFO] Audio: {audio_path}")
    print(f"[INFO] Result file: {result_file}")
    print(f"[INFO] Stream transcript dir: {stream_transcript_dir}")
    if batch_output_path is not None:
        print(f"[INFO] Batch output: {batch_output_path}")
    if not audio_path.exists():
        raise SystemExit(f"[FAIL] Audio file not found: {audio_path}")

    print("[INFO] Preprocessing batch audio before any model load...")
    batch_audio_path, cleanup_batch_audio = build_batch_audio(
        audio_path,
        args.batch_seconds,
        batch_offset_seconds,
        batch_output_path,
    )
    try:
        sample_rate, channels, batch_duration = _inspect_wav(batch_audio_path)
        print(
            f"[INFO] Batch audio ready: {batch_audio_path} "
            f"(sr={sample_rate}, ch={channels}, duration={batch_duration:.2f}s, offset={batch_offset_seconds}s)"
        )

        health, engines, models = require_backend_ready(base_url, args.timeout)
        engine_map = build_engine_map(engines)
        downloaded = build_downloaded_models(models)

        print("[INFO] /health:", json.dumps(health, ensure_ascii=False))
        print("[INFO] Downloaded models:", json.dumps(downloaded, ensure_ascii=False))
        print(
            f"[INFO] Batch sample seconds: {'full-file' if args.batch_seconds <= 0 else args.batch_seconds}"
        )
        print(f"[INFO] Batch offset seconds: {batch_offset_seconds}")
        print(f"[INFO] Stream sample seconds: {args.stream_seconds}")

        results: list[TestResult] = []

        if args.mode in {"all", "batch"}:
            batch_results: list[TestResult] = []
            enable_diarization = bool(args.enable_diarization)
            batch_speaker_model = args.speaker_model or "cam++"
            batch_targets: list[tuple[str, str]] = []
            if args.engine and args.model:
                batch_targets.append((args.engine, args.model))
            else:
                for engine_name, model_names in downloaded.items():
                    if engine_name == "speaker":
                        continue
                    for model_name in model_names:
                        batch_targets.append((engine_name, model_name))

            for engine_name, model_name in batch_targets:
                print(f"[INFO] Loading model for batch test: {engine_name}/{model_name}")
                engine_meta = engine_map.get(engine_name)
                if engine_meta is None:
                    result = TestResult("batch", f"{engine_name}/{model_name}", "FAIL", "引擎未出现在 /engines")
                else:
                    result = run_batch_test(
                        base_url=base_url,
                        audio_path=batch_audio_path,
                        engine_name=engine_name,
                        model_name=model_name,
                        engine_meta=engine_meta,
                        speaker_model=batch_speaker_model,
                        language=args.language,
                        hotwords=args.hotwords,
                        timeout=args.timeout,
                        enable_diarization=enable_diarization,
                    )
                emit_result(result, result_file)
                batch_results.append(result)

            print_matrix("非流式模型测试", batch_results)
            results.extend(batch_results)

        if args.mode in {"all", "stream"}:
            stream_results: list[TestResult] = []
            stream_targets = choose_stream_targets(downloaded)
            if not stream_targets:
                result = TestResult("stream", "stream-matrix", "SKIP", "没有已下载的流式测试模型")
                emit_result(result, result_file)
                stream_results.append(result)
            else:
                speaker_models = [args.speaker_model] if args.speaker_model else downloaded.get("speaker", [])
                if not speaker_models:
                    result = TestResult("stream", "speaker-models", "SKIP", "没有已下载的说话人模型")
                    emit_result(result, result_file)
                    stream_results.append(result)
                else:
                    pcm_bytes = decode_audio_to_pcm16(audio_path, args.stream_seconds)
                    for engine_name, model_name in stream_targets:
                        for speaker_model in speaker_models:
                            print(f"[INFO] Loading stream speaker model: {speaker_model}")
                            status, body = post_reload_speaker_models(
                                base_url,
                                speaker_model=speaker_model,
                                timeout=args.timeout,
                            )
                            if status != 200:
                                result = TestResult(
                                    "stream",
                                    f"{engine_name}/{model_name}@{speaker_model}",
                                    "FAIL",
                                    f"/speakers/reload-models {status}: {body}",
                                )
                                emit_result(result, result_file)
                                stream_results.append(result)
                                continue
                            payload = json.loads(body)
                            if payload.get("speaker_model") != speaker_model:
                                result = TestResult(
                                    "stream",
                                    f"{engine_name}/{model_name}@{speaker_model}",
                                    "FAIL",
                                    f"reload returned mismatched speaker_model: {body}",
                                )
                                emit_result(result, result_file)
                                stream_results.append(result)
                                continue
                            result = asyncio.run(
                                run_stream_once(
                                    base_url=base_url,
                                    engine_name=engine_name,
                                    model_name=model_name,
                                    speaker_model=speaker_model,
                                    pcm_bytes=pcm_bytes,
                                    hotwords=args.hotwords,
                                    timeout=args.timeout,
                                )
                            )
                            emit_result(result, result_file)
                            write_stream_transcript(
                                stream_transcript_dir,
                                result,
                                audio_path=audio_path,
                            )
                            stream_results.append(result)

            print_matrix("流式 + 说话人模型测试", stream_results)
            results.extend(stream_results)

        summarize_and_exit(results)
    finally:
        if cleanup_batch_audio:
            batch_audio_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
