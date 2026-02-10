# VoiceScribe Electron 前端界面优化

> 记录日期: 2026-02-09
> 最后更新: 2026-02-09

## 概述

基于 macOS SwiftUI 版本实现了 Windows Electron/Next.js 前端界面，达到 UI 和功能一致性。

---

## 组件结构

```
frontend/src/components/
├── settings/
│   ├── SettingsPanel.tsx        # 主设置容器（左侧导航+右侧内容）
│   ├── GeneralSettings.tsx      # 通用设置（语言、输出格式、说话人识别、AI优化）
│   ├── EngineSettings.tsx       # 引擎选择、模型下载、预加载
│   ├── VocabularySettings.tsx   # 自定义词汇表（FlowLayout 标签）
│   ├── SpeakerSettings.tsx      # 说话人注册（录音+列表）
│   ├── HotkeySettings.tsx       # 全局快捷键配置
│   └── index.ts
├── RecordingOverlay.tsx         # 录音状态浮窗
├── Sidebar.tsx                  # 左侧导航栏
└── ui/                          # shadcn/ui + Radix UI 组件
    ├── button.tsx
    ├── checkbox.tsx
    ├── input.tsx
    ├── label.tsx
    ├── select.tsx
    └── switch.tsx
```

---

## 主要页面

### 设置页面 (`app/page.tsx`)

- 左侧导航栏 + 右侧内容区
- Tab: 通用、引擎、词汇、说话人、快捷键
- 响应式布局，支持窗口缩放

### 录音浮窗 (`app/overlay/page.tsx`)

- 透明无边框窗口
- 显示录音时长、音频波形
- 转录中动画（三个跳动点）
- 点击取消录音

---

## Electron 集成

### System Tray 托盘菜单

```typescript
// electron/main.ts
Menu.buildFromTemplate([
    { label: isRecording ? '🔴 录音中...' : '⚪ 待命' },
    { label: isRecording ? '停止录音' : '开始录音' },
    { label: '复制最近结果' },
    { label: '设置...' },
    { label: '退出 VoiceScribe' },
])
```

### 全局快捷键

```typescript
globalShortcut.register('Alt+R', () => toggleRecording())
```

### IPC 通信（已实现）

| 前端调用 | 功能 | 状态 |
|---------|-----|------|
| `window.electron.recording.toggle()` | 切换录音 | ✅ |
| `window.electron.recording.cancel()` | 取消录音 | ✅ |
| `window.electron.recording.transcribeAudio(buffer)` | 发送音频转录 | ✅ |
| `window.electron.hotkey.get()` / `.update()` | 快捷键管理 | ✅ |
| `window.electron.settings.get()` / `.update()` | 设置管理 | ✅ |
| `window.electron.backend.checkHealth()` | 后端状态 | ✅ |
| `window.electron.backend.getEngines()` | 获取引擎列表 | ✅ |
| `window.electron.backend.loadEngine()` | 预加载引擎 | ✅ |
| `window.electron.backend.getSpeakers()` | 获取说话人列表 | ✅ |
| `window.electron.backend.deleteSpeaker()` | 删除说话人 | ✅ |

---

## 前后端通信已连接的组件

| 组件 | Electron API | 状态 |
|------|-------------|------|
| GeneralSettings | settings.get/update, backend.checkHealth | ✅ 已连接 |
| EngineSettings | backend.getEngines, backend.loadEngine | ✅ 已连接 |
| VocabularySettings | settings.get/update (vocabulary) | ✅ 已连接 |
| SpeakerSettings | backend.getSpeakers, backend.deleteSpeaker | ✅ 已连接 |
| HotkeySettings | hotkey.get/update | ✅ 已连接 |
| RecordingOverlay | recording.cancel | ✅ 已连接 |

---

## 样式

### globals.css

- `.sound-wave-bar[data-height="X"]` - 波形高度动态样式
- `.thinking-dot-delay-X` - 转录动画延迟

### 避免内联样式

使用 `data-*` 属性替代动态 `style` 属性，符合 lint 规则。

---

## 窗口行为

- **主窗口**: 关闭时隐藏到托盘（非退出）
- **浮窗**: 透明、无边框、始终置顶、跳过任务栏
- **托盘单击**: 切换录音
- **托盘双击**: 显示主窗口

---

## 构建状态 (2026-02-09)

- ✅ Electron TypeScript (`tsc -p tsconfig.electron.json`) - 编译成功
- ✅ Next.js 静态导出 (`next build`) - 编译成功，生成 index.html 和 overlay.html
- ✅ 所有设置组件已连接 Electron IPC API
- ⚠️ 说话人录音功能仍使用模拟（需要实现 Web Audio API 录音）
- ⚠️ 模型下载进度尚未实现真实后端调用

---

## 技术栈

- Next.js 16.1.6 + React 19.2.3
- Electron 40.2.1
- TypeScript 5
- Tailwind CSS 4
- Radix UI (shadcn/ui)
- Zustand 5 (状态管理)
