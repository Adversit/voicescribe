use crate::commands::hotkey::log_hotkey;
use crate::state::BackendProcessState;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::fs::OpenOptions;
use std::io;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const BACKEND_PORT: u16 = 8765;
const BASE_URL: &str = "http://127.0.0.1:8765";
const BACKEND_SYNC_STAMP_FILENAME: &str = ".bundle-version";
const BACKEND_DEPS_STAMP_FILENAME: &str = ".deps-installed";
const BACKEND_START_LOCK_FILENAME: &str = ".startup.lock";

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
    pub asr_engine: String,
    pub asr_model: String,
    pub diarization_model: Option<String>,
    pub speaker_mapping_model: Option<String>,
}

fn dev_backend_dir() -> PathBuf {
    source_project_root_dir().join("backend")
}

fn current_exe_resource_dir(relative: &str) -> Option<PathBuf> {
    let current_exe = env::current_exe().ok()?;
    let parent = current_exe.parent()?;
    Some(parent.join("resources").join(relative))
}

fn resource_subdir(app: &AppHandle, relative: &str) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let resource_dir = dir.join(relative);
        if resource_dir.exists() {
            return Some(resource_dir);
        }
    }

    current_exe_resource_dir(relative).filter(|path| path.exists())
}

fn resource_backend_dir(app: &AppHandle) -> Option<PathBuf> {
    resource_subdir(app, "backend")
}

fn repo_runtime_dir(backend_dir: &Path) -> Option<PathBuf> {
    let root = backend_dir.parent()?;
    if root.join("backend").exists() && root.join("app").exists() {
        Some(root.to_path_buf())
    } else {
        None
    }
}

fn truthy_env(name: &str) -> bool {
    env::var(name)
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

fn runtime_override_dir() -> Option<PathBuf> {
    env::var_os("VOICESCRIBE_RUNTIME_OVERRIDE_DIR").map(PathBuf::from)
}

fn canonical_path(path: &Path) -> Option<PathBuf> {
    fs::canonicalize(path).ok()
}

fn path_is_within_root(path: &Path, root: &Path) -> bool {
    let Some(path) = canonical_path(path) else {
        return false;
    };
    let Some(root) = canonical_path(root) else {
        return false;
    };

    path.starts_with(root)
}

fn should_use_dev_project_tree_for_paths(
    current_exe: &Path,
    source_root: &Path,
    force_dev_mode: bool,
    force_packaged_mode: bool,
) -> bool {
    if force_dev_mode {
        return true;
    }
    if force_packaged_mode {
        return false;
    }

    source_root.join("backend").exists() && path_is_within_root(current_exe, source_root)
}

fn should_use_dev_project_tree() -> bool {
    let source_root = source_project_root_dir();
    let force_dev_mode = truthy_env("VOICESCRIBE_FORCE_DEV_MODE");
    let force_packaged_mode = truthy_env("VOICESCRIBE_FORCE_INSTALL_MODE")
        || truthy_env("VOICESCRIBE_FORCE_PACKAGED_MODE");

    let Some(current_exe) = env::current_exe().ok() else {
        return source_root.join("backend").exists() && !force_packaged_mode;
    };

    should_use_dev_project_tree_for_paths(
        &current_exe,
        &source_root,
        force_dev_mode,
        force_packaged_mode,
    )
}

fn resolve_runtime_dir(app: &AppHandle, backend_seed: &Path) -> Result<PathBuf, String> {
    if let Some(runtime_dir) = runtime_override_dir() {
        return Ok(runtime_dir);
    }

    let project_root = source_project_root_dir();
    if should_use_dev_project_tree() {
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

fn backend_sync_stamp_path(target: &Path) -> PathBuf {
    target.join(BACKEND_SYNC_STAMP_FILENAME)
}

fn backend_deps_stamp_path(target: &Path) -> PathBuf {
    target.join(BACKEND_DEPS_STAMP_FILENAME)
}

fn backend_dependencies_ready(backend_dir: &Path) -> bool {
    backend_deps_stamp_path(backend_dir).exists()
}

fn mark_backend_dependencies_ready(backend_dir: &Path) -> Result<(), String> {
    fs::write(backend_deps_stamp_path(backend_dir), b"ready").map_err(|err| err.to_string())
}

fn backend_start_lock_path(backend_dir: &Path) -> PathBuf {
    backend_dir.join(BACKEND_START_LOCK_FILENAME)
}

fn backend_start_locked(backend_dir: &Path) -> bool {
    backend_start_lock_path(backend_dir).exists()
}

fn acquire_backend_start_lock(backend_dir: &Path) -> Result<bool, String> {
    let lock_path = backend_start_lock_path(backend_dir);
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
    {
        Ok(_) => Ok(true),
        Err(err) if err.kind() == io::ErrorKind::AlreadyExists => Ok(false),
        Err(err) => Err(err.to_string()),
    }
}

fn release_backend_start_lock(backend_dir: &Path) {
    let _ = fs::remove_file(backend_start_lock_path(backend_dir));
}

fn backend_port_is_open() -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], BACKEND_PORT)),
        Duration::from_millis(250),
    )
    .is_ok()
}

fn kill_backend_processes(backend_dir: &Path) -> Result<(), String> {
    let server_path = backend_dir.join("server.py");
    let escaped = server_path.to_string_lossy().replace("'", "''");
    let command = format!(
        "Get-CimInstance Win32_Process | Where-Object {{ .Name -eq 'python.exe' -and .CommandLine -and .CommandLine -like '*{escaped}*' }} | ForEach-Object {{ Stop-Process -Id .ProcessId -Force -ErrorAction SilentlyContinue }}"
    );

    let status = Command::new("powershell")
        .args(["-NoProfile", "-Command", &command])
        .status()
        .map_err(|err| format!("Failed to stop backend processes: {err}"))?;
    if !status.success() {
        return Err("Failed to stop backend processes via PowerShell".to_string());
    }

    Ok(())
}

fn backend_bundle_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

fn backend_bundle_sync_required_for_version(
    target: &Path,
    bundle_version: &str,
    force_sync: bool,
) -> bool {
    if force_sync {
        return true;
    }

    let server_file = target.join("server.py");
    let stamp_file = backend_sync_stamp_path(target);
    if !server_file.exists() || !stamp_file.exists() {
        return true;
    }

    fs::read_to_string(stamp_file)
        .map(|value| value.trim() != bundle_version)
        .unwrap_or(true)
}

fn sync_backend_bundle(app: &AppHandle, source: &Path, target: &Path) -> Result<(), String> {
    let bundle_version = backend_bundle_version(app);
    let force_sync = truthy_env("VOICESCRIBE_FORCE_BACKEND_SYNC");

    if backend_bundle_sync_required_for_version(target, &bundle_version, force_sync) {
        copy_backend_tree(source, target)?;
        let _ = fs::remove_file(backend_deps_stamp_path(target));
        fs::write(backend_sync_stamp_path(target), bundle_version)
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}

fn resolve_backend_dir(app: &AppHandle, runtime_dir: &Path) -> Result<PathBuf, String> {
    let dev_dir = dev_backend_dir();
    if should_use_dev_project_tree() && dev_dir.join("server.py").exists() {
        return Ok(dev_dir);
    }

    if let Some(resource_dir) = resource_backend_dir(app) {
        if resource_dir.join("server.py").exists() {
            let runtime_backend_dir = runtime_dir.join("backend");
            sync_backend_bundle(app, &resource_dir, &runtime_backend_dir)?;
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
    resource_subdir(app, "python-embed")
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

fn ensure_backend_venv(
    app: &AppHandle,
    backend_dir: &Path,
    runtime_dir: &Path,
) -> Result<Option<String>, String> {
    if let Some(existing) = venv_python_candidates(backend_dir)
        .into_iter()
        .find(|candidate| candidate.exists())
    {
        if !backend_dependencies_ready(backend_dir) {
            let _ = fs::remove_file(backend_deps_stamp_path(backend_dir));
            install_requirements_command(&existing, backend_dir)?;
            mark_backend_dependencies_ready(backend_dir)?;
        }
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

    let _ = fs::remove_file(backend_deps_stamp_path(backend_dir));
    install_requirements_command(&venv_python, backend_dir)?;
    mark_backend_dependencies_ready(backend_dir)?;
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

    if backend_port_is_open() {
        release_backend_start_lock(&backend_dir);
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

    if backend_start_locked(&backend_dir) {
        let last_error = state
            .last_error
            .lock()
            .map_err(|_| "Backend mutex poisoned")?
            .clone();
        return Ok(snapshot_status(
            false,
            "starting",
            &backend_dir,
            &runtime_dir,
            None,
            last_error,
        ));
    }

    {
        let mut starting_guard = state
            .starting
            .lock()
            .map_err(|_| "Backend mutex poisoned")?;
        if *starting_guard {
            let last_error = state
                .last_error
                .lock()
                .map_err(|_| "Backend mutex poisoned")?
                .clone();
            return Ok(snapshot_status(
                false,
                "starting",
                &backend_dir,
                &runtime_dir,
                None,
                last_error,
            ));
        }
        *starting_guard = true;
    }

    let lock_acquired = acquire_backend_start_lock(&backend_dir)?;
    if !lock_acquired {
        *state
            .starting
            .lock()
            .map_err(|_| "Backend mutex poisoned")? = false;
        let last_error = state
            .last_error
            .lock()
            .map_err(|_| "Backend mutex poisoned")?
            .clone();
        return Ok(snapshot_status(
            false,
            "starting",
            &backend_dir,
            &runtime_dir,
            None,
            last_error,
        ));
    }

    let start_result = (|| {
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
                release_backend_start_lock(&backend_dir);
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
    })();

    *state
        .starting
        .lock()
        .map_err(|_| "Backend mutex poisoned")? = false;
    start_result
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
    let _ = kill_backend_processes(&backend_dir);
    *child_guard = None;
    *state
        .starting
        .lock()
        .map_err(|_| "Backend mutex poisoned")? = false;
    release_backend_start_lock(&backend_dir);
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
    let running = backend_port_is_open();
    let starting = backend_start_locked(&backend_dir)
        || *state
            .starting
            .lock()
            .map_err(|_| "Backend mutex poisoned")?;

    if running {
        release_backend_start_lock(&backend_dir);
    }

    Ok(snapshot_status(
        running,
        if running {
            "running"
        } else if starting {
            "starting"
        } else {
            "idle"
        },
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
    asr_engine: String,
    asr_model: String,
    diarization_model: Option<String>,
    speaker_mapping_model: Option<String>,
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

    log_hotkey(format!(
        "backend transcribe request engine={} model={} diarization_model={} speaker_mapping_model={} diarization={} ai_refine={} audio_path={}",
        asr_engine,
        asr_model,
        diarization_model.as_deref().unwrap_or("none"),
        speaker_mapping_model.as_deref().unwrap_or("none"),
        enable_diarization,
        enable_ai_refine,
        audio_path
    ));

    for attempt in 1..=30 {
        log_hotkey(format!(
            "backend transcribe attempt={} engine={} model={}",
            attempt, asr_engine, asr_model
        ));

        let mut form = reqwest::multipart::Form::new()
            .part(
                "audio",
                reqwest::multipart::Part::bytes(file.clone()).file_name("recording.wav"),
            )
            .text("asr_engine", asr_engine.clone())
            .text("asr_model", asr_model.clone())
            .text("language", language.clone())
            .text("enable_diarization", enable_diarization.to_string())
            .text("hotwords", hotwords.clone())
            .text("enable_ai_refine", enable_ai_refine.to_string());

        if let Some(value) = diarization_model.clone() {
            form = form.text("diarization_model", value);
        }
        if let Some(value) = speaker_mapping_model.clone() {
            form = form.text("speaker_mapping_model", value);
        }

        match client
            .post(format!("{BASE_URL}/transcribe"))
            .multipart(form)
            .timeout(Duration::from_secs(300))
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    log_hotkey(format!(
                        "backend transcribe success attempt={} status={}",
                        attempt, status
                    ));
                    return response
                        .json::<TranscribeResult>()
                        .await
                        .map_err(|err| err.to_string());
                }

                last_error = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "backend returned error".to_string());

                log_hotkey(format!(
                    "backend transcribe response_error attempt={} status={} body={}",
                    attempt, status, last_error
                ));

                if status.is_client_error()
                    && status != reqwest::StatusCode::REQUEST_TIMEOUT
                    && status != reqwest::StatusCode::TOO_MANY_REQUESTS
                {
                    return Err(last_error);
                }
            }
            Err(err) => {
                last_error = err.to_string();
                log_hotkey(format!(
                    "backend transcribe request_error attempt={} error={}",
                    attempt, last_error
                ));
            }
        }

        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    log_hotkey(format!(
        "backend transcribe failed after retries error={}",
        last_error
    ));
    Err(last_error)
}

#[cfg(test)]
mod tests {
    use super::{
        backend_bundle_sync_required_for_version, enable_embedded_site_import,
        extract_embedded_python_zip, runtime_embedded_python_dir,
        should_use_dev_project_tree_for_paths,
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
        let updated =
            fs::read_to_string(target_dir.join("python311._pth")).expect("read extracted pth");
        assert!(updated.contains("import site"));
        assert!(!updated.contains("#import site"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn dev_tree_detection_prefers_source_root_when_executable_is_inside_repo() {
        let root = temp_test_dir("dev-tree");
        let exe = root
            .join("tauri-app")
            .join("src-tauri")
            .join("target")
            .join("release")
            .join("voicescribe-desktop.exe");

        fs::create_dir_all(root.join("backend")).expect("create backend dir");
        fs::create_dir_all(exe.parent().expect("exe parent")).expect("create exe parent");
        fs::write(&exe, b"fake-exe").expect("write exe");

        assert!(should_use_dev_project_tree_for_paths(
            &exe, &root, false, false
        ));
        assert!(!should_use_dev_project_tree_for_paths(
            &exe, &root, false, true
        ));
        assert!(should_use_dev_project_tree_for_paths(
            &exe, &root, true, true
        ));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn dev_tree_detection_rejects_executable_outside_source_tree() {
        let root = temp_test_dir("packaged-root");
        let packaged_dir = temp_test_dir("packaged-exe");
        let packaged = packaged_dir.join("VoiceScribe.exe");

        fs::create_dir_all(root.join("backend")).expect("create backend dir");
        fs::create_dir_all(&packaged_dir).expect("create packaged parent");
        fs::write(&packaged, b"fake-exe").expect("write packaged exe");

        assert!(!should_use_dev_project_tree_for_paths(
            &packaged, &root, false, false
        ));

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&packaged_dir);
    }

    #[test]
    fn backend_bundle_sync_required_respects_stamp_file() {
        let dir = temp_test_dir("bundle-stamp");
        fs::create_dir_all(&dir).expect("create dir");
        fs::write(dir.join("server.py"), b"print('ok')").expect("write server");
        fs::write(dir.join(".bundle-version"), "0.2.0").expect("write stamp");

        assert!(!backend_bundle_sync_required_for_version(
            &dir, "0.2.0", false
        ));
        assert!(backend_bundle_sync_required_for_version(
            &dir, "0.2.1", false
        ));
        assert!(backend_bundle_sync_required_for_version(
            &dir, "0.2.0", true
        ));

        let _ = fs::remove_dir_all(&dir);
    }
}
