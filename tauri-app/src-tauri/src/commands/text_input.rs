use arboard::Clipboard;
use chrono::Utc;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Serialize;
use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    SetForegroundWindow,
};

#[derive(Clone, Debug, Serialize)]
pub struct TargetContext {
    pub app_kind: String,
    pub executable_name: Option<String>,
    pub captured_at: String,
}

#[derive(Clone, Debug)]
struct TargetWindowSnapshot {
    hwnd: isize,
    context: TargetContext,
}

static TARGET_WINDOW: OnceLock<Mutex<Option<TargetWindowSnapshot>>> = OnceLock::new();

fn target_window() -> &'static Mutex<Option<TargetWindowSnapshot>> {
    TARGET_WINDOW.get_or_init(|| Mutex::new(None))
}

fn classify_app_kind(title: &str) -> &'static str {
    let title = title.to_lowercase();
    let rules = [
        (
            "code",
            ["visual studio code", "cursor", "pycharm", "intellij"],
        ),
        (
            "terminal",
            [
                "powershell",
                "command prompt",
                "windows terminal",
                "cmd.exe",
            ],
        ),
        ("chat", ["slack", "discord", "microsoft teams", "telegram"]),
        ("email", ["outlook", "mail", "thunderbird", "gmail"]),
        (
            "document",
            ["microsoft word", "notion", "obsidian", "wordpad"],
        ),
        (
            "browser",
            ["google chrome", "microsoft edge", "firefox", "brave"],
        ),
    ];
    for (kind, patterns) in rules {
        if patterns.iter().any(|pattern| title.contains(pattern)) {
            return kind;
        }
    }
    "other"
}

fn window_title(hwnd: HWND) -> String {
    let title_length = unsafe { GetWindowTextLengthW(hwnd) };
    if title_length <= 0 {
        return String::new();
    }
    let mut buffer = vec![0u16; title_length as usize + 1];
    let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    String::from_utf16_lossy(&buffer[..copied as usize])
}

pub fn remember_foreground_window() {
    let hwnd = unsafe { GetForegroundWindow() };
    if !hwnd.0.is_null() {
        let context = TargetContext {
            app_kind: if is_self_window(hwnd) {
                "unknown".to_string()
            } else {
                classify_app_kind(&window_title(hwnd)).to_string()
            },
            executable_name: None,
            captured_at: Utc::now().to_rfc3339(),
        };
        if let Ok(mut guard) = target_window().lock() {
            *guard = Some(TargetWindowSnapshot {
                hwnd: hwnd.0 as isize,
                context,
            });
        }
    }
}

pub fn clear_previous_window() {
    if let Ok(mut guard) = target_window().lock() {
        *guard = None;
    }
}

#[tauri::command]
pub fn get_target_context() -> Option<TargetContext> {
    target_window()
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|snapshot| snapshot.context.clone()))
}

fn is_self_window(hwnd: HWND) -> bool {
    if hwnd.0.is_null() {
        return false;
    }

    let mut pid = 0u32;
    unsafe {
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    pid == std::process::id()
}

fn write_clipboard(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|err| err.to_string())?;
    clipboard
        .set_text(text.to_string())
        .map_err(|err| err.to_string())
}

fn paste_into_previous_window() -> Result<(), String> {
    let hwnd = target_window()
        .lock()
        .map_err(|_| "Previous window mutex poisoned")?
        .as_ref()
        .map(|snapshot| snapshot.hwnd)
        .unwrap_or(0);

    if hwnd == 0 {
        return Ok(());
    }

    let hwnd = HWND(hwnd as *mut c_void);
    if is_self_window(hwnd) {
        return Ok(());
    }

    unsafe {
        let _ = SetForegroundWindow(hwnd);
    }
    thread::sleep(Duration::from_millis(200));

    let mut enigo = Enigo::new(&Settings::default()).map_err(|err| err.to_string())?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|err| err.to_string())?;
    enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|err| err.to_string())?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::classify_app_kind;

    #[test]
    fn classifies_common_target_app_titles() {
        assert_eq!(classify_app_kind("README.md - Visual Studio Code"), "code");
        assert_eq!(classify_app_kind("Inbox - Outlook"), "email");
        assert_eq!(classify_app_kind("Project chat | Slack"), "chat");
        assert_eq!(
            classify_app_kind("Administrator: Windows PowerShell"),
            "terminal"
        );
        assert_eq!(classify_app_kind("VoiceScribe settings"), "other");
    }
}

#[tauri::command]
pub fn output_text(mode: String, text: String) -> Result<(), String> {
    let current_hwnd = unsafe { GetForegroundWindow() };
    let mut effective_mode = mode.as_str();

    if mode == "directInput" && is_self_window(current_hwnd) {
        effective_mode = "clipboard";
    }
    if mode == "both" && is_self_window(current_hwnd) {
        effective_mode = "clipboard";
    }

    match effective_mode {
        "clipboard" => write_clipboard(&text),
        "directInput" => {
            write_clipboard(&text)?;
            paste_into_previous_window()
        }
        "both" => {
            write_clipboard(&text)?;
            paste_into_previous_window()
        }
        other => Err(format!("Unsupported output mode: {other}")),
    }
}
