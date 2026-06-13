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


if __name__ == "__main__":
    unittest.main()
