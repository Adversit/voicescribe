# ModelScope 缓存路径问题

## 问题
server.py 原本为 macOS 设计，使用自定义模型缓存路径：
```
~/Library/Application Support/VoiceScribe/models
```
并通过 `os.environ.setdefault("MODELSCOPE_CACHE", ...)` 覆盖 modelscope 默认缓存。

在 Windows 上，install.bat 用 `funasr.AutoModel()` 下载模型到 **modelscope 默认缓存目录**：
```
C:\Users\DingK\.cache\modelscope\hub\models\iic\...
C:\Users\DingK\.cache\modelscope\hub\models\damo\...
```

但 server.py 设置了 `MODELSCOPE_CACHE` 后，modelscope 查找模型的路径变了，导致找不到已下载的模型，重复下载。

## modelscope 路径结构
- 默认 `MODELSCOPE_CACHE` = `~/.cache/modelscope`
- modelscope 内部路径: `{MODELSCOPE_CACHE}/hub/models/{org}/{model_name}/`
- 如果设 `MODELSCOPE_CACHE=~/.cache/modelscope/hub`，实际路径变成 `~/.cache/modelscope/hub/hub/models/...` (重复!)
- 如果设 `MODELSCOPE_CACHE=~/.cache/modelscope/hub/models`，实际路径变成 `~/.cache/modelscope/hub/models/models/...` (重复!)

## 解决方案
Windows 上 **不要设置 `MODELSCOPE_CACHE`**，让 modelscope 使用默认路径。
只在 macOS 上设置自定义路径。

```python
if not MODEL_CACHE_DIR:
    if sys.platform == 'win32':
        MODEL_CACHE_DIR = os.path.join(Path.home(), ".cache", "modelscope", "hub", "models")
        # 不设置 MODELSCOPE_CACHE，让 modelscope 用默认路径
    else:
        MODEL_CACHE_DIR = os.path.join(
            Path.home(), "Library", "Application Support", "VoiceScribe", "models"
        )
        os.environ.setdefault("MODELSCOPE_CACHE", MODEL_CACHE_DIR)
```

## 模型文件完整性
install.bat 下载的模型可能不完整（只有配置文件，没有 model.pt 权重文件）。
需要通过 `/load` API 触发完整下载，model.pt 约 859MB~1.05GB。

## 相关文件
- `backend/server.py`: MODEL_CACHE_DIR 和 MODELSCOPE_CACHE 设置 (行 96-110)
- `backend/engines/funasr_engine.py`: FunASR 引擎加载逻辑
- `install.bat`: Step 3 模型下载
