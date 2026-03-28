use crate::commands::audio::recording_active;
use crate::state::{HotkeyBinding, HotkeyModifiersDetailed, HotkeyState};
use std::sync::{Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE, VK_LWIN, VK_RWIN, VK_SHIFT};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT,
    WM_SYSKEYDOWN, WM_SYSKEYUP,
};

static HOTKEY_RUNTIME: OnceLock<Mutex<HotkeyRuntime>> = OnceLock::new();
static HOOK_THREAD: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();
static HOOK_THREAD_ID: OnceLock<Mutex<Option<u32>>> = OnceLock::new();

struct HotkeyRuntime {
    binding: HotkeyBinding,
    last_press_time: Option<Instant>,
    is_pressed: bool,
    is_long_press_mode: bool,
    long_press_generation: u64,
    app_handle: Option<AppHandle>,
}

impl Default for HotkeyRuntime {
    fn default() -> Self {
        Self {
            binding: HotkeyBinding::default(),
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
    let app = runtime().lock().ok().and_then(|guard| guard.app_handle.clone());
    if let Some(app) = app {
        let _ = app.emit(name, ());
    }
}

fn is_key_down(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn normalized_modifier_state(primary_code: &str) -> HotkeyModifiersDetailed {
    let mut ctrl = is_key_down(0x11) || is_key_down(0xA2) || is_key_down(0xA3);
    let mut shift = is_key_down(VK_SHIFT.0 as i32) || is_key_down(0xA0) || is_key_down(0xA1);
    let mut win = is_key_down(VK_LWIN.0 as i32) || is_key_down(VK_RWIN.0 as i32);
    let mut alt_left = is_key_down(0xA4);
    let mut alt_right = is_key_down(0xA5);

    match primary_code {
        "ControlLeft" | "ControlRight" => ctrl = false,
        "ShiftLeft" | "ShiftRight" => shift = false,
        "MetaLeft" | "MetaRight" => win = false,
        "AltLeft" => alt_left = false,
        "AltRight" => alt_right = false,
        _ => {}
    }

    HotkeyModifiersDetailed {
        ctrl,
        shift,
        win,
        alt_left,
        alt_right,
    }
}

fn modifiers_match(binding: &HotkeyBinding) -> bool {
    let current = normalized_modifier_state(&binding.primary_code);
    current.ctrl == binding.modifiers.ctrl
        && current.shift == binding.modifiers.shift
        && current.win == binding.modifiers.win
        && current.alt_left == binding.modifiers.alt_left
        && current.alt_right == binding.modifiers.alt_right
}

fn matches_hotkey(vk: u32) -> bool {
    let guard = match runtime().lock() {
        Ok(guard) => guard,
        Err(_) => return false,
    };

    guard.binding.primary_key_code >= 0
        && vk == guard.binding.primary_key_code as u32
        && modifiers_match(&guard.binding)
}

fn spawn_long_press_timer(generation: u64) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(350));
        let should_start = {
            let mut guard = match runtime().lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };

            if guard.is_pressed && !guard.is_long_press_mode && guard.long_press_generation == generation {
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

unsafe extern "system" fn keyboard_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
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
        0xA4 => "AltLeft".to_string(),
        0xA5 => "AltRight".to_string(),
        0xA2 => "CtrlLeft".to_string(),
        0xA3 => "CtrlRight".to_string(),
        0xA0 => "ShiftLeft".to_string(),
        0xA1 => "ShiftRight".to_string(),
        _ => key_code.to_string(),
    }
}

fn build_binding_from_legacy(modifiers: u32, key_code: i32) -> HotkeyBinding {
    let mut parts = Vec::new();
    let mut detailed = HotkeyModifiersDetailed {
        ctrl: false,
        shift: false,
        win: false,
        alt_left: false,
        alt_right: false,
    };

    if modifiers & 0x1 != 0 {
        parts.push("Ctrl".to_string());
        detailed.ctrl = true;
    }
    if modifiers & 0x2 != 0 {
        parts.push("Shift".to_string());
        detailed.shift = true;
    }
    if modifiers & 0x4 != 0 {
        parts.push("Alt".to_string());
        detailed.alt_left = true;
    }
    if modifiers & 0x8 != 0 {
        parts.push("Win".to_string());
        detailed.win = true;
    }
    if key_code >= 0 {
        parts.push(format_key(key_code));
    }

    HotkeyBinding {
        primary_code: format_key(key_code),
        primary_key_code: key_code,
        display: if parts.is_empty() { "未设置".to_string() } else { parts.join("+") },
        modifiers: detailed,
    }
}

fn mask_from_binding(binding: &HotkeyBinding) -> u32 {
    let mut mask = 0;
    if binding.modifiers.ctrl {
        mask |= 0x1;
    }
    if binding.modifiers.shift {
        mask |= 0x2;
    }
    if binding.modifiers.alt_left || binding.modifiers.alt_right {
        mask |= 0x4;
    }
    if binding.modifiers.win {
        mask |= 0x8;
    }
    mask
}

#[tauri::command]
pub fn register_hotkey(app: AppHandle, state: State<'_, HotkeyState>, modifiers: u32, key_code: i32) -> Result<(), String> {
    let binding = build_binding_from_legacy(modifiers, key_code);
    register_hotkey_binding(app, state, binding)
}

#[tauri::command]
pub fn register_hotkey_binding(
    app: AppHandle,
    state: State<'_, HotkeyState>,
    binding: HotkeyBinding,
) -> Result<(), String> {
    *state.modifiers.lock().map_err(|_| "Hotkey mutex poisoned")? = mask_from_binding(&binding);
    *state.key_code.lock().map_err(|_| "Hotkey mutex poisoned")? = binding.primary_key_code;
    *state.binding.lock().map_err(|_| "Hotkey mutex poisoned")? = binding.clone();

    let mut guard = runtime().lock().map_err(|_| "Hotkey runtime mutex poisoned")?;
    guard.binding = binding;
    guard.app_handle = Some(app);
    drop(guard);

    ensure_hook_thread()
}

#[tauri::command]
pub fn unregister_hotkey(state: State<'_, HotkeyState>) -> Result<(), String> {
    *state.modifiers.lock().map_err(|_| "Hotkey mutex poisoned")? = 0;
    *state.key_code.lock().map_err(|_| "Hotkey mutex poisoned")? = -1;
    *state.binding.lock().map_err(|_| "Hotkey mutex poisoned")? = HotkeyBinding {
        primary_code: String::new(),
        primary_key_code: -1,
        display: "未设置".to_string(),
        modifiers: HotkeyModifiersDetailed {
            ctrl: false,
            shift: false,
            win: false,
            alt_left: false,
            alt_right: false,
        },
    };

    let mut guard = runtime().lock().map_err(|_| "Hotkey runtime mutex poisoned")?;
    guard.binding.primary_key_code = -1;
    guard.binding.display = "未设置".to_string();
    guard.is_pressed = false;
    guard.is_long_press_mode = false;
    guard.last_press_time = None;
    drop(guard);

    shutdown_hook_thread()
}

#[tauri::command]
pub fn get_hotkey_display(state: State<'_, HotkeyState>) -> Result<String, String> {
    let binding = state.binding.lock().map_err(|_| "Hotkey mutex poisoned")?.clone();
    if binding.display.is_empty() {
        Ok("未设置".to_string())
    } else {
        Ok(binding.display)
    }
}
