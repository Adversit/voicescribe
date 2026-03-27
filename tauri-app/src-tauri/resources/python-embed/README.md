# python-embed placeholder

将 Windows 嵌入式 Python 放到当前目录：
- 资源目录：`tauri-app/src-tauri/resources/python-embed/`
- 目标解释器：`python.exe`
- 推荐版本：Python 3.11 x64 embeddable package

支持两种准备方式：
1. 直接把解压后的 embeddable runtime 放进当前目录
2. 只放 `python-embed.zip`，让桌面端在安装态首次启动时自动解压到运行时目录 `runtime/python-embed/`

手动准备方式：
1. 把官方 embeddable zip 放到 `tauri-app/src-tauri/resources/python-embed/python-embed.zip`
2. 运行 `scripts/build_embedded_python.bat`
3. 脚本会自动解压，并尝试把 `python*._pth` 中的 `import site` 打开
4. 如果嵌入式运行时不具备 `venv` 能力，桌面端首次启动会自动回退到系统 Python 来创建 `backend/venv`

当前仓库不直接提交二进制运行时；首次初始化逻辑已经接入：
- 如果资源目录已有 `python.exe`，桌面端会优先使用它
- 如果资源目录只有 `python-embed.zip`，桌面端会先解压到可写运行时目录，再继续初始化
- 运行时只负责准备 Python 和依赖；模型仍然只从项目根目录 `models/` 管理
