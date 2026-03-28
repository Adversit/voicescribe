mod commands;
mod state;

use commands::{
    audio::{cancel_recording, delete_audio_file, get_recording_status, start_recording, stop_recording},
    backend::{backend_status, start_backend, stop_backend, transcribe},
    hotkey::{get_hotkey_display, register_hotkey, register_hotkey_binding, unregister_hotkey},
    text_input::output_text,
};
use state::{BackendProcessState, HotkeyState, RecordingState};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

const OVERLAY_LABEL: &str = "overlay";
const OVERLAY_WIDTH: f64 = 220.0;
const OVERLAY_HEIGHT: f64 = 84.0;
const OVERLAY_BOTTOM_MARGIN: i32 = 64;

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn emit_tray_event(app: &tauri::AppHandle, event_name: &str) {
    let _ = app.emit(event_name, ());
}

fn position_overlay_window(window: &WebviewWindow) {
    if let (Ok(Some(monitor)), Ok(size)) = (window.current_monitor(), window.outer_size()) {
        let screen = monitor.size();
        let x = ((screen.width as i32 - size.width as i32) / 2).max(0);
        let y = (screen.height as i32 - size.height as i32 - OVERLAY_BOTTOM_MARGIN).max(0);
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

fn ensure_overlay_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        return Ok(window);
    }

    let mut builder = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("overlay.html".into()))
        .title("VoiceScribe Overlay")
        .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .decorations(false)
        .visible(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false);

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone()).map_err(|err| err.to_string())?;
    }

    let window = builder.build().map_err(|err| err.to_string())?;
    position_overlay_window(&window);
    Ok(window)
}

#[tauri::command]
fn show_overlay(app: tauri::AppHandle) -> Result<(), String> {
    let window = ensure_overlay_window(&app)?;
    position_overlay_window(&window);
    let _ = window.show();
    Ok(())
}

#[tauri::command]
fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.hide();
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().arg("--from-autostart").build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(BackendProcessState::default())
        .manage(HotkeyState::default())
        .manage(RecordingState::default())
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let start_recording = MenuItemBuilder::with_id("start-recording", "开始录音").build(app)?;
            let stop_recording = MenuItemBuilder::with_id("stop-recording", "停止录音并转录").build(app)?;
            let cancel_recording = MenuItemBuilder::with_id("cancel-recording", "取消当前录音").build(app)?;
            let copy_latest = MenuItemBuilder::with_id("copy-latest", "复制最近转录").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出 VoiceScribe").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show, &start_recording, &stop_recording, &cancel_recording, &copy_latest, &quit])
                .build()?;

            let mut tray_builder = TrayIconBuilder::with_id("main-tray")
                .tooltip("VoiceScribe")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "start-recording" => emit_tray_event(app, "tray-start-recording"),
                    "stop-recording" => emit_tray_event(app, "tray-stop-recording"),
                    "cancel-recording" => emit_tray_event(app, "tray-cancel-recording"),
                    "copy-latest" => emit_tray_event(app, "tray-copy-latest"),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());

                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_icon(icon.clone());
                }
            }

            let _tray = tray_builder.build(app)?;
            let _ = ensure_overlay_window(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| match (window.label(), event) {
            ("main", WindowEvent::CloseRequested { api, .. }) => {
                api.prevent_close();
                let _ = window.hide();
            }
            ("main", WindowEvent::Destroyed) => {
                window.app_handle().exit(0);
            }
            (OVERLAY_LABEL, WindowEvent::CloseRequested { api, .. }) => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            start_backend,
            stop_backend,
            backend_status,
            transcribe,
            register_hotkey,
            register_hotkey_binding,
            unregister_hotkey,
            get_hotkey_display,
            start_recording,
            stop_recording,
            cancel_recording,
            delete_audio_file,
            get_recording_status,
            output_text,
            show_overlay,
            hide_overlay
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
