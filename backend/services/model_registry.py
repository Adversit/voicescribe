import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Optional


class ModelRegistryService:
    LEGACY_BUCKET_ALIASES = {
        "speaker": "speaker_mapping",
    }

    LEGACY_MODEL_ALIASES = {
        ("speaker_mapping", "cam++"): "campp",
    }

    def __init__(
        self,
        *,
        model_cache_dir: Path,
        registry_path: Path,
        whisper_cpp_model_dir: Path,
        whispercpp_model_files: Dict[str, str],
        diarization_models: Dict[str, Dict[str, Any]],
        speaker_mapping_models: Dict[str, Dict[str, Any]],
        get_funasr_model_id: Callable[[str], Optional[str]],
    ) -> None:
        self.model_cache_dir = model_cache_dir
        self.registry_path = registry_path
        self.whisper_cpp_model_dir = whisper_cpp_model_dir
        self.whispercpp_model_files = whispercpp_model_files
        self.diarization_models = diarization_models
        self.speaker_mapping_models = speaker_mapping_models
        self.get_funasr_model_id = get_funasr_model_id

    def supported_registry_models(self) -> Dict[str, set[str]]:
        return {
            "whisper": {"tiny", "base", "small", "medium", "large-v2", "large-v3"},
            "whispercpp": set(self.whispercpp_model_files.keys()),
            "funasr": {
                model_name
                for model_name in (
                    "paraformer-zh",
                    "paraformer-zh-streaming",
                    "seaco-paraformer",
                    "sensevoice-small",
                )
                if self.get_funasr_model_id(model_name)
            },
            "parakeet": {"parakeet-ctc-1.1b", "parakeet-tdt-1.1b"},
            "qwen3_asr": {"qwen3-asr-1.7b"},
            "diarization": set(self.diarization_models.keys()) - {"funasr_builtin"},
            "speaker_mapping": set(self.speaker_mapping_models.keys()),
        }

    @staticmethod
    def category_bucket(category: str, engine: str) -> str:
        return engine if category == "asr" else category

    def load_registry(self) -> dict:
        try:
            if self.registry_path.exists():
                with self.registry_path.open("r", encoding="utf-8") as handle:
                    registry = json.load(handle)
                cleaned_registry, changed = self.clean_registry_entries(registry)
                if changed:
                    self.save_registry(cleaned_registry)
                return cleaned_registry
        except Exception as error:
            print(f"[ModelRegistry] Failed to read registry: {error}")
        return {}

    def save_registry(self, registry: dict) -> None:
        try:
            with self.registry_path.open("w", encoding="utf-8") as handle:
                json.dump(registry, handle, ensure_ascii=False, indent=2)
        except Exception as error:
            print(f"[ModelRegistry] Failed to write registry: {error}")

    def is_within_models_dir(self, path: Path) -> bool:
        try:
            path.resolve().relative_to(self.model_cache_dir)
            return True
        except ValueError:
            return False

    def rebase_models_path(self, candidate: Path) -> Optional[Path]:
        parts = list(candidate.parts)
        lowered = [part.lower() for part in parts]
        if "models" not in lowered:
            return None

        models_index = lowered.index("models")
        return self.model_cache_dir.joinpath(*parts[models_index + 1 :]).resolve()

    def normalize_registry_path(self, path: Optional[str]) -> Optional[str]:
        if not path:
            return path

        candidate = Path(path).expanduser()
        if candidate.exists() and self.is_within_models_dir(candidate):
            return str(candidate.resolve())

        rebased = self.rebase_models_path(candidate)
        if rebased and rebased.exists():
            return str(rebased)

        return None

    def clean_registry_entries(self, registry: dict) -> tuple[dict, bool]:
        if not isinstance(registry, dict):
            return {}, True

        cleaned: dict = {}
        changed = False
        supported_models = self.supported_registry_models()

        for bucket, models in registry.items():
            if not isinstance(models, dict):
                changed = True
                continue

            canonical_bucket = self.LEGACY_BUCKET_ALIASES.get(bucket, bucket)
            if canonical_bucket != bucket:
                changed = True

            allowed_models = supported_models.get(canonical_bucket)
            if allowed_models is None:
                changed = True
                continue

            cleaned_bucket: dict = {}
            for model, entry in models.items():
                if not isinstance(entry, dict):
                    changed = True
                    continue

                canonical_model = self.LEGACY_MODEL_ALIASES.get((canonical_bucket, model), model)
                if canonical_model != model:
                    changed = True

                if canonical_model not in allowed_models:
                    changed = True
                    continue

                normalized_path = self.normalize_registry_path(entry.get("path"))
                if not normalized_path:
                    changed = True
                    continue

                normalized_entry = {
                    **entry,
                    "updated_at": entry.get("updated_at") or datetime.now().isoformat(),
                    "path": normalized_path,
                }
                if normalized_entry != entry:
                    changed = True
                existing_entry = cleaned_bucket.get(canonical_model)
                if existing_entry is None:
                    cleaned_bucket[canonical_model] = normalized_entry
                    continue

                existing_updated = str(existing_entry.get("updated_at") or "")
                normalized_updated = str(normalized_entry.get("updated_at") or "")
                if normalized_updated >= existing_updated:
                    if normalized_entry != existing_entry:
                        changed = True
                    cleaned_bucket[canonical_model] = normalized_entry

            if cleaned_bucket:
                cleaned[canonical_bucket] = cleaned_bucket
            elif models:
                changed = True

        return cleaned, changed

    def get_registry_entry(self, engine: str, model: str, category: str = "asr") -> Optional[dict]:
        registry = self.load_registry()
        bucket = self.category_bucket(category, engine)
        entry = registry.get(bucket, {}).get(model)
        if not entry:
            return None

        normalized_path = self.normalize_registry_path(entry.get("path"))
        if not normalized_path:
            self.delete_registry_entry(engine, model, category=category)
            return None

        if normalized_path != entry.get("path"):
            self.set_registry_entry(
                engine,
                model,
                normalized_path,
                int(entry.get("size_bytes", 0) or 0),
                category=category,
            )
            entry = {
                **entry,
                "path": normalized_path,
            }

        return entry

    def model_storage_path(self, engine: str, model: str, category: str = "asr") -> Optional[Path]:
        if category == "asr" and engine == "whisper":
            return (self.model_cache_dir / "whisper" / model).resolve()
        if category == "asr" and engine == "whispercpp":
            filename = self.whispercpp_model_files.get(model)
            if filename:
                return (self.whisper_cpp_model_dir / filename).resolve()
        if category == "asr" and engine == "funasr":
            model_id = self.get_funasr_model_id(model)
            if model_id:
                return (self.model_cache_dir / Path(model_id)).resolve()
        if category == "asr" and engine == "parakeet":
            return (self.model_cache_dir / "parakeet" / model).resolve()
        if category == "asr" and engine == "qwen3_asr":
            return (self.model_cache_dir / "qwen3_asr" / model).resolve()
        if category == "diarization":
            if model == "funasr_builtin":
                return None
            spec = self.diarization_models.get(model, {})
            model_id = spec.get("model_id")
            if model_id:
                return (self.model_cache_dir / Path(model_id)).resolve()
            return (self.model_cache_dir / "diarization" / model).resolve()
        if category == "speaker_mapping":
            spec = self.speaker_mapping_models.get(model, {})
            model_id = spec.get("model_id")
            if model_id:
                return (self.model_cache_dir / Path(model_id)).resolve()
            return (self.model_cache_dir / "speaker_mapping" / model).resolve()
        return None

    def set_registry_entry(self, engine: str, model: str, path: str, size_bytes: int, category: str = "asr") -> None:
        candidate = Path(path).expanduser()
        if not self.is_within_models_dir(candidate):
            raise ValueError(f"Model registry path must stay under models root: {path}")
        registry = self.load_registry()
        bucket = self.category_bucket(category, engine)
        if bucket not in registry:
            registry[bucket] = {}
        registry[bucket][model] = {
            "path": path,
            "size_bytes": size_bytes,
            "updated_at": datetime.now().isoformat(),
        }
        self.save_registry(registry)

    def delete_registry_entry(self, engine: str, model: str, category: str = "asr") -> None:
        registry = self.load_registry()
        bucket = self.category_bucket(category, engine)
        if bucket in registry and model in registry[bucket]:
            del registry[bucket][model]
            self.save_registry(registry)

    @staticmethod
    def reset_download_state(model_downloads: Dict[str, dict], engine: str, model: str, category: str = "asr") -> None:
        key = f"{category}:{ModelRegistryService.category_bucket(category, engine)}:{model}"
        model_downloads.pop(key, None)

    @staticmethod
    def dir_size(path: str) -> int:
        total = 0
        for root, _, files in os.walk(path):
            for name in files:
                try:
                    total += os.path.getsize(os.path.join(root, name))
                except FileNotFoundError:
                    continue
        return total

    def cache_total_size(self) -> int:
        return self.dir_size(str(self.model_cache_dir))

    def path_size(self, path: Path) -> int:
        if not path.exists():
            return 0
        if path.is_file():
            return path.stat().st_size
        return self.dir_size(str(path))
