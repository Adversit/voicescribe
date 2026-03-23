"""Grouped backend tests."""

##############################################################################
# Source: backend/tests/test_speaker_diarizer.py
##############################################################################

import json
import shutil
import sys
import types
from pathlib import Path

from diarization.speaker import SpeakerDiarizer


class TestSpeakerDiarizer:
    def test_primary_fallback_model_loads(self, monkeypatch):
        diarizer = SpeakerDiarizer(data_dir=".pytest-speakers")
        calls = {"sv": [], "diarization": []}

        class StubAutoModel:
            def __init__(self, **kwargs):
                calls["sv"].append(kwargs)

        def stub_pipeline(*, task, model):
            calls["diarization"].append({"task": task, "model": model})
            return object()

        monkeypatch.setitem(
            sys.modules,
            "funasr",
            types.SimpleNamespace(AutoModel=StubAutoModel),
        )
        monkeypatch.setitem(
            sys.modules,
            "modelscope.pipelines",
            types.SimpleNamespace(pipeline=stub_pipeline),
        )
        monkeypatch.setitem(
            sys.modules,
            "modelscope.utils.constant",
            types.SimpleNamespace(Tasks=types.SimpleNamespace(speaker_diarization="speaker-diarization")),
        )

        diarizer.load(load_diarization=True)

        assert diarizer.diarization_model is not None
        assert diarizer.diarization_model_backend == "modelscope_pipeline"
        assert diarizer.diarization_model_id == "iic/speech_campplus_speaker-diarization_common"
        assert calls["sv"]
        assert calls["diarization"]
        assert calls["diarization"][0]["model"].endswith("speech_campplus_speaker-diarization_common")

    def test_load_speakers_fallbacks_to_gbk_and_rewrites_utf8(self):
        speakers_dir = Path(".pytest-speakers-encoding")
        if speakers_dir.exists():
            shutil.rmtree(speakers_dir)
        speakers_dir.mkdir()
        speakers_file = speakers_dir / "speakers.json"

        payload = {"speakers": [{"id": "speaker_000", "name": "丁康"}]}
        try:
            speakers_file.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="gbk",
            )

            diarizer = SpeakerDiarizer(data_dir=str(speakers_dir))

            assert "speaker_000" in diarizer.speakers
            assert diarizer.speakers["speaker_000"]["name"] == "丁康"
            assert speakers_file.read_text(encoding="utf-8")
        finally:
            if speakers_dir.exists():
                shutil.rmtree(speakers_dir)

    def test_collect_segment_overlaps_uses_overlap_duration(self):
        diarizer = SpeakerDiarizer(data_dir=".pytest-speakers")
        segment = {"start": 0.0, "end": 4.0, "text": "abcdefghij"}
        diarization = [
            {"start": 0.0, "end": 1.0, "speaker": "SPEAKER_00"},
            {"start": 1.0, "end": 4.0, "speaker": "SPEAKER_01"},
        ]

        overlaps = diarizer._collect_segment_overlaps(segment, diarization)

        assert len(overlaps) == 2
        assert overlaps[0]["speaker"] == "SPEAKER_00"
        assert overlaps[0]["duration"] == 1.0
        assert overlaps[1]["speaker"] == "SPEAKER_01"
        assert overlaps[1]["duration"] == 3.0

    def test_assign_speakers_splits_segment_when_multiple_speakers_overlap(self):
        diarizer = SpeakerDiarizer(data_dir=".pytest-speakers")
        transcription = {
            "text": "abcdefghij",
            "segments": [{"start": 0.0, "end": 4.0, "text": "abcdefghij"}],
        }
        diarization = [
            {"start": 0.0, "end": 1.0, "speaker": "说话人1"},
            {"start": 1.0, "end": 4.0, "speaker": "丁康"},
        ]

        result = diarizer.assign_speakers(transcription, diarization)

        assert len(result["segments"]) == 2
        assert result["segments"][0]["speaker"] == "说话人1"
        assert result["segments"][1]["speaker"] == "丁康"
        assert result["segments"][0]["text"]
        assert result["segments"][1]["text"]
        assert "[说话人1]" in result["text"]
        assert "[丁康]" in result["text"]


##############################################################################
# Source: backend/tests/test_speaker_model_cache.py
##############################################################################

import shutil
import tempfile
import uuid
from pathlib import Path

from diarization.speaker_models import resolve_hf_repo_for_load


def _make_temp_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / ".tmp"
    base_dir.mkdir(parents=True, exist_ok=True)
    path = base_dir / uuid.uuid4().hex
    path.mkdir(parents=True, exist_ok=False)
    return path


def test_resolve_hf_repo_for_load_does_not_use_user_cache():
    temp_dir = _make_temp_dir()
    try:
        project_hf_home = temp_dir / "project_hf"
        user_hf_home = temp_dir / "user_hf" / "hub" / "models--pyannote--embedding" / "snapshots" / "abc123"
        user_hf_home.mkdir(parents=True)
        (user_hf_home / "pytorch_model.bin").write_bytes(b"weights")

        resolved = resolve_hf_repo_for_load(
            "pyannote/embedding",
            project_hf_home=str(project_hf_home),
        )

        assert resolved == "pyannote/embedding"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_resolve_hf_repo_for_load_prefers_project_snapshot():
    temp_dir = _make_temp_dir()
    try:
        project_hf_home = temp_dir / "project_hf"
        snapshot = project_hf_home / "hub" / "models--pyannote--embedding" / "snapshots" / "abc123"
        snapshot.mkdir(parents=True)
        (snapshot / "pytorch_model.bin").write_bytes(b"weights")

        resolved = resolve_hf_repo_for_load(
            "pyannote/embedding",
            project_hf_home=str(project_hf_home),
        )

        assert resolved == str(snapshot)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


##############################################################################
# Source: backend/tests/test_speaker_tracker.py
##############################################################################

import logging

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

    def test_configure_updates_split_mapping_thresholds(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.configure(
            match_threshold=0.66,
            active_registered_floor_min=0.48,
            active_registered_floor_offset=0.09,
            active_registered_keep_margin=0.03,
            stable_registered_floor_offset=0.07,
            stable_registered_keep_margin=0.05,
            registered_switch_floor_min=0.51,
            registered_switch_floor_offset=0.04,
            registered_switch_margin=0.06,
            span_continuity_floor_min=0.36,
            span_continuity_floor_offset=0.11,
            span_continuity_keep_margin=0.07,
            span_top_fallback_offset=0.04,
        )
        assert tracker.match_threshold == 0.66
        assert tracker.active_registered_floor_min == 0.48
        assert tracker.active_registered_floor_offset == 0.09
        assert tracker.active_registered_keep_margin == 0.03
        assert tracker.stable_registered_floor_offset == 0.07
        assert tracker.stable_registered_keep_margin == 0.05
        assert tracker.registered_switch_floor_min == 0.51
        assert tracker.registered_switch_floor_offset == 0.04
        assert tracker.registered_switch_margin == 0.06
        assert tracker.span_continuity_floor_min == 0.36
        assert tracker.span_continuity_floor_offset == 0.11
        assert tracker.span_continuity_keep_margin == 0.07
        assert tracker.span_top_fallback_offset == 0.04

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

    def test_process_segment_attaches_registered_mapping_after_enough_speech(self):
        tracker = DiartSpeakerTracker()
        cluster_embedding = np.ones(192, dtype=np.float32)
        mapping_embedding = np.ones(192, dtype=np.float32)
        tracker.register_known_speaker("Alice", "spk_001", mapping_embedding)

        tracker._extract_cluster_embedding = lambda audio: cluster_embedding
        tracker._extract_mapping_embedding = lambda audio: mapping_embedding

        first = tracker.process_segment(np.zeros(16000, dtype=np.float32), 0.0, 1.0)
        second = tracker.process_segment(np.zeros(16000, dtype=np.float32), 1.0, 2.0)
        third = tracker.process_segment(np.zeros(16000, dtype=np.float32), 2.0, 3.0)

        assert first.cluster_id == 0
        assert first.registered_id is None
        assert second.registered_id is None
        assert third.registered_id == "spk_001"
        assert third.registered_name == "Alice"
        assert third.get_speaker_labels()[0]["speaker"] == "Alice"

    def test_process_segment_inherits_registered_identity_from_cluster_after_stable_mapping(self):
        tracker = DiartSpeakerTracker()
        cluster_embedding = np.ones(192, dtype=np.float32)
        mapping_embedding = np.ones(192, dtype=np.float32)
        tracker.register_known_speaker("Alice", "spk_001", mapping_embedding)

        tracker._extract_cluster_embedding = lambda audio: cluster_embedding
        tracker._extract_mapping_embedding = lambda audio: mapping_embedding

        first = tracker.process_segment(np.zeros(int(16000 * 3.0), dtype=np.float32), 0.0, 3.0)
        assert first.registered_id == "spk_001"

        tracker._extract_mapping_embedding = lambda audio: None
        second = tracker.process_segment(np.zeros(16000, dtype=np.float32), 3.0, 4.0)
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

        info = tracker.process_segment(np.zeros(int(16000 * 3.0), dtype=np.float32), 0.0, 3.0)
        labels = info.get_speaker_labels()

        assert labels[0]["speaker"] == "Alice"
        assert len(labels) == 1
        assert info.overlap_detected is False
        assert info.overlap_score == 0.0
        spans = info.get_speaker_spans(0.0, 3.0)
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

    def test_process_segment_uses_pyannote_change_spans_when_available(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.register_known_speaker("Alice", "spk_001", np.array([1.0, 0.0], dtype=np.float32))
        tracker.register_known_speaker("Bob", "spk_002", np.array([0.0, 1.0], dtype=np.float32))

        tracker._cluster_init_attempted = True
        tracker._cluster_backend = "pyannote"
        tracker._cluster_inference = object()
        tracker._extract_cluster_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)

        def mapping_embedding(audio):
            mean_value = float(np.mean(audio))
            if mean_value >= 1.5:
                return np.array([0.0, 1.0], dtype=np.float32)
            return np.array([1.0, 0.0], dtype=np.float32)

        tracker._extract_mapping_embedding = mapping_embedding
        tracker._extract_pyannote = lambda audio, inference: mapping_embedding(audio)

        audio = np.concatenate(
            [
                np.ones(int(16000 * 1.6), dtype=np.float32),
                np.full(int(16000 * 1.6), 2.0, dtype=np.float32),
            ]
        )

        info = tracker.process_segment(audio, 0.0, 3.2, transcript_text="Alice then Bob")
        spans = info.get_speaker_spans(0.0, 3.2)

        assert len(spans) >= 2
        assert spans[0]["speaker"] == "Alice"
        assert spans[-1]["speaker"] == "Bob"

    def test_process_segment_keeps_pyannote_split_when_mapping_is_unresolved(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker._cluster_init_attempted = True
        tracker._cluster_backend = "pyannote"
        tracker._cluster_inference = object()
        tracker._extract_cluster_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: None

        def pyannote_embedding(audio, inference):
            mean_value = float(np.mean(audio))
            if mean_value >= 1.5:
                return np.array([0.0, 1.0], dtype=np.float32)
            return np.array([1.0, 0.0], dtype=np.float32)

        tracker._extract_pyannote = pyannote_embedding

        audio = np.concatenate(
            [
                np.ones(int(16000 * 1.6), dtype=np.float32),
                np.full(int(16000 * 1.6), 2.0, dtype=np.float32),
            ]
        )

        info = tracker.process_segment(audio, 0.0, 3.2, transcript_text="anonymous switch")
        spans = info.get_speaker_spans(0.0, 3.2)

        assert len(spans) >= 2
        assert len({span["speaker_id"] for span in spans}) <= 2
        assert spans[0]["speaker_id"] != spans[-1]["speaker_id"]
        assert all(span.get("segmentation_source") == "pyannote" for span in spans)

    def test_process_segment_caps_unresolved_pyannote_anonymous_speakers(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker._cluster_init_attempted = True
        tracker._cluster_backend = "pyannote"
        tracker._cluster_inference = object()
        tracker._extract_cluster_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: None

        embeddings = [
            np.array([1.0, 0.0], dtype=np.float32),
            np.array([0.0, 1.0], dtype=np.float32),
            np.array([-1.0, 0.0], dtype=np.float32),
        ]

        def pyannote_embedding(audio, inference):
            mean_value = float(np.mean(audio))
            if mean_value < 1.5:
                return embeddings[0]
            if mean_value < 2.5:
                return embeddings[1]
            return embeddings[2]

        tracker._extract_pyannote = pyannote_embedding

        audio = np.concatenate(
            [
                np.ones(int(16000 * 1.6), dtype=np.float32),
                np.full(int(16000 * 1.6), 2.0, dtype=np.float32),
                np.full(int(16000 * 1.6), 3.0, dtype=np.float32),
            ]
        )

        info = tracker.process_segment(audio, 0.0, 4.8, transcript_text="many anonymous turns")
        spans = info.get_speaker_spans(0.0, 4.8)

        assert len({span["speaker_id"] for span in spans}) <= 2

    def test_process_segment_skips_cam_fallback_when_pyannote_finds_no_change(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.register_known_speaker("Alice", "spk_001", np.array([1.0, 0.0], dtype=np.float32))
        tracker.register_known_speaker("Bob", "spk_002", np.array([0.0, 1.0], dtype=np.float32))

        tracker._cluster_init_attempted = True
        tracker._cluster_backend = "pyannote"
        tracker._cluster_inference = object()
        tracker._extract_cluster_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: np.array(
            [0.0, 1.0] if float(np.mean(audio)) >= 1.5 else [1.0, 0.0],
            dtype=np.float32,
        )
        tracker._extract_pyannote = lambda audio, inference: np.array([1.0, 0.0], dtype=np.float32)

        audio = np.concatenate(
            [
                np.ones(int(16000 * 1.6), dtype=np.float32),
                np.full(int(16000 * 1.6), 2.0, dtype=np.float32),
            ]
        )

        info = tracker.process_segment(audio, 0.0, 3.2, transcript_text="fallback should not split")
        spans = info.get_speaker_spans(0.0, 3.2)

        assert len(spans) == 1
        assert spans[0]["speaker_id"] in {"spk_001", "spk_002"}
        assert spans[0].get("segmentation_source") != "pyannote"

    def test_process_segment_suppresses_overlap_heuristics_on_pyannote_main_path(self):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.register_known_speaker("Alice", "spk_001", np.array([1.0, 0.0], dtype=np.float32))
        bob_embedding = np.array([0.95, 0.05], dtype=np.float32)
        bob_embedding = bob_embedding / np.linalg.norm(bob_embedding)
        tracker.register_known_speaker("Bob", "spk_002", bob_embedding)

        tracker._cluster_init_attempted = True
        tracker._cluster_backend = "pyannote"
        tracker._cluster_inference = object()
        tracker._extract_cluster_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)
        tracker._extract_pyannote = lambda audio, inference: np.array([1.0, 0.0], dtype=np.float32)

        audio = np.ones(int(16000 * 3.2), dtype=np.float32)

        info = tracker.process_segment(audio, 0.0, 3.2, transcript_text="single speaker")
        labels = info.get_speaker_labels()
        spans = info.get_speaker_spans(0.0, 3.2)

        assert info.overlap_detected is False
        assert info.overlap_score == 0.0
        assert len(labels) == 1
        assert labels[0]["speaker"] == "Alice"
        assert len(spans) == 1
        assert spans[0]["speaker"] == "Alice"

    def test_process_segment_logs_why_pyannote_keeps_single_segment(self, caplog):
        tracker = DiartSpeakerTracker(match_threshold=0.6)
        tracker.register_known_speaker("Alice", "spk_001", np.array([1.0, 0.0], dtype=np.float32))
        tracker.register_known_speaker("Bob", "spk_002", np.array([0.0, 1.0], dtype=np.float32))

        tracker._cluster_init_attempted = True
        tracker._cluster_backend = "pyannote"
        tracker._cluster_inference = object()
        tracker._extract_cluster_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)
        tracker._extract_mapping_embedding = lambda audio: np.array([1.0, 0.0], dtype=np.float32)
        tracker._extract_pyannote = lambda audio, inference: np.array([1.0, 0.0], dtype=np.float32)

        audio = np.ones(int(16000 * 3.2), dtype=np.float32)

        with caplog.at_level(logging.INFO):
            info = tracker.process_segment(audio, 0.0, 3.2, transcript_text="single speaker")

        spans = info.get_speaker_spans(0.0, 3.2)
        assert len(spans) == 1
        assert "pyannote segmentation kept single segment 0.00-3.20" in caplog.text
        assert "threshold=0.72" in caplog.text

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

        assert info.registered_id is None
        assert info.registered_name is None
        assert info.get_speaker_labels()[0]["speaker"].startswith("Speaker")

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

