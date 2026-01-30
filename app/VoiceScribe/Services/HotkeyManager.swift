import Foundation
import AppKit

/// 全局事件 tap 回调 (必须是全局函数)
private func hotkeyEventTapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    // 处理 tap 被禁用的情况
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = HotkeyManager.shared.getEventTap() {
            CGEvent.tapEnable(tap: tap, enable: true)
        }
        return Unmanaged.passRetained(event)
    }

    guard type == .keyDown || type == .keyUp || type == .flagsChanged else {
        return Unmanaged.passRetained(event)
    }

    let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
    let isRepeat = type == .keyDown && event.getIntegerValueField(.keyboardEventAutorepeat) != 0

    let shouldConsume = HotkeyManager.shared.handleEventTap(
        type: type,
        keyCode: Int(keyCode),
        flags: event.flags,
        isRepeat: isRepeat
    )

    if shouldConsume {
        return nil
    }

    return Unmanaged.passRetained(event)
}

/// 全局快捷键管理
class HotkeyManager {
    static let shared = HotkeyManager()

    // 全局事件监听 (使用 CGEventTap)
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var eventTapRunLoop: CFRunLoop?
    private var eventTapThread: Thread?

    // 录音模式追踪
    private var lastPressTime: Date?
    private var isHotkeyPressed = false
    private var isLongPressMode = false
    private var doubleTapTimer: Timer?

    // 双击检测时间阈值（毫秒）
    private let doubleTapThreshold: TimeInterval = 0.35

    /// 记录开始录音时的前台应用，用于转录完成后切换回去
    private var previousApp: NSRunningApplication?

    private init() {}

    /// 获取事件 tap (供回调函数使用)
    func getEventTap() -> CFMachPort? {
        return eventTap
    }

    /// 取消录音 (供回调函数使用)
    func cancelRecording() {
        handleEscapeKey()
    }

    /// 注册快捷键
    func register() {
        registerEventTap()
    }

    /// 注册全局事件监听 (使用 CGEventTap 实现全局监听)
    private func registerEventTap() {
        // 先检查辅助功能权限
        if !AXIsProcessTrusted() {
            print("[Hotkey] Accessibility permission not granted, prompting user...")
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(options)
            // 权限可能需要用户授权后重启应用才能生效
        }

        if eventTapThread != nil {
            return
        }

        let thread = Thread { [weak self] in
            self?.setupEventTapOnCurrentRunLoop()
        }
        thread.name = "VoiceScribe.HotkeyEventTap"
        thread.start()
        eventTapThread = thread
    }

    private func setupEventTapOnCurrentRunLoop() {
        let eventMask =
            (1 << CGEventType.keyDown.rawValue) |
            (1 << CGEventType.keyUp.rawValue) |
            (1 << CGEventType.flagsChanged.rawValue)

        let tap = createEventTap(location: .cgSessionEventTap, eventMask: eventMask)
            ?? createEventTap(location: .cghidEventTap, eventMask: eventMask)

        guard let tap else {
            print("[Hotkey] Failed to create CGEventTap for hotkey listener.")
            print("[Hotkey] Please grant accessibility permission in System Settings > Privacy & Security > Accessibility")
            print("[Hotkey] If still not working, try granting Input Monitoring permission as well.")
            return
        }

        eventTap = tap

        let runLoop = CFRunLoopGetCurrent()
        eventTapRunLoop = runLoop

        let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        self.runLoopSource = runLoopSource

        CFRunLoopAddSource(runLoop, runLoopSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)

        print("[Hotkey] CGEventTap registered successfully")
        CFRunLoopRun()
    }

    private func createEventTap(location: CGEventTapLocation, eventMask: Int) -> CFMachPort? {
        let tap = CGEvent.tapCreate(
            tap: location,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: CGEventMask(eventMask),
            callback: hotkeyEventTapCallback,
            userInfo: nil
        )

        if tap == nil {
            let locationName = (location == .cghidEventTap) ? "cghidEventTap" : "cgSessionEventTap"
            print("[Hotkey] CGEventTap create failed at \(locationName)")
        }

        return tap
    }

    /// 处理 ESC 键 - 取消录音
    private func handleEscapeKey() {
        let recorder = AudioRecorder.shared
        let state = AppState.shared

        guard recorder.isRecording else { return }

        print("[Hotkey] ESC pressed, cancelling recording")

        // 停止录音但不转录
        _ = recorder.stopRecording()
        state.isRecording = false

        // 显示"已取消"提示
        state.recordingCancelled = true

        // 重置状态
        previousApp = nil
        isLongPressMode = false
        doubleTapTimer?.invalidate()
        doubleTapTimer = nil

        // 1秒后隐藏悬浮窗并重置取消状态
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            state.recordingCancelled = false
            RecordingOverlayManager.shared.hideRecordingIndicator()
        }
    }

    /// 统一处理事件 tap
    func handleEventTap(type: CGEventType, keyCode: Int, flags: CGEventFlags, isRepeat: Bool) -> Bool {
        // ESC 键的 keyCode 是 53
        if type == .keyDown && keyCode == 53 && AudioRecorder.shared.isRecording {
            print("[Hotkey] ESC detected via CGEventTap, cancelling recording")
            DispatchQueue.main.async {
                self.handleEscapeKey()
            }
            return true
        }

        let state = AppState.shared
        let targetModifiers = state.hotkeyModifiers
        let currentModifiers = modifiers(from: flags)

        if state.hotkeyKeyCode == -1 {
            guard type == .flagsChanged else { return false }

            let isMatch = (currentModifiers & targetModifiers) == targetModifiers &&
                          currentModifiers != 0

            if isMatch && !isHotkeyPressed {
                isHotkeyPressed = true
                DispatchQueue.main.async {
                    self.handleHotkeyDown()
                }
            } else if !isMatch && isHotkeyPressed {
                isHotkeyPressed = false
                DispatchQueue.main.async {
                    self.handleHotkeyUp()
                }
            }

            return false
        }

        if isRepeat {
            return false
        }

        if type == .keyDown &&
            keyCode == state.hotkeyKeyCode &&
            (currentModifiers & targetModifiers) == targetModifiers {
            if !isHotkeyPressed {
                isHotkeyPressed = true
                DispatchQueue.main.async {
                    self.handleHotkeyDown()
                }
            }
            return true
        }

        if type == .keyUp && keyCode == state.hotkeyKeyCode && isHotkeyPressed {
            isHotkeyPressed = false
            DispatchQueue.main.async {
                self.handleHotkeyUp()
            }
            return true
        }

        return false
    }

    /// 快捷键按下
    private func handleHotkeyDown() {
        let now = Date()

        // 检查是否是双击
        if let lastPress = lastPressTime, now.timeIntervalSince(lastPress) < doubleTapThreshold {
            // 双击检测到 - 取消长按检测定时器
            doubleTapTimer?.invalidate()
            doubleTapTimer = nil
            lastPressTime = nil
            isLongPressMode = false

            print("[Hotkey] Double-tap detected")
            handleDoubleTap()
        } else {
            // 第一次按下或间隔太长
            lastPressTime = now
            isLongPressMode = true

            // 启动长按检测 - 如果在阈值时间内没有释放，认为是长按
            doubleTapTimer?.invalidate()
            doubleTapTimer = Timer.scheduledTimer(withTimeInterval: doubleTapThreshold, repeats: false) { [weak self] _ in
                guard let self = self, self.isLongPressMode else { return }
                print("[Hotkey] Long press started")
                self.startRecording()
            }
        }
    }

    /// 快捷键释放
    private func handleHotkeyUp() {
        // 如果是长按模式且正在录音，停止录音
        if isLongPressMode && AudioRecorder.shared.isRecording {
            print("[Hotkey] Long press released, stopping recording")
            stopRecordingAndTranscribe()
        }

        // 取消长按定时器（如果还在等待）
        doubleTapTimer?.invalidate()
        doubleTapTimer = nil
        isLongPressMode = false
    }

    /// 处理双击 - 切换录音状态
    private func handleDoubleTap() {
        if AudioRecorder.shared.isRecording {
            print("[Hotkey] Double-tap: stopping recording")
            stopRecordingAndTranscribe()
        } else {
            print("[Hotkey] Double-tap: starting recording")
            startRecording()
        }
    }

    /// 开始录音
    private func startRecording() {
        let state = AppState.shared
        let recorder = AudioRecorder.shared

        guard !recorder.isRecording else { return }

        // 记录当前前台应用
        previousApp = NSWorkspace.shared.frontmostApplication
        print("[Hotkey] Saved previous app: \(previousApp?.localizedName ?? "unknown")")

        recorder.checkPermission { [weak self] granted in
            if granted {
                do {
                    _ = try recorder.startRecording()
                    state.isRecording = true
                    RecordingOverlayManager.shared.showRecordingIndicator()
                } catch {
                    print("[Hotkey] Failed to start recording: \(error)")
                    self?.previousApp = nil
                }
            } else {
                print("[Hotkey] Microphone permission denied")
                self?.previousApp = nil
                if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") {
                    NSWorkspace.shared.open(url)
                }
            }
        }
    }

    /// 停止录音并转录
    private func stopRecordingAndTranscribe() {
        let state = AppState.shared
        let recorder = AudioRecorder.shared

        guard recorder.isRecording else { return }

        if let audioURL = recorder.stopRecording() {
            state.isRecording = false
            transcribe(audioURL: audioURL)
        }
    }

    /// 重新注册快捷键
    func reregisterHotkey() {
        unregister()
        register()
    }

    /// 获取快捷键显示字符串
    var hotkeyDisplayString: String {
        let state = AppState.shared
        var result = ""

        let modifiers = state.hotkeyModifiers

        if modifiers & 0x040000 != 0 { result += "⌃" }
        if modifiers & 0x080000 != 0 { result += "⌥" }
        if modifiers & 0x020000 != 0 { result += "⇧" }
        if modifiers & 0x100000 != 0 { result += "⌘" }

        let keyCode = state.hotkeyKeyCode
        if keyCode != -1 {
            result += keyCodeToString(keyCode)
        }

        return result.isEmpty ? "未设置" : result
    }

    private func keyCodeToString(_ keyCode: Int) -> String {
        let keyMap: [Int: String] = [
            0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X",
            8: "C", 9: "V", 11: "B", 12: "Q", 13: "W", 14: "E", 15: "R",
            16: "Y", 17: "T", 18: "1", 19: "2", 20: "3", 21: "4", 22: "6",
            23: "5", 24: "=", 25: "9", 26: "7", 27: "-", 28: "8", 29: "0",
            31: "O", 32: "U", 34: "I", 35: "P", 37: "L", 38: "J", 40: "K",
            45: "N", 46: "M", 49: "Space"
        ]
        return keyMap[keyCode] ?? ""
    }

    private func modifiers(from flags: CGEventFlags) -> Int {
        var result = 0

        if flags.contains(.maskCommand) { result |= 0x100000 }
        if flags.contains(.maskShift) { result |= 0x020000 }
        if flags.contains(.maskAlternate) { result |= 0x080000 }
        if flags.contains(.maskControl) { result |= 0x040000 }

        return result
    }

    /// 取消注册
    func unregister() {
        // 取消事件监听 (CGEventTap)
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
            if let source = runLoopSource {
                if let runLoop = eventTapRunLoop {
                    CFRunLoopRemoveSource(runLoop, source, .commonModes)
                }
            }
            eventTap = nil
            runLoopSource = nil
        }
        if let runLoop = eventTapRunLoop {
            CFRunLoopStop(runLoop)
        }
        eventTapRunLoop = nil
        eventTapThread = nil

        // 重置状态
        doubleTapTimer?.invalidate()
        doubleTapTimer = nil
        isHotkeyPressed = false
        isLongPressMode = false
        lastPressTime = nil
    }

    private func transcribe(audioURL: URL) {
        let state = AppState.shared
        state.isTranscribing = true

        print("[Transcribe] Starting with engine=\(state.selectedEngine), model=\(state.selectedModel), language=\(state.language)")

        Task {
            do {
                let result = try await BackendService.shared.transcribe(
                    audioPath: audioURL.path,
                    engine: state.selectedEngine,
                    model: state.selectedModel,
                    language: state.language,
                    enableDiarization: state.enableDiarization,
                    hotwords: state.hotwords
                )
                print("[Transcribe] Success: \(result.text)")

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

                    state.transcriptions.insert(transcription, at: 0)
                    state.currentTranscription = transcription
                    state.isTranscribing = false

                    RecordingOverlayManager.shared.hideRecordingIndicator()
                    self.handleTranscriptionOutput(result.text)
                }
            } catch {
                await MainActor.run {
                    state.isTranscribing = false
                    RecordingOverlayManager.shared.hideRecordingIndicator()
                    print("[Transcribe] Error: \(error)")
                }
            }
        }
    }

    private func handleTranscriptionOutput(_ text: String) {
        let outputMode = AppState.shared.outputMode
        print("[Output] Mode: \(outputMode), Text: \(text.prefix(50))...")

        if outputMode == "clipboard" {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            print("[Output] Copied to clipboard")
            return
        }

        if let app = previousApp {
            print("[Output] Activating previous app: \(app.localizedName ?? "unknown")")
            app.activate()
            Thread.sleep(forTimeInterval: 0.2)
        }
        previousApp = nil

        TextInputService.shared.pasteText(text)
    }
}
