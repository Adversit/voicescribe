"""Speaker diarization and recognition built on FunASR speaker models."""

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import soundfile as sf

from diarization.speaker_models import (
    normalize_speaker_model_name,
    resolve_local_model_path,
    resolve_speaker_model_for_load,
)


class SpeakerDiarizer:
    """Offline diarization and registered-speaker matching."""

    def __init__(
        self,
        data_dir: str = "~/.voicescribe/speakers",
        sv_model_name: Optional[str] = None,
    ):
        self.data_dir = Path(data_dir).expanduser()
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.diarization_model = None
        self.sv_model = None
        self.sv_model_name = normalize_speaker_model_name(
            sv_model_name or os.environ.get("VOICESCRIBE_SPK_MODEL")
        )
        self.speakers: Dict[str, Dict[str, Any]] = {}

        self._load_speakers()

    def _load_speakers_payload(self, speakers_file: Path) -> dict:
        encodings = ["utf-8", "utf-8-sig", "gb18030", "gbk"]
        last_error: Optional[Exception] = None

        for encoding in encodings:
            try:
                with open(speakers_file, encoding=encoding) as file:
                    payload = json.load(file)
                if encoding != "utf-8":
                    # Normalize legacy-encoded files to UTF-8 after a successful read.
                    with open(speakers_file, "w", encoding="utf-8") as file:
                        json.dump(payload, file, ensure_ascii=False, indent=2)
                return payload
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                last_error = exc

        raise ValueError(
            f"Failed to read speaker registry: {speakers_file} ({last_error})"
        )

    def _load_speakers(self):
        speakers_file = self.data_dir / "speakers.json"
        if not speakers_file.exists():
            return

        data = self._load_speakers_payload(speakers_file)

        for speaker in data.get("speakers", []):
            emb_file = self.data_dir / f"{speaker['id']}.npy"
            if emb_file.exists():
                speaker["embedding"] = np.load(emb_file)
            self.speakers[speaker["id"]] = speaker

    def load_speaker_embedding(self, speaker_id: str) -> Optional[np.ndarray]:
        speaker = self.speakers.get(speaker_id)
        if speaker and "embedding" in speaker:
            return speaker["embedding"]

        emb_file = self.data_dir / f"{speaker_id}.npy"
        if not emb_file.exists():
            return None

        embedding = np.load(emb_file)
        if speaker:
            speaker["embedding"] = embedding
        return embedding

    def _save_speakers(self):
        speakers_file = self.data_dir / "speakers.json"
        payload = {
            "speakers": [
                {"id": speaker["id"], "name": speaker["name"]}
                for speaker in self.speakers.values()
            ]
        }
        with open(speakers_file, "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)

    def load(self, load_diarization: bool = True):
        try:
            from funasr import AutoModel
        except ImportError as exc:
            raise ImportError(
                "Speaker diarization requires funasr. Install with: pip install funasr"
            ) from exc

        self.sv_model_name, sv_path = resolve_speaker_model_for_load(self.sv_model_name)
        print(
            f"[Speaker] Loading speaker verification model [{self.sv_model_name}] from {sv_path}..."
        )
        self.sv_model = AutoModel(model=sv_path, disable_update=True)
        print("[Speaker] Speaker verification model loaded")

        if load_diarization:
            diarization_candidates = []
            override = os.environ.get("VOICESCRIBE_DIARIZATION_MODEL")
            if override:
                diarization_candidates.append(override)
            diarization_candidates.extend(
                [
                    "iic/speech_campplus_speaker-diarization_common",
                    "damo/speech_diarization_sond-zh-cn-alimeeting-16k-n16k4-pytorch",
                ]
            )

            for model_id in diarization_candidates:
                try:
                    resolved = resolve_local_model_path(model_id)
                    print(f"[Speaker] Loading diarization model: {resolved}...")
                    self.diarization_model = AutoModel(model=resolved, disable_update=True)
                    print(f"[Speaker] Diarization model loaded: {model_id}")
                    break
                except Exception as exc:
                    print(f"[Speaker] Diarization model failed to load ({model_id}): {exc}")
                    self.diarization_model = None

        print("[Speaker] FunASR speaker models ready")

    def _read_audio_mono(self, audio_path: str) -> tuple[np.ndarray, int]:
        data, sample_rate = sf.read(audio_path)
        if data.ndim > 1:
            data = data.mean(axis=1)
        return data.astype(np.float32, copy=False), sample_rate

    def _extract_embedding_for_segment(
        self,
        audio_data: np.ndarray,
        sample_rate: int,
        start: float,
        end: float,
        min_duration: float,
    ) -> Optional[np.ndarray]:
        start_idx = max(0, int(start * sample_rate))
        end_idx = min(len(audio_data), int(end * sample_rate))
        if end_idx <= start_idx:
            return None

        duration = (end_idx - start_idx) / sample_rate
        if duration < min_duration:
            return None

        segment = audio_data[start_idx:end_idx]
        if len(segment) == 0:
            return None

        tmp_file = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as file:
                tmp_file = file.name
            sf.write(tmp_file, segment, sample_rate)
            return self.extract_embedding(tmp_file)
        finally:
            if tmp_file and os.path.exists(tmp_file):
                try:
                    os.remove(tmp_file)
                except Exception:
                    pass

    def diarize(self, audio_path: str) -> List[Dict[str, Any]]:
        if self.diarization_model is None:
            print("[Speaker] No diarization model, assuming single speaker")
            return [{"start": 0.0, "end": 9999.0, "speaker": "SPEAKER_00"}]

        result = self.diarization_model.generate(audio_path)
        results: List[Dict[str, Any]] = []
        if isinstance(result, list):
            for item in result:
                if len(item) >= 3:
                    results.append(
                        {
                            "start": float(item[0]),
                            "end": float(item[1]),
                            "speaker": str(item[2]),
                        }
                    )
        return results

    def extract_embedding(self, audio_path: str) -> np.ndarray:
        if self.sv_model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        result = self.sv_model.generate(audio_path)

        if isinstance(result, dict) and "spk_embedding" in result:
            embedding = result["spk_embedding"]
        elif isinstance(result, list) and result:
            first = result[0]
            if isinstance(first, dict) and "spk_embedding" in first:
                embedding = first["spk_embedding"]
            else:
                embedding = first
        else:
            embedding = result

        if not isinstance(embedding, np.ndarray):
            try:
                import torch  # type: ignore

                if isinstance(embedding, torch.Tensor):
                    embedding = embedding.detach().cpu().numpy()
                else:
                    embedding = np.asarray(embedding)
            except Exception:
                embedding = np.asarray(embedding)

        return embedding.flatten()

    def register_speaker(self, name: str, audio_path: str) -> str:
        import shutil

        existing_ids = set(self.speakers.keys())
        index = 0
        while f"speaker_{index:03d}" in existing_ids:
            index += 1
        speaker_id = f"speaker_{index:03d}"

        embedding = self.extract_embedding(audio_path)

        audio_save_path = self.data_dir / f"{speaker_id}.wav"
        shutil.copy2(audio_path, audio_save_path)

        self.speakers[speaker_id] = {
            "id": speaker_id,
            "name": name,
            "embedding": embedding,
        }

        np.save(self.data_dir / f"{speaker_id}.npy", embedding)
        self._save_speakers()

        print(f"[Speaker] Registered: {name} ({speaker_id}), embedding shape: {embedding.shape}")
        return speaker_id

    def delete_speaker(self, speaker_id: str) -> bool:
        if speaker_id not in self.speakers:
            return False

        del self.speakers[speaker_id]

        for suffix in (".npy", ".wav"):
            target = self.data_dir / f"{speaker_id}{suffix}"
            if target.exists():
                target.unlink()

        self._save_speakers()
        print(f"[Speaker] Deleted: {speaker_id}")
        return True

    def identify_speaker(
        self,
        embedding: np.ndarray,
        threshold: float = 0.7,
    ) -> Optional[str]:
        if not self.speakers:
            return None

        best_match = None
        best_score = -1.0

        for speaker_id, speaker in self.speakers.items():
            if "embedding" not in speaker:
                continue

            emb1 = embedding.flatten()
            emb2 = speaker["embedding"].flatten()
            denom = np.linalg.norm(emb1) * np.linalg.norm(emb2)
            if denom <= 0:
                continue

            score = float(np.dot(emb1, emb2) / denom)
            if score > best_score and score >= threshold:
                best_score = score
                best_match = speaker_id

        if best_match:
            print(f"[Speaker] Identified: {best_match} (score: {best_score:.3f})")
        return best_match

    def _collect_segment_overlaps(
        self,
        segment: Dict[str, Any],
        diarization: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        seg_start = float(segment.get("start", 0.0))
        seg_end = float(segment.get("end", 0.0))
        overlaps: List[Dict[str, Any]] = []

        for diar_item in diarization:
            overlap_start = max(seg_start, float(diar_item["start"]))
            overlap_end = min(seg_end, float(diar_item["end"]))
            overlap_duration = overlap_end - overlap_start
            if overlap_duration <= 0:
                continue
            overlaps.append(
                {
                    "speaker": diar_item["speaker"],
                    "start": overlap_start,
                    "end": overlap_end,
                    "duration": overlap_duration,
                }
            )

        overlaps.sort(key=lambda item: (item["start"], -item["duration"]))
        return overlaps

    def _split_text_by_overlaps(
        self,
        text: str,
        overlaps: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        clean_text = str(text or "").strip()
        if not clean_text:
            return []

        merged: List[Dict[str, Any]] = []
        for overlap in overlaps:
            speaker = overlap["speaker"]
            if merged and merged[-1]["speaker"] == speaker:
                merged[-1]["end"] = overlap["end"]
                merged[-1]["duration"] += overlap["duration"]
            else:
                merged.append(dict(overlap))

        if len(merged) <= 1:
            return merged

        total_duration = sum(item["duration"] for item in merged)
        if total_duration <= 0:
            return merged

        text_length = len(clean_text)
        allocated = 0
        pieces: List[Dict[str, Any]] = []

        for index, item in enumerate(merged):
            if index == len(merged) - 1:
                chunk = clean_text[allocated:]
            else:
                ratio = item["duration"] / total_duration
                target = max(1, round(text_length * ratio))
                remaining_segments = len(merged) - index - 1
                max_end = text_length - remaining_segments
                next_allocated = min(max_end, allocated + target)
                chunk = clean_text[allocated:next_allocated]
                allocated = next_allocated

            chunk = chunk.strip()
            if not chunk:
                continue

            pieces.append(
                {
                    "speaker": item["speaker"],
                    "start": item["start"],
                    "end": item["end"],
                    "text": chunk,
                }
            )

        return pieces

    def assign_speakers(
        self,
        transcription: Dict[str, Any],
        diarization: List[Dict[str, Any]],
        audio_path: str = None,
    ) -> Dict[str, Any]:
        segments = transcription.get("segments", [])

        speaker_mapping: Dict[str, str] = {}
        if audio_path and self.speakers and self.sv_model:
            try:
                unique_labels = list({item["speaker"] for item in diarization})
                min_duration = float(os.environ.get("VOICESCRIBE_SPK_MIN_SEC", "1.0"))

                if len(unique_labels) > 1 and diarization:
                    audio_data, sample_rate = self._read_audio_mono(audio_path)
                    embeddings_by_label: Dict[str, List[np.ndarray]] = {}

                    for diar_item in diarization:
                        embedding = self._extract_embedding_for_segment(
                            audio_data,
                            sample_rate,
                            float(diar_item["start"]),
                            float(diar_item["end"]),
                            min_duration,
                        )
                        if embedding is not None:
                            embeddings_by_label.setdefault(diar_item["speaker"], []).append(
                                embedding
                            )

                    for label, embeddings in embeddings_by_label.items():
                        if not embeddings:
                            continue
                        avg_embedding = np.mean(np.stack(embeddings, axis=0), axis=0)
                        matched_id = self.identify_speaker(avg_embedding)
                        if matched_id:
                            matched_name = self.speakers[matched_id].get("name", matched_id)
                            speaker_mapping[label] = matched_name
                            print(f"[Speaker] Matched {label} -> {matched_name}")
                else:
                    embedding = self.extract_embedding(audio_path)
                    matched_id = self.identify_speaker(embedding)
                    if matched_id:
                        matched_name = self.speakers[matched_id].get("name", matched_id)
                        for diar_item in diarization:
                            speaker_mapping[diar_item["speaker"]] = matched_name
                        print(f"[Speaker] Matched: {matched_name}")
            except Exception as exc:
                print(f"[Speaker] Embedding extraction failed: {exc}")

        original_text = transcription.get("text", "")
        if not segments and original_text:
            if speaker_mapping:
                speaker_name = list(speaker_mapping.values())[0]
                transcription["text"] = f"[{speaker_name}] {original_text}"
            return transcription

        rebuilt_segments: List[Dict[str, Any]] = []
        for segment in segments:
            overlaps = self._collect_segment_overlaps(segment, diarization)
            if not overlaps:
                copied = dict(segment)
                copied["speaker"] = "UNKNOWN"
                rebuilt_segments.append(copied)
                continue

            split_parts = self._split_text_by_overlaps(segment.get("text", ""), overlaps)
            if len(split_parts) > 1:
                for part in split_parts:
                    rebuilt_segments.append(
                        {
                            "start": part["start"],
                            "end": part["end"],
                            "text": part["text"],
                            "speaker": speaker_mapping.get(part["speaker"], part["speaker"]),
                        }
                    )
                continue

            dominant = max(overlaps, key=lambda item: item["duration"])
            copied = dict(segment)
            copied["speaker"] = speaker_mapping.get(
                dominant["speaker"],
                dominant["speaker"],
            )
            rebuilt_segments.append(copied)

        transcription["segments"] = rebuilt_segments

        lines = []
        current_speaker = None
        current_text: List[str] = []

        for segment in rebuilt_segments:
            if segment["speaker"] != current_speaker:
                if current_text:
                    lines.append(f"[{current_speaker}] {' '.join(current_text)}")
                current_speaker = segment["speaker"]
                current_text = [segment["text"]]
            else:
                current_text.append(segment["text"])

        if current_text:
            lines.append(f"[{current_speaker}] {' '.join(current_text)}")

        transcription["text"] = "\n".join(lines) if lines else original_text
        return transcription

    def get_speaker_audio_path(self, speaker_id: str) -> Optional[str]:
        audio_file = self.data_dir / f"{speaker_id}.wav"
        if audio_file.exists():
            return str(audio_file)
        return None

    def list_speakers(self) -> List[Dict[str, str]]:
        return [
            {"speaker_id": speaker["id"], "name": speaker["name"]}
            for speaker in self.speakers.values()
        ]
