import numpy as np
import pytest
from meeting.vad import SileroVADSegmenter, VADConfig, SpeechSegment


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
