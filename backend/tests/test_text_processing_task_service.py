import threading
import time
import unittest

from services.text_processing_service import TextProcessingCancelled, TextProcessingRequest, TextProcessingResult
from services.text_processing_task_service import TextProcessingTaskService


class FakeProcessingService:
    def __init__(self):
        self.started = threading.Event()

    def process(self, request, cancel_event):
        self.started.set()
        while not cancel_event.wait(0.01):
            pass
        raise TextProcessingCancelled()


class ImmediateProcessingService:
    def process(self, request, cancel_event):
        return TextProcessingResult(
            raw_text=request.text,
            text="done",
            profile=request.profile,
            provider=request.provider,
            model=None,
            status="processed",
            duration_ms=1,
        )


class TextProcessingTaskServiceTests(unittest.TestCase):
    def wait_for(self, service, task_id, status, timeout=2):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            task = service.get(task_id)
            if task["status"] == status:
                return task
            time.sleep(0.01)
        self.fail(f"task did not reach {status}: {service.get(task_id)}")

    def test_cancelled_task_never_publishes_late_result(self):
        processing = FakeProcessingService()
        service = TextProcessingTaskService(processing)
        self.addCleanup(service.shutdown)
        task = service.start(TextProcessingRequest(text="raw", profile="light"))
        self.assertTrue(processing.started.wait(1))

        cancelled = service.cancel(task["task_id"])
        terminal = self.wait_for(service, task["task_id"], "cancelled")

        self.assertEqual(cancelled["status"], "cancelled")
        self.assertIsNone(terminal["result"])

    def test_completed_task_publishes_result(self):
        service = TextProcessingTaskService(ImmediateProcessingService())
        self.addCleanup(service.shutdown)
        task = service.start(TextProcessingRequest(text="raw", profile="light"))

        terminal = self.wait_for(service, task["task_id"], "completed")

        self.assertEqual(terminal["result"]["text"], "done")

    def test_unknown_task_returns_none(self):
        service = TextProcessingTaskService(ImmediateProcessingService())
        self.addCleanup(service.shutdown)
        self.assertIsNone(service.get("missing"))
        self.assertIsNone(service.cancel("missing"))


if __name__ == "__main__":
    unittest.main()
