import numpy as np
import pytest
from meeting.vad import SileroVADSegmenter, VADConfig, SpeechSegment


class TestVADConfig:
    def test_default_config(self):
        cfg = VADConfig()
        assert cfg.threshold == 0.5
        assert cfg.hangover_ms == 700
        assert cfg.min_speech_ms == 300
        assert cfg.pre_roll_ms == 200
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

    def test_flush_returns_segment_when_speaking(self):
        cfg = VADConfig(sample_rate=16000, min_speech_ms=100)
        seg = SileroVADSegmenter(cfg)
        seg.is_speaking = True
        seg._speech_start_time = 0.0
        seg._speech_buffer = [np.ones(1600, dtype=np.float32)]  # 100ms
        seg._total_samples = 1600

        out = seg.flush()
        assert out is not None
        assert isinstance(out, SpeechSegment)
        assert out.end_time > out.start_time
        assert len(out.audio) == 1600
        assert seg.is_speaking is False

    def test_flush_discards_short_segment(self):
        cfg = VADConfig(sample_rate=16000, min_speech_ms=300)
        seg = SileroVADSegmenter(cfg)
        seg.is_speaking = True
        seg._speech_start_time = 0.0
        seg._speech_buffer = [np.ones(800, dtype=np.float32)]  # 50ms
        seg._total_samples = 800

        out = seg.flush()
        assert out is None
        assert seg.is_speaking is False
