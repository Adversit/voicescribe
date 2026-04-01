import os
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from fastapi import HTTPException


class RuntimeTranscriptionService:
    def __init__(
        self,
        *,
        registry_getter: Callable[[str, str, str], Optional[dict]],
        speaker_factory: Any,
        diarization_available: bool,
        funasr_runtime_error: Optional[str],
        whisper_available: bool,
        whispercpp_available: bool,
        funasr_available: bool,
        qwen3_asr_available: bool,
        parakeet_available: bool,
        whisper_engine_cls: Any,
        whispercpp_engine_cls: Any,
        funasr_engine_cls: Any,
        qwen3_asr_engine_cls: Any,
        parakeet_engine_cls: Any,
        whisper_cpp_model_dir: Path,
    ) -> None:
        self.registry_getter = registry_getter
        self.speaker_factory = speaker_factory
        self.diarization_available = diarization_available
        self.funasr_runtime_error = funasr_runtime_error
        self.whisper_available = whisper_available
        self.whispercpp_available = whispercpp_available
        self.funasr_available = funasr_available
        self.qwen3_asr_available = qwen3_asr_available
        self.parakeet_available = parakeet_available
        self.whisper_engine_cls = whisper_engine_cls
        self.whispercpp_engine_cls = whispercpp_engine_cls
        self.funasr_engine_cls = funasr_engine_cls
        self.qwen3_asr_engine_cls = qwen3_asr_engine_cls
        self.parakeet_engine_cls = parakeet_engine_cls
        self.whisper_cpp_model_dir = whisper_cpp_model_dir
        self.engines: Dict[str, Dict[str, Any]] = {}
        self.diarizer: Optional[object] = None
        self.mock_mode = False

    def set_mock_mode(self, mock_mode: bool) -> None:
        self.mock_mode = mock_mode

    def get_or_create_diarizer(self):
        if self.diarizer is None:
            self.diarizer = self.speaker_factory()
        return self.diarizer

    def speaker_runtime_status(self) -> dict:
        if not self.diarization_available:
            return {
                "speaker_verification_loaded": False,
                "speaker_verification_model": None,
                "diarization_loaded": False,
                "diarization_model": None,
                "registered_speakers": 0,
            }

        speaker_service = self.diarizer if self.diarizer is not None else self.speaker_factory()
        return speaker_service.runtime_status()

    def ensure_speaker_verification_loaded(self, logical_model: Optional[str] = None):
        if not self.diarization_available:
            raise HTTPException(400, f"Speaker features not available: {self.funasr_runtime_error or 'runtime probe failed'}")

        speaker_service = self.get_or_create_diarizer()
        speaker_service.ensure_speaker_verification_loaded(logical_model)
        print(
            f"[Speaker] Speaker verification ready: model={speaker_service.sv_model_id}, registered={len(speaker_service.speakers)}"
        )
        return speaker_service

    def ensure_diarization_loaded(self, logical_model: Optional[str] = None):
        if not self.diarization_available:
            raise HTTPException(400, f"Speaker diarization not available: {self.funasr_runtime_error or 'runtime probe failed'}")

        speaker_service = self.get_or_create_diarizer()
        speaker_service.ensure_diarization_loaded(logical_model)
        print(
            f"[Speaker] Diarization ready: model={speaker_service.diarization_model_id}, registered={len(speaker_service.speakers)}"
        )
        return speaker_service

    async def ensure_engine_loaded(
        self,
        engine: str,
        model: str,
        enable_diarization: bool = False,
        diarization_model: Optional[str] = None,
        speaker_mapping_model: Optional[str] = None,
        load_source: str = "auto_on_demand",
    ):
        existing = self.engines.get(engine)
        if (
            existing
            and existing.get("model") == model
            and existing.get("diarization_model") == diarization_model
            and existing.get("speaker_mapping_model") == speaker_mapping_model
        ):
            if engine != "funasr" or not enable_diarization or existing.get("diarization", False):
                print(
                    f"[Load:{load_source}] Reusing engine={engine} model={model} diarization={existing.get('diarization', False)}"
                )
                return existing

        if self.mock_mode:
            print(
                f"[Load:{load_source}] Mock load engine={engine} model={model} diarization={enable_diarization} diarization_model={diarization_model} speaker_mapping_model={speaker_mapping_model}"
            )
            self.engines[engine] = {
                "engine": None,
                "model": model,
                "diarization": bool(enable_diarization),
                "diarization_model": diarization_model,
                "speaker_mapping_model": speaker_mapping_model,
            }
            return self.engines[engine]

        print(
            f"[Load:{load_source}] Loading engine={engine} model={model} diarization={enable_diarization} diarization_model={diarization_model} speaker_mapping_model={speaker_mapping_model}"
        )

        if engine == "whisper":
            if not self.whisper_available:
                raise HTTPException(400, "Whisper engine not available. Install faster-whisper.")
            eng = self.whisper_engine_cls()
            whisper_entry = self.registry_getter("whisper", model, "asr")
            load_target = whisper_entry["path"] if whisper_entry and os.path.exists(whisper_entry.get("path", "")) else model
            eng.load(load_target)
            self.engines["whisper"] = {
                "engine": eng,
                "model": model,
                "diarization_model": diarization_model,
                "speaker_mapping_model": speaker_mapping_model,
                "load_target": load_target,
            }
        elif engine == "whispercpp":
            if not self.whispercpp_available:
                raise HTTPException(400, "Whisper.cpp engine not available. Install whisper-cpp via brew.")
            whispercpp_entry = self.registry_getter("whispercpp", model, "asr")
            model_path = whispercpp_entry["path"] if whispercpp_entry and os.path.exists(whispercpp_entry.get("path", "")) else str(self.whisper_cpp_model_dir / f"ggml-{model}.bin")
            eng = self.whispercpp_engine_cls(model_path=model_path)
            self.engines["whispercpp"] = {
                "engine": eng,
                "model": model,
                "diarization_model": diarization_model,
                "speaker_mapping_model": speaker_mapping_model,
                "load_target": model_path,
            }
        elif engine == "funasr":
            if not self.funasr_available:
                raise HTTPException(400, f"FunASR engine not available: {self.funasr_runtime_error or 'runtime probe failed'}")
            eng = self.funasr_engine_cls()
            builtin_diarization = bool(enable_diarization and diarization_model == "funasr_builtin")
            eng.load(model, enable_diarization=builtin_diarization)
            self.engines["funasr"] = {
                "engine": eng,
                "model": model,
                "diarization": builtin_diarization,
                "diarization_model": diarization_model,
                "speaker_mapping_model": speaker_mapping_model,
                "load_target": model,
            }
        elif engine == "qwen3_asr":
            if not self.qwen3_asr_available:
                raise HTTPException(400, "Qwen3-ASR engine not available. Install qwen-asr first.")
            eng = self.qwen3_asr_engine_cls()
            qwen_entry = self.registry_getter("qwen3_asr", model, "asr")
            load_target = qwen_entry["path"] if qwen_entry and os.path.exists(qwen_entry.get("path", "")) else model
            eng.load(load_target)
            self.engines["qwen3_asr"] = {
                "engine": eng,
                "model": model,
                "diarization_model": diarization_model,
                "speaker_mapping_model": speaker_mapping_model,
                "load_target": load_target,
            }
        elif engine == "parakeet":
            if not self.parakeet_available:
                raise HTTPException(400, "Parakeet engine not available. Requires NVIDIA GPU and NeMo toolkit.")
            eng = self.parakeet_engine_cls()
            parakeet_entry = self.registry_getter("parakeet", model, "asr")
            load_target = parakeet_entry["path"] if parakeet_entry and os.path.exists(parakeet_entry.get("path", "")) else model
            eng.load(load_target)
            self.engines["parakeet"] = {
                "engine": eng,
                "model": model,
                "diarization_model": diarization_model,
                "speaker_mapping_model": speaker_mapping_model,
                "load_target": load_target,
            }
        else:
            raise HTTPException(400, f"Unknown engine: {engine}")

        print(f"[Load] Loaded engine={engine} model={model} runtime={self.engines[engine]}")
        print(f"[Load:{load_source}] Loaded engine={engine} model={model}")
        return self.engines[engine]
