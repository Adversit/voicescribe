use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
};

static PREVIOUS_WINDOW: OnceLock<Mutex<Option<isize>>> = OnceLock::new();

fn previous_window() -> &'static Mutex<Option<isize>> {
    PREVIOUS_WINDOW.get_or_init(|| Mutex::new(None))
}

pub fn remember_foreground_window() {
    let hwnd = unsafe { GetForegroundWindow() };
    if !hwnd.0.is_null() {
        if let Ok(mut guard) = previous_window().lock() {
            *guard = Some(hwnd.0 as isize);
        }
    }
}

pub fn clear_previous_window() {
    if let Ok(mut guard) = previous_window().lock() {
        *guard = None;
    }
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
    let hwnd = previous_window()
        .lock()
        .map_err(|_| "Previous window mutex poisoned")?
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
