@echo off
chcp 65001 >nul
echo ========================================
echo VoiceScribe 历史记录测试
echo ========================================
echo.
echo 本脚本将帮助您测试历史记录功能
echo.
echo 前提条件:
echo 1. 后端必须运行 (http://127.0.0.1:8765)
echo 2. 前端必须运行 (http://localhost:3000)
echo.
echo 如果未运行，请先运行 dev.bat！
echo.
pause

echo.
echo 测试后端连接...
curl -s http://127.0.0.1:8765/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 后端未运行！请先运行 dev.bat
    pause
    exit /b 1
)
echo [成功] 后端正在运行

echo.
echo ========================================
echo 录音和历史记录测试步骤
echo ========================================
echo.
echo 步骤 1: 打开 Electron 应用
echo   - 应该能看到主窗口
echo   - 应该能看到开发者工具 (F12)
echo.
echo 步骤 2: 检查开发者工具
echo   - 在控制台中查找: [GlobalRecordingManager] Component mounted
echo   - 在控制台中查找: [GlobalRecordingManager] IPC listeners registered
echo   - 如果看不到这些日志，说明组件未正确加载
echo.
echo 步骤 3: 进行录音测试
echo   - 按住 Alt+B 开始录音
echo   - 说话: "你好，这是一个测试"
echo   - 松开 Alt+B 停止录音
echo.
echo 步骤 4: 观察控制台输出
echo   主进程 (后台窗口) 应该显示:
echo   - [Recording] Started, user should be in their target application
echo   - Recording started
echo   - Recording stopped. Duration: X.Xs
echo   - [Main] ===== TRANSCRIPTION COMPLETE =====
echo   - [Main] Text: 你好，这是一个测试
echo   - [Main] Sending transcription-complete event to main window
echo.
echo   渲染进程 (F12 控制台) 应该显示:
echo   - [GlobalRecordingManager] ===== TRANSCRIPTION COMPLETE EVENT =====
echo   - [GlobalRecordingManager] Event data: {...}
echo   - [GlobalRecordingManager] Adding transcription: {...}
echo   - [GlobalRecordingManager] Transcription added to store
echo.
echo 步骤 5: 检查历史记录
echo   - 点击左侧菜单的 "历史记录" 标签
echo   - 应该能看到刚才的转录记录
echo   - 界面应该是中文的 (转录历史、搜索、清空全部等)
echo   - 记录应该显示:
echo     * 日期和时间 (中文格式)
echo     * 时长
echo     * 引擎/模型/语言
echo     * 转录文本
echo.
echo 步骤 6: 测试历史记录功能
echo   - 点击 "复制" 按钮 - 应该复制文本到剪贴板
echo   - 点击 "导出" 按钮 - 应该显示 "导出为 TXT" 和 "导出为 MD"
echo   - 点击 "编辑" 按钮 - 应该能编辑文本
echo   - 点击 "删除" 按钮 - 应该删除记录
echo   - 点击 "清空全部" 按钮 - 应该清空所有记录
echo.
echo ========================================
echo 故障排查
echo ========================================
echo.
echo 如果看不到 F12 开发者工具:
echo   - 确保使用 npm run dev:electron 启动
echo   - 检查 main.ts 中是否有 mainWindow.webContents.openDevTools()
echo.
echo 如果历史记录不保存:
echo   1. 检查主进程日志是否有 "Sending transcription-complete event"
echo   2. 检查 F12 控制台是否有 "TRANSCRIPTION COMPLETE EVENT"
echo   3. 如果主进程有但渲染进程没有，说明事件未正确传递
echo   4. 如果渲染进程有但不保存，检查 Zustand store 配置
echo.
echo 如果界面不是中文:
echo   - 确保运行了 npm run build:electron
echo   - 重启 Electron 应用
echo.
echo ========================================
pause
