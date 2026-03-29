import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

_BACKEND_DIR = Path(__file__).resolve().parent
_DLL_HANDLES: List[Any] = []


def prepare_windows_runtime() -> List[str]:
    messages: List[str] = []
    if sys.platform != "win32":
        return messages

    candidates = [
        _BACKEND_DIR / "venv" / "Scripts",
        _BACKEND_DIR / "venv" / "Lib" / "site-packages" / "torch" / "lib",
    ]

    path_entries = os.environ.get("PATH", "").split(os.pathsep)
    for candidate in candidates:
        if not candidate.exists():
            continue
        candidate_str = str(candidate)
        if candidate_str not in path_entries:
            os.environ["PATH"] = candidate_str + os.pathsep + os.environ.get("PATH", "")
            path_entries.insert(0, candidate_str)
            messages.append(f"prepend_path={candidate_str}")
        if hasattr(os, "add_dll_directory"):
            try:
                _DLL_HANDLES.append(os.add_dll_directory(candidate_str))
                messages.append(f"add_dll_directory={candidate_str}")
            except OSError as err:
                messages.append(f"add_dll_directory_failed={candidate_str}: {err}")

    return messages


@lru_cache(maxsize=1)
def probe_torch_runtime() -> Dict[str, Any]:
    messages = prepare_windows_runtime()
    try:
        import torch

        return {
            "ok": True,
            "version": getattr(torch, "__version__", None),
            "messages": messages,
            "error": None,
        }
    except Exception as err:
        return {
            "ok": False,
            "version": None,
            "messages": messages,
            "error": f"{type(err).__name__}: {err}",
        }


@lru_cache(maxsize=1)
def probe_funasr_runtime() -> Dict[str, Any]:
    torch_state = probe_torch_runtime()
    messages = list(torch_state.get("messages") or [])
    if not torch_state.get("ok"):
        return {
            "ok": False,
            "messages": messages,
            "error": f"torch unavailable: {torch_state.get('error')}",
        }

    try:
        from funasr import AutoModel  # noqa: F401

        return {
            "ok": True,
            "messages": messages,
            "error": None,
        }
    except Exception as err:
        return {
            "ok": False,
            "messages": messages,
            "error": f"{type(err).__name__}: {err}",
        }
