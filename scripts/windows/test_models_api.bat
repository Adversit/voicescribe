@echo off
chcp 65001 >nul
echo ========================================
echo 测试模型 API
echo ========================================
echo.
echo 正在调用 GET /models...
echo.

curl -s http://127.0.0.1:8765/models

echo.
echo.
echo ========================================
echo 上面是后端返回的模型状态数据
echo ========================================
echo.
echo 检查要点:
echo 1. 是否返回了所有 FunASR 模型？
echo    - seaco-paraformer
echo    - paraformer-zh
echo    - sensevoice-small
echo.
echo 2. 每个模型的状态是否正确？
echo    - available: true/false (是否已下载)
echo    - downloading: true/false (是否正在下载)
echo    - size_bytes: 数字 (模型大小)
echo.
echo 3. 如果某个模型已下载但显示 available: false
echo    说明后端没有正确检测到模型
echo.
pause
