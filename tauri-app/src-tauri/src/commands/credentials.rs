#[cfg(windows)]
use windows::core::{Error as WindowsError, PCWSTR, PWSTR};
#[cfg(windows)]
use windows::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC,
};

const ERROR_NOT_FOUND_HRESULT: i32 = -2147023728;

fn credential_target(category: &str, engine: &str, model: &str) -> String {
    format!("VoiceScribe:model-download-token:{category}:{engine}:{model}")
}

#[cfg(windows)]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(core::iter::once(0)).collect()
}

#[cfg(windows)]
fn is_not_found(error: &WindowsError) -> bool {
    error.code().0 == ERROR_NOT_FOUND_HRESULT
}

#[cfg(windows)]
#[tauri::command]
pub fn get_model_download_token(
    category: String,
    engine: String,
    model: String,
) -> Result<Option<String>, String> {
    let target = credential_target(&category, &engine, &model);
    let target_wide = wide_null(&target);
    let mut credential = core::ptr::null_mut();

    unsafe {
        match CredReadW(PCWSTR(target_wide.as_ptr()), CRED_TYPE_GENERIC, 0, &mut credential) {
            Ok(()) => {
                if credential.is_null() {
                    return Ok(None);
                }

                let blob =
                    core::slice::from_raw_parts((*credential).CredentialBlob, (*credential).CredentialBlobSize as usize)
                        .to_vec();
                CredFree(credential.cast());

                if blob.is_empty() {
                    return Ok(None);
                }

                String::from_utf8(blob)
                    .map(Some)
                    .map_err(|_| "Saved token is not valid UTF-8".to_string())
            }
            Err(error) if is_not_found(&error) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub fn get_model_download_token(
    _category: String,
    _engine: String,
    _model: String,
) -> Result<Option<String>, String> {
    Err("Windows Credential Manager is only available on Windows".to_string())
}

#[cfg(windows)]
#[tauri::command]
pub fn save_model_download_token(
    category: String,
    engine: String,
    model: String,
    token: String,
) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("Token 不能为空".to_string());
    }

    let mut token_bytes = trimmed.as_bytes().to_vec();
    if token_bytes.len() > 512 {
        return Err("Token 超出 Windows Credential Manager 通用凭据长度限制".to_string());
    }

    let target = credential_target(&category, &engine, &model);
    let target_wide = wide_null(&target);
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target_wide.as_ptr() as *mut _),
        CredentialBlobSize: token_bytes.len() as u32,
        CredentialBlob: token_bytes.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };

    unsafe { CredWriteW(&credential, 0).map_err(|error| error.to_string()) }
}

#[cfg(not(windows))]
#[tauri::command]
pub fn save_model_download_token(
    _category: String,
    _engine: String,
    _model: String,
    _token: String,
) -> Result<(), String> {
    Err("Windows Credential Manager is only available on Windows".to_string())
}

#[cfg(windows)]
#[tauri::command]
pub fn delete_model_download_token(
    category: String,
    engine: String,
    model: String,
) -> Result<(), String> {
    let target = credential_target(&category, &engine, &model);
    let target_wide = wide_null(&target);

    unsafe {
        match CredDeleteW(PCWSTR(target_wide.as_ptr()), CRED_TYPE_GENERIC, 0) {
            Ok(()) => Ok(()),
            Err(error) if is_not_found(&error) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub fn delete_model_download_token(
    _category: String,
    _engine: String,
    _model: String,
) -> Result<(), String> {
    Err("Windows Credential Manager is only available on Windows".to_string())
}
