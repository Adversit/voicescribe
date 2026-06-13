import os
import unittest
from pathlib import Path

import config


class ConfigPathTests(unittest.TestCase):
    def test_model_root_is_inside_project_root(self):
        config.MODEL_CACHE_DIR.relative_to(config.PROJECT_ROOT)

    def test_managed_cache_environment_points_inside_model_root(self):
        config.ensure_runtime_env()
        managed = [
            "MODELSCOPE_CACHE",
            "HF_HOME",
            "HUGGINGFACE_HUB_CACHE",
            "HF_DATASETS_CACHE",
            "TRANSFORMERS_CACHE",
            "TORCH_HOME",
            "OLLAMA_MODELS",
        ]
        for key in managed:
            with self.subTest(key=key):
                Path(os.environ[key]).resolve().relative_to(config.MODEL_CACHE_DIR)


if __name__ == "__main__":
    unittest.main()
