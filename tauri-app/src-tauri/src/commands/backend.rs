use crate::state::BackendProcessState;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const BACKEND_PORT: u16 = 8765;
const BASE_URL: &str = "http://127.0.0.1:8765";

#[derive(Debug, Clone, Serialize)]
pub struct BackendRuntimeStatus {
    running: bool,
    status: String,
    port: u16,
    backend_dir: String,
    runtime_dir: String,
    model_dir: String,
    python_path: Option<String>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub speaker: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscribeResult {
    pub text: String,
    pub segments: Vec<Segment>,
    pub duration: f64,
    pub engine: String,
    pub model: String,
}

fn dev_backend_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("backend")
}

fn resource_backend_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok().map(|dir| dir.join("backend"))
}

fn resolve_backend_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let candidates = [
        dev_backend_dir(),
        resource_backend_dir(app).unwrap_or_default(),
        env::current_dir().map_err(|err| err.to_string())?.join("backend"),
    ];

    candidates
        .into_iter()
        .find(|path| path.join("server.py").exists())
        .ok_or_else(|| "Unable to locate backend/server.py".to_string())
}

fn repo_runtime_dir(backend_dir: &Path) -> Option<PathBuf> {
    let root = backend_dir.parent()?;
    if root.join("backend").exists() && root.join("app").exists() {
        Some(root.to_path_buf())
    } else {
        None
    }
}

fn resolve_runtime_dir(app: &AppHandle, backend_dir: &Path) -> Result<PathBuf, String> {
    if let Some(runtime_dir) = repo_runtime_dir(backend_dir) {
        return Ok(runtime_dir);
    }

    let base = app
        .path()
        .app_data_dir()
        .or_else(|_| app.path().local_data_dir())
        .map_err(|err| err.to_string())?;
    Ok(base.join("runtime"))
}

fn ensure_runtime_dirs(runtime_dir: &Path) -> Result<(), String> {
    for path in [
        runtime_dir.to_path_buf(),
        runtime_dir.join("models"),
        runtime_dir.join("config"),
        runtime_dir.join("data").join("speakers"),
    ] {
        fs::create_dir_all(path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn resolve_python(app: &AppHandle, backend_dir: &Path) -> Option<String> {
    let embedded = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("python-embed").join("python.exe"));

    let venv_candidates = [
        backend_dir.join("venv").join("Scripts").join("python.exe"),
        backend_dir.join("venv").join("bin").join("python"),
    ];

    for candidate in embedded.into_iter().chain(venv_candidates.into_iter()) {
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    Some(if cfg!(target_os = "windows") {
        "python".to_string()
    } else {
        "python3".to_string()
    })
}

fn snapshot_status(
    running: bool,
    status: impl Into<String>,
    backend_dir: &Path,
    runtime_dir: &Path,
    python_path: Option<String>,
    last_error: Option<String>,
) -> BackendRuntimeStatus {
    BackendRuntimeStatus {
        running,
        status: status.into(),
        port: BACKEND_PORT,
        backend_dir: backend_dir.to_string_lossy().to_string(),
        runtime_dir: runtime_dir.to_string_lossy().to_string(),
        model_dir: runtime_dir.join("models").to_string_lossy().to_string(),
        python_path,
        last_error,
    }
}

#[tauri::command]
pub fn start_backend(
    app: AppHandle,
    state: State<'_, BackendProcessState>,
) -> Result<BackendRuntimeStatus, String> {
    let backend_dir = resolve_backend_dir(&app)?;
    let runtime_dir = resolve_runtime_dir(&app, &backend_dir)?;
    ensure_runtime_dirs(&runtime_dir)?;

    {
        let mut child_guard = state.child.lock().map_err(|_| "Backend mutex poisoned")?;
        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(None) => {
                    let last_error = state
                        .last_error
                        .lock()
                        .map_err(|_| "Backend mutex poisoned")?
                        .clone();
                    return Ok(snapshot_status(
                        true,
                        "running",
                        &backend_dir,
                        &runtime_dir,
                        None,
                        last_error,
                    ));
                }
                Ok(Some(_)) | Err(_) => {
                    *child_guard = None;
                }
            }
        }
    }

    let python_path = resolve_python(&app, &backend_dir);
    let python_cmd = python_path
        .clone()
        .ok_or_else(|| "Unable to resolve Python runtime".to_string())?;

    let mut command = Command::new(&python_cmd);
    command.arg(backend_dir.join("server.py"));
    command.current_dir(&backend_dir);
    command.env("PYTHONUNBUFFERED", "1");
    command.env("VOICESCRIBE_RUNTIME_DIR", &runtime_dir);
    command.env("VOICESCRIBE_MODEL_DIR", runtime_dir.join("models"));
    command.env("VOICESCRIBE_CONFIG_DIR", runtime_dir.join("config"));
    command.env(
        "VOICESCRIBE_SPEAKER_DIR",
        runtime_dir.join("data").join("speakers"),
    );

    match command.spawn() {
        Ok(child) => {
            *state.child.lock().map_err(|_| "Backend mutex poisoned")? = Some(child);
            *state
                .last_error
                .lock()
                .map_err(|_| "Backend mutex poisoned")? = None;
            Ok(snapshot_status(
                true,
                "starting",
                &backend_dir,
                &runtime_dir,
                python_path,
                None,
            ))
        }
        Err(err) => {
            let message = format!("Failed to start backend: {err}");
            *state
                .last_error
                .lock()
                .map_err(|_| "Backend mutex poisoned")? = Some(message.clone());
            Ok(snapshot_status(
                false,
                "error",
                &backend_dir,
                &runtime_dir,
                python_path,
                Some(message),
            ))
        }
    }
}

#[tauri::command]
pub fn stop_backend(
    app: AppHandle,
    state: State<'_, BackendProcessState>,
) -> Result<BackendRuntimeStatus, String> {
    let backend_dir = resolve_backend_dir(&app)?;
    let runtime_dir = resolve_runtime_dir(&app, &backend_dir)?;
    let mut child_guard = state.child.lock().map_err(|_| "Backend mutex poisoned")?;
    if let Some(child) = child_guard.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *child_guard = None;
    Ok(snapshot_status(
        false,
        "stopped",
        &backend_dir,
        &runtime_dir,
        None,
        state
            .last_error
            .lock()
            .map_err(|_| "Backend mutex poisoned")?
            .clone(),
    ))
}

#[tauri::command]
pub fn backend_status(
    app: AppHandle,
    state: State<'_, BackendProcessState>,
) -> Result<BackendRuntimeStatus, String> {
    let backend_dir = resolve_backend_dir(&app)?;
    let runtime_dir = resolve_runtime_dir(&app, &backend_dir)?;
    let running = {
        let mut child_guard = state.child.lock().map_err(|_| "Backend mutex poisoned")?;
        if let Some(child) = child_guard.as_mut() {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    };

    Ok(snapshot_status(
        running,
        if running { "running" } else { "idle" },
        &backend_dir,
        &runtime_dir,
        None,
        state
            .last_error
            .lock()
            .map_err(|_| "Backend mutex poisoned")?
            .clone(),
    ))
}

#[tauri::command]
pub async fn transcribe(
    audio_path: String,
    engine: String,
    model: String,
    language: String,
    enable_diarization: bool,
    hotwords: String,
    enable_ai_refine: bool,
) -> Result<TranscribeResult, String> {
    let client = reqwest::Client::new();
    let file = tokio::fs::read(&audio_path)
        .await
        .map_err(|err| err.to_string())?;

    let mut last_error = String::from("transcribe failed");

    for _attempt in 1..=30 {
        let form = reqwest::multipart::Form::new()
            .part(
                "audio",
                reqwest::multipart::Part::bytes(file.clone()).file_name("recording.wav"),
            )
            .text("engine", engine.clone())
            .text("model", model.clone())
            .text("language", language.clone())
            .text("enable_diarization", enable_diarization.to_string())
            .text("hotwords", hotwords.clone())
            .text("enable_ai_refine", enable_ai_refine.to_string());

        match client
            .post(format!("{BASE_URL}/transcribe"))
            .multipart(form)
            .timeout(Duration::from_secs(300))
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    return response.json::<TranscribeResult>().await.map_err(|err| err.to_string());
                }

                last_error = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "backend returned error".to_string());
            }
            Err(err) => {
                last_error = err.to_string();
            }
        }

        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    Err(last_error)
}
