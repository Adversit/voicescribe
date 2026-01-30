import SwiftUI

/// 菜单栏视图
struct MenuBarView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var recorder = AudioRecorder.shared
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // 录音状态
            HStack {
                Image(systemName: recorder.isRecording ? "mic.fill" : "mic")
                    .foregroundColor(recorder.isRecording ? .red : .primary)
                Text(recorder.isRecording ? "录音中..." : "待命")
                Spacer()
                if recorder.isRecording {
                    Text(formatDuration(recorder.duration))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal)
            
            Divider()
            
            // 快速操作
            Button(action: toggleRecording) {
                Label(recorder.isRecording ? "停止录音" : "开始录音", 
                      systemImage: recorder.isRecording ? "stop.fill" : "mic.fill")
            }
            .keyboardShortcut("R", modifiers: [.command, .shift])
            
            Divider()
            
            // 最近转录
            if let recent = appState.transcriptions.first {
                VStack(alignment: .leading, spacing: 4) {
                    Text("最近转录")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text(recent.text.prefix(100) + (recent.text.count > 100 ? "..." : ""))
                        .font(.caption)
                        .lineLimit(3)
                }
                .padding(.horizontal)
                
                Button(action: copyLastTranscription) {
                    Label("复制最近结果", systemImage: "doc.on.doc")
                }
            }
            
            Divider()
            
            // 设置
            Button(action: openSettings) {
                Label("设置...", systemImage: "gear")
            }
            .keyboardShortcut(",", modifiers: .command)
            
            // 显示主窗口
            Button(action: showMainWindow) {
                Label("打开主窗口", systemImage: "macwindow")
            }
            
            Divider()
            
            // 退出
            Button(action: {
                NSApplication.shared.terminate(nil)
            }) {
                Label("退出 VoiceScribe", systemImage: "power")
            }
            .keyboardShortcut("Q", modifiers: .command)
        }
        .padding(.vertical, 8)
    }
    
    private func toggleRecording() {
        if recorder.isRecording {
            if let url = recorder.stopRecording() {
                appState.isRecording = false
                transcribe(audioURL: url)
            }
        } else {
            do {
                _ = try recorder.startRecording()
                appState.isRecording = true
            } catch {
                print("Failed to start recording: \(error)")
            }
        }
    }
    
    private func transcribe(audioURL: URL) {
        appState.isTranscribing = true
        
        Task {
            do {
                let result = try await BackendService.shared.transcribe(
                    audioPath: audioURL.path,
                    engine: appState.selectedEngine,
                    model: appState.selectedModel,
                    language: appState.language,
                    enableDiarization: appState.enableDiarization,
                    hotwords: appState.hotwords,
                    enableAIRefine: appState.enableAIRefine
                )
                
                await MainActor.run {
                    let transcription = Transcription(
                        id: UUID(),
                        date: Date(),
                        duration: result.duration,
                        text: result.text,
                        segments: result.segments.map {
                            Transcription.Segment(
                                start: $0.start,
                                end: $0.end,
                                text: $0.text,
                                speaker: $0.speaker
                            )
                        },
                        engine: result.engine,
                        model: result.model,
                        audioPath: audioURL.path
                    )
                    
                    appState.transcriptions.insert(transcription, at: 0)
                    appState.isTranscribing = false
                }
            } catch {
                await MainActor.run {
                    appState.isTranscribing = false
                }
            }
        }
    }
    
    private func copyLastTranscription() {
        if let recent = appState.transcriptions.first {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(recent.text, forType: .string)
        }
    }
    
    private func openSettings() {
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
    
    private func showMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        if let window = NSApp.windows.first(where: { $0.title == "VoiceScribe" || $0.identifier?.rawValue.contains("ContentView") == true }) {
            window.makeKeyAndOrderFront(nil)
        }
    }
    
    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

