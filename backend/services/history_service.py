import json
from pathlib import Path
from typing import List, Optional


SUPPORTED_APP_KINDS = {"code", "chat", "email", "document", "browser", "terminal", "other", "unknown"}


class HistoryService:
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path

    def load_records(self) -> List[dict]:
        try:
            if self.storage_path.exists():
                with self.storage_path.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                if isinstance(payload, dict):
                    records = payload.get("records", [])
                    if isinstance(records, list):
                        return [self.normalize_record(record) for record in records]
                if isinstance(payload, list):
                    return [self.normalize_record(record) for record in payload]
        except Exception as error:
            print(f"[History] Failed to read history: {error}")
        return []

    @staticmethod
    def normalize_record(record: dict) -> dict:
        normalized = dict(record)
        normalized.setdefault("raw_text", normalized.get("text", ""))
        processing = normalized.get("text_processing")
        processing_context = processing.get("target_context") if isinstance(processing, dict) else None
        normalized["target_context"] = HistoryService.normalize_target_context(
            normalized.get("target_context", processing_context)
        )
        normalized.setdefault(
            "text_processing",
            {
                "raw_text": normalized.get("raw_text", ""),
                "text": normalized.get("text", ""),
                "profile": "raw",
                "provider": None,
                "model": None,
                "status": "skipped",
                "duration_ms": 0,
                "warning": None,
                "target_context": normalized.get("target_context"),
            },
        )
        if isinstance(normalized.get("text_processing"), dict):
            normalized["text_processing"] = dict(normalized["text_processing"])
            normalized["text_processing"]["target_context"] = normalized.get("target_context")
        return normalized

    @staticmethod
    def normalize_target_context(value: object) -> Optional[dict]:
        if not isinstance(value, dict):
            return None
        app_kind = str(value.get("app_kind") or "unknown").strip().lower()
        if app_kind not in SUPPORTED_APP_KINDS:
            app_kind = "unknown"
        return {
            "app_kind": app_kind,
            "executable_name": str(value.get("executable_name") or "").strip()[:120] or None,
            "captured_at": str(value.get("captured_at") or "").strip()[:64],
        }

    @staticmethod
    def sort_records(records: List[dict]) -> List[dict]:
        return sorted(records, key=lambda item: item.get("created_at", ""), reverse=True)

    def save_records(self, records: List[dict]) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        with self.storage_path.open("w", encoding="utf-8") as handle:
            normalized = [self.normalize_record(record) for record in records]
            json.dump({"records": self.sort_records(normalized)}, handle, ensure_ascii=False, indent=2)

    def find_record(self, record_id: str) -> Optional[dict]:
        for record in self.load_records():
            if record.get("id") == record_id:
                return record
        return None

    @staticmethod
    def export_text(record: dict) -> str:
        target_context = record.get("target_context")
        app_kind = target_context.get("app_kind", "") if isinstance(target_context, dict) else ""
        lines = [
            f"时间: {record.get('created_at', '')}",
            f"模式: {record.get('mode', '')}",
            f"引擎: {record.get('asr_engine', record.get('engine', ''))}",
            f"模型: {record.get('asr_model', record.get('model', ''))}",
            f"分离模型: {record.get('diarization_model', '')}",
            f"映射模型: {record.get('speaker_mapping_model', '')}",
            f"时长: {record.get('duration', 0)}",
            f"目标应用类别: {app_kind}",
            "",
            "原始转写:",
            record.get("raw_text", record.get("text", "")),
            "",
            "正文:",
            record.get("text", ""),
        ]

        summary = record.get("summary")
        if summary:
            lines.extend(["", "AI 摘要:", summary])

        speaker_entries = record.get("speaker_entries") or []
        if speaker_entries:
            lines.extend(["", "说话人片段:"])
            for entry in speaker_entries:
                speaker = entry.get("speaker") or "说话人"
                timestamp = entry.get("timestamp") or ""
                prefix = f"[{timestamp}] " if timestamp else ""
                lines.append(f"{prefix}{speaker}: {entry.get('text') or ''}")

        return "\n".join(lines).strip() + "\n"

    @staticmethod
    def delete_audio_file(record: dict) -> None:
        audio_path = record.get("audio_path")
        if not record.get("retain_audio") or not audio_path:
            return

        path = Path(audio_path)
        if path.exists() and path.is_file():
            try:
                path.unlink(missing_ok=True)
            except Exception as error:
                print(f"[History] Failed to delete audio file: {error}")

