import json
import shutil
from pathlib import Path

from diarization.speaker import SpeakerDiarizer


class TestSpeakerDiarizer:
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
