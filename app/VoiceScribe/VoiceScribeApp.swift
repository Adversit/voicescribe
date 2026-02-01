import SwiftUI

@main
struct VoiceScribeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var appState = AppState.shared
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        
        Settings {
            SettingsView()
                .environmentObject(appState)
        }
        
        MenuBarExtra("VoiceScribe", systemImage: appState.isRecording ? "mic.fill" : "mic") {
            MenuBarView()
                .environmentObject(appState)
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // 启动后端服务
        BackendManager.shared.start()

        // 延迟注册快捷键（等待 AppStorage 加载完成）
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            let state = AppState.shared
            print("[Hotkey] Registering with settings: keyCode=\(state.hotkeyKeyCode), modifiers=\(state.hotkeyModifiers)")
            print("[Hotkey] Display: \(HotkeyManager.shared.hotkeyDisplayString)")
            HotkeyManager.shared.register()
        }

        // 预加载用户选择的模型
        preloadSelectedModel()
    }

    func applicationWillTerminate(_ notification: Notification) {
        HotkeyManager.shared.unregister()

        // 停止后端服务
        BackendManager.shared.stop()
    }

    /// 预加载用户选择的引擎和模型
    private func preloadSelectedModel() {
        let state = AppState.shared

        // 确保模型与引擎匹配
        let model = getValidModel(engine: state.selectedEngine, currentModel: state.selectedModel)
        if model != state.selectedModel {
            print("[Preload] Fixing model mismatch: \(state.selectedModel) -> \(model)")
            state.selectedModel = model
        }

        // 等待后端就绪后预加载
        Task {
            // 等待后端启动（最多等待 30 秒）
            for _ in 0..<30 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if state.backendConnected {
                    break
                }
            }

            guard state.backendConnected else {
                print("[Preload] Backend not ready, skip preload")
                return
            }

            print("[Preload] Loading \(state.selectedEngine)/\(model)...")
            do {
                try await BackendService.shared.loadEngine(
                    engine: state.selectedEngine,
                    model: model
                )
                print("[Preload] Model loaded successfully!")
            } catch {
                print("[Preload] Failed: \(error)")
            }
        }
    }

    /// 获取与引擎匹配的有效模型
    private func getValidModel(engine: String, currentModel: String) -> String {
        let engineModels: [String: [String]] = [
            "whisper": ["tiny", "base", "small", "medium", "large-v2", "large-v3"],
            "whispercpp": ["tiny", "base", "small", "medium", "large"],
            "funasr": ["paraformer-zh", "seaco-paraformer", "sensevoice-small"],
            "parakeet": ["parakeet-ctc-1.1b", "parakeet-tdt-1.1b"]
        ]

        let defaultModels: [String: String] = [
            "whisper": "medium",
            "whispercpp": "medium",
            "funasr": "paraformer-zh",
            "parakeet": "parakeet-ctc-1.1b"
        ]

        // 如果当前模型在引擎支持列表中，使用它
        if let models = engineModels[engine], models.contains(currentModel) {
            return currentModel
        }

        // 否则使用该引擎的默认模型
        return defaultModels[engine] ?? currentModel
    }
}
