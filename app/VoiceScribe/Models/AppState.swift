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
    @AppStorage("selectedEngine") var selectedEngine = "whispercpp"
    @AppStorage("selectedModel") var selectedModel = "medium"
    @AppStorage("language") var language = "zh"
    @AppStorage("enableDiarization") var enableDiarization = false
    @AppStorage("hotkeyModifiers") var hotkeyModifiers: Int = 0x100108 // ⌘⇧
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
    
    private init() {
        // 启动时检查后端连接
        checkBackendConnection()
    }
    
    func checkBackendConnection() {
        Task {
            do {
                let engines = try await BackendService.shared.listEngines()
                await MainActor.run {
                    self.availableEngines = engines
                    self.backendConnected = true
                }
            } catch {
                await MainActor.run {
                    self.backendConnected = false
                }
            }
        }
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
