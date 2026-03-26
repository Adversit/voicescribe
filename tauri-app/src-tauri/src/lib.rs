mod commands;
mod state;

use commands::{
    audio::{cancel_recording, get_recording_status, start_recording, stop_recording},
    backend::{backend_status, start_backend, stop_backend, transcribe},
    hotkey::{get_hotkey_display, register_hotkey, unregister_hotkey},
    text_input::output_text,
};
use state::{BackendProcessState, HotkeyState, RecordingState};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
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
            let quit = MenuItemBuilder::with_id("quit", "退出 VoiceScribe").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            let mut tray_builder = TrayIconBuilder::with_id("main-tray")
                .tooltip("VoiceScribe")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
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

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    WindowEvent::Destroyed => {
                        window.app_handle().exit(0);
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_backend,
            stop_backend,
            backend_status,
            transcribe,
            register_hotkey,
            unregister_hotkey,
            get_hotkey_display,
            start_recording,
            stop_recording,
            cancel_recording,
            get_recording_status,
            output_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
