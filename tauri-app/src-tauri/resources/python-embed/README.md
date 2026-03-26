# python-embed placeholder

将 Windows 嵌入式 Python 解压到当前目录：
- 目标目录：`tauri-app/src-tauri/resources/python-embed/`
- 目标文件：`python.exe`
- 推荐版本：Python 3.11 x64 embeddable package

准备方式：
1. 把官方 embeddable zip 放到 `tauri-app/src-tauri/resources/python-embed/python-embed.zip`
2. 运行 `scripts/build_embedded_python.bat`
3. 脚本会自动解压，并尝试把 `python*._pth` 中的 `import site` 打开
4. 如果嵌入式运行时不具备 `venv` 能力，桌面端首次启动会自动回退到系统 Python 来创建 `backend/venv`

当前仓库不直接提交二进制运行时；首次初始化逻辑已经接入，放入 `python.exe` 后会优先检测这里的解释器，并在具备 `venv` 能力时优先使用它完成 `backend/venv` 引导。
