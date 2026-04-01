import json
from pathlib import Path
from typing import List, Optional


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
                        return records
                if isinstance(payload, list):
                    return payload
        except Exception as error:
            print(f"[History] Failed to read history: {error}")
        return []

    @staticmethod
    def sort_records(records: List[dict]) -> List[dict]:
        return sorted(records, key=lambda item: item.get("created_at", ""), reverse=True)

    def save_records(self, records: List[dict]) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        with self.storage_path.open("w", encoding="utf-8") as handle:
            json.dump({"records": self.sort_records(records)}, handle, ensure_ascii=False, indent=2)

    def find_record(self, record_id: str) -> Optional[dict]:
        for record in self.load_records():
            if record.get("id") == record_id:
                return record
        return None

    @staticmethod
    def export_text(record: dict) -> str:
        lines = [
            f"时间: {record.get('created_at', '')}",
            f"模式: {record.get('mode', '')}",
            f"引擎: {record.get('asr_engine', record.get('engine', ''))}",
            f"模型: {record.get('asr_model', record.get('model', ''))}",
            f"分离模型: {record.get('diarization_model', '')}",
            f"映射模型: {record.get('speaker_mapping_model', '')}",
            f"时长: {record.get('duration', 0)}",
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

