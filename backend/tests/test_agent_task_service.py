import threading
import time
import unittest

from services.agent_service import AgentCancelled, AgentRequest, AgentResult
from services.agent_task_service import AgentTaskService


class BlockingAgentService:
    def __init__(self):
        self.started = threading.Event()

    def run(self, request, cancel_event):
        self.started.set()
        cancel_event.wait()
        raise AgentCancelled()


class ImmediateAgentService:
    def run(self, request, cancel_event):
        return AgentResult("done", request.provider, None, "repo", "workspace_read_only", 1)


class AgentTaskServiceTests(unittest.TestCase):
    def wait_for(self, service, task_id, status, timeout=2):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            task = service.get(task_id)
            if task["status"] == status:
                return task
            time.sleep(0.01)
        self.fail(f"task did not reach {status}: {service.get(task_id)}")

    def test_cancelled_task_never_publishes_result(self):
        agent = BlockingAgentService()
        service = AgentTaskService(agent)
        self.addCleanup(service.shutdown)
        task = service.start(AgentRequest(prompt="inspect"))
        self.assertTrue(agent.started.wait(1))

        cancelled = service.cancel(task["task_id"])
        terminal = self.wait_for(service, task["task_id"], "cancelled")

        self.assertEqual(cancelled["status"], "cancelled")
        self.assertIsNone(terminal["result"])

    def test_completed_task_publishes_result(self):
        service = AgentTaskService(ImmediateAgentService())
        self.addCleanup(service.shutdown)
        task = service.start(AgentRequest(prompt="inspect"))

        terminal = self.wait_for(service, task["task_id"], "completed")

        self.assertEqual(terminal["result"]["output"], "done")

    def test_unknown_task_returns_none(self):
        service = AgentTaskService(ImmediateAgentService())
        self.addCleanup(service.shutdown)
        self.assertIsNone(service.get("missing"))
        self.assertIsNone(service.cancel("missing"))


if __name__ == "__main__":
    unittest.main()
