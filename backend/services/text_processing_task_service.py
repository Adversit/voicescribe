import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Optional

from services.text_processing_service import (
    TextProcessingCancelled,
    TextProcessingRequest,
    TextProcessingResult,
    TextProcessingService,
    _short_error,
)


TERMINAL_STATUSES = {"completed", "fallback", "cancelled", "failed"}


@dataclass
class TextProcessingTask:
    task_id: str
    request: TextProcessingRequest
    status: str = "pending"
    result: Optional[TextProcessingResult] = None
    error: Optional[str] = None
    cancel_event: threading.Event = field(default_factory=threading.Event)

    def snapshot(self) -> dict:
        return {
            "task_id": self.task_id,
            "status": self.status,
            "result": self.result.to_dict() if self.result else None,
            "error": self.error,
        }


class TextProcessingTaskService:
    def __init__(self, processing_service: TextProcessingService, max_tasks: int = 100) -> None:
        self.processing_service = processing_service
        self.max_tasks = max_tasks
        self.tasks: dict[str, TextProcessingTask] = {}
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="voicescribe-text-task")

    def start(self, request: TextProcessingRequest) -> dict:
        task = TextProcessingTask(task_id=str(uuid.uuid4()), request=request)
        with self.lock:
            self._trim_terminal_tasks()
            self.tasks[task.task_id] = task
        self.executor.submit(self._run, task.task_id)
        return task.snapshot()

    def get(self, task_id: str) -> Optional[dict]:
        with self.lock:
            task = self.tasks.get(task_id)
            return task.snapshot() if task else None

    def cancel(self, task_id: str) -> Optional[dict]:
        with self.lock:
            task = self.tasks.get(task_id)
            if task is None:
                return None
            if task.status not in TERMINAL_STATUSES:
                task.cancel_event.set()
                task.status = "cancelled"
                task.result = None
                task.error = None
            return task.snapshot()

    def shutdown(self) -> None:
        with self.lock:
            for task in self.tasks.values():
                if task.status not in TERMINAL_STATUSES:
                    task.cancel_event.set()
                    task.status = "cancelled"
        self.executor.shutdown(wait=False, cancel_futures=True)

    def _run(self, task_id: str) -> None:
        with self.lock:
            task = self.tasks.get(task_id)
            if task is None or task.cancel_event.is_set():
                return
            task.status = "running"

        try:
            result = self.processing_service.process(task.request, task.cancel_event)
        except TextProcessingCancelled:
            with self.lock:
                task.status = "cancelled"
                task.result = None
                task.error = None
            return
        except Exception as error:
            with self.lock:
                if task.cancel_event.is_set():
                    task.status = "cancelled"
                    task.result = None
                    task.error = None
                else:
                    task.status = "failed"
                    task.result = None
                    task.error = _short_error(error)
            return

        with self.lock:
            if task.cancel_event.is_set() or task.status == "cancelled":
                task.status = "cancelled"
                task.result = None
                task.error = None
                return
            task.result = result
            task.status = "fallback" if result.status == "fallback" else "completed"

    def _trim_terminal_tasks(self) -> None:
        if len(self.tasks) < self.max_tasks:
            return
        for task_id in list(self.tasks):
            if self.tasks[task_id].status in TERMINAL_STATUSES:
                del self.tasks[task_id]
                if len(self.tasks) < self.max_tasks:
                    break
