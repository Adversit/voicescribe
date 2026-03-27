use crate::state::BackendProcessState;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const BACKEND_PORT: u16 = 8765;
const BASE_URL: &str = "http://127.0.0.1:8765";

fn source_project_root_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
}

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
    source_project_root_dir().join("backend")
}

fn resource_backend_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok().map(|dir| dir.join("backend"))
}

fn repo_runtime_dir(backend_dir: &Path) -> Option<PathBuf> {
    let root = backend_dir.parent()?;
    if root.join("backend").exists() && root.join("app").exists() {
        Some(root.to_path_buf())
    } else {
        None
    }
}

fn resolve_runtime_dir(app: &AppHandle, backend_seed: &Path) -> Result<PathBuf, String> {
    let project_root = source_project_root_dir();
    if project_root.join("backend").exists() {
        return Ok(project_root);
    }

    if let Some(runtime_dir) = repo_runtime_dir(backend_seed) {
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
        runtime_dir.join("backend"),
        runtime_dir.join("models"),
        runtime_dir.join("config"),
        runtime_dir.join("data").join("speakers"),
    ] {
        fs::create_dir_all(path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn copy_backend_tree(source: &Path, target: &Path) -> Result<(), String> {
    fn copy_dir_recursive(source: &Path, target: &Path) -> io::Result<()> {
        fs::create_dir_all(target)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            let source_path = entry.path();
            let target_path = target.join(entry.file_name());
            if source_path.is_dir() {
                let name = entry.file_name();
                if name == "__pycache__" || name == "venv" {
                    continue;
                }
                copy_dir_recursive(&source_path, &target_path)?;
            } else {
                fs::copy(&source_path, &target_path)?;
            }
        }
        Ok(())
    }

    copy_dir_recursive(source, target).map_err(|err| err.to_string())
}

fn resolve_backend_dir(app: &AppHandle, runtime_dir: &Path) -> Result<PathBuf, String> {
    let dev_dir = dev_backend_dir();
    if dev_dir.join("server.py").exists() {
        return Ok(dev_dir);
    }

    if let Some(resource_dir) = resource_backend_dir(app) {
        if resource_dir.join("server.py").exists() {
            let runtime_backend_dir = runtime_dir.join("backend");
            copy_backend_tree(&resource_dir, &runtime_backend_dir)?;
            return Ok(runtime_backend_dir);
        }
    }

    let cwd_backend_dir = env::current_dir()
        .map_err(|err| err.to_string())?
        .join("backend");
    if cwd_backend_dir.join("server.py").exists() {
        return Ok(cwd_backend_dir);
    }

    Err("Unable to locate backend/server.py".to_string())
}

fn resource_embedded_python_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok().map(|dir| dir.join("python-embed"))
}

fn runtime_embedded_python_dir(runtime_dir: &Path) -> PathBuf {
    runtime_dir.join("python-embed")
}

fn embedded_python_executable(dir: &Path) -> PathBuf {
    dir.join("python.exe")
}

fn enable_embedded_site_import(dir: &Path) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if !name.starts_with("python") || !name.ends_with("._pth") {
            continue;
        }

        let contents = fs::read_to_string(&path).map_err(|err| err.to_string())?;
        let next = contents.replace("#import site", "import site");
        if next != contents {
            fs::write(&path, next).map_err(|err| err.to_string())?;
        }
    }

    Ok(())
}

fn extract_embedded_python_zip(zip_file: &Path, target_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(target_dir).map_err(|err| err.to_string())?;

    let command = format!(
        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
        zip_file.display(),
        target_dir.display()
    );

    let status = Command::new("powershell")
        .args(["-NoProfile", "-Command", &command])
        .status()
        .map_err(|err| format!("Failed to extract embedded python zip: {err}"))?;
    if !status.success() {
        return Err("Expand-Archive for embedded python failed".to_string());
    }

    enable_embedded_site_import(target_dir)?;

    let python = embedded_python_executable(target_dir);
    if !python.exists() {
        return Err("Embedded python zip extracted, but python.exe was not found".to_string());
    }

    Ok(())
}

fn resolve_embedded_python(app: &AppHandle, runtime_dir: &Path) -> Option<PathBuf> {
    if let Some(resource_dir) = resource_embedded_python_dir(app) {
        let resource_python = embedded_python_executable(&resource_dir);
        if resource_python.exists() {
            let _ = enable_embedded_site_import(&resource_dir);
            return Some(resource_python);
        }
    }

    let runtime_python_dir = runtime_embedded_python_dir(runtime_dir);
    let runtime_python = embedded_python_executable(&runtime_python_dir);
    if runtime_python.exists() {
        let _ = enable_embedded_site_import(&runtime_python_dir);
        return Some(runtime_python);
    }

    let resource_dir = resource_embedded_python_dir(app)?;
    let zip_file = resource_dir.join("python-embed.zip");
    if !zip_file.exists() {
        return None;
    }

    if extract_embedded_python_zip(&zip_file, &runtime_python_dir).is_ok() {
        let python = embedded_python_executable(&runtime_python_dir);
        if python.exists() {
            return Some(python);
        }
    }

    None
}

fn resolve_system_python() -> Option<PathBuf> {
    let candidates = if cfg!(target_os = "windows") {
        ["python.exe", "python3.exe", "python", "python3"]
    } else {
        ["python3", "python", "python3", "python"]
    };

    for candidate in candidates {
        if let Some(found) = env::var_os("PATH").and_then(|paths| {
            env::split_paths(&paths)
                .map(|dir| dir.join(candidate))
                .find(|path| path.exists())
        }) {
            return Some(found);
        }
    }

    None
}

fn python_supports_venv(python: &Path) -> bool {
    Command::new(python)
        .args(["-c", "import venv"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn resolve_bootstrap_python(app: &AppHandle, runtime_dir: &Path) -> Option<PathBuf> {
    if let Some(embedded) = resolve_embedded_python(app, runtime_dir) {
        if python_supports_venv(&embedded) {
            return Some(embedded);
        }
    }

    resolve_system_python().filter(|python| python_supports_venv(python))
}

fn venv_python_candidates(backend_dir: &Path) -> [PathBuf; 2] {
    [
        backend_dir.join("venv").join("Scripts").join("python.exe"),
        backend_dir.join("venv").join("bin").join("python"),
    ]
}

fn resolve_python(app: &AppHandle, backend_dir: &Path, runtime_dir: &Path) -> Option<String> {
    let venv_candidates = venv_python_candidates(backend_dir);
    let embedded = resolve_embedded_python(app, runtime_dir);

    for candidate in venv_candidates.into_iter().chain(embedded.into_iter()) {
        if candidate.exists() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    resolve_system_python().map(|path| path.to_string_lossy().to_string())
}

fn install_requirements_command(venv_python: &Path, backend_dir: &Path) -> Result<(), String> {
    let requirements = backend_dir.join("requirements-minimal.txt");

    let status = Command::new(venv_python)
        .args(["-m", "pip", "install", "--upgrade", "pip"])
        .current_dir(backend_dir)
        .status()
        .map_err(|err| format!("Failed to upgrade pip: {err}"))?;
    if !status.success() {
        return Err("pip upgrade failed".to_string());
    }

    let status = Command::new(venv_python)
        .args(["-m", "pip", "install", "-r"])
        .arg(&requirements)
        .current_dir(backend_dir)
        .status()
        .map_err(|err| format!("Failed to install backend dependencies: {err}"))?;
    if !status.success() {
        return Err("pip install -r requirements-minimal.txt failed".to_string());
    }

    Ok(())
}

fn ensure_backend_venv(app: &AppHandle, backend_dir: &Path, runtime_dir: &Path) -> Result<Option<String>, String> {
    if let Some(existing) = venv_python_candidates(backend_dir)
        .into_iter()
        .find(|candidate| candidate.exists())
    {
        return Ok(Some(existing.to_string_lossy().to_string()));
    }

    let Some(bootstrap_python) = resolve_bootstrap_python(app, runtime_dir) else {
        return Ok(None);
    };

    let venv_dir = backend_dir.join("venv");
    let status = Command::new(&bootstrap_python)
        .args(["-m", "venv"])
        .arg(&venv_dir)
        .current_dir(backend_dir)
        .status()
        .map_err(|err| format!("Failed to create backend venv: {err}"))?;
    if !status.success() {
        return Err("python -m venv backend/venv failed".to_string());
    }

    let venv_python = venv_python_candidates(backend_dir)
        .into_iter()
        .find(|candidate| candidate.exists())
        .ok_or_else(|| "Backend venv created, but python executable was not found".to_string())?;

    install_requirements_command(&venv_python, backend_dir)?;
    Ok(Some(venv_python.to_string_lossy().to_string()))
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
    let backend_seed = resource_backend_dir(&app).unwrap_or_else(dev_backend_dir);
    let runtime_dir = resolve_runtime_dir(&app, &backend_seed)?;
    ensure_runtime_dirs(&runtime_dir)?;
    let backend_dir = resolve_backend_dir(&app, &runtime_dir)?;

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

    let python_path = ensure_backend_venv(&app, &backend_dir, &runtime_dir)?;
    let python_cmd = python_path
        .clone()
        .or_else(|| resolve_python(&app, &backend_dir, &runtime_dir))
        .ok_or_else(|| "Unable to resolve Python runtime. Prepare python-embed or install system Python with venv support.".to_string())?;

    let mut command = Command::new(&python_cmd);
    command.arg(backend_dir.join("server.py"));
    command.current_dir(&backend_dir);
    command.env("PYTHONUNBUFFERED", "1");
    command.env("VOICESCRIBE_ROOT", runtime_dir.clone());
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
                Some(python_cmd),
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
                Some(python_cmd),
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
    let backend_seed = resource_backend_dir(&app).unwrap_or_else(dev_backend_dir);
    let runtime_dir = resolve_runtime_dir(&app, &backend_seed)?;
    let backend_dir = resolve_backend_dir(&app, &runtime_dir)?;
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
    let backend_seed = resource_backend_dir(&app).unwrap_or_else(dev_backend_dir);
    let runtime_dir = resolve_runtime_dir(&app, &backend_seed)?;
    let backend_dir = resolve_backend_dir(&app, &runtime_dir)?;
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
                    return response
                        .json::<TranscribeResult>()
                        .await
                        .map_err(|err| err.to_string());
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

#[cfg(test)]
mod tests {
    use super::{
        enable_embedded_site_import, extract_embedded_python_zip, runtime_embedded_python_dir,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock drift")
            .as_nanos();
        std::env::temp_dir().join(format!("voicescribe-{name}-{nanos}"))
    }

    #[test]
    fn enable_embedded_site_import_uncomments_python_pth_files() {
        let dir = temp_test_dir("embed-pth");
        fs::create_dir_all(&dir).expect("create temp dir");
        let pth_file = dir.join("python311._pth");
        fs::write(&pth_file, "python311.zip\n#import site\n").expect("write pth");

        enable_embedded_site_import(&dir).expect("enable import site");

        let updated = fs::read_to_string(&pth_file).expect("read updated pth");
        assert!(updated.contains("import site"));
        assert!(!updated.contains("#import site"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn runtime_embedded_python_dir_is_nested_under_runtime_dir() {
        let runtime_root = PathBuf::from("C:/voicescribe/runtime");
        assert_eq!(
            runtime_embedded_python_dir(&runtime_root),
            runtime_root.join("python-embed")
        );
    }

    #[test]
    fn extract_embedded_python_zip_expands_runtime_and_uncomments_pth() {
        let root = temp_test_dir("embed-zip");
        let source_dir = root.join("source");
        let target_dir = root.join("target");
        let zip_file = root.join("python-embed.zip");
        fs::create_dir_all(&source_dir).expect("create source dir");
        fs::write(source_dir.join("python.exe"), b"fake-python").expect("write python exe");
        fs::write(
            source_dir.join("python311._pth"),
            "python311.zip\n#import site\n",
        )
        .expect("write pth");

        let command = format!(
            "Compress-Archive -Path '{}' -DestinationPath '{}' -Force",
            source_dir.join("*").display(),
            zip_file.display()
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", &command])
            .status()
            .expect("compress archive");
        assert!(status.success(), "compress archive should succeed");

        extract_embedded_python_zip(&zip_file, &target_dir).expect("extract embedded zip");

        assert!(target_dir.join("python.exe").exists());
        let updated = fs::read_to_string(target_dir.join("python311._pth"))
            .expect("read extracted pth");
        assert!(updated.contains("import site"));
        assert!(!updated.contains("#import site"));

        let _ = fs::remove_dir_all(&root);
    }
}

