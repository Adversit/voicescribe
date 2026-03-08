"""Add backend to sys.path so tests can use 'from meeting.vad import ...' etc."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
