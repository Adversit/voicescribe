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
        assert first.get_speaker_labels()[0]["speaker"] == "Alice"

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

    def test_process_segment_collapses_weak_multi_speaker_signal_to_single_speaker(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        cluster_embedding = np.ones(3, dtype=np.float32)
        mapping_embedding = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        tracker.register_known_speaker("Alice", "spk_001", np.array([1.0, 0.0, 0.0], dtype=np.float32))
        tracker.register_known_speaker("Bob", "spk_002", np.array([0.94, 0.0, 0.0], dtype=np.float32))

        tracker._extract_cluster_embedding = lambda audio: cluster_embedding
        tracker._extract_mapping_embedding = lambda audio: mapping_embedding

        info = tracker.process_segment(np.zeros(16000, dtype=np.float32), 0.0, 1.0)
        labels = info.get_speaker_labels()

        assert labels[0]["speaker"] == "Alice"
        assert len(labels) == 1
        assert info.overlap_detected is False
        assert info.overlap_score == 0.0
        spans = info.get_speaker_spans(0.0, 1.0)
        assert len(spans) == 1
        assert spans[0]["speaker"] == "Alice"

    def test_process_segment_generates_speaker_spans_for_subsegments(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.register_known_speaker("Alice", "spk_001", np.array([1.0, 0.0], dtype=np.float32))
        tracker.register_known_speaker("Bob", "spk_002", np.array([0.0, 1.0], dtype=np.float32))

        tracker._extract_cluster_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)

        def mapping_embedding(audio):
            mean_value = float(np.mean(audio))
            if mean_value >= 1.5:
                return np.array([0.0, 1.0], dtype=np.float32)
            return np.array([1.0, 0.0], dtype=np.float32)

        tracker._extract_mapping_embedding = mapping_embedding

        audio = np.concatenate(
            [
                np.ones(int(16000 * 1.6), dtype=np.float32),
                np.full(int(16000 * 1.6), 2.0, dtype=np.float32),
            ]
        )

        info = tracker.process_segment(audio, 0.0, 3.2, transcript_text="Alice first then Bob")
        spans = info.get_speaker_spans(0.0, 3.2)
        labels = info.get_speaker_labels()

        assert len(spans) >= 2
        assert spans[0]["speaker"] == "Alice"
        assert spans[-1]["speaker"] == "Bob"
        assert {item["speaker"] for item in labels} == {"Alice", "Bob"}

    def test_process_segment_prefers_existing_registered_cluster(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        registered_embedding = np.array([1.0, 0.0], dtype=np.float32)
        tracker.register_known_speaker("Ding", "spk_001", registered_embedding)

        tracker.speakers[0] = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            registered_name="Ding",
            registered_id="spk_001",
            confidence=0.82,
            embedding=registered_embedding,
        )
        tracker.active_speaker = tracker.speakers[0]

        tracker._extract_cluster_embedding = lambda audio: np.array([0.98, 0.02], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)

        info = tracker.process_segment(np.zeros(16000, dtype=np.float32), 1.0, 2.0)

        assert info.cluster_id == 0
        assert info.registered_id == "spk_001"
        assert info.registered_name == "Ding"

    def test_process_segment_keeps_active_registered_speaker_below_threshold(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        ding_embedding = np.array([1.0, 0.0], dtype=np.float32)
        tester_embedding = np.array([0.0, 1.0], dtype=np.float32)
        tracker.register_known_speaker("Ding", "spk_001", ding_embedding)
        tracker.register_known_speaker("Tester", "spk_002", tester_embedding)

        tracker.speakers[0] = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            registered_name="Ding",
            registered_id="spk_001",
            confidence=0.82,
            embedding=ding_embedding,
        )
        tracker.active_speaker = tracker.speakers[0]

        tracker._extract_cluster_embedding = lambda audio: np.array([0.96, 0.04], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)
        tracker.identify_speaker_candidates = lambda embedding, top_k=3: [
            {"speaker_id": "spk_002", "speaker": "Tester", "confidence": 0.57},
            {"speaker_id": "spk_001", "speaker": "Ding", "confidence": 0.55},
        ][:top_k]

        info = tracker.process_segment(np.zeros(16000, dtype=np.float32), 2.0, 3.0)

        assert info.registered_id == "spk_001"
        assert info.registered_name == "Ding"
        assert info.get_speaker_labels()[0]["speaker"] == "Ding"

    def test_process_segment_switches_to_decisive_registered_speaker_before_anonymous(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.register_known_speaker("Ding", "spk_001", np.array([1.0, 0.0], dtype=np.float32))
        tracker.register_known_speaker("Tester", "spk_002", np.array([0.0, 1.0], dtype=np.float32))

        tracker.speakers[0] = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            registered_name="Ding",
            registered_id="spk_001",
            confidence=0.82,
            embedding=np.array([1.0, 0.0], dtype=np.float32),
        )
        tracker.active_speaker = tracker.speakers[0]

        tracker._extract_cluster_embedding = lambda audio: np.array([0.0, 1.0], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: np.array([0.0, 1.0], dtype=np.float32)
        tracker.identify_speaker_candidates = lambda embedding, top_k=3: [
            {"speaker_id": "spk_002", "speaker": "Tester", "confidence": 0.56},
            {"speaker_id": "spk_001", "speaker": "Ding", "confidence": 0.49},
        ][:top_k]

        info = tracker.process_segment(np.zeros(16000, dtype=np.float32), 3.0, 4.0)

        assert info.registered_id == "spk_002"
        assert info.registered_name == "Tester"
        assert info.get_speaker_labels()[0]["speaker"] == "Tester"

    def test_subsegment_prefers_stable_registered_speaker_when_scores_are_close(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.register_known_speaker("Ding", "spk_001", np.array([1.0, 0.0], dtype=np.float32))
        tracker.register_known_speaker("Tester", "spk_002", np.array([0.97, 0.0], dtype=np.float32))

        default_info = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            registered_name="Ding",
            registered_id="spk_001",
            confidence=0.83,
            embedding=np.array([1.0, 0.0], dtype=np.float32),
        )

        ranked = [
            {"speaker_id": "spk_002", "speaker": "Tester", "confidence": 0.86},
            {"speaker_id": "spk_001", "speaker": "Ding", "confidence": 0.83},
        ]

        preferred_name, preferred_id, preferred_confidence = tracker._prefer_stable_registered_candidate(
            default_info,
            ranked,
        )

        assert preferred_id == "spk_001"
        assert preferred_name == "Ding"
        assert preferred_confidence == 0.83

    def test_process_segment_prefers_continuity_cluster_for_same_speaker(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.speakers[0] = SpeakerInfo(
            cluster_id=0,
            label="Speaker_0",
            confidence=0.7,
            embedding=np.array([1.0, 0.0], dtype=np.float32),
        )
        tracker.active_speaker = tracker.speakers[0]

        tracker._extract_cluster_embedding = lambda audio: np.array([0.9, 0.1], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: None

        info = tracker.process_segment(np.zeros(16000, dtype=np.float32), 0.0, 1.0)

        assert info.cluster_id == 0

    def test_subsegment_prefers_previous_speaker_when_scores_are_close(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        ranked = [
            {"speaker_id": "spk_002", "speaker": "Tester", "confidence": 0.82},
            {"speaker_id": "spk_001", "speaker": "Ding", "confidence": 0.78},
        ]

        preferred_name, preferred_id, preferred_confidence = tracker._prefer_stable_span_candidate(
            ("Ding", "spk_001", 0.8),
            ranked,
        )

        assert preferred_id == "spk_001"
        assert preferred_name == "Ding"
        assert preferred_confidence == 0.8

    def test_subsegment_switches_to_decisive_registered_speaker(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        switched_name, switched_id, switched_confidence = tracker._prefer_registered_switch_candidate(
            [
                {"speaker_id": "spk_002", "speaker": "Tester", "confidence": 0.56},
                {"speaker_id": "spk_001", "speaker": "Ding", "confidence": 0.48},
            ],
            current_speaker="Ding",
            current_speaker_id="spk_001",
            context="subsegment",
        )

        assert switched_id == "spk_002"
        assert switched_name == "Tester"
        assert switched_confidence == 0.56

    def test_registered_switch_uses_current_speaker_candidate_as_competitor(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        switched_name, switched_id, switched_confidence = tracker._prefer_registered_switch_candidate(
            [
                {"speaker_id": "spk_003", "speaker": "Other", "confidence": 0.58},
                {"speaker_id": "spk_002", "speaker": "Tester", "confidence": 0.56},
                {"speaker_id": "spk_001", "speaker": "Ding", "confidence": 0.55},
            ],
            current_speaker="Ding",
            current_speaker_id="spk_001",
            context="subsegment",
        )

        assert switched_id == ""
        assert switched_name == ""
        assert switched_confidence == 0.0
