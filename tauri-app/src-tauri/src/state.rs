use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;

#[derive(Default)]
pub struct BackendProcessState {
    pub child: Mutex<Option<Child>>,
    pub starting: Mutex<bool>,
    pub last_error: Mutex<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyBinding {
    pub keys: Vec<u32>,
    pub display: String,
}

impl Default for HotkeyBinding {
    fn default() -> Self {
        Self {
            keys: vec![0xA5],
            display: "\u{53f3} Alt".to_string(),
        }
    }
}

#[derive(Default)]
pub struct HotkeyState {
    pub binding: Mutex<HotkeyBinding>,
}

#[derive(Default)]
pub struct RecordingState {
    pub is_recording: Mutex<bool>,
    pub current_path: Mutex<Option<PathBuf>>,
}
