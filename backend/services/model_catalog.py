from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException


def build_engine_catalog(
    *,
    funasr_models: list[str],
    whisper_models: list[str],
    whispercpp_models: list[str],
    parakeet_models: list[str],
    qwen3_asr_models: list[str],
    diarization_models: Dict[str, Dict[str, Any]],
    speaker_mapping_models: Dict[str, Dict[str, Any]],
    availability: Dict[str, bool],
) -> Dict[str, Dict[str, Any]]:
    speaker_mapping_names = list(speaker_mapping_models.keys())
    diarization_names = list(diarization_models.keys())

    return {
        "funasr": {
            "display_name": "FunASR",
            "description": "阿里 FunASR，支持内置和外部分离路径。",
            "asr_models": funasr_models,
            "diarization_models": diarization_names,
            "speaker_mapping_models": speaker_mapping_names,
            "default_selection": {
                "asrModel": "seaco-paraformer",
                "diarizationModel": "funasr_builtin",
                "speakerMappingModel": "campp",
            },
            "available": availability.get("funasr", False),
        },
        "qwen3_asr": {
            "display_name": "Qwen3-ASR",
            "description": "Qwen3-ASR 独立引擎。",
            "asr_models": qwen3_asr_models,
            "diarization_models": ["campplus-diarization", "sond-diarization", "3d-speaker"],
            "speaker_mapping_models": speaker_mapping_names,
            "default_selection": {
                "asrModel": "qwen3-asr-1.7b",
                "diarizationModel": "3d-speaker",
                "speakerMappingModel": "campp",
            },
            "available": availability.get("qwen3_asr", False),
        },
        "whisper": {
            "display_name": "Whisper",
            "description": "OpenAI Whisper，多语言通用引擎。",
            "asr_models": whisper_models,
            "diarization_models": ["campplus-diarization", "sond-diarization", "3d-speaker"],
            "speaker_mapping_models": speaker_mapping_names,
            "default_selection": {
                "asrModel": "large-v3",
                "diarizationModel": "3d-speaker",
                "speakerMappingModel": "campp",
            },
            "available": availability.get("whisper", False),
        },
        "whispercpp": {
            "display_name": "WhisperCpp",
            "description": "whisper.cpp CLI 引擎。",
            "asr_models": whispercpp_models,
            "diarization_models": ["campplus-diarization", "sond-diarization", "3d-speaker"],
            "speaker_mapping_models": speaker_mapping_names,
            "default_selection": {
                "asrModel": "base",
                "diarizationModel": "3d-speaker",
                "speakerMappingModel": "campp",
            },
            "available": availability.get("whispercpp", False),
        },
        "parakeet": {
            "display_name": "Parakeet",
            "description": "NVIDIA Parakeet，本轮进入矩阵但说话人对齐能力受限。",
            "asr_models": parakeet_models,
            "diarization_models": ["campplus-diarization", "sond-diarization", "3d-speaker"],
            "speaker_mapping_models": speaker_mapping_names,
            "default_selection": {
                "asrModel": "parakeet-ctc-1.1b",
                "diarizationModel": "3d-speaker",
                "speakerMappingModel": "campp",
            },
            "available": availability.get("parakeet", False),
        },
    }


def build_engine_model_catalog(engine_catalog: Dict[str, Dict[str, Any]]) -> Dict[str, list[str]]:
    return {engine: spec["asr_models"] for engine, spec in engine_catalog.items()}


def engine_available(engine_catalog: Dict[str, Dict[str, Any]], engine: str) -> bool:
    return bool(engine_catalog.get(engine, {}).get("available"))


def category_bucket(category: str, engine: str) -> str:
    return engine if category == "asr" else category


def all_model_entries(
    engine_catalog: Dict[str, Dict[str, Any]],
    diarization_models: Dict[str, Dict[str, Any]],
    speaker_mapping_models: Dict[str, Dict[str, Any]],
) -> Iterable[tuple[str, str, str, Dict[str, Any]]]:
    for engine, spec in engine_catalog.items():
        for model_name in spec["asr_models"]:
            yield "asr", engine, model_name, {
                "display_name": model_name,
                "engine_scope": [engine],
                "downloadable": True,
                "requires_token": False,
            }

    for model_name, spec in diarization_models.items():
        yield "diarization", "diarization", model_name, spec

    for model_name, spec in speaker_mapping_models.items():
        yield "speaker_mapping", "speaker_mapping", model_name, spec


def find_model_definition(
    engine_catalog: Dict[str, Dict[str, Any]],
    diarization_models: Dict[str, Dict[str, Any]],
    speaker_mapping_models: Dict[str, Dict[str, Any]],
    category: str,
    engine: str,
    model: str,
) -> Optional[Dict[str, Any]]:
    for entry_category, entry_engine, entry_model, spec in all_model_entries(
        engine_catalog,
        diarization_models,
        speaker_mapping_models,
    ):
        if entry_category == category and entry_engine == category_bucket(category, engine) and entry_model == model:
            return spec
    return None


def validate_engine_selection(
    engine_catalog: Dict[str, Dict[str, Any]],
    engine: str,
    asr_model: str,
    diarization_model: Optional[str],
    speaker_mapping_model: Optional[str],
) -> None:
    engine_spec = engine_catalog.get(engine)
    if not engine_spec:
        raise HTTPException(400, f"Unknown engine: {engine}")

    if asr_model not in engine_spec.get("asr_models", []):
        raise HTTPException(400, f"Incompatible ASR model for engine {engine}: {asr_model}")

    if diarization_model and diarization_model not in engine_spec.get("diarization_models", []):
        raise HTTPException(400, f"Incompatible diarization model for engine {engine}: {diarization_model}")

    if speaker_mapping_model and speaker_mapping_model not in engine_spec.get("speaker_mapping_models", []):
        raise HTTPException(400, f"Incompatible speaker mapping model for engine {engine}: {speaker_mapping_model}")
