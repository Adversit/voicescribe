import numpy as np
import pytest
from meeting.speaker_tracker import DiartSpeakerTracker, SpeakerInfo


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
