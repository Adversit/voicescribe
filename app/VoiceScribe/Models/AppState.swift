import SwiftUI
import Combine

/// 全局应用状态
class AppState: ObservableObject {
    static let shared = AppState()
    
    // MARK: - Recording State
    @Published var isRecording = false
    @Published var recordingDuration: TimeInterval = 0
    @Published var audioLevel: Float = 0
    
    // MARK: - Transcription State
    @Published var isTranscribing = false
    @Published var recordingCancelled = false  // ESC 取消录音时短暂显示
    @Published var transcriptions: [Transcription] = []
    @Published var currentTranscription: Transcription?
    
    // MARK: - Settings
    @AppStorage("selectedEngine") var selectedEngine = "funasr"
    @AppStorage("selectedModel") var selectedModel = "seaco-paraformer"
    @AppStorage("language") var language = "zh"
    @AppStorage("enableDiarization") var enableDiarization = false
    @AppStorage("hotkeyModifiers") var hotkeyModifiers: Int = 0x120000 // ⌘⇧
    @AppStorage("hotkeyKeyCode") var hotkeyKeyCode: Int = 15 // R

    // MARK: - Output Settings
    /// 输出模式: directInput(直接输入) | clipboard(剪贴板) | both(两者都执行)
    @AppStorage("outputMode") var outputMode = "directInput"

    // MARK: - Vocabulary
    /// 自定义热词（逗号分隔）
    @AppStorage("hotwords") var hotwords = ""

    // MARK: - AI Refine
    /// 启用 AI 文本优化
    @AppStorage("enableAIRefine") var enableAIRefine = false
    
    // MARK: - Backend Status
    @Published var backendConnected = false
    @Published var availableEngines: [EngineInfo] = []
    
    private var cancellables = Set<AnyCancellable>()
    private var connectionCheckTimer: Timer?

    private init() {
        // 启动定期检查后端连接
        startConnectionMonitor()
    }

    /// 启动连接监控（每 2 秒检查一次，直到连接成功后改为 10 秒）
    func startConnectionMonitor() {
        // 立即检查一次
        checkBackendConnection()

        // 定期检查
        scheduleConnectionTimer(interval: 2.0)
    }

    func checkBackendConnection() {
        Task {
            do {
                let engines = try await BackendService.shared.listEngines()
                await MainActor.run {
                    self.availableEngines = engines
                    if !self.backendConnected {
                        self.backendConnected = true
                        // 连接成功后，降低检查频率
                        self.scheduleConnectionTimer(interval: 10.0)
                    }
                }
            } catch {
                await MainActor.run {
                    if self.backendConnected {
                        self.backendConnected = false
                        // 断开连接后，提高检查频率
                        self.scheduleConnectionTimer(interval: 2.0)
                    }
                }
            }
        }
    }

    private func scheduleConnectionTimer(interval: TimeInterval) {
        connectionCheckTimer?.invalidate()
        connectionCheckTimer = Timer.scheduledTimer(
            timeInterval: interval,
            target: self,
            selector: #selector(handleConnectionTimer(_:)),
            userInfo: nil,
            repeats: true
        )
    }

    @objc private func handleConnectionTimer(_ timer: Timer) {
        checkBackendConnection()
    }
}

/// 转录结果
struct Transcription: Identifiable, Codable, Hashable {
    let id: UUID
    let date: Date
    let duration: TimeInterval
    var text: String
    var segments: [Segment]
    let engine: String
    let model: String
    let audioPath: String?
    
    struct Segment: Codable, Identifiable, Hashable {
        var id: String { "\(start)-\(end)" }
        let start: Double
        let end: Double
        var text: String
        var speaker: String?
    }
    
    // Hashable 实现（基于 id）
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
    
    static func == (lhs: Transcription, rhs: Transcription) -> Bool {
        lhs.id == rhs.id
    }
}

/// ASR 引擎信息
struct EngineInfo: Codable, Identifiable {
    var id: String { name }
    let name: String
    let models: [String]
    let loadedModel: String?
    let available: Bool

    enum CodingKeys: String, CodingKey {
        case name, models, available
        case loadedModel = "loaded_model"
    }

    /// 引擎显示名称
    var displayName: String {
        switch name {
        case "whisper": return "Whisper"
        case "whispercpp": return "Whisper.cpp"
        case "funasr": return "FunASR"
        case "parakeet": return "Parakeet"
        default: return name
        }
    }

    /// 引擎描述
    var description: String {
        switch name {
        case "whisper": return "OpenAI Whisper，多语言支持"
        case "whispercpp": return "Whisper.cpp，轻量高效"
        case "funasr": return "阿里 FunASR，中文优化"
        case "parakeet": return "NVIDIA Parakeet，英文优化"
        default: return ""
        }
    }
}
