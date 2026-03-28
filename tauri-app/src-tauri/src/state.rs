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
pub struct HotkeyModifiersDetailed {
    pub ctrl: bool,
    pub shift: bool,
    pub win: bool,
    pub alt_left: bool,
    pub alt_right: bool,
}

impl Default for HotkeyModifiersDetailed {
    fn default() -> Self {
        Self {
            ctrl: true,
            shift: true,
            win: false,
            alt_left: false,
            alt_right: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyBinding {
    pub primary_code: String,
    pub primary_key_code: i32,
    pub display: String,
    pub modifiers: HotkeyModifiersDetailed,
}

impl Default for HotkeyBinding {
    fn default() -> Self {
        Self {
            primary_code: "KeyR".to_string(),
            primary_key_code: 82,
            display: "Ctrl+Shift+R".to_string(),
            modifiers: HotkeyModifiersDetailed::default(),
        }
    }
}

#[derive(Default)]
pub struct HotkeyState {
    pub modifiers: Mutex<u32>,
    pub key_code: Mutex<i32>,
    pub binding: Mutex<HotkeyBinding>,
}

#[derive(Default)]
pub struct RecordingState {
    pub is_recording: Mutex<bool>,
    pub current_path: Mutex<Option<PathBuf>>,
}
