# python-embed placeholder

将 Windows 嵌入式 Python 解压到当前目录：
- 目标目录：`tauri-app/src-tauri/resources/python-embed/`
- 目标文件：`python.exe`

推荐版本：Python 3.11 x64 embeddable package。

当前仓库不直接提交二进制运行时；首次初始化逻辑已经接入，放入 `python.exe` 后会优先使用这里的解释器创建 `backend/venv` 并安装 `requirements-minimal.txt`。
