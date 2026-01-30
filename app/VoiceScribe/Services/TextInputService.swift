import Foundation
import Cocoa
import Carbon

/// 文本输入服务 - 使用 CGEvent 模拟键盘输入
class TextInputService {
    static let shared = TextInputService()

    private init() {}

    // MARK: - Permission Check

    /// 检查辅助功能权限（不弹出提示）
    func hasAccessibilityPermission() -> Bool {
        return AXIsProcessTrusted()
    }

    /// 检查辅助功能权限（弹出授权提示）
    func checkAccessibilityPermission() -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    /// 打开系统设置的辅助功能页面
    func openAccessibilitySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Text Input

    /// 使用 CGEvent 模拟键盘输入文本到当前焦点应用
    /// - Parameter text: 要输入的文本
    func typeText(_ text: String) {
        // 如果没有权限，使用剪贴板+粘贴方式作为备选
        guard hasAccessibilityPermission() else {
            print("[TextInput] No accessibility permission, falling back to paste method")
            pasteText(text)
            return
        }

        let source = CGEventSource(stateID: .hidSystemState)

        for char in text {
            typeCharacter(char, source: source)
        }
    }

    /// 输入单个字符
    private func typeCharacter(_ char: Character, source: CGEventSource?) {
        let string = String(char)
        var buffer = Array(string.utf16)

        // Key down event
        if let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true) {
            keyDown.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: &buffer)
            keyDown.post(tap: .cgAnnotatedSessionEventTap)
        }

        // Key up event
        if let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) {
            keyUp.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: &buffer)
            keyUp.post(tap: .cgAnnotatedSessionEventTap)
        }

        // 短暂延迟确保输入稳定
        usleep(500)
    }

    /// 使用剪贴板 + 粘贴方式输入文本（备选方案）
    /// - Parameter text: 要输入的文本
    func pasteText(_ text: String) {
        print("[TextInput] pasteText called with: \(text.prefix(50))...")

        // 设置剪贴板内容
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        print("[TextInput] Text copied to clipboard")

        // 使用 CGEvent 执行粘贴，避免 AppleScript 失败时重复粘贴
        let source = CGEventSource(stateID: .hidSystemState)
        if let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true) {
            keyDown.flags = .maskCommand
            keyDown.post(tap: .cgAnnotatedSessionEventTap)
        }
        if let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false) {
            keyUp.flags = .maskCommand
            keyUp.post(tap: .cgAnnotatedSessionEventTap)
        }
        print("[TextInput] CGEvent paste sent")
    }
}
