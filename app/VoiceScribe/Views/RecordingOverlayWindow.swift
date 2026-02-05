import SwiftUI
import AppKit

/// 录音状态悬浮窗口
class RecordingOverlayWindow: NSWindow {
    static let shared = RecordingOverlayWindow()

    private var hostingView: NSHostingView<RecordingOverlayView>?

    private init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 60),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        // 窗口配置
        self.isOpaque = false
        self.backgroundColor = .clear
        self.level = .floating  // 悬浮在其他窗口之上
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        self.isMovableByWindowBackground = true
        self.hasShadow = true

        // 设置内容视图 - 使用自动尺寸
        let overlayView = RecordingOverlayView()
        let hostingView = NSHostingView(rootView: overlayView)
        hostingView.translatesAutoresizingMaskIntoConstraints = false
        self.contentView = hostingView
        self.hostingView = hostingView

        // 让窗口根据内容自动调整大小
        hostingView.setContentHuggingPriority(.defaultHigh, for: .horizontal)
        hostingView.setContentHuggingPriority(.defaultHigh, for: .vertical)

        // 默认位置：屏幕底部中央
        positionAtBottomCenter()
    }

    func positionAtBottomCenter() {
        guard let screen = NSScreen.main else { return }
        let screenFrame = screen.visibleFrame
        let x = screenFrame.midX - self.frame.width / 2
        let y = screenFrame.minY + 40
        self.setFrameOrigin(NSPoint(x: x, y: y))
    }

    func show() {
        positionAtBottomCenter()
        self.orderFront(nil)
    }

    func hide() {
        self.orderOut(nil)
    }
}

/// 录音状态悬浮视图
struct RecordingOverlayView: View {
    @StateObject private var recorder = AudioRecorder.shared
    @StateObject private var appState = AppState.shared
    @State private var isHovering = false

    var body: some View {
        HStack(spacing: 12) {
            if appState.recordingCancelled {
                // 取消状态：显示已取消
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.orange)

                Text("已取消")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.9))
            } else if appState.isTranscribing {
                // 转录状态：显示跳动的点
                ThinkingDotsView()
            } else {
                // 录音指示灯
                Circle()
                    .fill(Color.white)
                    .frame(width: 10, height: 10)
                    .opacity(recorder.isRecording ? 1 : 0.3)
                    .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: recorder.isRecording)

                // 声波动画
                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { index in
                        SoundWaveBar(
                            level: recorder.audioLevel,
                            index: index,
                            isRecording: recorder.isRecording
                        )
                    }
                }
                .frame(width: 40, height: 30)

                // 录音时长 或 取消提示
                if isHovering {
                    Text("点击取消")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.9))
                } else {
                    Text(formatDuration(recorder.duration))
                        .font(.system(size: 14, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)
                }
            }
        }
        .frame(minWidth: 140)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isHovering && recorder.isRecording ? Color.red.opacity(0.85) : Color.black.opacity(0.85))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isHovering && recorder.isRecording ? Color.red.opacity(0.6) : Color.white.opacity(0.3), lineWidth: 1)
        )
        .onHover { hovering in
            isHovering = hovering
        }
        .onTapGesture {
            // 点击悬浮窗取消录音
            if recorder.isRecording {
                HotkeyManager.shared.cancelRecording()
            }
        }
        .help(recorder.isRecording ? "点击取消录音" : "")
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

/// 声波条
struct SoundWaveBar: View {
    let level: Float
    let index: Int
    let isRecording: Bool

    @State private var animatedHeight: CGFloat = 0.2

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(Color.white)
            .frame(width: 4, height: barHeight)
            .animation(.easeInOut(duration: 0.1), value: animatedHeight)
            .onChange(of: level) { _, newValue in
                if isRecording {
                    // 根据音量和索引计算高度，添加随机变化
                    let baseHeight = CGFloat(newValue) * 25
                    let variation = CGFloat.random(in: -3...3)
                    let indexOffset = CGFloat(abs(index - 2)) * 2
                    animatedHeight = max(4, min(25, baseHeight + variation - indexOffset))
                }
            }
            .onChange(of: isRecording) { _, newValue in
                if !newValue {
                    animatedHeight = 4
                }
            }
    }

    private var barHeight: CGFloat {
        isRecording ? animatedHeight : 4
    }
}

/// 思考中动画（跳动的点）
struct ThinkingDotsView: View {
    @State private var dotScales: [CGFloat] = [1, 1, 1]

    var body: some View {
        HStack(spacing: 6) {
            Text("thinking")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white.opacity(0.9))

            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color.white)
                        .frame(width: 6, height: 6)
                        .scaleEffect(dotScales[index])
                }
            }
        }
        .onAppear {
            animateDots()
        }
    }

    private func animateDots() {
        for i in 0..<3 {
            withAnimation(
                Animation.easeInOut(duration: 0.4)
                    .repeatForever(autoreverses: true)
                    .delay(Double(i) * 0.15)
            ) {
                dotScales[i] = 0.5
            }
        }
    }
}

// MARK: - Recording Overlay Manager

/// 管理录音悬浮窗的显示/隐藏
class RecordingOverlayManager {
    static let shared = RecordingOverlayManager()

    private init() {}

    func showRecordingIndicator() {
        DispatchQueue.main.async {
            RecordingOverlayWindow.shared.show()
        }
    }

    func hideRecordingIndicator() {
        DispatchQueue.main.async {
            RecordingOverlayWindow.shared.hide()
        }
    }
}
