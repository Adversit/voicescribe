use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;

#[derive(Default)]
pub struct BackendProcessState {
    pub child: Mutex<Option<Child>>,
    pub starting: Mutex<bool>,
    pub last_error: Mutex<Option<String>>,
}

#[derive(Default)]
pub struct HotkeyState {
    pub modifiers: Mutex<u32>,
    pub key_code: Mutex<i32>,
}

#[derive(Default)]
pub struct RecordingState {
    pub is_recording: Mutex<bool>,
    pub current_path: Mutex<Option<PathBuf>>,
}
