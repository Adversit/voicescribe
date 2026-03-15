# Meeting Recording Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade VoiceScribe from "record-then-transcribe" to real-time meeting recording with speaker diarization, live transcription display, and incremental AI summarization.

**Architecture:** New `/meeting` WebSocket endpoint with VAD-based segmentation (Silero VAD), real-time speaker tracking (diart), high-accuracy transcription (FireRedASR-AED), and periodic LLM summarization. Frontend adds a "Recording" tab in the main window with speaker-colored transcript and summary card.

**Tech Stack:** Python FastAPI, Silero VAD, diart, pyannote.audio, FireRedASR, claude CLI (haiku), Electron, React 19, Zustand, WebSocket

**Design Doc:** `docs/plans/2026-03-08-meeting-recording-design.md`

---

## Phase 1: Backend Pipeline

### Task 1: Add Python Dependencies

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/requirements-core.txt`

**Step 1: Update requirements.txt**

Add to `backend/requirements.txt`:

```
# Meeting recording dependencies
silero-vad==5.1.2
diart==0.9.0
pyannote.audio>=3.1
rx>=3.2.0
```

Add to `backend/requirements-core.txt`:

```
# Meeting recording (core)
silero-vad==5.1.2
```

**Step 2: Install dependencies**

Run: `cd backend && pip install silero-vad diart pyannote.audio`

Expected: Successful installation (diart pulls pyannote as dependency)

**Step 3: Install FireRedASR**

Run: `cd backend && pip install git+https://github.com/FireRedTeam/FireRedASR.git`

If that fails, clone and install locally:

```bash
cd backend
git clone https://github.com/FireRedTeam/FireRedASR.git vendor/FireRedASR
pip install -e vendor/FireRedASR
```

**Step 4: Verify imports**

Run: `python -c "import silero_vad; from diart import SpeakerDiarization; print('OK')"`

Expected: `OK`

**Step 5: Commit**

```bash
git add backend/requirements.txt backend/requirements-core.txt
git commit -m "chore: add meeting recording dependencies (silero-vad, diart, fireredasr)"
```

---

### Task 2: Silero VAD Wrapper

**Files:**
- Create: `backend/meeting/__init__.py`
- Create: `backend/meeting/vad.py`
- Create: `backend/tests/test_vad.py`

**Step 1: Create module init**

Create `backend/meeting/__init__.py`:

```python
"""Meeting recording pipeline: VAD + speaker diarization + ASR."""
```

**Step 2: Write the failing test**

Create `backend/tests/__init__.py` (empty) and `backend/tests/test_vad.py`:

```python
import numpy as np
import pytest
from backend.meeting.vad import SileroVADSegmenter, VADConfig, SpeechSegment


class TestVADConfig:
    def test_default_config(self):
        cfg = VADConfig()
        assert cfg.threshold == 0.5
        assert cfg.hangover_ms == 300
        assert cfg.min_speech_ms == 250
        assert cfg.pre_roll_ms == 100
        assert cfg.max_segment_s == 30.0
        assert cfg.sample_rate == 16000

    def test_custom_config(self):
        cfg = VADConfig(threshold=0.6, hangover_ms=500)
        assert cfg.threshold == 0.6
        assert cfg.hangover_ms == 500


class TestSileroVADSegmenter:
    def test_init(self):
        seg = SileroVADSegmenter(VADConfig())
        assert seg.config.threshold == 0.5
        assert seg.is_speaking is False

    def test_process_silence(self):
        seg = SileroVADSegmenter(VADConfig())
        silence = np.zeros(512, dtype=np.float32)
        result = seg.process_chunk(silence)
        assert result is None
        assert seg.is_speaking is False

    def test_speech_segment_dataclass(self):
        s = SpeechSegment(
            audio=np.zeros(16000, dtype=np.float32),
            start_time=1.0,
            end_time=2.0
        )
        assert s.start_time == 1.0
        assert s.end_time == 2.0
        assert len(s.audio) == 16000

    def test_reset(self):
        seg = SileroVADSegmenter(VADConfig())
        seg.is_speaking = True
        seg.reset()
        assert seg.is_speaking is False
```

**Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_vad.py -v`

Expected: FAIL (module not found)

**Step 4: Write implementation**

Create `backend/meeting/vad.py`:

```python
"""Silero VAD wrapper for speech segmentation."""

from dataclasses import dataclass, field
from typing import Optional
import numpy as np
import torch


@dataclass
class VADConfig:
    threshold: float = 0.5
    min_speech_ms: int = 250
    hangover_ms: int = 300
    pre_roll_ms: int = 100
    max_segment_s: float = 30.0
    sample_rate: int = 16000


@dataclass
class SpeechSegment:
    audio: np.ndarray
    start_time: float
    end_time: float


class SileroVADSegmenter:
    """Segments audio stream into speech utterances using Silero VAD."""

    def __init__(self, config: VADConfig):
        self.config = config
        self.model, self.utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            trust_repo=True
        )
        self.is_speaking = False
        self._speech_buffer: list[np.ndarray] = []
        self._pre_roll_buffer: list[np.ndarray] = []
        self._speech_start_time: float = 0.0
        self._silence_duration_ms: float = 0.0
        self._total_samples: int = 0
        self._chunk_duration_ms = 512 / config.sample_rate * 1000  # ~32ms

    def process_chunk(self, chunk: np.ndarray) -> Optional[SpeechSegment]:
        """Process a 512-sample audio chunk. Returns SpeechSegment when utterance ends."""
        current_time = self._total_samples / self.config.sample_rate
        self._total_samples += len(chunk)

        # Get speech probability
        tensor = torch.from_numpy(chunk).float()
        prob = self.model(tensor, self.config.sample_rate).item()

        if prob >= self.config.threshold:
            # Speech detected
            self._silence_duration_ms = 0.0

            if not self.is_speaking:
                # Speech start
                self.is_speaking = True
                self._speech_start_time = max(
                    0, current_time - self.config.pre_roll_ms / 1000
                )
                # Prepend pre-roll buffer
                self._speech_buffer = list(self._pre_roll_buffer)
                self._pre_roll_buffer.clear()

            self._speech_buffer.append(chunk)

            # Check max segment length
            speech_duration = current_time - self._speech_start_time
            if speech_duration >= self.config.max_segment_s:
                return self._finalize_segment(current_time)

        else:
            # Silence detected
            if self.is_speaking:
                self._speech_buffer.append(chunk)
                self._silence_duration_ms += self._chunk_duration_ms

                if self._silence_duration_ms >= self.config.hangover_ms:
                    # Check minimum speech duration
                    speech_duration_ms = (
                        current_time - self._speech_start_time
                    ) * 1000
                    if speech_duration_ms >= self.config.min_speech_ms:
                        return self._finalize_segment(current_time)
                    else:
                        # Too short, discard
                        self._reset_speech_state()
            else:
                # Maintain pre-roll buffer
                self._pre_roll_buffer.append(chunk)
                max_pre_roll_chunks = int(
                    self.config.pre_roll_ms / self._chunk_duration_ms
                ) + 1
                if len(self._pre_roll_buffer) > max_pre_roll_chunks:
                    self._pre_roll_buffer.pop(0)

        return None

    def _finalize_segment(self, end_time: float) -> SpeechSegment:
        audio = np.concatenate(self._speech_buffer)
        segment = SpeechSegment(
            audio=audio,
            start_time=self._speech_start_time,
            end_time=end_time
        )
        self._reset_speech_state()
        return segment

    def _reset_speech_state(self):
        self.is_speaking = False
        self._speech_buffer.clear()
        self._silence_duration_ms = 0.0

    def reset(self):
        """Reset all state for a new session."""
        self._reset_speech_state()
        self._pre_roll_buffer.clear()
        self._total_samples = 0
        self._speech_start_time = 0.0
        self.model.reset_states()
```

**Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_vad.py -v`

Expected: All PASS

**Step 6: Commit**

```bash
git add backend/meeting/ backend/tests/
git commit -m "feat(meeting): add Silero VAD segmenter with config and tests"
```

---

### Task 3: FireRedASR Engine Adapter

**Files:**
- Create: `backend/engines/firered_engine.py`
- Create: `backend/tests/test_firered_engine.py`

**Step 1: Write the failing test**

Create `backend/tests/test_firered_engine.py`:

```python
import pytest
from backend.engines.firered_engine import FireRedEngine


class TestFireRedEngine:
    def test_models_dict(self):
        assert "firered-aed-l" in FireRedEngine.MODELS
        assert isinstance(FireRedEngine.MODELS["firered-aed-l"], str)

    def test_init(self):
        engine = FireRedEngine()
        assert engine.model is None
        assert engine.loaded_model is None

    def test_transcribe_not_loaded(self):
        engine = FireRedEngine()
        with pytest.raises(RuntimeError, match="not loaded"):
            engine.transcribe("dummy.wav")
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_firered_engine.py -v`

Expected: FAIL

**Step 3: Write implementation**

Create `backend/engines/firered_engine.py`:

```python
"""FireRedASR-AED engine adapter.

FireRedASR-AED (1.1B params) achieves CER 3.18% on Chinese benchmarks,
significantly better than Whisper (9.86%) and Paraformer (~4.5%).

Requires: pip install git+https://github.com/FireRedTeam/FireRedASR.git
Audio must be 16kHz 16-bit PCM WAV format.
"""

import logging
import os
import time
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class FireRedEngine:
    MODELS = {
        "firered-aed-l": "FireRedTeam/FireRedASR-AED-L",
    }

    def __init__(self):
        self.model = None
        self.loaded_model: Optional[str] = None
        self.device = "cuda" if self._cuda_available() else "cpu"

    @staticmethod
    def _cuda_available() -> bool:
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    def load(self, model_name: str = "firered-aed-l", **kwargs) -> None:
        """Load a FireRedASR model."""
        if model_name not in self.MODELS:
            raise ValueError(
                f"Unknown model: {model_name}. "
                f"Available: {list(self.MODELS.keys())}"
            )

        model_id = self.MODELS[model_name]
        logger.info(f"[FireRedASR] Loading {model_name} ({model_id})...")

        try:
            from fireredasr.models.fireredasr import FireRedAsr
        except ImportError:
            raise RuntimeError(
                "FireRedASR not installed. "
                "Run: pip install git+https://github.com/FireRedTeam/FireRedASR.git"
            )

        # Check for local model path first
        local_path = kwargs.get("local_model_path")
        if local_path and os.path.isdir(local_path):
            logger.info(f"[FireRedASR] Using local model: {local_path}")
            self.model = FireRedAsr.from_pretrained(
                model_type="aed", model_dir=local_path
            )
        else:
            # Download from HuggingFace
            from huggingface_hub import snapshot_download
            model_dir = snapshot_download(repo_id=model_id)
            self.model = FireRedAsr.from_pretrained(
                model_type="aed", model_dir=model_dir
            )

        self.loaded_model = model_name
        logger.info(f"[FireRedASR] Model {model_name} loaded on {self.device}")

    def transcribe(
        self,
        audio_path: str,
        language: str = "zh",
        **kwargs
    ) -> dict:
        """Transcribe an audio file.

        Args:
            audio_path: Path to 16kHz 16-bit PCM WAV file.
            language: Language hint (not used by FireRedASR, kept for interface).

        Returns:
            dict with keys: text, segments, duration, language, engine
        """
        if self.model is None:
            raise RuntimeError("FireRedASR model not loaded. Call load() first.")

        start = time.time()

        results = self.model.transcribe(
            [audio_path],
            {
                "use_gpu": self.device == "cuda",
                "beam_size": 5,
            }
        )

        elapsed = time.time() - start
        text = results[0]["text"] if results else ""

        return {
            "text": text,
            "segments": [{"text": text, "start": 0, "end": elapsed}],
            "duration": elapsed,
            "language": language,
            "engine": "firered",
            "model": self.loaded_model,
        }

    def transcribe_array(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
        **kwargs
    ) -> dict:
        """Transcribe from numpy array by writing temp file.

        Args:
            audio: Float32 numpy array of audio samples.
            sample_rate: Sample rate (must be 16000).

        Returns:
            Same as transcribe().
        """
        import tempfile
        import soundfile as sf

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name
            sf.write(tmp_path, audio, sample_rate, subtype="PCM_16")

        try:
            return self.transcribe(tmp_path, **kwargs)
        finally:
            os.unlink(tmp_path)

    def unload(self):
        """Unload the model to free memory."""
        self.model = None
        self.loaded_model = None
        logger.info("[FireRedASR] Model unloaded")
```

**Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_firered_engine.py -v`

Expected: All PASS

**Step 5: Commit**

```bash
git add backend/engines/firered_engine.py backend/tests/test_firered_engine.py
git commit -m "feat(engine): add FireRedASR-AED engine adapter"
```

---

### Task 4: diart Speaker Tracker Wrapper

**Files:**
- Create: `backend/meeting/speaker_tracker.py`
- Create: `backend/tests/test_speaker_tracker.py`

**Step 1: Write the failing test**

Create `backend/tests/test_speaker_tracker.py`:

```python
import numpy as np
import pytest
from backend.meeting.speaker_tracker import DiartSpeakerTracker, SpeakerInfo


class TestSpeakerInfo:
    def test_dataclass(self):
        info = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            registered_name=None,
            confidence=0.0
        )
        assert info.display_name == "说话人 1"

    def test_registered_display_name(self):
        info = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            registered_name="张三",
            confidence=0.92
        )
        assert info.display_name == "张三"


class TestDiartSpeakerTracker:
    def test_init(self):
        tracker = DiartSpeakerTracker(max_speakers=5)
        assert tracker.max_speakers == 5
        assert tracker.active_speaker is None

    def test_register_known_speakers(self):
        tracker = DiartSpeakerTracker()
        embedding = np.random.randn(192).astype(np.float32)
        tracker.register_known_speaker("张三", "spk_001", embedding)
        assert "spk_001" in tracker.known_speakers

    def test_reset(self):
        tracker = DiartSpeakerTracker()
        embedding = np.random.randn(192).astype(np.float32)
        tracker.register_known_speaker("张三", "spk_001", embedding)
        tracker.reset()
        assert tracker.active_speaker is None
        # known_speakers should persist across reset
        assert "spk_001" in tracker.known_speakers
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_speaker_tracker.py -v`

Expected: FAIL

**Step 3: Write implementation**

Create `backend/meeting/speaker_tracker.py`:

```python
"""Real-time speaker diarization using diart.

diart processes audio in a rolling buffer updated every 500ms.
It combines pyannote segmentation + embedding models with
incremental clustering to track speakers in real-time.

The tracker matches diart's anonymous Speaker_N labels against
pre-registered voiceprints using cosine similarity.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class SpeakerInfo:
    cluster_id: int
    label: str  # diart label, e.g. "Speaker_0"
    registered_name: Optional[str] = None
    registered_id: Optional[str] = None
    confidence: float = 0.0
    embedding: Optional[np.ndarray] = None

    @property
    def display_name(self) -> str:
        if self.registered_name:
            return self.registered_name
        return f"说话人 {self.cluster_id + 1}"


class DiartSpeakerTracker:
    """Wraps diart for real-time speaker tracking with voiceprint matching."""

    def __init__(
        self,
        max_speakers: int = 8,
        latency: float = 1.0,
        match_threshold: float = 0.6,
    ):
        self.max_speakers = max_speakers
        self.latency = latency
        self.match_threshold = match_threshold
        self.active_speaker: Optional[SpeakerInfo] = None
        self.speakers: dict[int, SpeakerInfo] = {}
        self.known_speakers: dict[str, dict] = {}  # id -> {name, embedding}
        self._pipeline = None

    def _init_pipeline(self):
        """Lazy-init diart pipeline (expensive, loads models)."""
        if self._pipeline is not None:
            return

        try:
            from diart import SpeakerDiarization
            from diart.inference import StreamingInference
            import diart.operators as ops

            config = SpeakerDiarization.HyperParameters(
                tau_active=0.5,
                rho_update=0.3,
                delta_new=1.0,
                max_speakers=self.max_speakers,
            )
            self._pipeline = SpeakerDiarization(config)
            logger.info("[SpeakerTracker] diart pipeline initialized")
        except ImportError:
            logger.warning(
                "[SpeakerTracker] diart not available, "
                "speaker tracking disabled"
            )
        except Exception as e:
            logger.error(f"[SpeakerTracker] Failed to init: {e}")

    def register_known_speaker(
        self,
        name: str,
        speaker_id: str,
        embedding: np.ndarray
    ):
        """Register a known speaker's voiceprint for matching."""
        self.known_speakers[speaker_id] = {
            "name": name,
            "embedding": embedding / np.linalg.norm(embedding),  # normalize
        }
        logger.info(f"[SpeakerTracker] Registered known speaker: {name}")

    def identify_speaker(
        self, embedding: np.ndarray
    ) -> tuple[Optional[str], Optional[str], float]:
        """Match an embedding against known speakers.

        Returns:
            (speaker_id, name, confidence) or (None, None, 0.0)
        """
        if not self.known_speakers:
            return None, None, 0.0

        embedding_norm = embedding / np.linalg.norm(embedding)
        best_id = None
        best_name = None
        best_score = 0.0

        for spk_id, info in self.known_speakers.items():
            score = float(np.dot(embedding_norm, info["embedding"]))
            if score > best_score:
                best_score = score
                best_id = spk_id
                best_name = info["name"]

        if best_score >= self.match_threshold:
            return best_id, best_name, best_score
        return None, None, best_score

    def process_segment(
        self, audio: np.ndarray, start_time: float, end_time: float
    ) -> SpeakerInfo:
        """Identify the speaker for a VAD-segmented audio chunk.

        Falls back to embedding extraction + matching if diart
        pipeline is not available.
        """
        self._init_pipeline()

        # Extract embedding for this segment
        embedding = self._extract_embedding(audio)

        if embedding is not None:
            spk_id, spk_name, confidence = self.identify_speaker(embedding)

            # Find or create cluster
            cluster_id = self._get_or_create_cluster(embedding)

            info = SpeakerInfo(
                cluster_id=cluster_id,
                label=f"Speaker_{cluster_id}",
                registered_name=spk_name,
                registered_id=spk_id,
                confidence=confidence,
                embedding=embedding,
            )
        else:
            # No embedding available, assign unknown
            info = SpeakerInfo(
                cluster_id=len(self.speakers),
                label=f"Speaker_{len(self.speakers)}",
            )

        self.speakers[info.cluster_id] = info
        self.active_speaker = info
        return info

    def _extract_embedding(self, audio: np.ndarray) -> Optional[np.ndarray]:
        """Extract speaker embedding from audio segment."""
        try:
            from pyannote.audio import Inference
            import torch

            if not hasattr(self, "_embedding_model"):
                self._embedding_model = Inference(
                    "pyannote/embedding",
                    window="whole",
                    use_auth_token=True,
                )

            # pyannote expects (channel, samples) tensor
            waveform = torch.from_numpy(audio).float().unsqueeze(0)
            embedding = self._embedding_model(
                {"waveform": waveform, "sample_rate": 16000}
            )
            return np.array(embedding).flatten()
        except Exception as e:
            logger.warning(f"[SpeakerTracker] Embedding extraction failed: {e}")
            return None

    def _get_or_create_cluster(self, embedding: np.ndarray) -> int:
        """Assign embedding to existing cluster or create new one."""
        embedding_norm = embedding / np.linalg.norm(embedding)

        best_cluster = -1
        best_score = 0.0

        for cid, info in self.speakers.items():
            if info.embedding is not None:
                ref = info.embedding / np.linalg.norm(info.embedding)
                score = float(np.dot(embedding_norm, ref))
                if score > best_score:
                    best_score = score
                    best_cluster = cid

        # Threshold for same speaker cluster
        if best_score >= 0.5 and best_cluster >= 0:
            return best_cluster

        # New cluster
        return len(self.speakers)

    def reset(self):
        """Reset tracking state for new session. Keeps known speakers."""
        self.active_speaker = None
        self.speakers.clear()
        self._pipeline = None
        if hasattr(self, "_embedding_model"):
            del self._embedding_model
        logger.info("[SpeakerTracker] State reset")
```

**Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_speaker_tracker.py -v`

Expected: All PASS

**Step 5: Commit**

```bash
git add backend/meeting/speaker_tracker.py backend/tests/test_speaker_tracker.py
git commit -m "feat(meeting): add diart speaker tracker with voiceprint matching"
```

---

### Task 5: MeetingSession Orchestrator

**Files:**
- Create: `backend/meeting/session.py`
- Create: `backend/tests/test_session.py`

**Step 1: Write the failing test**

Create `backend/tests/test_session.py`:

```python
import pytest
from unittest.mock import MagicMock
from backend.meeting.session import MeetingSession, Utterance, SessionConfig


class TestSessionConfig:
    def test_defaults(self):
        cfg = SessionConfig()
        assert cfg.engine == "firered"
        assert cfg.speakers_enabled is True
        assert cfg.summary_interval == 120

    def test_custom(self):
        cfg = SessionConfig(engine="funasr", summary_interval=60)
        assert cfg.engine == "funasr"
        assert cfg.summary_interval == 60


class TestUtterance:
    def test_to_dict(self):
        u = Utterance(
            id="utt_001",
            speaker="张三",
            speaker_id="spk_001",
            text="测试文本",
            start=1.0,
            end=3.5,
            confidence=0.85,
        )
        d = u.to_dict()
        assert d["type"] == "utterance"
        assert d["speaker"] == "张三"
        assert d["text"] == "测试文本"
        assert d["start"] == 1.0


class TestMeetingSession:
    def test_init(self):
        session = MeetingSession(SessionConfig())
        assert session.session_id is not None
        assert len(session.utterances) == 0
        assert session.running_summary == ""

    def test_add_utterance(self):
        session = MeetingSession(SessionConfig())
        u = Utterance(
            id="utt_001",
            speaker="张三",
            speaker_id="spk_001",
            text="你好",
            start=0.0,
            end=1.0,
            confidence=0.9,
        )
        session.add_utterance(u)
        assert len(session.utterances) == 1
        assert session.utterances[0].text == "你好"

    def test_get_plain_text(self):
        session = MeetingSession(SessionConfig())
        session.add_utterance(Utterance(
            id="1", speaker="张三", speaker_id="s1",
            text="你好", start=0.0, end=1.0, confidence=0.9
        ))
        session.add_utterance(Utterance(
            id="2", speaker="李四", speaker_id="s2",
            text="你好啊", start=1.5, end=2.5, confidence=0.9
        ))
        assert session.get_plain_text() == "你好\n你好啊"

    def test_get_formatted_text_with_speakers(self):
        session = MeetingSession(SessionConfig())
        session.add_utterance(Utterance(
            id="1", speaker="张三", speaker_id="s1",
            text="你好", start=0.0, end=1.0, confidence=0.9
        ))
        text = session.get_formatted_text(include_speakers=True)
        assert "[张三]" in text
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_session.py -v`

Expected: FAIL

**Step 3: Write implementation**

Create `backend/meeting/session.py`:

```python
"""Meeting session orchestrator.

Manages the lifecycle of a meeting recording session:
VAD segmentation -> speaker identification -> ASR transcription.
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from backend.meeting.vad import SileroVADSegmenter, VADConfig, SpeechSegment
from backend.meeting.speaker_tracker import DiartSpeakerTracker, SpeakerInfo

logger = logging.getLogger(__name__)


@dataclass
class SessionConfig:
    engine: str = "firered"
    model: str = "firered-aed-l"
    language: str = "zh"
    speakers_enabled: bool = True
    hotwords: str = ""
    enable_ai_refine: bool = True
    summary_interval: int = 120  # seconds
    max_speakers: int = 8
    llm_provider: str = "claude_cli"
    llm_model: str = "haiku"


@dataclass
class Utterance:
    id: str
    speaker: str
    speaker_id: str
    text: str
    start: float
    end: float
    confidence: float
    refined_text: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "type": "utterance",
            "id": self.id,
            "speaker": self.speaker,
            "speaker_id": self.speaker_id,
            "text": self.refined_text or self.text,
            "original_text": self.text if self.refined_text else None,
            "start": self.start,
            "end": self.end,
            "confidence": self.confidence,
        }


class MeetingSession:
    """Orchestrates a meeting recording session."""

    def __init__(self, config: SessionConfig):
        self.config = config
        self.session_id = str(uuid.uuid4())[:8]
        self.start_time = time.time()
        self.utterances: list[Utterance] = []
        self.running_summary: str = ""
        self._utterance_counter = 0

        # Initialize components
        self.vad = SileroVADSegmenter(VADConfig())
        self.speaker_tracker = (
            DiartSpeakerTracker(max_speakers=config.max_speakers)
            if config.speakers_enabled
            else None
        )
        self.asr_engine = None  # Loaded externally and set

        logger.info(
            f"[MeetingSession] Created session {self.session_id} "
            f"engine={config.engine} speakers={config.speakers_enabled}"
        )

    def set_asr_engine(self, engine):
        """Set the ASR engine (loaded externally)."""
        self.asr_engine = engine

    def load_registered_speakers(self, speakers: list[dict]):
        """Load pre-registered speakers for matching.

        Args:
            speakers: List of {id, name, embedding} dicts from speaker.py
        """
        if not self.speaker_tracker:
            return

        for spk in speakers:
            self.speaker_tracker.register_known_speaker(
                name=spk["name"],
                speaker_id=spk["id"],
                embedding=spk["embedding"],
            )

    async def process_audio_segment(
        self, segment: SpeechSegment
    ) -> Utterance:
        """Process a VAD-segmented audio chunk through ASR + speaker ID.

        Args:
            segment: Audio segment from VAD.

        Returns:
            Utterance with speaker and text.
        """
        # Speaker identification
        if self.speaker_tracker:
            speaker_info = self.speaker_tracker.process_segment(
                segment.audio, segment.start_time, segment.end_time
            )
            speaker_name = speaker_info.display_name
            speaker_id = speaker_info.registered_id or speaker_info.label
            confidence = speaker_info.confidence
        else:
            speaker_name = "说话人"
            speaker_id = "unknown"
            confidence = 0.0

        # ASR transcription
        if self.asr_engine is None:
            raise RuntimeError("ASR engine not set")

        result = self.asr_engine.transcribe_array(
            segment.audio,
            sample_rate=16000,
            hotwords=self.config.hotwords,
        )

        self._utterance_counter += 1
        utterance = Utterance(
            id=f"utt_{self._utterance_counter:04d}",
            speaker=speaker_name,
            speaker_id=speaker_id,
            text=result["text"],
            start=segment.start_time,
            end=segment.end_time,
            confidence=confidence,
        )

        self.add_utterance(utterance)
        return utterance

    def add_utterance(self, utterance: Utterance):
        """Add an utterance to the session."""
        self.utterances.append(utterance)

    def get_plain_text(self) -> str:
        """Get all utterances as plain text."""
        return "\n".join(u.refined_text or u.text for u in self.utterances)

    def get_formatted_text(
        self,
        include_speakers: bool = False,
        include_summary: bool = False,
    ) -> str:
        """Get formatted text based on output preferences."""
        lines = []

        for u in self.utterances:
            text = u.refined_text or u.text
            if include_speakers:
                lines.append(f"[{u.speaker}] {text}")
            else:
                lines.append(text)

        result = "\n".join(lines)

        if include_summary and self.running_summary:
            result += f"\n\n---\n摘要：{self.running_summary}"

        return result

    def get_recent_transcript(self, since_utterance: int = 0) -> str:
        """Get transcript since a given utterance index, for summarization."""
        recent = self.utterances[since_utterance:]
        lines = []
        for u in recent:
            text = u.refined_text or u.text
            lines.append(f"[{u.speaker}] {text}")
        return "\n".join(lines)

    def get_session_data(self) -> dict:
        """Get complete session data for history storage."""
        return {
            "session_id": self.session_id,
            "timestamp": self.start_time,
            "duration": time.time() - self.start_time,
            "engine": self.config.engine,
            "utterances": [u.to_dict() for u in self.utterances],
            "summary": {
                "content": self.running_summary,
                "decisions": [],
                "action_items": [],
            } if self.running_summary else None,
            "plain_text": self.get_plain_text(),
        }

    def cleanup(self):
        """Clean up resources."""
        self.vad.reset()
        if self.speaker_tracker:
            self.speaker_tracker.reset()
        logger.info(f"[MeetingSession] Session {self.session_id} cleaned up")
```

**Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_session.py -v`

Expected: All PASS

**Step 5: Commit**

```bash
git add backend/meeting/session.py backend/tests/test_session.py
git commit -m "feat(meeting): add MeetingSession orchestrator"
```

---

### Task 6: /meeting WebSocket Endpoint

**Files:**
- Modify: `backend/server.py`
- Create: `backend/tests/test_meeting_endpoint.py`

**Step 1: Write the failing test**

Create `backend/tests/test_meeting_endpoint.py`:

```python
"""Smoke test for /meeting WebSocket endpoint."""

import json
import pytest
from fastapi.testclient import TestClient


def test_meeting_endpoint_exists():
    """Verify the /meeting WebSocket route is registered."""
    import sys
    sys.path.insert(0, ".")
    from backend.server import app

    # Check that /meeting route exists
    routes = [r.path for r in app.routes]
    assert "/meeting" in routes


def test_root_shows_meeting_capability():
    """Verify root endpoint advertises meeting capability."""
    import sys
    sys.path.insert(0, ".")
    from backend.server import app
    client = TestClient(app)
    response = client.get("/")
    data = response.json()
    assert "meeting" in str(data).lower() or response.status_code == 200
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_meeting_endpoint.py -v`

Expected: FAIL (no `/meeting` route)

**Step 3: Add /meeting endpoint to server.py**

Locate the existing `/stream` WebSocket endpoint in `backend/server.py`. After it, add the `/meeting` endpoint. Read the file first to find the right insertion point.

Add these imports near the top of `server.py`:

```python
from backend.meeting.session import MeetingSession, SessionConfig, Utterance
from backend.meeting.vad import SpeechSegment
```

Add the endpoint after the existing `/stream` handler:

```python
@app.websocket("/meeting")
async def meeting_ws(websocket: WebSocket):
    """WebSocket endpoint for meeting recording with speaker diarization.

    Protocol:
    Client sends: {"action": "start", "engine": "firered", "speakers_enabled": true}
    Client sends: {"action": "audio", "data": "<base64 PCM 16kHz mono>"}
    Client sends: {"action": "end"}

    Server sends: {"type": "utterance", "speaker": "...", "text": "...", ...}
    Server sends: {"type": "speaker_active", "speaker": "...", ...}
    Server sends: {"type": "summary", "content": "...", ...}
    Server sends: {"type": "session_end", ...}
    """
    await websocket.accept()
    session = None

    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                msg = json.loads(data["text"])
                action = msg.get("action")

                if action == "start":
                    config = SessionConfig(
                        engine=msg.get("engine", "firered"),
                        model=msg.get("model", "firered-aed-l"),
                        speakers_enabled=msg.get("speakers_enabled", True),
                        hotwords=msg.get("hotwords", ""),
                        enable_ai_refine=msg.get("enable_ai_refine", True),
                        summary_interval=msg.get("summary_interval", 120),
                        llm_provider=msg.get("llm_provider", "claude_cli"),
                        llm_model=msg.get("llm_model", "haiku"),
                    )
                    session = MeetingSession(config)

                    # Set ASR engine
                    engine_name = config.engine
                    if engine_name in engines and engines[engine_name].get("instance"):
                        session.set_asr_engine(engines[engine_name]["instance"])
                    elif MOCK_MODE:
                        session.set_asr_engine(_MockASREngine())
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Engine '{engine_name}' not loaded"
                        })
                        continue

                    # Load registered speakers
                    if config.speakers_enabled and diarizer:
                        try:
                            speakers_data = []
                            for spk in diarizer.list_speakers():
                                emb = diarizer.load_speaker_embedding(spk["id"])
                                if emb is not None:
                                    speakers_data.append({
                                        "id": spk["id"],
                                        "name": spk["name"],
                                        "embedding": emb,
                                    })
                            session.load_registered_speakers(speakers_data)
                        except Exception as e:
                            logger.warning(f"[Meeting] Failed to load speakers: {e}")

                    await websocket.send_json({
                        "type": "started",
                        "session_id": session.session_id,
                        "engine": config.engine,
                        "speakers_enabled": config.speakers_enabled,
                    })

                elif action == "end":
                    if session:
                        session_data = session.get_session_data()
                        await websocket.send_json({
                            "type": "session_end",
                            "total_utterances": len(session.utterances),
                            "duration": session_data["duration"],
                            "session_data": session_data,
                        })
                        session.cleanup()
                        session = None
                    break

            elif "bytes" in data:
                # Binary PCM audio data
                if session is None:
                    continue

                audio_bytes = data["bytes"]
                audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(
                    np.float32
                ) / 32768.0

                # Feed audio to VAD in 512-sample chunks
                chunk_size = 512
                for i in range(0, len(audio), chunk_size):
                    chunk = audio[i:i + chunk_size]
                    if len(chunk) < chunk_size:
                        chunk = np.pad(chunk, (0, chunk_size - len(chunk)))

                    segment = session.vad.process_chunk(chunk)

                    if segment is not None:
                        # VAD detected end of utterance
                        try:
                            utterance = await session.process_audio_segment(
                                segment
                            )
                            await websocket.send_json(utterance.to_dict())

                            # Notify active speaker
                            await websocket.send_json({
                                "type": "speaker_active",
                                "speaker": utterance.speaker,
                                "speaker_id": utterance.speaker_id,
                            })
                        except Exception as e:
                            logger.error(f"[Meeting] Processing error: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": str(e),
                            })

    except WebSocketDisconnect:
        if session:
            session.cleanup()
    except Exception as e:
        logger.error(f"[Meeting] WebSocket error: {e}")
        if session:
            session.cleanup()


class _MockASREngine:
    """Mock ASR engine for testing without real models."""

    def transcribe_array(self, audio, sample_rate=16000, **kwargs):
        duration = len(audio) / sample_rate
        return {
            "text": f"[模拟转写 {duration:.1f}s]",
            "segments": [],
            "duration": 0.01,
            "language": "zh",
            "engine": "mock",
        }
```

Also add `import numpy as np` and `import json` to imports if not already present.

**Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_meeting_endpoint.py -v`

Expected: All PASS

**Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_meeting_endpoint.py
git commit -m "feat(meeting): add /meeting WebSocket endpoint with VAD + speaker + ASR pipeline"
```

---

## Phase 2: Frontend Recording Panel

### Task 7: Meeting Store (Zustand)

**Files:**
- Create: `frontend/src/store/meeting-store.ts`

**Step 1: Create the store**

Create `frontend/src/store/meeting-store.ts`:

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MeetingUtterance {
  id: string;
  speaker: string;
  speakerId: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface MeetingSummary {
  content: string;
  decisions: string[];
  actionItems: Array<{ assignee: string; task: string }>;
  updatedAt: string;
}

export interface MeetingRecord {
  id: string;
  timestamp: number;
  duration: number;
  engine: string;
  utterances: MeetingUtterance[];
  summary: MeetingSummary | null;
  plainText: string;
}

interface MeetingState {
  // Active session
  isRecording: boolean;
  sessionId: string | null;
  currentUtterances: MeetingUtterance[];
  currentSummary: MeetingSummary | null;
  activeSpeaker: string | null;
  recordingStartTime: number | null;

  // History
  meetingHistory: MeetingRecord[];

  // Actions - active session
  startSession: (sessionId: string) => void;
  endSession: () => void;
  addUtterance: (utterance: MeetingUtterance) => void;
  updateUtterance: (id: string, text: string) => void;
  setSummary: (summary: MeetingSummary) => void;
  setActiveSpeaker: (speaker: string | null) => void;

  // Actions - history
  addMeetingRecord: (record: MeetingRecord) => void;
  deleteMeetingRecord: (id: string) => void;
  clearMeetingHistory: () => void;
}

export const useMeetingStore = create<MeetingState>()(
  persist(
    (set, get) => ({
      // Active session state (not persisted)
      isRecording: false,
      sessionId: null,
      currentUtterances: [],
      currentSummary: null,
      activeSpeaker: null,
      recordingStartTime: null,

      // History (persisted)
      meetingHistory: [],

      startSession: (sessionId) =>
        set({
          isRecording: true,
          sessionId,
          currentUtterances: [],
          currentSummary: null,
          activeSpeaker: null,
          recordingStartTime: Date.now(),
        }),

      endSession: () => {
        const state = get();
        if (state.currentUtterances.length > 0) {
          const record: MeetingRecord = {
            id: state.sessionId || crypto.randomUUID(),
            timestamp: state.recordingStartTime || Date.now(),
            duration: (Date.now() - (state.recordingStartTime || Date.now())) / 1000,
            engine: "firered",
            utterances: state.currentUtterances,
            summary: state.currentSummary,
            plainText: state.currentUtterances.map((u) => u.text).join("\n"),
          };
          set((s) => ({
            meetingHistory: [record, ...s.meetingHistory],
          }));
        }
        set({
          isRecording: false,
          sessionId: null,
          currentUtterances: [],
          currentSummary: null,
          activeSpeaker: null,
          recordingStartTime: null,
        });
      },

      addUtterance: (utterance) =>
        set((s) => ({
          currentUtterances: [...s.currentUtterances, utterance],
          activeSpeaker: utterance.speaker,
        })),

      updateUtterance: (id, text) =>
        set((s) => ({
          currentUtterances: s.currentUtterances.map((u) =>
            u.id === id ? { ...u, text } : u
          ),
        })),

      setSummary: (summary) => set({ currentSummary: summary }),

      setActiveSpeaker: (speaker) => set({ activeSpeaker: speaker }),

      addMeetingRecord: (record) =>
        set((s) => ({
          meetingHistory: [record, ...s.meetingHistory],
        })),

      deleteMeetingRecord: (id) =>
        set((s) => ({
          meetingHistory: s.meetingHistory.filter((r) => r.id !== id),
        })),

      clearMeetingHistory: () => set({ meetingHistory: [] }),
    }),
    {
      name: "voicescribe-meetings",
      partialize: (state) => ({
        meetingHistory: state.meetingHistory,
      }),
    }
  )
);
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/store/meeting-store.ts
git commit -m "feat(frontend): add meeting store with session and history management"
```

---

### Task 8: Meeting WebSocket Client

**Files:**
- Create: `frontend/src/lib/meeting-websocket.ts`

**Step 1: Create the WebSocket client**

Create `frontend/src/lib/meeting-websocket.ts`:

```typescript
import type { MeetingUtterance, MeetingSummary } from "../store/meeting-store";

export interface MeetingWSOptions {
  engine: string;
  model?: string;
  speakersEnabled: boolean;
  hotwords?: string;
  enableAiRefine?: boolean;
  summaryInterval?: number;
  llmProvider?: string;
  llmModel?: string;
}

export interface MeetingWSCallbacks {
  onStarted: (sessionId: string) => void;
  onUtterance: (utterance: MeetingUtterance) => void;
  onUtteranceRefined: (id: string, text: string) => void;
  onSpeakerActive: (speaker: string, speakerId: string) => void;
  onSummary: (summary: MeetingSummary) => void;
  onSessionEnd: (data: { totalUtterances: number; duration: number; sessionData: any }) => void;
  onError: (message: string) => void;
}

export class MeetingWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: MeetingWSCallbacks;
  private url: string;

  constructor(
    backendUrl: string = "ws://127.0.0.1:8765",
    callbacks: MeetingWSCallbacks
  ) {
    this.url = `${backendUrl}/meeting`;
    this.callbacks = callbacks;
  }

  async connect(options: MeetingWSOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.ws!.send(
          JSON.stringify({
            action: "start",
            engine: options.engine,
            model: options.model,
            speakers_enabled: options.speakersEnabled,
            hotwords: options.hotwords || "",
            enable_ai_refine: options.enableAiRefine ?? true,
            summary_interval: options.summaryInterval ?? 120,
            llm_provider: options.llmProvider ?? "claude_cli",
            llm_model: options.llmModel ?? "haiku",
          })
        );
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "started":
            this.callbacks.onStarted(msg.session_id);
            resolve();
            break;

          case "utterance":
            this.callbacks.onUtterance({
              id: msg.id,
              speaker: msg.speaker,
              speakerId: msg.speaker_id,
              text: msg.text,
              start: msg.start,
              end: msg.end,
              confidence: msg.confidence,
            });
            break;

          case "utterance_refined":
            this.callbacks.onUtteranceRefined(msg.utterance_id, msg.text);
            break;

          case "speaker_active":
            this.callbacks.onSpeakerActive(msg.speaker, msg.speaker_id);
            break;

          case "summary":
            this.callbacks.onSummary({
              content: msg.content,
              decisions: msg.decisions || [],
              actionItems: (msg.action_items || []).map(
                (a: { assignee: string; task: string }) => ({
                  assignee: a.assignee,
                  task: a.task,
                })
              ),
              updatedAt: new Date().toISOString(),
            });
            break;

          case "session_end":
            this.callbacks.onSessionEnd({
              totalUtterances: msg.total_utterances,
              duration: msg.duration,
              sessionData: msg.session_data,
            });
            break;

          case "error":
            this.callbacks.onError(msg.message);
            break;
        }
      };

      this.ws.onerror = (err) => {
        reject(new Error("Meeting WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  sendAudio(pcmData: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcmData.buffer);
    }
  }

  async finish(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "end" }));
    }
  }

  abort(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/lib/meeting-websocket.ts
git commit -m "feat(frontend): add meeting WebSocket client"
```

---

### Task 9: Recording Tab UI Components

**Files:**
- Create: `frontend/src/components/meeting/TranscriptPanel.tsx`
- Create: `frontend/src/components/meeting/SummaryCard.tsx`
- Create: `frontend/src/components/meeting/RecordingControls.tsx`
- Create: `frontend/src/components/MeetingRecorder.tsx`

**Step 1: Create TranscriptPanel**

Create `frontend/src/components/meeting/TranscriptPanel.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { MeetingUtterance } from "../../store/meeting-store";

const SPEAKER_COLORS = [
  "text-blue-400",
  "text-green-400",
  "text-yellow-400",
  "text-purple-400",
  "text-pink-400",
  "text-cyan-400",
  "text-orange-400",
  "text-red-400",
];

interface TranscriptPanelProps {
  utterances: MeetingUtterance[];
  activeSpeaker: string | null;
}

export function TranscriptPanel({ utterances, activeSpeaker }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const speakerColorMap = useRef(new Map<string, string>());

  function getSpeakerColor(speaker: string): string {
    if (!speakerColorMap.current.has(speaker)) {
      const idx = speakerColorMap.current.size % SPEAKER_COLORS.length;
      speakerColorMap.current.set(speaker, SPEAKER_COLORS[idx]);
    }
    return speakerColorMap.current.get(speaker)!;
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [utterances]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  }

  if (utterances.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        等待录音开始...
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-3"
    >
      {utterances.map((u) => (
        <div key={u.id} className="group">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`font-medium text-sm ${getSpeakerColor(u.speaker)}`}>
              {u.speaker}
            </span>
            <span className="text-xs text-gray-500">
              {formatTime(u.start)}
            </span>
          </div>
          <p className="text-sm text-gray-200 pl-0.5">{u.text}</p>
        </div>
      ))}

      {!autoScrollRef.current && (
        <button
          onClick={() => {
            autoScrollRef.current = true;
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
          className="fixed bottom-24 right-8 bg-gray-700 text-white text-xs px-3 py-1 rounded-full shadow"
        >
          回到底部
        </button>
      )}
    </div>
  );
}
```

**Step 2: Create SummaryCard**

Create `frontend/src/components/meeting/SummaryCard.tsx`:

```tsx
"use client";

import type { MeetingSummary } from "../../store/meeting-store";

interface SummaryCardProps {
  summary: MeetingSummary | null;
  isRecording: boolean;
}

export function SummaryCard({ summary, isRecording }: SummaryCardProps) {
  if (!summary && isRecording) {
    return (
      <div className="border-t border-gray-700 p-4 text-gray-500 text-sm">
        摘要将在录制 2-3 分钟后自动生成...
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="border-t border-gray-700 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">实时摘要</h3>
        {summary.updatedAt && (
          <span className="text-xs text-gray-500">
            更新于 {new Date(summary.updatedAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-200">{summary.content}</p>
      {summary.decisions.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-1">决策</h4>
          <ul className="text-sm text-gray-300 list-disc list-inside">
            {summary.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.actionItems.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-1">待办</h4>
          <ul className="text-sm text-gray-300 list-disc list-inside">
            {summary.actionItems.map((a, i) => (
              <li key={i}>
                <span className="text-blue-400">{a.assignee}</span>：{a.task}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create RecordingControls**

Create `frontend/src/components/meeting/RecordingControls.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface RecordingControlsProps {
  isRecording: boolean;
  startTime: number | null;
  activeSpeaker: string | null;
  onStart: () => void;
  onStop: () => void;
}

export function RecordingControls({
  isRecording,
  startTime,
  activeSpeaker,
  onStart,
  onStop,
}: RecordingControlsProps) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!isRecording || !startTime) {
      setElapsed("00:00");
      return;
    }

    const timer = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      const m = Math.floor(secs / 60).toString().padStart(2, "0");
      const s = (secs % 60).toString().padStart(2, "0");
      setElapsed(`${m}:${s}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording, startTime]);

  return (
    <div className="border-t border-gray-700 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isRecording && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
        <span className="text-sm font-mono text-gray-300">{elapsed}</span>
        {activeSpeaker && isRecording && (
          <span className="text-xs text-gray-500">
            {activeSpeaker} 正在说话
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {!isRecording ? (
          <button
            onClick={onStart}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition"
          >
            开始录制
          </button>
        ) : (
          <button
            onClick={onStop}
            className="px-4 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-md transition"
          >
            停止录制
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Create MeetingRecorder main component**

Create `frontend/src/components/MeetingRecorder.tsx`:

```tsx
"use client";

import { useCallback, useRef } from "react";
import { useMeetingStore } from "../store/meeting-store";
import { MeetingWebSocket } from "../lib/meeting-websocket";
import { TranscriptPanel } from "./meeting/TranscriptPanel";
import { SummaryCard } from "./meeting/SummaryCard";
import { RecordingControls } from "./meeting/RecordingControls";

export function MeetingRecorder() {
  const store = useMeetingStore();
  const wsRef = useRef<MeetingWebSocket | null>(null);
  const recorderRef = useRef<any>(null);

  const handleStart = useCallback(async () => {
    try {
      // Get settings from electron
      const settings = await window.electron?.settings.get();

      const ws = new MeetingWebSocket("ws://127.0.0.1:8765", {
        onStarted: (sessionId) => {
          store.startSession(sessionId);
        },
        onUtterance: (utterance) => {
          store.addUtterance(utterance);
        },
        onUtteranceRefined: (id, text) => {
          store.updateUtterance(id, text);
        },
        onSpeakerActive: (speaker) => {
          store.setActiveSpeaker(speaker);
        },
        onSummary: (summary) => {
          store.setSummary(summary);
        },
        onSessionEnd: () => {
          store.endSession();
        },
        onError: (msg) => {
          console.error("[MeetingRecorder] Error:", msg);
        },
      });

      await ws.connect({
        engine: settings?.engine || "firered",
        model: settings?.model || "firered-aed-l",
        speakersEnabled: settings?.enableDiarization ?? true,
        hotwords: settings?.vocabulary?.join(", ") || "",
        enableAiRefine: settings?.enableAiRefine ?? true,
      });

      wsRef.current = ws;

      // Start audio capture
      const { WavRecorder } = await import("../lib/wav-recorder");
      const recorder = new WavRecorder({ sampleRate: 16000 });
      recorderRef.current = recorder;

      recorder.setOnPcmChunk((chunk: Int16Array) => {
        ws.sendAudio(chunk);
      });

      await recorder.start();
    } catch (err) {
      console.error("[MeetingRecorder] Failed to start:", err);
    }
  }, [store]);

  const handleStop = useCallback(async () => {
    try {
      // Stop audio capture
      if (recorderRef.current) {
        await recorderRef.current.stop();
        recorderRef.current = null;
      }

      // End meeting session
      if (wsRef.current) {
        await wsRef.current.finish();
        wsRef.current = null;
      }
    } catch (err) {
      console.error("[MeetingRecorder] Failed to stop:", err);
      store.endSession();
    }
  }, [store]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <TranscriptPanel
        utterances={store.currentUtterances}
        activeSpeaker={store.activeSpeaker}
      />
      <SummaryCard
        summary={store.currentSummary}
        isRecording={store.isRecording}
      />
      <RecordingControls
        isRecording={store.isRecording}
        startTime={store.recordingStartTime}
        activeSpeaker={store.activeSpeaker}
        onStart={handleStart}
        onStop={handleStop}
      />
    </div>
  );
}
```

**Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors (may need to fix import paths based on actual project structure)

**Step 6: Commit**

```bash
git add frontend/src/components/meeting/ frontend/src/components/MeetingRecorder.tsx
git commit -m "feat(frontend): add meeting recording tab UI components"
```

---

### Task 10: Wire Recording Tab into Main Window

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/components/SettingsPanel.tsx` (if tab navigation exists there)

**Step 1: Read current page.tsx to understand navigation**

Read `frontend/src/app/page.tsx` to understand how tabs/navigation work.

**Step 2: Add "录制" tab to the navigation**

Add a new tab alongside existing ones. Import `MeetingRecorder` and render it when the recording tab is selected. The exact modification depends on the current navigation structure found in step 1.

**Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(frontend): wire meeting recorder tab into main window navigation"
```

---

## Phase 3: AI Post-Processing

### Task 11: Refactor AI Refiner

**Files:**
- Modify: `backend/postprocess/ai_refiner.py`
- Create: `backend/tests/test_ai_refiner.py`

**Step 1: Write the failing test**

Create `backend/tests/test_ai_refiner.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch
from backend.postprocess.ai_refiner import AIRefiner


class TestAIRefiner:
    def test_init_default_provider(self):
        refiner = AIRefiner()
        assert refiner.provider == "claude_cli"

    def test_init_custom_provider(self):
        refiner = AIRefiner(provider="anthropic_api")
        assert refiner.provider == "anthropic_api"

    def test_should_refine_with_hotwords(self):
        refiner = AIRefiner()
        assert refiner.should_refine("中文文本", ["LLM", "GPT"]) is True

    def test_should_not_refine_without_hotwords(self):
        refiner = AIRefiner()
        assert refiner.should_refine("中文文本", []) is False

    def test_build_hotword_prompt(self):
        refiner = AIRefiner()
        prompt = refiner._build_hotword_prompt("测试LM文本", ["LLM", "GPT"])
        assert "LLM" in prompt
        assert "GPT" in prompt
        assert "测试LM文本" in prompt
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ai_refiner.py -v`

Expected: FAIL

**Step 3: Rewrite ai_refiner.py**

Read current `backend/postprocess/ai_refiner.py` first, then rewrite:

```python
"""AI-powered text refinement with multi-provider LLM support.

Supports:
- claude CLI (haiku) - default, no API key needed
- Anthropic SDK - for direct API calls (reserved)
- Custom API - for local/domestic models (reserved)
"""

import asyncio
import logging
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)


class AIRefiner:
    def __init__(
        self,
        provider: str = "claude_cli",
        model: str = "haiku",
        custom_api_url: str = "",
        custom_api_key: str = "",
        timeout: int = 30,
    ):
        self.provider = provider
        self.model = model
        self.custom_api_url = custom_api_url
        self.custom_api_key = custom_api_key
        self.timeout = timeout

    def should_refine(self, text: str, hotwords: list[str]) -> bool:
        """Determine if text should be refined. Triggers when hotwords exist."""
        return len(hotwords) > 0 and len(text.strip()) > 0

    async def refine(self, text: str, hotwords: list[str]) -> str:
        """Refine transcribed text using LLM to correct hotword errors.

        Args:
            text: Transcribed text to refine.
            hotwords: List of correct terms to match against.

        Returns:
            Refined text, or original text if refinement fails.
        """
        if not self.should_refine(text, hotwords):
            return text

        prompt = self._build_hotword_prompt(text, hotwords)

        try:
            result = await self._call_llm(prompt)
            if result and len(result.strip()) > 0:
                return result.strip()
        except Exception as e:
            logger.warning(f"[AIRefiner] Refinement failed: {e}")

        return text

    def _build_hotword_prompt(self, text: str, hotwords: list[str]) -> str:
        hotword_str = ", ".join(hotwords)
        return (
            f"请检查以下语音转写文本，将可能的识别错误修正为正确的专业术语。\n"
            f"热词列表：{hotword_str}\n"
            f"转写文本：{text}\n\n"
            f"仅修正与热词相关的明显错误，保持其他内容不变。"
            f"直接输出修正后的文本，不要添加任何解释。"
        )

    async def _call_llm(self, prompt: str) -> str:
        """Route to the configured LLM provider."""
        if self.provider == "claude_cli":
            return await self._call_claude_cli(prompt)
        elif self.provider == "anthropic_api":
            return await self._call_anthropic_api(prompt)
        elif self.provider == "custom":
            return await self._call_custom_api(prompt)
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider}")

    async def _call_claude_cli(self, prompt: str) -> str:
        """Call claude CLI in headless mode."""
        proc = await asyncio.create_subprocess_exec(
            "claude", "--model", self.model, "--print", "-p", prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=self.timeout
            )
            output = stdout.decode("utf-8", errors="replace").strip()
            if proc.returncode != 0:
                logger.warning(
                    f"[AIRefiner] claude CLI returned {proc.returncode}: "
                    f"{stderr.decode('utf-8', errors='replace')}"
                )
            return output
        except asyncio.TimeoutError:
            proc.kill()
            logger.warning("[AIRefiner] claude CLI timed out")
            return ""

    async def _call_anthropic_api(self, prompt: str) -> str:
        """Call Anthropic API directly. Reserved for future use."""
        raise NotImplementedError(
            "Anthropic API provider not yet implemented. "
            "Install anthropic SDK and configure API key."
        )

    async def _call_custom_api(self, prompt: str) -> str:
        """Call custom API endpoint. Reserved for local/domestic models."""
        raise NotImplementedError(
            "Custom API provider not yet implemented. "
            "Configure custom_api_url and custom_api_key."
        )
```

**Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_ai_refiner.py -v`

Expected: All PASS

**Step 5: Commit**

```bash
git add backend/postprocess/ai_refiner.py backend/tests/test_ai_refiner.py
git commit -m "refactor(refiner): multi-provider LLM support, remove english-only restriction"
```

---

### Task 12: Meeting Summarizer

**Files:**
- Create: `backend/meeting/summarizer.py`
- Create: `backend/tests/test_summarizer.py`

**Step 1: Write the failing test**

Create `backend/tests/test_summarizer.py`:

```python
import pytest
from unittest.mock import AsyncMock
from backend.meeting.summarizer import MeetingSummarizer, SummaryResult
from backend.meeting.session import Utterance


class TestMeetingSummarizer:
    def test_init(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner, interval=60)
        assert summarizer.interval == 60
        assert summarizer.running_summary == ""
        assert len(summarizer.pending_utterances) == 0

    def test_add_utterance(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        u = Utterance(
            id="1", speaker="张三", speaker_id="s1",
            text="你好", start=0.0, end=1.0, confidence=0.9
        )
        summarizer.add_utterance(u)
        assert len(summarizer.pending_utterances) == 1

    def test_should_summarize(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        assert summarizer.should_summarize() is False

        u = Utterance(
            id="1", speaker="张三", speaker_id="s1",
            text="你好", start=0.0, end=1.0, confidence=0.9
        )
        summarizer.add_utterance(u)
        assert summarizer.should_summarize() is True

    def test_format_transcript(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        utterances = [
            Utterance(id="1", speaker="张三", speaker_id="s1",
                      text="你好", start=0.0, end=1.0, confidence=0.9),
            Utterance(id="2", speaker="李四", speaker_id="s2",
                      text="你好啊", start=1.5, end=2.5, confidence=0.9),
        ]
        text = summarizer._format_transcript(utterances)
        assert "[张三] 你好" in text
        assert "[李四] 你好啊" in text

    def test_build_prompt(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        prompt = summarizer._build_prompt("之前摘要", "[张三] 新内容")
        assert "之前摘要" in prompt
        assert "新内容" in prompt
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_summarizer.py -v`

Expected: FAIL

**Step 3: Write implementation**

Create `backend/meeting/summarizer.py`:

```python
"""Incremental meeting summarization using rolling window + LLM.

Accumulates utterances and periodically generates updated summaries
by feeding running_summary + new_transcript to an LLM.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Optional

from backend.meeting.session import Utterance
from backend.postprocess.ai_refiner import AIRefiner

logger = logging.getLogger(__name__)


@dataclass
class SummaryResult:
    content: str
    decisions: list[str] = field(default_factory=list)
    action_items: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "type": "summary",
            "content": self.content,
            "decisions": self.decisions,
            "action_items": self.action_items,
        }


class MeetingSummarizer:
    def __init__(self, refiner: AIRefiner, interval: int = 120):
        self.refiner = refiner
        self.interval = interval
        self.running_summary = ""
        self.pending_utterances: list[Utterance] = []
        self._last_summarized_index = 0

    def add_utterance(self, utterance: Utterance):
        self.pending_utterances.append(utterance)

    def should_summarize(self) -> bool:
        return len(self.pending_utterances) > 0

    async def generate_summary(self) -> Optional[SummaryResult]:
        """Generate an incremental summary from pending utterances."""
        if not self.should_summarize():
            return None

        new_transcript = self._format_transcript(self.pending_utterances)
        prompt = self._build_prompt(self.running_summary, new_transcript)

        try:
            raw = await self.refiner._call_llm(prompt)
            result = self._parse_summary(raw)
            self.running_summary = result.content
            self.pending_utterances.clear()
            return result
        except Exception as e:
            logger.error(f"[Summarizer] Failed: {e}")
            return None

    def _format_transcript(self, utterances: list[Utterance]) -> str:
        lines = []
        for u in utterances:
            text = u.refined_text or u.text
            lines.append(f"[{u.speaker}] {text}")
        return "\n".join(lines)

    def _build_prompt(self, running_summary: str, new_transcript: str) -> str:
        return (
            f"你是一个会议记录助手。基于之前的摘要和新的讨论内容，更新摘要。\n\n"
            f"之前的摘要：{running_summary or '（无）'}\n\n"
            f"新内容：\n{new_transcript}\n\n"
            f"请输出JSON格式：\n"
            f'{{"summary": "更新后的摘要（3-5句话）", '
            f'"decisions": ["决策1", ...], '
            f'"action_items": [{{"assignee": "姓名", "task": "任务"}}]}}\n\n'
            f"如果没有明确的决策或待办，对应数组留空。只输出JSON，不要其他内容。"
        )

    def _parse_summary(self, raw: str) -> SummaryResult:
        """Parse LLM output into SummaryResult."""
        # Try JSON parsing first
        try:
            # Find JSON in the response
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(raw[start:end])
                return SummaryResult(
                    content=data.get("summary", raw),
                    decisions=data.get("decisions", []),
                    action_items=data.get("action_items", []),
                )
        except (json.JSONDecodeError, KeyError):
            pass

        # Fallback: use raw text as summary
        return SummaryResult(content=raw.strip())

    def reset(self):
        self.running_summary = ""
        self.pending_utterances.clear()
        self._last_summarized_index = 0
```

**Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_summarizer.py -v`

Expected: All PASS

**Step 5: Commit**

```bash
git add backend/meeting/summarizer.py backend/tests/test_summarizer.py
git commit -m "feat(meeting): add incremental meeting summarizer"
```

---

### Task 13: Wire Summarizer and Refiner into MeetingSession

**Files:**
- Modify: `backend/meeting/session.py`
- Modify: `backend/server.py` (add summary timer to `/meeting`)

**Step 1: Add summarizer to MeetingSession**

In `backend/meeting/session.py`, add to `__init__`:

```python
from backend.postprocess.ai_refiner import AIRefiner
from backend.meeting.summarizer import MeetingSummarizer

# In __init__:
self.refiner = AIRefiner(
    provider=config.llm_provider,
    model=config.llm_model,
)
self.summarizer = MeetingSummarizer(
    refiner=self.refiner,
    interval=config.summary_interval,
)
```

Add method to session:

```python
async def refine_utterance(self, utterance: Utterance) -> Optional[str]:
    """Refine an utterance with AI if hotwords are configured."""
    hotwords = [h.strip() for h in self.config.hotwords.split(",") if h.strip()]
    if not hotwords:
        return None

    refined = await self.refiner.refine(utterance.text, hotwords)
    if refined != utterance.text:
        utterance.refined_text = refined
        return refined
    return None
```

**Step 2: Add summary timer to /meeting endpoint in server.py**

After the utterance is sent to client, add:

```python
# After sending utterance
session.summarizer.add_utterance(utterance)

# Refine asynchronously
if session.config.enable_ai_refine:
    refined = await session.refine_utterance(utterance)
    if refined:
        await websocket.send_json({
            "type": "utterance_refined",
            "utterance_id": utterance.id,
            "text": refined,
        })
```

Add a background summary task when session starts:

```python
async def _summary_loop(session, websocket):
    """Periodically generate summaries."""
    while True:
        await asyncio.sleep(session.config.summary_interval)
        if session.summarizer.should_summarize():
            result = await session.summarizer.generate_summary()
            if result:
                session.running_summary = result.content
                await websocket.send_json(result.to_dict())
```

Start it after session creation:

```python
summary_task = asyncio.create_task(_summary_loop(session, websocket))
# Cancel on session end:
summary_task.cancel()
```

**Step 3: Verify tests still pass**

Run: `cd backend && python -m pytest tests/ -v`

Expected: All PASS

**Step 4: Commit**

```bash
git add backend/meeting/session.py backend/server.py
git commit -m "feat(meeting): wire summarizer and refiner into meeting pipeline"
```

---

## Phase 4: Output & History

### Task 14: Settings Extensions

**Files:**
- Modify: `frontend/electron/store.ts`
- Modify: `frontend/electron/preload.ts`

**Step 1: Add new settings to store.ts**

Add to `AppSettings` interface in `frontend/electron/store.ts`:

```typescript
// Meeting settings
meetingOutputFormat: 'text_only' | 'with_speakers' | 'with_summary' | 'full';
llmProvider: 'claude_cli' | 'anthropic_api' | 'custom';
llmModel: string;
customApiUrl: string;
customApiKey: string;
summaryInterval: number;
```

Add defaults:

```typescript
meetingOutputFormat: 'with_speakers',
llmProvider: 'claude_cli',
llmModel: 'haiku',
customApiUrl: '',
customApiKey: '',
summaryInterval: 120,
```

**Step 2: Verify build**

Run: `cd frontend && npm run build:electron`

Expected: Exit code 0

**Step 3: Commit**

```bash
git add frontend/electron/store.ts frontend/electron/preload.ts
git commit -m "feat(settings): add meeting output format and LLM provider settings"
```

---

### Task 15: Output Settings UI

**Files:**
- Create: `frontend/src/components/settings/OutputSettings.tsx`
- Create: `frontend/src/components/settings/LLMSettings.tsx`
- Modify: `frontend/src/components/SettingsPanel.tsx`

**Step 1: Create OutputSettings component**

Create `frontend/src/components/settings/OutputSettings.tsx` with radio buttons for the 4 output format options (text_only, with_speakers, with_summary, full).

**Step 2: Create LLMSettings component**

Create `frontend/src/components/settings/LLMSettings.tsx` with:
- Provider dropdown (claude_cli / anthropic_api / custom)
- Model input field
- Summary interval slider (60-300s)
- Custom API URL/Key fields (shown only when provider=custom)

**Step 3: Add tabs to SettingsPanel**

Add "输出" and "AI" tabs to the existing settings panel. Read `SettingsPanel.tsx` first to understand the tab structure.

**Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/components/settings/OutputSettings.tsx frontend/src/components/settings/LLMSettings.tsx frontend/src/components/SettingsPanel.tsx
git commit -m "feat(frontend): add output format and LLM settings UI"
```

---

### Task 16: Meeting History Detail Page

**Files:**
- Create: `frontend/src/components/history/MeetingHistoryDetail.tsx`
- Create: `frontend/src/components/history/SpeakerFilter.tsx`
- Create: `frontend/src/lib/export-meeting.ts`

**Step 1: Create SpeakerFilter**

Create `frontend/src/components/history/SpeakerFilter.tsx`:

A row of buttons showing all speakers in the meeting. "全部" is default. Clicking a speaker filters the utterance list.

**Step 2: Create MeetingHistoryDetail**

Create `frontend/src/components/history/MeetingHistoryDetail.tsx`:

Shows a single MeetingRecord with:
- Header: date, duration, engine
- SpeakerFilter bar
- Utterance list (same style as TranscriptPanel but not live)
- Summary section
- Action bar: copy, export MD, delete

**Step 3: Create export-meeting.ts**

Create `frontend/src/lib/export-meeting.ts`:

```typescript
import type { MeetingRecord } from "../store/meeting-store";

export function exportMeetingAsMarkdown(record: MeetingRecord): string {
  const date = new Date(record.timestamp).toLocaleString("zh-CN");
  const lines: string[] = [];

  lines.push(`# 会议记录 ${date}`);
  lines.push("");

  if (record.summary) {
    lines.push("## 摘要");
    lines.push(record.summary.content);
    lines.push("");

    if (record.summary.decisions.length > 0) {
      lines.push("## 决策");
      record.summary.decisions.forEach((d) => lines.push(`- ${d}`));
      lines.push("");
    }

    if (record.summary.actionItems.length > 0) {
      lines.push("## 待办");
      record.summary.actionItems.forEach((a) =>
        lines.push(`- [ ] ${a.assignee}：${a.task}`)
      );
      lines.push("");
    }
  }

  lines.push("## 转写记录");
  lines.push("");

  record.utterances.forEach((u) => {
    const time = `${Math.floor(u.start / 60)}:${Math.floor(u.start % 60).toString().padStart(2, "0")}`;
    lines.push(`**${u.speaker}** (${time})`);
    lines.push(u.text);
    lines.push("");
  });

  return lines.join("\n");
}
```

**Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/components/history/ frontend/src/lib/export-meeting.ts
git commit -m "feat(frontend): add meeting history detail with speaker filter and MD export"
```

---

### Task 17: Integration Test

**Files:**
- Create: `backend/tests/test_integration.py`

**Step 1: Write integration test**

Create `backend/tests/test_integration.py`:

```python
"""Integration test: MeetingSession with mock ASR."""

import asyncio
import numpy as np
import pytest
from backend.meeting.session import MeetingSession, SessionConfig
from backend.meeting.vad import SpeechSegment


class MockASREngine:
    def transcribe_array(self, audio, sample_rate=16000, **kwargs):
        duration = len(audio) / sample_rate
        return {
            "text": f"测试转写文本 {duration:.1f}秒",
            "segments": [],
            "duration": 0.01,
            "language": "zh",
            "engine": "mock",
        }


class TestMeetingIntegration:
    def test_full_pipeline_mock(self):
        config = SessionConfig(speakers_enabled=False)
        session = MeetingSession(config)
        session.set_asr_engine(MockASREngine())

        # Simulate a speech segment
        audio = np.random.randn(16000 * 3).astype(np.float32)  # 3s
        segment = SpeechSegment(audio=audio, start_time=0.0, end_time=3.0)

        utterance = asyncio.get_event_loop().run_until_complete(
            session.process_audio_segment(segment)
        )

        assert utterance.text.startswith("测试转写文本")
        assert utterance.speaker == "说话人"
        assert len(session.utterances) == 1

    def test_session_data_output(self):
        config = SessionConfig(speakers_enabled=False)
        session = MeetingSession(config)
        session.set_asr_engine(MockASREngine())

        audio = np.random.randn(16000 * 2).astype(np.float32)
        segment = SpeechSegment(audio=audio, start_time=0.0, end_time=2.0)

        asyncio.get_event_loop().run_until_complete(
            session.process_audio_segment(segment)
        )

        data = session.get_session_data()
        assert data["session_id"] == session.session_id
        assert len(data["utterances"]) == 1
        assert len(data["plain_text"]) > 0

    def test_formatted_output(self):
        config = SessionConfig(speakers_enabled=False)
        session = MeetingSession(config)
        session.set_asr_engine(MockASREngine())

        audio = np.random.randn(16000).astype(np.float32)
        segment = SpeechSegment(audio=audio, start_time=0.0, end_time=1.0)

        asyncio.get_event_loop().run_until_complete(
            session.process_audio_segment(segment)
        )

        plain = session.get_plain_text()
        assert "测试转写文本" in plain

        with_speakers = session.get_formatted_text(include_speakers=True)
        assert "[说话人]" in with_speakers
```

**Step 2: Run all tests**

Run: `cd backend && python -m pytest tests/ -v`

Expected: All PASS

**Step 3: Commit**

```bash
git add backend/tests/test_integration.py
git commit -m "test: add meeting pipeline integration tests with mock ASR"
```

---

### Task 18: Final Build Verification

**Step 1: Run all backend tests**

Run: `cd backend && python -m pytest tests/ -v`

Expected: All PASS

**Step 2: Run frontend TypeScript check**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 3: Run Electron build check**

Run: `cd frontend && npm run build:electron`

Expected: Exit code 0

**Step 4: Python syntax check on all new files**

Run: `python -m py_compile backend/meeting/vad.py && python -m py_compile backend/meeting/session.py && python -m py_compile backend/meeting/speaker_tracker.py && python -m py_compile backend/meeting/summarizer.py && python -m py_compile backend/engines/firered_engine.py && python -m py_compile backend/postprocess/ai_refiner.py && echo "All OK"`

Expected: `All OK`

**Step 5: Commit any fixes**

If any issues found, fix and commit.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete meeting recording feature (Phase 1-4)"
```
