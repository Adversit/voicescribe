"""
Speaker Diarization & Recognition
说话人分离与识别 - 使用 FunASR CAM++ 模型
"""

import os
import json
import tempfile
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
import soundfile as sf
from config import MODEL_CACHE_DIR, SPEAKER_DATA_DIR, ensure_runtime_env, resolve_modelscope_model_dir
from runtime_probe import prepare_windows_runtime


class SpeakerDiarizer:
    """说话人分离与识别（基于 FunASR）"""

    DIARIZATION_MODEL_MAP = {
        "campplus-diarization": "iic/speech_campplus_speaker-diarization_common",
        "sond-diarization": "damo/speech_diarization_sond-zh-cn-alimeeting-16k-n16k4-pytorch",
        "3d-speaker": "3d-speaker",
        "pyannote-3.1": "pyannote/speaker-diarization-3.1",
    }

    SPEAKER_VERIFICATION_MODEL_MAP = {
        "campp": "damo/speech_campplus_sv_zh-cn_16k-common",
        "eres2netv2": "iic/speech_eres2netv2_sv_zh-cn_16k-common",
    }

    def __init__(self, data_dir: str = None):
        """
        Args:
            data_dir: 声纹数据存储目录
        """
        if data_dir is None:
            data_dir = str(SPEAKER_DATA_DIR)

        self.data_dir = Path(data_dir).expanduser()
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.diarization_model = None  # speaker diarization model or pipeline
        self.diarization_model_id: Optional[str] = None
        self.diarization_backend: Optional[str] = None
        self.sv_model = None  # speaker verification model
        self.sv_model_id: Optional[str] = None
        self.speakers: Dict[str, Dict] = {}  # speaker_id -> {name, embedding}

        self._load_speakers()

    def _load_speakers(self):
        """加载已注册的说话人"""
        speakers_file = self.data_dir / "speakers.json"
        if speakers_file.exists():
            with open(speakers_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                for sp in data.get("speakers", []):
                    emb_file = self.data_dir / f"{sp['id']}.npy"
                    if emb_file.exists():
                        sp["embedding"] = np.load(emb_file)
                    self.speakers[sp["id"]] = sp

    def _save_speakers(self):
        """保存说话人数据"""
        speakers_file = self.data_dir / "speakers.json"
        data = {
            "speakers": [
                {"id": sp["id"], "name": sp["name"]}
                for sp in self.speakers.values()
            ]
        }
        with open(speakers_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _import_auto_model(self):
        ensure_runtime_env()
        prepare_windows_runtime()
        try:
            from funasr import AutoModel
        except ImportError:
            raise ImportError(
                "Speaker diarization requires funasr. "
                "Install with: pip install funasr"
            )
        return AutoModel

    def _import_modelscope_pipeline(self):
        ensure_runtime_env()
        prepare_windows_runtime()
        try:
            from modelscope.pipelines import pipeline
        except ImportError as err:
            raise ImportError(
                "Speaker diarization pipeline requires modelscope runtime extras: "
                "addict, datasets, pillow, simplejson, sortedcontainers, hdbscan"
            ) from err
        return pipeline

    def _import_pyannote_pipeline(self):
        ensure_runtime_env()
        prepare_windows_runtime()
        try:
            from pyannote.audio import Pipeline
        except ImportError as err:
            raise ImportError(
                "pyannote diarization requires pyannote.audio. "
                "Install with: pip install pyannote.audio"
            ) from err
        return Pipeline

    def _resolve_local_model_path(self, logical_model: str, model_id: str) -> str:
        candidate = Path(model_id).expanduser()
        if candidate.exists():
            return str(candidate.resolve())

        direct_dir = (MODEL_CACHE_DIR / "diarization" / logical_model).resolve()
        if direct_dir.exists():
            return str(direct_dir)

        repo_like_dir = MODEL_CACHE_DIR.joinpath(*model_id.split("/")).resolve()
        if repo_like_dir.exists():
            return str(repo_like_dir)

        hf_repo_dir = (MODEL_CACHE_DIR / "huggingface" / "hub" / f"models--{model_id.replace('/', '--')}").resolve()
        if hf_repo_dir.exists():
            snapshots = hf_repo_dir / "snapshots"
            if snapshots.exists():
                snapshot_dirs = [item for item in snapshots.iterdir() if item.is_dir()]
                if snapshot_dirs:
                    snapshot_dirs.sort(key=lambda item: item.stat().st_mtime, reverse=True)
                    return str(snapshot_dirs[0].resolve())
        return model_id

    def _prepare_diarization_audio(self, audio_path: str) -> tuple[str, Optional[str]]:
        data, sr = sf.read(audio_path)
        if getattr(data, 'ndim', 1) > 1:
            data = data.mean(axis=1)
        data = data.astype(np.float32, copy=False)

        if sr == 16000:
            return audio_path, None

        from scipy import signal

        resampled = signal.resample_poly(data, 16000, sr).astype(np.float32, copy=False)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_file = f.name
        sf.write(tmp_file, resampled, 16000)
        return tmp_file, tmp_file

    def _resolve_speaker_verification_model_id(self, logical_model: Optional[str]) -> str:
        if not logical_model:
            return os.environ.get(
                "VOICESCRIBE_SPEAKER_VERIFICATION_MODEL",
                self.SPEAKER_VERIFICATION_MODEL_MAP["campp"],
            )
        return self.SPEAKER_VERIFICATION_MODEL_MAP.get(logical_model, logical_model)

    def _resolve_diarization_model_id(self, logical_model: Optional[str]) -> str:
        if not logical_model:
            return os.environ.get(
                "VOICESCRIBE_DIARIZATION_MODEL",
                self.DIARIZATION_MODEL_MAP["campplus-diarization"],
            )
        return self.DIARIZATION_MODEL_MAP.get(logical_model, logical_model)

    def ensure_speaker_verification_loaded(self, logical_model: Optional[str] = None):
        target_model_id = self._resolve_speaker_verification_model_id(logical_model)
        if self.sv_model is not None and self.sv_model_id == target_model_id:
            print(f"[Speaker] Speaker verification already loaded: {self.sv_model_id}")
            return self.sv_model

        AutoModel = self._import_auto_model()
        model_id = target_model_id
        model_path = resolve_modelscope_model_dir(model_id)
        print(f"[Speaker] Loading speaker verification model: {model_id} -> {model_path}...")
        self.sv_model = AutoModel(
            model=model_path,
            disable_update=True
        )
        self.sv_model_id = model_id
        print(f"[Speaker] Speaker verification model loaded: {model_id}")
        return self.sv_model

    def ensure_diarization_loaded(self, logical_model: Optional[str] = None):
        logical_model = logical_model or "campplus-diarization"
        target_model_id = self._resolve_diarization_model_id(logical_model)
        if self.diarization_model is not None and self.diarization_model_id == target_model_id:
            print(
                f"[Speaker] Diarization model already loaded: {self.diarization_model_id} ({self.diarization_backend})"
            )
            return self.diarization_model

        if logical_model == "pyannote-3.1":
            pipeline_cls = self._import_pyannote_pipeline()
            model_path = self._resolve_local_model_path(logical_model, target_model_id)
            print(f"[Speaker] Loading pyannote diarization pipeline: {target_model_id} -> {model_path}...")
            self.diarization_model = pipeline_cls.from_pretrained(model_path)
            self.diarization_model_id = target_model_id
            self.diarization_backend = "pyannote_audio"
            print(f"[Speaker] Diarization pipeline loaded: {target_model_id} ({self.diarization_backend})")
            return self.diarization_model

        pipeline_factory = self._import_modelscope_pipeline()
        diarization_candidates = [target_model_id]

        last_error = None
        for model_id in diarization_candidates:
            try:
                model_path = self._resolve_local_model_path(logical_model, model_id)
                print(f"[Speaker] Loading diarization pipeline: {model_id} -> {model_path}...")
                self.diarization_model = pipeline_factory(
                    task="speaker-diarization",
                    model=model_path,
                )
                self.diarization_model_id = model_id
                self.diarization_backend = "modelscope_segmentation_clustering"
                print(
                    f"[Speaker] Diarization pipeline loaded: {model_id} ({self.diarization_backend})"
                )
                return self.diarization_model
            except Exception as e:
                print(f"[Speaker] Diarization pipeline failed to load ({model_id}): {e}")
                last_error = e
                self.diarization_model = None
                self.diarization_model_id = None
                self.diarization_backend = None

        if last_error is not None:
            raise RuntimeError(f"Failed to load diarization pipeline: {last_error}")
        raise RuntimeError("No diarization model candidates available")

    def load(
        self,
        load_diarization: bool = True,
        diarization_model: Optional[str] = None,
        speaker_verification_model: Optional[str] = None,
    ):
        """Load speaker models required by the current action."""
        self.ensure_speaker_verification_loaded(speaker_verification_model)
        if load_diarization:
            self.ensure_diarization_loaded(diarization_model)
        print(
            f"[Speaker] Speaker models ready: sv={self.sv_model_id}, diarization={self.diarization_model_id}, backend={self.diarization_backend}"
        )

    def runtime_status(self) -> Dict[str, Any]:
        return {
            "speaker_verification_loaded": self.sv_model is not None,
            "speaker_verification_model": self.sv_model_id,
            "diarization_loaded": self.diarization_model is not None,
            "diarization_model": self.diarization_model_id,
            "diarization_backend": self.diarization_backend,
            "registered_speakers": len(self.speakers),
        }

    def _read_audio_mono(self, audio_path: str) -> tuple[np.ndarray, int]:
        """读取音频并转换为单声道 float32"""
        data, sr = sf.read(audio_path)
        if data.ndim > 1:
            data = data.mean(axis=1)
        data = data.astype(np.float32, copy=False)
        return data, sr

    def _extract_embedding_for_segment(
        self,
        audio_data: np.ndarray,
        sr: int,
        start: float,
        end: float,
        min_duration: float,
    ) -> Optional[np.ndarray]:
        """对指定时间片段提取声纹 embedding"""
        start_idx = max(0, int(start * sr))
        end_idx = min(len(audio_data), int(end * sr))
        if end_idx <= start_idx:
            return None
        duration = (end_idx - start_idx) / sr
        if duration < min_duration:
            return None

        segment = audio_data[start_idx:end_idx]
        if len(segment) == 0:
            return None

        tmp_file = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                tmp_file = f.name
            sf.write(tmp_file, segment, sr)
            return self.extract_embedding(tmp_file)
        finally:
            if tmp_file and os.path.exists(tmp_file):
                try:
                    os.remove(tmp_file)
                except Exception:
                    pass

    def diarize(self, audio_path: str) -> List[Dict]:
        """
        ????????

        Args:
            audio_path: ?????????

        Returns:
            [
                {"start": 0.0, "end": 2.5, "speaker": "SPEAKER_00"},
                {"start": 2.5, "end": 5.0, "speaker": "SPEAKER_01"},
                ...
            ]
        """
        if self.diarization_model is None:
            print("[Speaker] No diarization model, assuming single speaker")
            return [{"start": 0.0, "end": 9999.0, "speaker": "SPEAKER_00"}]

        processed_audio_path, temp_audio_path = self._prepare_diarization_audio(audio_path)
        try:
            audio_data, sr = self._read_audio_mono(processed_audio_path)
            duration = (len(audio_data) / sr) if sr else 0.0
            rms = float(np.sqrt(np.mean(np.square(audio_data)))) if len(audio_data) else 0.0
            if duration < 0.5 or rms < 1e-4:
                print(
                    f"[Speaker] Skip diarization: duration={duration:.3f}s rms={rms:.6f} is too short or silent"
                )
                return []

            if self.diarization_backend == "modelscope_segmentation_clustering":
                try:
                    result = self.diarization_model(processed_audio_path)
                except AssertionError as e:
                    if "effective audio duration is too short" in str(e).lower():
                        print(f"[Speaker] Skip diarization: {e}")
                        return []
                    raise
                raw_segments = result.get("text") if isinstance(result, dict) else result
                results = []
                if isinstance(raw_segments, list):
                    for item in raw_segments:
                        if isinstance(item, (list, tuple)) and len(item) >= 3:
                            speaker_index = int(item[2])
                            results.append(
                                {
                                    "start": float(item[0]),
                                    "end": float(item[1]),
                                    "speaker": f"SPEAKER_{speaker_index:02d}",
                                }
                            )
                return results

            if self.diarization_backend == "pyannote_audio":
                annotation = self.diarization_model(processed_audio_path)
                results = []
                for segment, _, speaker in annotation.itertracks(yield_label=True):
                    results.append(
                        {
                            "start": float(segment.start),
                            "end": float(segment.end),
                            "speaker": str(speaker),
                        }
                    )
                return results

            result = self.diarization_model.generate(processed_audio_path)
            results = []
            if isinstance(result, list):
                for item in result:
                    if len(item) >= 3:
                        results.append({
                            "start": float(item[0]),
                            "end": float(item[1]),
                            "speaker": str(item[2]),
                        })
            return results
        finally:
            if temp_audio_path and os.path.exists(temp_audio_path):
                try:
                    os.remove(temp_audio_path)
                except Exception:
                    pass
    def extract_embedding(self, audio_path: str) -> np.ndarray:
        """提取音频的声纹特征"""
        if self.sv_model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        result = self.sv_model.generate(audio_path)

        # 获取 embedding
        if isinstance(result, dict) and "spk_embedding" in result:
            embedding = result["spk_embedding"]
        elif isinstance(result, list) and len(result) > 0:
            # 可能是列表格式
            if isinstance(result[0], dict) and "spk_embedding" in result[0]:
                embedding = result[0]["spk_embedding"]
            else:
                embedding = result[0]
        else:
            embedding = result

        # 确保是 numpy 数组
        if not isinstance(embedding, np.ndarray):
            embedding = np.array(embedding)

        # 展平为一维
        embedding = embedding.flatten()

        return embedding

    def register_speaker(self, name: str, audio_path: str) -> str:
        """
        注册说话人声纹

        Args:
            name: 说话人姓名
            audio_path: 包含该说话人声音的音频文件

        Returns:
            speaker_id
        """
        # 生成唯一 ID
        existing_ids = set(self.speakers.keys())
        idx = 0
        while f"speaker_{idx:03d}" in existing_ids:
            idx += 1
        speaker_id = f"speaker_{idx:03d}"

        # 提取声纹
        embedding = self.extract_embedding(audio_path)

        # 保存
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
        """
        删除说话人

        Args:
            speaker_id: 说话人 ID

        Returns:
            是否删除成功
        """
        if speaker_id not in self.speakers:
            return False

        # 删除内存中的数据
        del self.speakers[speaker_id]

        # 删除 embedding 文件
        emb_file = self.data_dir / f"{speaker_id}.npy"
        if emb_file.exists():
            emb_file.unlink()

        # 更新 JSON 文件
        self._save_speakers()

        print(f"[Speaker] Deleted: {speaker_id}")
        return True

    def identify_speaker(self, embedding: np.ndarray, threshold: float = 0.7) -> Optional[str]:
        """
        根据声纹识别说话人

        Args:
            embedding: 声纹特征向量
            threshold: 相似度阈值 (CAM++ 推荐 0.7)

        Returns:
            speaker_id 或 None（未识别）
        """
        if not self.speakers:
            return None

        best_match = None
        best_score = -1

        for speaker_id, sp in self.speakers.items():
            if "embedding" not in sp:
                continue

            # 计算余弦相似度
            emb1 = embedding.flatten()
            emb2 = sp["embedding"].flatten()
            score = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))

            if score > best_score and score >= threshold:
                best_score = score
                best_match = speaker_id

        if best_match:
            print(f"[Speaker] Identified: {best_match} (score: {best_score:.3f})")

        return best_match

    def assign_speakers(
        self,
        transcription: Dict[str, Any],
        diarization: List[Dict],
        audio_path: str = None,
    ) -> Dict[str, Any]:
        """
        将说话人标签分配到转录结果

        Args:
            transcription: ASR 转录结果 {"text": ..., "segments": [...]}
            diarization: 说话人分离结果
            audio_path: 音频文件路径（用于声纹识别）

        Returns:
            带说话人标签的转录结果
        """
        segments = transcription.get("segments", [])

        # 如果有音频路径且有已注册的说话人，尝试声纹识别
        speaker_mapping = {}  # diarization 标签 -> 真实姓名
        if audio_path and self.speakers and self.sv_model:
            try:
                unique_labels = list({d["speaker"] for d in diarization})
                min_duration = float(os.environ.get("VOICESCRIBE_SPK_MIN_SEC", "1.0"))

                if len(unique_labels) > 1 and diarization:
                    audio_data, sr = self._read_audio_mono(audio_path)
                    embeddings_by_label: Dict[str, List[np.ndarray]] = {}

                    for d in diarization:
                        emb = self._extract_embedding_for_segment(
                            audio_data,
                            sr,
                            float(d["start"]),
                            float(d["end"]),
                            min_duration,
                        )
                        if emb is not None:
                            embeddings_by_label.setdefault(d["speaker"], []).append(emb)

                    for label, embs in embeddings_by_label.items():
                        if not embs:
                            continue
                        avg_emb = np.mean(np.stack(embs, axis=0), axis=0)
                        matched_id = self.identify_speaker(avg_emb)
                        if matched_id:
                            matched_name = self.speakers[matched_id].get("name", matched_id)
                            speaker_mapping[label] = matched_name
                            print(f"[Speaker] Matched {label} -> {matched_name}")
                else:
                    # 单人场景：使用整段音频声纹匹配
                    embedding = self.extract_embedding(audio_path)
                    matched_id = self.identify_speaker(embedding)
                    if matched_id:
                        matched_name = self.speakers[matched_id].get("name", matched_id)
                        for d in diarization:
                            speaker_mapping[d["speaker"]] = matched_name
                        print(f"[Speaker] Matched: {matched_name}")
            except Exception as e:
                print(f"[Speaker] Embedding extraction failed: {e}")

        # 如果没有 segments，但有原始文本，直接使用原始文本
        original_text = transcription.get("text", "")
        if not segments and original_text:
            # 如果识别出了说话人，在文本前加上说话人名字
            if speaker_mapping:
                speaker_name = list(speaker_mapping.values())[0]
                transcription["text"] = f"[{speaker_name}] {original_text}"
            return transcription

        for seg in segments:
            seg_mid = (seg["start"] + seg["end"]) / 2

            # 找到对应的说话人
            speaker = "UNKNOWN"
            for d in diarization:
                if d["start"] <= seg_mid <= d["end"]:
                    speaker = d["speaker"]
                    # 使用声纹匹配的映射
                    if speaker in speaker_mapping:
                        speaker = speaker_mapping[speaker]
                    break

            seg["speaker"] = speaker

        # 重新生成带说话人的文本
        lines = []
        current_speaker = None
        current_text = []

        for seg in segments:
            if seg["speaker"] != current_speaker:
                if current_text:
                    lines.append(f"[{current_speaker}] {' '.join(current_text)}")
                current_speaker = seg["speaker"]
                current_text = [seg["text"]]
            else:
                current_text.append(seg["text"])

        if current_text:
            lines.append(f"[{current_speaker}] {' '.join(current_text)}")

        transcription["text"] = "\n".join(lines) if lines else original_text
        return transcription

    def list_speakers(self) -> List[Dict]:
        """列出已注册的说话人"""
        return [
            {"speaker_id": sp["id"], "name": sp["name"]}
            for sp in self.speakers.values()
        ]
