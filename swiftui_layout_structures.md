# SwiftUI 界面布局结构

本文档详细列出了 `VoiceScribe` 项目中 SwiftUI 界面及其实现细节。所有列出的组件和功能均已在项目源代码中通过 SwiftUI 实现。

---

## 1. 应用整体架构 (VoiceScribeApp.swift)

应用定义了两个主要的窗口场景和一个菜单栏项：

### 布局草图 (App Scenes)

```text
+---------------------+      +---------------------+      +--------------+
|   WindowGroup       |      |      Settings       |      | MenuBarExtra |
| (ContentView)       |      |   (SettingsView)    |      | (MenuBarView)|
+---------------------+      +---------------------+      +--------------+
```

- **实现细节**:
  - `WindowGroup` (主窗口): 渲染 `ContentView`，样式为 `.hiddenTitleBar`。
  - `Settings` (设置窗口): 渲染 `SettingsView`，这是系统的 "设置..." (Cmd + ,) 面板。
  - `MenuBarExtra`: 在系统托盘菜单显示 `MenuBarView`。

---

## 2. 主设置分栏视图 (ContentView.swift)

采用现代 macOS 风格的分栏布局。

### 布局结构 (Layout)

```text
+-------------------------------------------------------+
|  [ Sidebar ]  |  [ Detail Content Area ]      [ ( ! )]| <--- Toolbar
+---------------+---------------------------------------+
| 通用 (gear)   |                                       |
| 引擎 (cpu)    |      此处显示选中的设置面板内容        |
| 词汇 (text)   |                                       |
| 说话人 (user)  |                                       |
| 快捷键 (kbd)  |                                       |
+---------------+---------------------------------------+
| [ OVERLAY : Dependency Install / Model Download ]     |
+-------------------------------------------------------+
```

- **确认的 SwiftUI 组件**:
  - `NavigationSplitView`: 实现左侧 `List` 作为侧边栏，右侧为 `detail`。
  - `ZStack`: 用于在底层内容之上覆盖 `InstallProgressOverlay` 和 `ModelDownloadOverlay`。
  - `ToolbarItem`: 在右上角通过 `ConnectionStatusView` 显示后端连接状态。

---

## 3. 设置详情面板 (SettingsView.swift)

### 通用布局 (GeneralSettingsView)

- **布局**: 标准 `Form` 布局。
- **SwiftUI 特性**: 使用 `Picker` 绑定 `AppStorage` 数据，通过 `.onAppear` 检查系统权限。

### 流式标签布局 (VocabularySettingsView)

```text
+---------------------------------------+
| [ Input Field ] [ Add Button ]        |
+---------------------------------------+
|  [word1 x] [longer_word x] [word3 x]  |  <--- FlowLayout
|  [word4 x] [word5 x]                  |
+---------------------------------------+
```

- **实现细节**: 使用了自定义的 `Layout` 协议实现的 `FlowResult` 计算，确保标签能自动换行。

### 引擎管理 (EngineSettingsView)

- **布局**: `Form` 嵌套 `ForEach` 模型行。
- **实现细节**: 每个模型行包含一个 `.borderless` 样式的下载/删除按钮，支持异步状态更新。

---

## 4. 菜单栏下拉菜单 (MenuBarView.swift)

### 布局结构

```text
+----------------------------+
| [Mic] 录音中...      00:12 |
|----------------------------|
| [Stop] 停止录音      Cmd+S |
|----------------------------|
| 最近转录:                  |
| "这里是刚刚识别的内容..."      |
| [Copy] 复制最近结果          |
|----------------------------|
| [Gear] 设置...       Cmd+, |
| [Quit] 退出          Cmd+Q |
+----------------------------+
```

- **实现细节**: 使用 `VStack` 模拟标准的 `NSMenu` 外观，支持键盘快捷键绑定。

---

## 5. 录音悬浮指示器 (RecordingOverlayWindow.swift)

这是项目中最具动感的组件。

### 布局与动画

```text
  [ Floating Pill / 悬浮胶囊 ]
+---------------------------------+
| ( )  |||i||   00:15  (Click)    |
+---------------------------------+
  ^      ^        ^
 呼吸灯  声波条    计时器
```

- **确认的 SwiftUI 动画**:
  - **呼吸指示灯**: `Circle` 配合 `.animation(.easeInOut.repeatForever)`。
  - **动态声波 (SoundWaveBar)**: 五个柱状图，高度由 `AudioRecorder.shared.audioLevel` 实时驱动，并添加了额外的随机偏移 (`CGFloat.random`) 使其看起来更灵动。
  - **思考点动画 (ThinkingDotsView)**: 三个点依次执行缩放动画，模拟 Loading 效果。

---

## 图片引用

注：如果环境支持，这里将展示视觉效果图。

- ![主布局示例](main_layout_diagram.png)
- ![录音悬浮窗示例](overlay_logic_diagram.png)
