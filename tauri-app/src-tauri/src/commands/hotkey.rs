use crate::commands::audio::recording_active;
use crate::state::HotkeyState;
use std::sync::{Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_ESCAPE, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT,
    WM_SYSKEYDOWN, WM_SYSKEYUP,
};

static HOTKEY_RUNTIME: OnceLock<Mutex<HotkeyRuntime>> = OnceLock::new();
static HOOK_THREAD: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();
static HOOK_THREAD_ID: OnceLock<Mutex<Option<u32>>> = OnceLock::new();

struct HotkeyRuntime {
    target_vk: u32,
    target_modifiers: u32,
    last_press_time: Option<Instant>,
    is_pressed: bool,
    is_long_press_mode: bool,
    long_press_generation: u64,
    app_handle: Option<AppHandle>,
}

impl Default for HotkeyRuntime {
    fn default() -> Self {
        Self {
            target_vk: 0x52,
            target_modifiers: 0x3,
            last_press_time: None,
            is_pressed: false,
            is_long_press_mode: false,
            long_press_generation: 0,
            app_handle: None,
        }
    }
}

fn runtime() -> &'static Mutex<HotkeyRuntime> {
    HOTKEY_RUNTIME.get_or_init(|| Mutex::new(HotkeyRuntime::default()))
}

fn hook_thread() -> &'static Mutex<Option<JoinHandle<()>>> {
    HOOK_THREAD.get_or_init(|| Mutex::new(None))
}

fn hook_thread_id() -> &'static Mutex<Option<u32>> {
    HOOK_THREAD_ID.get_or_init(|| Mutex::new(None))
}

fn emit_event(name: &str) {
    let app = runtime()
        .lock()
        .ok()
        .and_then(|guard| guard.app_handle.clone());
    if let Some(app) = app {
        let _ = app.emit(name, ());
    }
}

fn is_key_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn modifiers_match(mask: u32) -> bool {
    let ctrl = is_key_down(0x11);
    let shift = is_key_down(VK_SHIFT.0 as i32);
    let alt = is_key_down(VK_MENU.0 as i32);
    let win = is_key_down(VK_LWIN.0 as i32) || is_key_down(VK_RWIN.0 as i32);

    (mask & 0x1 == 0 || ctrl)
        && (mask & 0x2 == 0 || shift)
        && (mask & 0x4 == 0 || alt)
        && (mask & 0x8 == 0 || win)
}

fn matches_hotkey(vk: u32) -> bool {
    let guard = match runtime().lock() {
        Ok(guard) => guard,
        Err(_) => return false,
    };

    guard.target_vk != 0 && vk == guard.target_vk && modifiers_match(guard.target_modifiers)
}

fn spawn_long_press_timer(generation: u64) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(350));
        let should_start = {
            let mut guard = match runtime().lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };

            if guard.is_pressed
                && !guard.is_long_press_mode
                && guard.long_press_generation == generation
            {
                guard.is_long_press_mode = true;
                true
            } else {
                false
            }
        };

        if should_start && !recording_active() {
            emit_event("hotkey-start-recording");
        }
    });
}

fn handle_key_down() {
    let now = Instant::now();
    let mut emit: Option<&'static str> = None;
    let mut long_press_generation = None;

    {
        let mut guard = match runtime().lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        if guard.is_pressed {
            return;
        }

        guard.is_pressed = true;

        if let Some(last_press) = guard.last_press_time {
            if now.duration_since(last_press) < Duration::from_millis(350) {
                guard.last_press_time = None;
                guard.is_long_press_mode = false;
                guard.long_press_generation += 1;
                emit = Some(if recording_active() {
                    "hotkey-stop-recording"
                } else {
                    "hotkey-start-recording"
                });
            }
        }

        if emit.is_none() {
            guard.last_press_time = Some(now);
            guard.long_press_generation += 1;
            long_press_generation = Some(guard.long_press_generation);
        }
    }

    if let Some(event_name) = emit {
        emit_event(event_name);
    }
    if let Some(generation) = long_press_generation {
        spawn_long_press_timer(generation);
    }
}

fn handle_key_up() {
    let should_stop = {
        let mut guard = match runtime().lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        if !guard.is_pressed {
            return;
        }

        guard.is_pressed = false;
        let stop = guard.is_long_press_mode && recording_active();
        guard.is_long_press_mode = false;
        stop
    };

    if should_stop {
        emit_event("hotkey-stop-recording");
    }
}

unsafe extern "system" fn keyboard_hook_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code == HC_ACTION as i32 {
        let kb = *(lparam.0 as *const KBDLLHOOKSTRUCT);
        let message = wparam.0 as u32;

        if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN)
            && kb.vkCode == VK_ESCAPE.0 as u32
            && recording_active()
        {
            emit_event("hotkey-cancel");
            return LRESULT(1);
        }

        if matches_hotkey(kb.vkCode) {
            match message {
                WM_KEYDOWN | WM_SYSKEYDOWN => {
                    handle_key_down();
                    return LRESULT(1);
                }
                WM_KEYUP | WM_SYSKEYUP => {
                    handle_key_up();
                    return LRESULT(1);
                }
                _ => {}
            }
        }
    }

    CallNextHookEx(HHOOK::default(), code, wparam, lparam)
}

fn ensure_hook_thread() -> Result<(), String> {
    let mut thread_guard = hook_thread().lock().map_err(|_| "Hotkey thread mutex poisoned")?;
    if thread_guard.is_some() {
        return Ok(());
    }

    let handle = thread::spawn(|| unsafe {
        if let Ok(mut thread_id_guard) = hook_thread_id().lock() {
            *thread_id_guard = Some(GetCurrentThreadId());
        }

        let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook_proc), None, 0)
            .unwrap_or_default();

        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {}

        let _ = UnhookWindowsHookEx(hook);
        if let Ok(mut thread_id_guard) = hook_thread_id().lock() {
            *thread_id_guard = None;
        }
    });

    *thread_guard = Some(handle);
    Ok(())
}

fn shutdown_hook_thread() -> Result<(), String> {
    if let Some(thread_id) = *hook_thread_id().lock().map_err(|_| "Hotkey thread mutex poisoned")? {
        unsafe {
            let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }

    if let Some(handle) = hook_thread().lock().map_err(|_| "Hotkey thread mutex poisoned")?.take() {
        let _ = handle.join();
    }

    Ok(())
}

fn format_key(key_code: i32) -> String {
    match key_code {
        0x30..=0x39 | 0x41..=0x5A => char::from_u32(key_code as u32)
            .map(|ch| ch.to_string())
            .unwrap_or_else(|| key_code.to_string()),
        0x70..=0x7B => format!("F{}", key_code - 0x6F),
        _ => key_code.to_string(),
    }
}

#[tauri::command]
pub fn register_hotkey(
    app: AppHandle,
    state: State<'_, HotkeyState>,
    modifiers: u32,
    key_code: i32,
) -> Result<(), String> {
    *state.modifiers.lock().map_err(|_| "Hotkey mutex poisoned")? = modifiers;
    *state.key_code.lock().map_err(|_| "Hotkey mutex poisoned")? = key_code;

    let mut guard = runtime().lock().map_err(|_| "Hotkey runtime mutex poisoned")?;
    guard.target_modifiers = modifiers;
    guard.target_vk = key_code.max(0) as u32;
    guard.app_handle = Some(app);
    drop(guard);

    ensure_hook_thread()
}

#[tauri::command]
pub fn unregister_hotkey(state: State<'_, HotkeyState>) -> Result<(), String> {
    *state.modifiers.lock().map_err(|_| "Hotkey mutex poisoned")? = 0;
    *state.key_code.lock().map_err(|_| "Hotkey mutex poisoned")? = -1;

    let mut guard = runtime().lock().map_err(|_| "Hotkey runtime mutex poisoned")?;
    guard.target_modifiers = 0;
    guard.target_vk = 0;
    guard.is_pressed = false;
    guard.is_long_press_mode = false;
    guard.last_press_time = None;
    drop(guard);

    shutdown_hook_thread()
}

#[tauri::command]
pub fn get_hotkey_display(state: State<'_, HotkeyState>) -> Result<String, String> {
    let modifiers = *state.modifiers.lock().map_err(|_| "Hotkey mutex poisoned")?;
    let key_code = *state.key_code.lock().map_err(|_| "Hotkey mutex poisoned")?;

    let mut parts = Vec::new();
    if modifiers & 0x1 != 0 {
        parts.push("Ctrl".to_string());
    }
    if modifiers & 0x2 != 0 {
        parts.push("Shift".to_string());
    }
    if modifiers & 0x4 != 0 {
        parts.push("Alt".to_string());
    }
    if modifiers & 0x8 != 0 {
        parts.push("Win".to_string());
    }
    if key_code >= 0 {
        parts.push(format_key(key_code));
    }

    if parts.is_empty() {
        Ok("未设置".to_string())
    } else {
        Ok(parts.join("+"))
    }
}
