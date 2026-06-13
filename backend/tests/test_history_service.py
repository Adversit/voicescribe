import json
import tempfile
import unittest
from pathlib import Path

from services.history_service import HistoryService


class HistoryServiceTests(unittest.TestCase):
    def test_legacy_record_gets_raw_text_and_skipped_processing_result(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage_path = Path(temp_dir) / "history.json"
            storage_path.write_text(
                json.dumps({"records": [{"id": "legacy", "text": "legacy transcript"}]}),
                encoding="utf-8",
            )

            records = HistoryService(storage_path).load_records()

        self.assertEqual(records[0]["raw_text"], "legacy transcript")
        self.assertEqual(records[0]["text_processing"]["status"], "skipped")
        self.assertEqual(records[0]["text_processing"]["profile"], "raw")
        self.assertIsNone(records[0]["target_context"])

    def test_context_is_derived_from_processing_result_for_older_phase_b_record(self):
        record = {
            "id": "phase-b",
            "text": "processed",
            "text_processing": {
                "status": "processed",
                "profile": "light",
                "target_context": {"app_kind": "chat", "executable_name": None, "captured_at": "now"},
            },
        }

        normalized = HistoryService.normalize_record(record)

        self.assertEqual(normalized["target_context"]["app_kind"], "chat")

    def test_save_records_sanitizes_target_context(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage_path = Path(temp_dir) / "history.json"
            service = HistoryService(storage_path)
            service.save_records(
                [
                    {
                        "id": "unsafe",
                        "text": "text",
                        "target_context": {
                            "app_kind": "private",
                            "executable_name": "x" * 500,
                            "captured_at": "y" * 100,
                        },
                    }
                ]
            )
            record = service.load_records()[0]

        self.assertEqual(record["target_context"]["app_kind"], "unknown")
        self.assertEqual(record["text_processing"]["target_context"]["app_kind"], "unknown")
        self.assertEqual(len(record["target_context"]["executable_name"]), 120)
        self.assertEqual(len(record["target_context"]["captured_at"]), 64)


if __name__ == "__main__":
    unittest.main()
