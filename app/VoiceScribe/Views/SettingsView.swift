import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        TabView {
            GeneralSettingsView()
                .tabItem {
                    Label("通用", systemImage: "gear")
                }

            EngineSettingsView()
                .tabItem {
                    Label("引擎", systemImage: "cpu")
                }

            VocabularySettingsView()
                .tabItem {
                    Label("词汇", systemImage: "textformat")
                }

            SpeakerSettingsView()
                .tabItem {
                    Label("说话人", systemImage: "person.2")
                }

            HotkeySettingsView()
                .tabItem {
                    Label("快捷键", systemImage: "keyboard")
                }
        }
        .frame(width: 550, height: 450)
    }
}

// MARK: - General Settings

struct GeneralSettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var hasAccessibilityPermission = false

    var body: some View {
        Form {
            Section("语言") {
                Picker("默认语言", selection: $appState.language) {
                    Text("中文").tag("zh")
                    Text("英文").tag("en")
                    Text("日文").tag("ja")
                    Text("自动检测").tag("auto")
                }
            }

            Section("输出方式") {
                Picker("转录完成后", selection: $appState.outputMode) {
                    Text("直接输入到应用").tag("directInput")
                    Text("复制到剪贴板").tag("clipboard")
                    Text("两者都执行").tag("both")
                }

                if appState.outputMode != "clipboard" {
                    HStack {
                        Image(systemName: hasAccessibilityPermission
                              ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                            .foregroundColor(hasAccessibilityPermission ? .green : .orange)
                        Text(hasAccessibilityPermission
                             ? "辅助功能权限已授予" : "需要辅助功能权限")
                            .font(.caption)
                        Spacer()
                        if !hasAccessibilityPermission {
                            Button("授权") {
                                TextInputService.shared.openAccessibilitySettings()
                            }
                            .buttonStyle(.link)
                        }
                    }
                }
            }

            Section("其他") {
                Toggle("启用说话人识别", isOn: $appState.enableDiarization)
                Toggle("启用 AI 文本优化", isOn: $appState.enableAIRefine)

                if appState.enableAIRefine {
                    Text("AI 优化将去除语气词、修正错别字")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Section("关于") {
                LabeledContent("版本", value: "0.1.0")
                HStack {
                    Text("后端状态")
                    Spacer()
                    HStack(spacing: 4) {
                        Circle()
                            .fill(appState.backendConnected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(appState.backendConnected ? "已连接" : "未连接")
                    }
                }
            }
        }
        .padding()
        .onAppear {
            hasAccessibilityPermission = TextInputService.shared.hasAccessibilityPermission()
        }
    }
}

// MARK: - Engine Settings

struct EngineSettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var isLoading = false

    // 静态引擎列表（作为后备）
    private let staticEngines: [(name: String, displayName: String, models: [String], description: String)] = [
        ("whisper", "Whisper", ["tiny", "base", "small", "medium", "large-v2", "large-v3"], "OpenAI Whisper，多语言支持"),
        ("whispercpp", "Whisper.cpp", ["tiny", "base", "small", "medium", "large"], "轻量高效，Apple Silicon 优化"),
        ("funasr", "FunASR", ["paraformer-zh", "paraformer-zh-streaming", "sensevoice-small"], "阿里 FunASR，中文识别效果最佳"),
        ("parakeet", "Parakeet", ["parakeet-ctc-1.1b", "parakeet-tdt-1.1b"], "NVIDIA Parakeet，英文优化，需要 GPU"),
    ]

    var body: some View {
        Form {
            Section("ASR 引擎") {
                Picker("选择引擎", selection: $appState.selectedEngine) {
                    ForEach(staticEngines, id: \.name) { engine in
                        HStack {
                            Text(engine.displayName)
                            if !isEngineAvailable(engine.name) {
                                Text("(未安装)")
                                    .foregroundColor(.secondary)
                                    .font(.caption)
                            }
                        }.tag(engine.name)
                    }
                }

                // 引擎说明
                if let engine = staticEngines.first(where: { $0.name == appState.selectedEngine }) {
                    Text(engine.description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Section("模型") {
                Picker("选择模型", selection: $appState.selectedModel) {
                    ForEach(modelsForCurrentEngine, id: \.self) { model in
                        Text(modelDisplayName(model)).tag(model)
                    }
                }

                // 模型说明
                modelDescription
            }

            Section("预加载") {
                Button(action: preloadModel) {
                    HStack {
                        if isLoading {
                            ProgressView()
                                .scaleEffect(0.7)
                        }
                        Text(isLoading ? "加载中..." : "预加载模型")
                    }
                }
                .disabled(isLoading || !isEngineAvailable(appState.selectedEngine))

                Text("预加载模型可以加快首次转录速度")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .onChange(of: appState.selectedEngine) { newValue in
            // 切换引擎时，重置为该引擎的默认模型
            if let engine = staticEngines.first(where: { $0.name == newValue }),
               let firstModel = engine.models.first {
                // 选择合适的默认模型
                if newValue == "whisper" || newValue == "whispercpp" {
                    appState.selectedModel = "medium"
                } else if newValue == "funasr" {
                    appState.selectedModel = "paraformer-zh"
                } else {
                    appState.selectedModel = firstModel
                }
            }
        }
    }

    private var modelsForCurrentEngine: [String] {
        if let engine = staticEngines.first(where: { $0.name == appState.selectedEngine }) {
            return engine.models
        }
        return []
    }

    private func modelDisplayName(_ model: String) -> String {
        switch model {
        case "tiny": return "tiny (最快)"
        case "base": return "base"
        case "small": return "small"
        case "medium": return "medium (推荐)"
        case "large-v2": return "large-v2"
        case "large-v3": return "large-v3 (最准)"
        case "large": return "large"
        case "paraformer-zh": return "Paraformer 中文 (推荐)"
        case "paraformer-zh-streaming": return "Paraformer 流式"
        case "sensevoice-small": return "SenseVoice Small"
        case "parakeet-ctc-1.1b": return "Parakeet CTC 1.1B"
        case "parakeet-tdt-1.1b": return "Parakeet TDT 1.1B"
        default: return model
        }
    }

    @ViewBuilder
    private var modelDescription: some View {
        switch appState.selectedEngine {
        case "whisper", "whispercpp":
            Text("tiny/base: 速度快但准确率较低\nmedium: 速度与准确率平衡\nlarge: 最准确但较慢")
                .font(.caption)
                .foregroundColor(.secondary)
        case "funasr":
            Text("Paraformer: 标准中文识别\nSenseVoice: 支持更多语种")
                .font(.caption)
                .foregroundColor(.secondary)
        case "parakeet":
            Text("需要 NVIDIA GPU，主要针对英文优化")
                .font(.caption)
                .foregroundColor(.secondary)
        default:
            EmptyView()
        }
    }

    private func isEngineAvailable(_ name: String) -> Bool {
        // 检查后端返回的可用引擎
        if let engine = appState.availableEngines.first(where: { $0.name == name }) {
            return engine.available
        }
        // 后备：如果后端未连接，假设都可用（mock 模式）
        return appState.backendConnected || true
    }

    private func preloadModel() {
        isLoading = true

        Task {
            do {
                try await BackendService.shared.loadEngine(
                    engine: appState.selectedEngine,
                    model: appState.selectedModel
                )
            } catch {
                print("Failed to preload: \(error)")
            }

            await MainActor.run {
                isLoading = false
            }
        }
    }
}

// MARK: - Vocabulary Settings

struct VocabularySettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var newWord = ""

    var hotwordsList: [String] {
        appState.hotwords
            .split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("自定义词汇")
                .font(.headline)

            Text("添加人名、术语、品牌名等专有名词，可提高识别准确率。\n此功能主要对 FunASR 引擎有效。")
                .font(.caption)
                .foregroundColor(.secondary)

            Divider()

            // 添加新词汇
            HStack {
                TextField("输入词汇", text: $newWord)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit {
                        addWord()
                    }

                Button("添加") {
                    addWord()
                }
                .disabled(newWord.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            // 词汇列表
            if hotwordsList.isEmpty {
                Text("暂无自定义词汇")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
            } else {
                ScrollView {
                    FlowLayout(spacing: 8) {
                        ForEach(hotwordsList, id: \.self) { word in
                            HStack(spacing: 4) {
                                Text(word)
                                    .font(.system(size: 13))
                                Button(action: { removeWord(word) }) {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 12))
                                        .foregroundColor(.secondary)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.gray.opacity(0.15))
                            .cornerRadius(16)
                        }
                    }
                }
                .frame(height: 150)
            }

            Divider()

            HStack {
                Button("清空全部") {
                    appState.hotwords = ""
                }
                .disabled(hotwordsList.isEmpty)

                Spacer()

                Text("\(hotwordsList.count) 个词汇")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding()
    }

    private func addWord() {
        let word = newWord.trimmingCharacters(in: .whitespaces)
        guard !word.isEmpty else { return }

        if appState.hotwords.isEmpty {
            appState.hotwords = word
        } else {
            appState.hotwords += ",\(word)"
        }
        newWord = ""
    }

    private func removeWord(_ word: String) {
        var words = hotwordsList
        words.removeAll { $0 == word }
        appState.hotwords = words.joined(separator: ",")
    }
}

// MARK: - Flow Layout for Tags

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x,
                                       y: bounds.minY + result.positions[index].y),
                         proposal: .unspecified)
        }
    }

    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []

        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var rowHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)

                if x + size.width > maxWidth && x > 0 {
                    x = 0
                    y += rowHeight + spacing
                    rowHeight = 0
                }

                positions.append(CGPoint(x: x, y: y))
                rowHeight = max(rowHeight, size.height)
                x += size.width + spacing
            }

            self.size = CGSize(width: maxWidth, height: y + rowHeight)
        }
    }
}

// MARK: - Speaker Settings

struct SpeakerSettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var speakers: [SpeakerInfo] = []
    @State private var newSpeakerName = ""
    @State private var isRecording = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("说话人管理")
                .font(.headline)

            Text("注册说话人后，转录时可以自动识别每个人的发言。\n需要启用「说话人识别」功能。")
                .font(.caption)
                .foregroundColor(.secondary)

            Divider()

            // 已注册说话人列表
            if speakers.isEmpty {
                Text("暂无已注册说话人")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
            } else {
                List {
                    ForEach(speakers) { speaker in
                        HStack {
                            Image(systemName: "person.circle")
                                .foregroundColor(.blue)
                            Text(speaker.name)
                            Spacer()
                            Text(speaker.speakerId)
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Button(action: { deleteSpeaker(speaker) }) {
                                Image(systemName: "trash")
                                    .foregroundColor(.red)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(height: 150)
            }

            Divider()

            // 添加新说话人
            HStack {
                TextField("说话人姓名", text: $newSpeakerName)
                    .textFieldStyle(.roundedBorder)

                Button(action: recordAndRegister) {
                    HStack {
                        Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                        Text(isRecording ? "停止" : "录制声纹")
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(isRecording ? .red : .blue)
                .disabled(newSpeakerName.isEmpty)
            }

            Text("录制 5-10 秒的该说话人独白作为声纹样本")
                .font(.caption)
                .foregroundColor(.secondary)

            Spacer()
        }
        .padding()
        .onAppear {
            loadSpeakers()
        }
    }

    private func loadSpeakers() {
        Task {
            do {
                let list = try await BackendService.shared.listSpeakers()
                await MainActor.run {
                    speakers = list
                }
            } catch {
                print("Failed to load speakers: \(error)")
            }
        }
    }

    private func recordAndRegister() {
        let recorder = AudioRecorder.shared

        if isRecording {
            // 停止录制并注册
            if let url = recorder.stopRecording() {
                isRecording = false
                registerSpeaker(audioURL: url)
            }
        } else {
            // 先检查权限，再开始录制
            recorder.checkPermission { granted in
                if granted {
                    do {
                        _ = try recorder.startRecording()
                        isRecording = true
                    } catch {
                        print("Failed to start recording: \(error)")
                    }
                } else {
                    print("Microphone permission denied")
                }
            }
        }
    }

    private func registerSpeaker(audioURL: URL) {
        let speakerName = newSpeakerName  // 捕获当前名字
        print("[Speaker] Registering: \(speakerName), audio: \(audioURL.path)")

        Task {
            do {
                let speaker = try await BackendService.shared.registerSpeaker(
                    name: speakerName,
                    audioPath: audioURL.path
                )
                print("[Speaker] Registered successfully: \(speaker.name) (\(speaker.speakerId))")

                await MainActor.run {
                    speakers.append(speaker)
                    newSpeakerName = ""
                    print("[Speaker] UI updated, total speakers: \(speakers.count)")
                }
            } catch {
                print("[Speaker] Failed to register: \(error)")
            }
        }
    }

    private func deleteSpeaker(_ speaker: SpeakerInfo) {
        Task {
            do {
                try await BackendService.shared.deleteSpeaker(speakerId: speaker.speakerId)
                print("[Speaker] Deleted: \(speaker.name) (\(speaker.speakerId))")

                await MainActor.run {
                    speakers.removeAll { $0.speakerId == speaker.speakerId }
                }
            } catch {
                print("[Speaker] Failed to delete: \(error)")
            }
        }
    }
}

// MARK: - Hotkey Settings

struct HotkeySettingsView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedKey: String = "无"
    @State private var useCommand: Bool = true
    @State private var useShift: Bool = false
    @State private var useOption: Bool = true
    @State private var useControl: Bool = false

    let availableKeys = ["无", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
                         "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
                         "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]

    var body: some View {
        Form {
            Section("录音快捷键") {
                HStack {
                    Text("当前快捷键")
                    Spacer()
                    Text(HotkeyManager.shared.hotkeyDisplayString)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.gray.opacity(0.2))
                        .cornerRadius(6)
                        .font(.system(.body, design: .monospaced))
                }

                // 修饰键选择
                VStack(alignment: .leading, spacing: 8) {
                    Text("修饰键（至少选择一个）").font(.subheadline).foregroundColor(.secondary)
                    HStack(spacing: 16) {
                        Toggle("⌘ Command", isOn: $useCommand)
                        Toggle("⇧ Shift", isOn: $useShift)
                    }
                    HStack(spacing: 16) {
                        Toggle("⌥ Option", isOn: $useOption)
                        Toggle("⌃ Control", isOn: $useControl)
                    }
                }

                // 按键选择
                Picker("附加按键（可选）", selection: $selectedKey) {
                    ForEach(availableKeys, id: \.self) { key in
                        Text(key == "无" ? "无（仅修饰键）" : key).tag(key)
                    }
                }

                // 应用按钮
                HStack {
                    Spacer()
                    Button("应用快捷键") {
                        applyHotkey()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!hasValidModifier)
                }

                if !hasValidModifier {
                    Text("⚠️ 至少需要选择一个修饰键")
                        .font(.caption)
                        .foregroundColor(.red)
                } else {
                    Text("新快捷键预览: \(previewHotkey)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Section("使用方式") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top) {
                        Image(systemName: "hand.tap.fill")
                            .foregroundColor(.blue)
                            .frame(width: 24)
                        VStack(alignment: .leading) {
                            Text("长按模式")
                                .font(.subheadline.bold())
                            Text("按住快捷键录音，松开停止并转录")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    HStack(alignment: .top) {
                        Image(systemName: "hand.tap")
                            .foregroundColor(.green)
                            .frame(width: 24)
                        VStack(alignment: .leading) {
                            Text("双击模式")
                                .font(.subheadline.bold())
                            Text("快速双击开始持续录音，再按一次停止")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .padding()
        .onAppear {
            loadCurrentHotkey()
        }
    }

    var hasValidModifier: Bool {
        useCommand || useShift || useOption || useControl
    }

    var previewHotkey: String {
        var result = ""
        if useControl { result += "⌃" }
        if useOption { result += "⌥" }
        if useShift { result += "⇧" }
        if useCommand { result += "⌘" }
        if selectedKey != "无" {
            result += selectedKey
        }
        return result
    }

    private func loadCurrentHotkey() {
        let modifiers = appState.hotkeyModifiers
        useCommand = modifiers & 0x100000 != 0
        useShift = modifiers & 0x020000 != 0
        useOption = modifiers & 0x080000 != 0
        useControl = modifiers & 0x040000 != 0

        // 从 keyCode 获取当前按键
        let keyCode = appState.hotkeyKeyCode
        if keyCode == -1 {
            selectedKey = "无"
        } else {
            selectedKey = keyCodeToLetter(keyCode)
        }
    }

    private func applyHotkey() {
        // 构建修饰键
        var modifiers = 0
        if useCommand { modifiers |= 0x100000 }
        if useShift { modifiers |= 0x020000 }
        if useOption { modifiers |= 0x080000 }
        if useControl { modifiers |= 0x040000 }

        // 获取 keyCode (-1 表示仅修饰键)
        let keyCode = selectedKey == "无" ? -1 : letterToKeyCode(selectedKey)

        // 更新设置
        appState.hotkeyKeyCode = keyCode
        appState.hotkeyModifiers = modifiers

        // 重新注册快捷键
        HotkeyManager.shared.reregisterHotkey()

        print("[Hotkey] Applied: \(previewHotkey), keyCode=\(keyCode), modifiers=\(modifiers)")
    }

    private func letterToKeyCode(_ letter: String) -> Int {
        let keyMap: [String: Int] = [
            "A": 0, "S": 1, "D": 2, "F": 3, "H": 4, "G": 5, "Z": 6, "X": 7,
            "C": 8, "V": 9, "B": 11, "Q": 12, "W": 13, "E": 14, "R": 15,
            "Y": 16, "T": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22,
            "5": 23, "9": 25, "7": 26, "8": 28, "0": 29,
            "O": 31, "U": 32, "I": 34, "P": 35, "L": 37, "J": 38, "K": 40,
            "N": 45, "M": 46
        ]
        return keyMap[letter.uppercased()] ?? 15
    }

    private func keyCodeToLetter(_ keyCode: Int) -> String {
        let keyMap: [Int: String] = [
            0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X",
            8: "C", 9: "V", 11: "B", 12: "Q", 13: "W", 14: "E", 15: "R",
            16: "Y", 17: "T", 18: "1", 19: "2", 20: "3", 21: "4", 22: "6",
            23: "5", 25: "9", 26: "7", 28: "8", 29: "0",
            31: "O", 32: "U", 34: "I", 35: "P", 37: "L", 38: "J", 40: "K",
            45: "N", 46: "M"
        ]
        return keyMap[keyCode] ?? "R"
    }
}
