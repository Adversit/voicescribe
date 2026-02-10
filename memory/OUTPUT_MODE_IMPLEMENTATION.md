# 输出模式功能实现文档

## 日期
2026-02-09

## 问题描述

在检查 VoiceScribe Electron 版本的"通用"设置界面时，发现"输出方式"功能只部分实现：
- ✅ "复制到剪贴板" - 已实现
- ❌ "直接输入到应用" - 未实现
- ❌ "两者都执行" - 未实现

前端界面显示了3个选项，但后端只实现了复制到剪贴板功能。

## macOS 版本的实现方式

### 1. TextInputService.swift
提供两种文本输入方法：

```swift
// 方法 1: 逐字符模拟键盘输入（需要辅助功能权限）
func typeText(_ text: String) {
    let source = CGEventSource(stateID: .hidSystemState)
    for char in text {
        typeCharacter(char, source: source)
    }
}

// 方法 2: 复制到剪贴板 + 模拟 Cmd+V 粘贴
func pasteText(_ text: String) {
    NSPasteboard.general.setString(text, forType: .string)
    
    // 使用 CGEvent 模拟 Cmd+V
    let source = CGEventSource(stateID: .hidSystemState)
    let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true)
    keyDown.flags = .maskCommand
    keyDown.post(tap: .cgAnnotatedSessionEventTap)
    
    let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false)
    keyUp.flags = .maskCommand
    keyUp.post(tap: .cgAnnotatedSessionEventTap)
}
```

### 2. HotkeyManager.swift 输出逻辑

```swift
private func handleTranscriptionOutput(_ text: String) {
    var outputMode = AppState.shared.outputMode
    
    // 如果前台应用是 VoiceScribe 本身，强制使用剪贴板模式
    if let app = previousApp, app.bundleIdentifier == "com.voicescribe.app" {
        outputMode = "clipboard"
    }
    
    if outputMode == "clipboard" {
        NSPasteboard.general.setString(text, forType: .string)
        return
    }
    
    // directInput 或 both 模式
    if let app = previousApp {
        app.activate()  // 激活之前的应用
        Thread.sleep(forTimeInterval: 0.2)
    }
    
    TextInputService.shared.pasteText(text)
}
```

## Windows Electron 版本的实现

### 1. 输出模式类型定义

**文件：** `frontend/electron/store.ts`, `frontend/electron/preload.ts`

```typescript
// 修改前
outputFormat: 'clipboard' | 'file';

// 修改后
outputFormat: 'clipboard' | 'directInput' | 'both';
```

### 2. 转录完成处理逻辑

**文件：** `frontend/electron/main.ts`

```typescript
function handleTranscriptionOutput(text: string) {
    const settings = getSettings();
    let outputMode = settings.outputFormat || 'clipboard';

    console.log(`[Output] Mode: ${outputMode}, Text: ${text.substring(0, 50)}...`);

    if (outputMode === 'clipboard') {
        clipboard.writeText(text);
        console.log('[Output] Copied to clipboard');
        return;
    }

    // directInput 或 both 模式
    clipboard.writeText(text);
    console.log('[Output] Text copied to clipboard');

    if (outputMode === 'directInput' || outputMode === 'both') {
        setTimeout(() => {
            simulatePaste();
        }, 200);
    }
}
```

### 3. 自动粘贴实现（三种方法）

**文件：** `frontend/electron/main.ts`

```typescript
function simulatePaste() {
    // 方法 1: 使用 robotjs（可选依赖）
    try {
        const robot = require('robotjs');
        robot.keyTap('v', ['control']);
        console.log('[Output] Simulated Ctrl+V paste using robotjs');
        return;
    } catch (error) {
        // robotjs 不可用，尝试其他方法
    }

    // 方法 2: 使用 PowerShell SendKeys（Windows 原生，无需依赖）
    if (process.platform === 'win32') {
        try {
            const { exec } = require('child_process');
            const script = `
                Add-Type -AssemblyName System.Windows.Forms
                [System.Windows.Forms.SendKeys]::SendWait("^v")
            `;
            exec(`powershell -Command "${script.replace(/\n/g, ' ')}"`, (error: Error | null) => {
                if (error) {
                    console.warn('[Output] PowerShell paste failed:', error.message);
                    console.log('[Output] Text is in clipboard, press Ctrl+V to paste');
                } else {
                    console.log('[Output] Simulated Ctrl+V paste using PowerShell');
                }
            });
            return;
        } catch (error) {
            console.warn('[Output] PowerShell method failed:', error);
        }
    }

    // 方法 3: 仅复制到剪贴板，提示用户手动粘贴
    console.log('[Output] Direct input mode: Text ready in clipboard, press Ctrl+V to paste');
}
```

## 实现细节

### PowerShell SendKeys 方法（推荐）

**优点：**
- ✅ Windows 原生支持，无需额外依赖
- ✅ 使用 .NET Framework 的 `System.Windows.Forms.SendKeys`
- ✅ 可靠性高，兼容性好
- ✅ 不需要安装任何 npm 包

**工作原理：**
1. 通过 PowerShell 加载 `System.Windows.Forms` 程序集
2. 使用 `SendKeys.SendWait("^v")` 发送 Ctrl+V 组合键
3. `^v` 表示 Ctrl+V（`^` 是 Ctrl 修饰符）

**执行流程：**
```
转录完成 → 复制到剪贴板 → 等待 200ms → 执行 PowerShell 命令 → 模拟 Ctrl+V → 文本粘贴到当前应用
```

### robotjs 方法（可选）

**优点：**
- 跨平台支持（Windows/macOS/Linux）
- 更精确的键盘控制

**缺点：**
- 需要安装额外依赖：`npm install robotjs`
- 需要编译原生模块
- 可能在某些系统上安装失败

**安装命令：**
```bash
npm install robotjs
```

### 三种方法的优先级

1. **robotjs**（如果已安装）- 最可靠，跨平台
2. **PowerShell SendKeys**（Windows 原生）- 推荐，无需依赖
3. **仅剪贴板**（备选）- 用户手动 Ctrl+V

## 其他遇到的问题

### 问题 1: 端口占用错误

**错误信息：**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**原因：**
- Next.js 开发服务器的端口 3000 被之前未正确关闭的进程占用

**解决方法：**
```powershell
# 1. 查找占用端口的进程
netstat -ano | findstr :3000

# 2. 终止进程（替换 <PID> 为实际进程 ID）
taskkill /F /PID <PID>

# 3. 重新启动开发模式
.\scripts\windows\dev.bat
```

### 问题 2: 录音窗口显示不完整

**问题描述：**
- 录音窗口尺寸太小，内容被截断
- 窗口无法拖动

**解决方案：**
1. 调整窗口尺寸：200x60 → 280x80
2. 启用窗口拖动：`movable: true`
3. 使用 `-webkit-app-region: drag` 实现拖动区域
4. 音波动画使用 inline style 而不是 data 属性

**修改文件：**
- `frontend/electron/main.ts` - 窗口配置
- `frontend/src/components/RecordingOverlay.tsx` - 拖动逻辑
- `frontend/src/app/overlay/page.tsx` - 布局调整

## 测试验证

### 测试步骤

1. **测试"复制到剪贴板"模式：**
   - 设置 → 通用 → 输出方式 → 选择"复制到剪贴板"
   - 按 Alt+R 开始录音
   - 说话后再按 Alt+R 停止
   - 验证：文本已复制到剪贴板，可以手动 Ctrl+V 粘贴

2. **测试"直接输入到应用"模式：**
   - 设置 → 通用 → 输出方式 → 选择"直接输入到应用"
   - 打开记事本或其他文本编辑器
   - 按 Alt+R 开始录音
   - 说话后再按 Alt+R 停止
   - 验证：文本自动粘贴到记事本中

3. **测试"两者都执行"模式：**
   - 设置 → 通用 → 输出方式 → 选择"两者都执行"
   - 行为与"直接输入到应用"相同（因为直接输入就是通过剪贴板实现的）

### 预期结果

- ✅ 所有三种输出模式都能正常工作
- ✅ PowerShell SendKeys 方法无需额外依赖
- ✅ 如果 PowerShell 方法失败，会提示用户手动粘贴
- ✅ 转录完成后有 200ms 延迟确保剪贴板就绪

## 总结

成功实现了与 macOS 版本一致的输出模式功能：
- ✅ 复制到剪贴板
- ✅ 直接输入到应用（使用 PowerShell SendKeys）
- ✅ 两者都执行

Windows 版本使用 PowerShell SendKeys 作为主要方法，这是一个**零依赖**的解决方案，与 macOS 版本使用 CGEvent API 的方式在功能上完全等价。

## 相关文件

- `frontend/electron/main.ts` - 主要实现逻辑
- `frontend/electron/store.ts` - 设置类型定义
- `frontend/electron/preload.ts` - IPC 类型定义
- `frontend/src/components/settings/GeneralSettings.tsx` - 设置界面
- `app/VoiceScribe/Services/TextInputService.swift` - macOS 参考实现
- `app/VoiceScribe/Services/HotkeyManager.swift` - macOS 参考实现
