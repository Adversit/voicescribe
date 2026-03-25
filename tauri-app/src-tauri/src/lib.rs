mod commands;
mod state;

use commands::{
    audio::{cancel_recording, get_recording_status, start_recording, stop_recording},
    backend::{backend_status, start_backend, stop_backend, transcribe},
    hotkey::{get_hotkey_display, register_hotkey, unregister_hotkey},
    text_input::output_text,
};
use state::{BackendProcessState, HotkeyState, RecordingState};

pub fn run() {
    tauri::Builder::default()
        .manage(BackendProcessState::default())
        .manage(HotkeyState::default())
        .manage(RecordingState::default())
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
