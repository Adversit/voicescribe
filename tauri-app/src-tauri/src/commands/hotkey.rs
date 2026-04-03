use crate::commands::audio::recording_active;
use crate::state::{HotkeyBinding, HotkeyState};
use std::collections::BTreeSet;
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::{GetCurrentProcessId, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetForegroundWindow, GetMessageW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT,
    WM_SYSKEYDOWN, WM_SYSKEYUP,
};

static HOTKEY_RUNTIME: OnceLock<Mutex<HotkeyRuntime>> = OnceLock::new();
static HOOK_THREAD: OnceLock<Mutex<Option<JoinHandle<()>>>> = OnceLock::new();
static HOOK_THREAD_ID: OnceLock<Mutex<Option<u32>>> = OnceLock::new();

const NOT_SET_LABEL: &str = "\u{672a}\u{8bbe}\u{7f6e}";
const TRACE_EVENT_BUDGET: u8 = 24;
const TRACE_WINDOW_SECONDS: u64 = 20;

struct HotkeyRuntime {
    binding: HotkeyBinding,
    pressed_keys: BTreeSet<u32>,
    is_hotkey_active: bool,
    suspended: bool,
    is_long_press_mode: bool,
    long_press_generation: u64,
    app_handle: Option<AppHandle>,
    last_emitted_event: Option<&'static str>,
    last_emitted_at: Option<Instant>,
    pending_trace_id: Option<String>,
    pending_trace_started_at: Option<Instant>,
    pending_trace_event_budget: u8,
}

impl Default for HotkeyRuntime {
    fn default() -> Self {
        Self {
            binding: HotkeyBinding::default(),
            pressed_keys: BTreeSet::new(),
            is_hotkey_active: false,
            suspended: false,
            is_long_press_mode: false,
            long_press_generation: 0,
            app_handle: None,
            last_emitted_event: None,
            last_emitted_at: None,
            pending_trace_id: None,
            pending_trace_started_at: None,
            pending_trace_event_budget: 0,
        }
    }
}

#[derive(Clone)]
struct TraceDiagnosticEvent {
    trace_id: String,
    age_ms: u128,
    remaining_events: u8,
}

struct ForegroundWindowSnapshot {
    same_process: bool,
    title: String,
}

fn runtime() -> &'static Mutex<HotkeyRuntime> {
    HOTKEY_RUNTIME.get_or_init(|| Mutex::new(HotkeyRuntime::default()))
}

fn log_hook_runtime_status(context: &str) {
    let (hook_thread_slot_present, hook_thread_finished) = hook_thread()
        .lock()
        .map(|guard| {
            let slot_present = guard.is_some();
            let finished = guard
                .as_ref()
                .map(|handle| handle.is_finished())
                .unwrap_or(false);
            (slot_present, finished)
        })
        .unwrap_or((false, false));
    let hook_thread_id_present = hook_thread_id()
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false);
    log_hotkey(format!(
        "hook_status context={} slot_present={} thread_id_present={} thread_finished={}",
        context, hook_thread_slot_present, hook_thread_id_present, hook_thread_finished,
    ));
}

fn hook_thread() -> &'static Mutex<Option<JoinHandle<()>>> {
    HOOK_THREAD.get_or_init(|| Mutex::new(None))
}

fn hook_thread_id() -> &'static Mutex<Option<u32>> {
    HOOK_THREAD_ID.get_or_init(|| Mutex::new(None))
}

fn hotkey_log_path() -> std::path::PathBuf {
    std::env::temp_dir().join("voicescribe-hotkey.log")
}

pub(crate) fn log_hotkey(message: impl AsRef<str>) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| format!("{}.{:03}", value.as_secs(), value.subsec_millis()))
        .unwrap_or_else(|_| "0.000".to_string());
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(hotkey_log_path())
    {
        let _ = writeln!(file, "[{}] {}", timestamp, message.as_ref());
    }
}

fn format_keys(keys: &[u32]) -> String {
    if keys.is_empty() {
        return "[]".to_string();
    }

    keys.iter()
        .map(|key| format!("0x{:X}", key))
        .collect::<Vec<_>>()
        .join("+")
}

fn format_key_set(keys: &BTreeSet<u32>) -> String {
    let values = keys.iter().copied().collect::<Vec<_>>();
    format_keys(&values)
}

fn runtime_state_summary() -> String {
    runtime()
        .lock()
        .map(|guard| {
            format!(
                "runtime_binding={} runtime_pressed={} runtime_hotkey_active={} runtime_suspended={} runtime_long_press_mode={}",
                format_keys(&guard.binding.keys),
                format_key_set(&guard.pressed_keys),
                guard.is_hotkey_active,
                guard.suspended,
                guard.is_long_press_mode,
            )
        })
        .unwrap_or_else(|_| "runtime_state=lock_error".to_string())
}

fn normalize_binding_keys(keys: &[u32]) -> Vec<u32> {
    let normalized = keys
        .iter()
        .copied()
        .filter(|key| *key > 0)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    if normalized.len() == 1 || normalized.len() == 2 {
        normalized
    } else {
        Vec::new()
    }
}

fn hotkey_label_from_vk(vk: u32) -> String {
    match vk {
        0xA0 => "\u{5de6} Shift".to_string(),
        0xA1 => "\u{53f3} Shift".to_string(),
        0xA2 => "\u{5de6} Ctrl".to_string(),
        0xA3 => "\u{53f3} Ctrl".to_string(),
        0xA4 => "\u{5de6} Alt".to_string(),
        0xA5 => "\u{53f3} Alt".to_string(),
        0x5B => "\u{5de6} Win".to_string(),
        0x5C => "\u{53f3} Win".to_string(),
        0x1B => "Esc".to_string(),
        0x0D => "\u{56de}\u{8f66}".to_string(),
        0x20 => "\u{7a7a}\u{683c}".to_string(),
        0x09 => "Tab".to_string(),
        0x08 => "\u{9000}\u{683c}".to_string(),
        0x25 => "\u{5de6}".to_string(),
        0x26 => "\u{4e0a}".to_string(),
        0x27 => "\u{53f3}".to_string(),
        0x28 => "\u{4e0b}".to_string(),
        0x30..=0x39 | 0x41..=0x5A => char::from_u32(vk)
            .map(|value| value.to_string())
            .unwrap_or_else(|| format!("VK_{}", vk)),
        0x70..=0x7B => format!("F{}", vk - 0x6F),
        _ => format!("VK_{}", vk),
    }
}

fn display_from_keys(keys: &[u32]) -> String {
    if keys.is_empty() {
        return NOT_SET_LABEL.to_string();
    }

    keys.iter()
        .map(|key| hotkey_label_from_vk(*key))
        .collect::<Vec<_>>()
        .join("+")
}

fn sanitize_binding(mut binding: HotkeyBinding) -> Result<HotkeyBinding, String> {
    let keys = normalize_binding_keys(&binding.keys);
    if keys.is_empty() {
        return Err("Hotkey binding must contain one or two keys".to_string());
    }

    binding.keys = keys;
    binding.display = display_from_keys(&binding.keys);
    Ok(binding)
}

fn binding_matches_pressed(binding: &HotkeyBinding, pressed_keys: &BTreeSet<u32>) -> bool {
    let binding_keys = normalize_binding_keys(&binding.keys);
    if binding_keys.is_empty() {
        return false;
    }

    // Some Windows layouts report Right Alt as AltGr, which may carry an
    // extra Ctrl key alongside VK_RMENU. Keep explicit 2-key bindings strict
    // and only relax the single-key Right Alt path.
    if binding_keys.as_slice() == [0xA5] {
        let pressed = pressed_keys.iter().copied().collect::<Vec<_>>();
        if matches!(pressed.as_slice(), [0xA5] | [0xA2, 0xA5] | [0xA3, 0xA5]) {
            return true;
        }
    }

    binding_keys.len() == pressed_keys.len()
        && binding_keys
            .iter()
            .copied()
            .eq(pressed_keys.iter().copied())
}

fn emit_event(name: &str) {
    log_hotkey(format!("emit_event {name}"));
    let app = runtime()
        .lock()
        .ok()
        .and_then(|guard| guard.app_handle.clone());
    if let Some(app) = app {
        if let Some(window) = app.get_webview_window("main") {
            match window.emit(name, ()) {
                Ok(()) => log_hotkey(format!("emit_event delivered_to=main name={name}")),
                Err(err) => {
                    log_hotkey(format!("emit_event failed_to_main name={name} error={err}"))
                }
            }
        } else {
            log_hotkey("emit_event skipped: main window missing");
        }
    } else {
        log_hotkey("emit_event skipped: app_handle missing");
    }
}

fn should_emit_hotkey_event(event_name: &'static str) -> bool {
    let mut guard = match runtime().lock() {
        Ok(guard) => guard,
        Err(_) => return true,
    };

    let now = Instant::now();
    if let (Some(last_event), Some(last_at)) = (guard.last_emitted_event, guard.last_emitted_at) {
        if last_event == event_name && now.duration_since(last_at) <= Duration::from_millis(200) {
            log_hotkey(format!(
                "suppress_duplicate_event name={} delta_ms={}",
                event_name,
                now.duration_since(last_at).as_millis()
            ));
            return false;
        }
    }

    guard.last_emitted_event = Some(event_name);
    guard.last_emitted_at = Some(now);
    true
}

fn arm_pending_trace(guard: &mut HotkeyRuntime, trace_id: String) {
    guard.pending_trace_id = Some(trace_id);
    guard.pending_trace_started_at = Some(Instant::now());
    guard.pending_trace_event_budget = TRACE_EVENT_BUDGET;
}

fn begin_pending_trace_event() -> Option<TraceDiagnosticEvent> {
    let mut guard = runtime().lock().ok()?;
    let trace_id = guard.pending_trace_id.clone()?;
    let started_at = guard.pending_trace_started_at?;
    let age = Instant::now().duration_since(started_at);

    if age > Duration::from_secs(TRACE_WINDOW_SECONDS) {
        log_hotkey(format!(
            "apply_trace expired trace_id={} age_ms={} budget_remaining={}",
            trace_id,
            age.as_millis(),
            guard.pending_trace_event_budget,
        ));
        guard.pending_trace_id = None;
        guard.pending_trace_started_at = None;
        guard.pending_trace_event_budget = 0;
        return None;
    }

    if guard.pending_trace_event_budget == 0 {
        guard.pending_trace_id = None;
        guard.pending_trace_started_at = None;
        return None;
    }

    guard.pending_trace_event_budget -= 1;
    let remaining_events = guard.pending_trace_event_budget;
    if remaining_events == 0 {
        guard.pending_trace_id = None;
        guard.pending_trace_started_at = None;
    }

    Some(TraceDiagnosticEvent {
        trace_id,
        age_ms: age.as_millis(),
        remaining_events,
    })
}

fn is_extended_key(flags: u32) -> bool {
    flags & 0x01 != 0
}

fn is_vk_currently_down(vk: u32) -> bool {
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

fn foreground_window_snapshot() -> Option<ForegroundWindowSnapshot> {
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        let mut pid = 0;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let same_process = pid == GetCurrentProcessId();

        let title_length = GetWindowTextLengthW(hwnd);
        let title = if title_length > 0 {
            let mut buffer = vec![0u16; title_length as usize + 1];
            let copied = GetWindowTextW(hwnd, &mut buffer);
            String::from_utf16_lossy(&buffer[..copied as usize])
        } else {
            String::new()
        };

        Some(ForegroundWindowSnapshot { same_process, title })
    }
}

fn is_voice_scribe_main_foreground(snapshot: &ForegroundWindowSnapshot) -> bool {
    snapshot.same_process
        && snapshot.title.contains("VoiceScribe")
        && !snapshot.title.contains("Overlay")
}

fn should_log_foreground_alt_raw(
    kb: &KBDLLHOOKSTRUCT,
    normalized_key: Option<u32>,
    message: u32,
) -> bool {
    matches!(
        message,
        WM_SYSKEYDOWN | WM_SYSKEYUP | WM_KEYDOWN | WM_KEYUP
    ) && (matches!(kb.vkCode, 0xA4 | 0xA5)
        || kb.scanCode == 56
        || matches!(normalized_key, Some(0xA4 | 0xA5)))
}

fn prune_stale_pressed_keys(pressed_keys: &mut BTreeSet<u32>) -> Vec<u32> {
    let stale_keys = pressed_keys
        .iter()
        .copied()
        .filter(|key| !is_vk_currently_down(*key))
        .collect::<Vec<_>>();

    for key in &stale_keys {
        pressed_keys.remove(key);
    }

    stale_keys
}

fn normalized_vk_from_kb(kb: &KBDLLHOOKSTRUCT) -> Option<u32> {
    let vk = kb.vkCode;
    let scan = kb.scanCode;
    let extended = is_extended_key(kb.flags.0);

    let normalized = match (vk, scan, extended) {
        (_, 42, _) => 0xA0,
        (_, 54, _) => 0xA1,
        (_, 29, false) => 0xA2,
        (_, 29, true) => 0xA3,
        (0xA4, _, _) => 0xA4,
        (0xA5, _, _) => 0xA5,
        (_, 56, false) => 0xA4,
        (_, 56, true) => 0xA5,
        (0x5B, _, _) => 0x5B,
        (0x5C, _, _) => 0x5C,
        _ if vk > 0 => vk,
        _ => return None,
    };

    Some(normalized)
}

fn spawn_long_press_timer(generation: u64) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(350));
        let should_start = {
            let mut guard = match runtime().lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };

            if guard.is_hotkey_active
                && !guard.is_long_press_mode
                && guard.long_press_generation == generation
                && !recording_active()
            {
                guard.is_long_press_mode = true;
                true
            } else {
                false
            }
        };

        if should_start {
            log_hotkey("long_press threshold reached");
            emit_event("hotkey-start-recording");
        }
    });
}

fn handle_hotkey_press_transition() {
    let long_press_generation = {
        let mut guard = match runtime().lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        guard.long_press_generation += 1;
        guard.is_long_press_mode = false;
        log_hotkey(format!(
            "hotkey_press_transition binding={} pressed={}",
            format_keys(&guard.binding.keys),
            format_key_set(&guard.pressed_keys)
        ));
        guard.long_press_generation
    };

    spawn_long_press_timer(long_press_generation);
}

fn handle_hotkey_release_transition() {
    let event_name = {
        let mut guard = match runtime().lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        guard.long_press_generation += 1;
        let event_name = if guard.is_long_press_mode {
            if recording_active() {
                log_hotkey("hotkey_release -> stop after long press");
                Some("hotkey-stop-recording")
            } else {
                None
            }
        } else if recording_active() {
            log_hotkey("single_click -> stop");
            Some("hotkey-stop-recording")
        } else {
            log_hotkey("single_click -> start");
            Some("hotkey-start-recording")
        };
        guard.is_long_press_mode = false;
        event_name
    };

    if let Some(event_name) = event_name {
        if should_emit_hotkey_event(event_name) {
            emit_event(event_name);
        }
    }
}

enum HotkeyTransition {
    Pressed,
    Released,
}

fn update_runtime_hotkey_state(
    key: u32,
    message: u32,
    trace: Option<&TraceDiagnosticEvent>,
) -> Option<HotkeyTransition> {
    let mut guard = runtime().lock().ok()?;

    if guard.suspended {
        if !guard.pressed_keys.is_empty() || guard.is_hotkey_active || guard.is_long_press_mode {
            log_hotkey(format!(
                "hotkey_state skipped_suspended key=0x{:X} message={} pressed={} active={} long_press={}",
                key,
                message,
                format_key_set(&guard.pressed_keys),
                guard.is_hotkey_active,
                guard.is_long_press_mode,
            ));
        }
        if let Some(trace) = trace {
            log_hotkey(format!(
                "hotkey_state trace_id={} age_ms={} remaining_events={} skipped_suspended key=0x{:X} message={} binding={} pressed={} active={} long_press={}",
                trace.trace_id,
                trace.age_ms,
                trace.remaining_events,
                key,
                message,
                format_keys(&guard.binding.keys),
                format_key_set(&guard.pressed_keys),
                guard.is_hotkey_active,
                guard.is_long_press_mode,
            ));
        }
        guard.pressed_keys.clear();
        guard.is_hotkey_active = false;
        guard.is_long_press_mode = false;
        return None;
    }

    let was_active = guard.is_hotkey_active;
    let stale_keys = prune_stale_pressed_keys(&mut guard.pressed_keys);

    if !stale_keys.is_empty() {
        log_hotkey(format!(
            "prune_stale_pressed_keys removed={} before_message={} current_key=0x{:X}",
            format_keys(&stale_keys),
            message,
            key,
        ));
    }

    match message {
        WM_KEYDOWN | WM_SYSKEYDOWN => {
            guard.pressed_keys.insert(key);
        }
        WM_KEYUP | WM_SYSKEYUP => {
            guard.pressed_keys.remove(&key);
        }
        _ => return None,
    }

    let is_active = binding_matches_pressed(&guard.binding, &guard.pressed_keys);
    guard.is_hotkey_active = is_active;

    log_hotkey(format!(
        "hotkey_state key=0x{:X} message={} binding={} pressed={} was_active={} is_active={}",
        key,
        message,
        format_keys(&guard.binding.keys),
        format_key_set(&guard.pressed_keys),
        was_active,
        is_active,
    ));

    if let Some(trace) = trace {
        log_hotkey(format!(
            "hotkey_state trace_id={} age_ms={} remaining_events={} key=0x{:X} message={} binding={} pressed={} was_active={} is_active={}",
            trace.trace_id,
            trace.age_ms,
            trace.remaining_events,
            key,
            message,
            format_keys(&guard.binding.keys),
            format_key_set(&guard.pressed_keys),
            was_active,
            is_active,
        ));
    }

    if !was_active && is_active {
        Some(HotkeyTransition::Pressed)
    } else if was_active && !is_active {
        Some(HotkeyTransition::Released)
    } else {
        None
    }
}
unsafe extern "system" fn keyboard_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let kb = *(lparam.0 as *const KBDLLHOOKSTRUCT);
        let message = wparam.0 as u32;
        let trace = begin_pending_trace_event();
        let normalized_key = normalized_vk_from_kb(&kb);
        let foreground_snapshot = if should_log_foreground_alt_raw(&kb, normalized_key, message) {
            foreground_window_snapshot()
        } else {
            None
        };

        if let Some(trace) = trace.as_ref() {
            let normalized_summary = normalized_key
                .map(|value| format!("0x{:X}", value))
                .unwrap_or_else(|| "none".to_string());
            log_hotkey(format!(
                "hook_raw trace_id={} age_ms={} remaining_events={} message={} vk=0x{:X} scan=0x{:X} flags=0x{:X} normalized_vk={}",
                trace.trace_id,
                trace.age_ms,
                trace.remaining_events,
                message,
                kb.vkCode,
                kb.scanCode,
                kb.flags.0,
                normalized_summary,
            ));
        }

        if let Some(snapshot) = foreground_snapshot.as_ref() {
            if is_voice_scribe_main_foreground(snapshot) {
                let normalized_summary = normalized_key
                    .map(|value| format!("0x{:X}", value))
                    .unwrap_or_else(|| "none".to_string());
                log_hotkey(format!(
                    "foreground_alt_raw window=voicescribe-main title={} same_process={} message={} vk=0x{:X} scan=0x{:X} flags=0x{:X} normalized_vk={}",
                    snapshot.title,
                    snapshot.same_process,
                    message,
                    kb.vkCode,
                    kb.scanCode,
                    kb.flags.0,
                    normalized_summary,
                ));
            }
        }

        let Some(key) = normalized_key else {
            return CallNextHookEx(HHOOK::default(), code, wparam, lparam);
        };

        if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN)
            && key == VK_ESCAPE.0 as u32
            && recording_active()
        {
            log_hotkey("esc -> cancel");
            emit_event("hotkey-cancel");
        }

        match update_runtime_hotkey_state(key, message, trace.as_ref()) {
            Some(HotkeyTransition::Pressed) => {
                handle_hotkey_press_transition();
            }
            Some(HotkeyTransition::Released) => {
                handle_hotkey_release_transition();
            }
            None => {}
        }
    }

    CallNextHookEx(HHOOK::default(), code, wparam, lparam)
}

fn ensure_hook_thread() -> Result<(), String> {
    log_hook_runtime_status("ensure_hook_thread:enter");
    let mut thread_guard = hook_thread()
        .lock()
        .map_err(|_| "Hotkey thread mutex poisoned")?;
    if thread_guard.is_some() {
        let hook_thread_finished = thread_guard
            .as_ref()
            .map(|handle| handle.is_finished())
            .unwrap_or(false);
        let hook_thread_id_present = hook_thread_id()
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false);
        log_hotkey(format!(
            "ensure_hook_thread existing_slot thread_id_present={} thread_finished={}",
            hook_thread_id_present, hook_thread_finished
        ));
        log_hotkey("ensure_hook_thread: already running");
        return Ok(());
    }
    log_hotkey("ensure_hook_thread: starting");

    let (startup_tx, startup_rx) = mpsc::channel();

    let handle = thread::spawn(move || unsafe {
        if let Ok(mut thread_id_guard) = hook_thread_id().lock() {
            *thread_id_guard = Some(GetCurrentThreadId());
        }

        let module = match GetModuleHandleW(None) {
            Ok(module) => module,
            Err(err) => {
                log_hotkey(format!(
                    "ensure_hook_thread: GetModuleHandleW failed: {err}"
                ));
                let _ = startup_tx.send(Err(format!("GetModuleHandleW failed: {err}")));
                if let Ok(mut thread_id_guard) = hook_thread_id().lock() {
                    *thread_id_guard = None;
                }
                return;
            }
        };

        let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook_proc), module, 0) {
            Ok(hook) => {
                log_hotkey("ensure_hook_thread: SetWindowsHookExW succeeded");
                let _ = startup_tx.send(Ok(()));
                hook
            }
            Err(err) => {
                log_hotkey(format!(
                    "ensure_hook_thread: SetWindowsHookExW failed: {err}"
                ));
                let _ = startup_tx.send(Err(format!("SetWindowsHookExW failed: {err}")));
                if let Ok(mut thread_id_guard) = hook_thread_id().lock() {
                    *thread_id_guard = None;
                }
                return;
            }
        };

        let mut message = MSG::default();
        loop {
            let get_message_result = GetMessageW(&mut message, None, 0, 0);
            if !get_message_result.as_bool() {
                log_hotkey(format!(
                    "hook_thread:message_loop_exit result={}",
                    get_message_result.0
                ));
                break;
            }
        }

        let _ = UnhookWindowsHookEx(hook);
        if let Ok(mut thread_id_guard) = hook_thread_id().lock() {
            *thread_id_guard = None;
        }
        log_hotkey("hook_thread:exiting");
    });

    match startup_rx.recv_timeout(Duration::from_secs(2)) {
        Ok(Ok(())) => {
            *thread_guard = Some(handle);
            log_hotkey("ensure_hook_thread: startup confirmed");
            Ok(())
        }
        Ok(Err(err)) => {
            let _ = handle.join();
            log_hotkey(format!("ensure_hook_thread: startup failed: {err}"));
            Err(err)
        }
        Err(_) => {
            let _ = handle.join();
            log_hotkey("ensure_hook_thread: startup timed out");
            Err("Timed out while starting hotkey hook thread".to_string())
        }
    }
}

fn shutdown_hook_thread() -> Result<(), String> {
    if let Some(thread_id) = *hook_thread_id()
        .lock()
        .map_err(|_| "Hotkey thread mutex poisoned")?
    {
        unsafe {
            let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }

    if let Some(handle) = hook_thread()
        .lock()
        .map_err(|_| "Hotkey thread mutex poisoned")?
        .take()
    {
        let _ = handle.join();
    }

    Ok(())
}

#[tauri::command]
pub fn debug_hotkey_log(message: String) -> Result<(), String> {
    log_hotkey(format!("frontend {message}"));
    Ok(())
}

#[tauri::command]
pub fn suspend_hotkey_runtime() -> Result<(), String> {
    let summary = {
        let mut guard = runtime()
            .lock()
            .map_err(|_| "Hotkey runtime mutex poisoned")?;
        guard.suspended = true;
        guard.pressed_keys.clear();
        guard.is_hotkey_active = false;
        guard.is_long_press_mode = false;
        guard.long_press_generation += 1;
        format!(
            "runtime_binding={} runtime_pressed={} runtime_hotkey_active={} runtime_suspended={} runtime_long_press_mode={}",
            format_keys(&guard.binding.keys),
            format_key_set(&guard.pressed_keys),
            guard.is_hotkey_active,
            guard.suspended,
            guard.is_long_press_mode,
        )
    };

    log_hotkey(format!("suspend_hotkey_runtime {}", summary));
    Ok(())
}

#[tauri::command]
pub fn resume_hotkey_runtime(
    trace_id: Option<String>,
    reason: Option<String>,
) -> Result<(), String> {
    let summary = {
        let mut guard = runtime()
            .lock()
            .map_err(|_| "Hotkey runtime mutex poisoned")?;
        guard.suspended = false;
        guard.pressed_keys.clear();
        guard.is_hotkey_active = false;
        guard.is_long_press_mode = false;
        guard.long_press_generation += 1;
        if let Some(trace_id) = trace_id.clone() {
            arm_pending_trace(&mut guard, trace_id);
        }
        format!(
            "runtime_binding={} runtime_pressed={} runtime_hotkey_active={} runtime_suspended={} runtime_long_press_mode={}",
            format_keys(&guard.binding.keys),
            format_key_set(&guard.pressed_keys),
            guard.is_hotkey_active,
            guard.suspended,
            guard.is_long_press_mode,
        )
    };

    log_hotkey(format!(
        "resume_hotkey_runtime trace_id={} reason={} {}",
        trace_id.as_deref().unwrap_or("none"),
        reason.as_deref().unwrap_or("unspecified"),
        summary,
    ));
    Ok(())
}

#[tauri::command]
pub fn register_hotkey_binding(
    app: AppHandle,
    state: State<'_, HotkeyState>,
    binding: HotkeyBinding,
    trace_id: Option<String>,
) -> Result<(), String> {
    let binding = sanitize_binding(binding)?;
    log_hotkey(format!(
        "register_hotkey_binding request trace_id={} keys={} display={} {}",
        trace_id.as_deref().unwrap_or("none"),
        format_keys(&binding.keys),
        binding.display,
        runtime_state_summary(),
    ));
    *state.binding.lock().map_err(|_| "Hotkey mutex poisoned")? = binding.clone();

    let mut guard = runtime()
        .lock()
        .map_err(|_| "Hotkey runtime mutex poisoned")?;
    guard.binding = binding.clone();
    guard.app_handle = Some(app);
    guard.pressed_keys.clear();
    guard.is_hotkey_active = false;
    guard.is_long_press_mode = false;
    if let Some(trace_id) = trace_id.clone() {
        arm_pending_trace(&mut guard, trace_id);
    }
    drop(guard);

    log_hotkey(format!(
        "register_hotkey_binding trace_id={} keys={} display={} {}",
        trace_id.as_deref().unwrap_or("none"),
        format_keys(&binding.keys),
        binding.display,
        runtime_state_summary(),
    ));

    ensure_hook_thread()
}
#[tauri::command]
pub fn unregister_hotkey(state: State<'_, HotkeyState>) -> Result<(), String> {
    *state.binding.lock().map_err(|_| "Hotkey mutex poisoned")? = HotkeyBinding {
        keys: Vec::new(),
        display: NOT_SET_LABEL.to_string(),
    };

    let mut guard = runtime()
        .lock()
        .map_err(|_| "Hotkey runtime mutex poisoned")?;
    guard.binding = HotkeyBinding {
        keys: Vec::new(),
        display: NOT_SET_LABEL.to_string(),
    };
    guard.pressed_keys.clear();
    guard.is_hotkey_active = false;
    guard.is_long_press_mode = false;
    drop(guard);

    shutdown_hook_thread()
}

#[tauri::command]
pub fn get_hotkey_display(state: State<'_, HotkeyState>) -> Result<String, String> {
    let binding = state
        .binding
        .lock()
        .map_err(|_| "Hotkey mutex poisoned")?
        .clone();
    if binding.display.is_empty() {
        Ok(NOT_SET_LABEL.to_string())
    } else {
        Ok(binding.display)
    }
}

#[cfg(test)]
mod tests {
    use super::binding_matches_pressed;
    use crate::state::HotkeyBinding;
    use std::collections::BTreeSet;

    fn pressed(keys: &[u32]) -> BTreeSet<u32> {
        keys.iter().copied().collect()
    }

    #[test]
    fn right_alt_binding_matches_plain_right_alt() {
        let binding = HotkeyBinding {
            keys: vec![0xA5],
            display: "右 Alt".to_string(),
        };

        assert!(binding_matches_pressed(&binding, &pressed(&[0xA5])));
    }

    #[test]
    fn right_alt_binding_matches_altgr_variants() {
        let binding = HotkeyBinding {
            keys: vec![0xA5],
            display: "右 Alt".to_string(),
        };

        assert!(binding_matches_pressed(&binding, &pressed(&[0xA2, 0xA5])));
        assert!(binding_matches_pressed(&binding, &pressed(&[0xA3, 0xA5])));
    }

    #[test]
    fn two_key_bindings_remain_strict() {
        let binding = HotkeyBinding {
            keys: vec![0xA2, 0xA5],
            display: "左 Ctrl+右 Alt".to_string(),
        };

        assert!(binding_matches_pressed(&binding, &pressed(&[0xA2, 0xA5])));
        assert!(!binding_matches_pressed(&binding, &pressed(&[0xA5])));
        assert!(!binding_matches_pressed(&binding, &pressed(&[0xA3, 0xA5])));
    }
}
