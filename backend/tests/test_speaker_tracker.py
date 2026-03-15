import numpy as np

from meeting.speaker_tracker import (
    DiartSpeakerTracker,
    SpeakerInfo,
    build_speaker_backend_plan,
)


class TestSpeakerInfo:
    def test_display_name_uses_cluster_label_by_default(self):
        info = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            registered_name=None,
            confidence=0.0,
        )
        assert info.display_name == "Speaker 1"

    def test_display_name_prefers_registered_name(self):
        info = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            registered_name="Alice",
            confidence=0.92,
        )
        assert info.display_name == "Alice"


class TestDiartSpeakerTracker:
    def test_build_speaker_backend_plan(self):
        plan = build_speaker_backend_plan(
            enable_streaming=True,
            enable_diarization=False,
            sv_model_name="eres2netv2",
        )
        assert plan["preload_cluster"] is True
        assert plan["preload_mapping"] is False
        assert plan["speaker_model"] == "eres2netv2"

    def test_init(self):
        tracker = DiartSpeakerTracker(max_speakers=5)
        assert tracker.max_speakers == 5
        assert tracker.active_speaker is None

    def test_register_known_speakers(self):
        tracker = DiartSpeakerTracker()
        embedding = np.random.randn(192).astype(np.float32)
        tracker.register_known_speaker("Alice", "spk_001", embedding)
        assert "spk_001" in tracker.known_speakers

    def test_reset_keeps_known_speakers(self):
        tracker = DiartSpeakerTracker()
        embedding = np.random.randn(192).astype(np.float32)
        tracker.register_known_speaker("Alice", "spk_001", embedding)
        tracker.reset()
        assert tracker.active_speaker is None
        assert tracker.speakers == {}
        assert "spk_001" in tracker.known_speakers

    def test_process_segment_uses_pyannote_cluster_then_cam_mapping(self):
        tracker = DiartSpeakerTracker()
        cluster_embedding = np.ones(192, dtype=np.float32)
        mapping_embedding = np.ones(192, dtype=np.float32)
        tracker.register_known_speaker("Alice", "spk_001", mapping_embedding)

        tracker._extract_cluster_embedding = lambda audio: cluster_embedding
        tracker._extract_mapping_embedding = lambda audio: mapping_embedding

        first = tracker.process_segment(np.zeros(16000, dtype=np.float32), 0.0, 1.0)
        assert first.cluster_id == 0
        assert first.registered_id == "spk_001"
        assert first.registered_name == "Alice"

    def test_process_segment_inherits_registered_identity_from_cluster(self):
        tracker = DiartSpeakerTracker()
        cluster_embedding = np.ones(192, dtype=np.float32)
        mapping_embedding = np.ones(192, dtype=np.float32)
        tracker.register_known_speaker("Alice", "spk_001", mapping_embedding)

        tracker._extract_cluster_embedding = lambda audio: cluster_embedding
        tracker._extract_mapping_embedding = lambda audio: mapping_embedding

        first = tracker.process_segment(np.zeros(16000, dtype=np.float32), 0.0, 1.0)
        assert first.registered_id == "spk_001"

        tracker._extract_mapping_embedding = lambda audio: None
        second = tracker.process_segment(np.zeros(16000, dtype=np.float32), 1.0, 2.0)
        assert second.cluster_id == first.cluster_id
        assert second.registered_id == "spk_001"
        assert second.registered_name == "Alice"
