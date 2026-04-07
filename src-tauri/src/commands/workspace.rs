use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const MAX_TEXT_PREVIEW_BYTES: u64 = 1_048_576;
const DEFAULT_SHELL_TIMEOUT_MS: u64 = 30_000;
const MAX_SHELL_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_SHELL_OUTPUT_BYTES: usize = 512_000;
const MAX_SHELL_OUTPUT_BYTES: usize = 2_000_000;

#[derive(Debug, serde::Serialize)]
pub struct WorkspaceInfo {
    pub name: String,
    pub path: String,
    pub is_git_repo: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct WorkspaceDirEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: Option<u64>,
}

#[derive(Debug, serde::Serialize)]
pub struct WorkspaceDirList {
    pub path: String,
    pub entries: Vec<WorkspaceDirEntry>,
}

#[derive(Debug, serde::Serialize)]
pub struct WorkspaceTextFile {
    pub path: String,
    pub content: Option<String>,
    pub size: u64,
    pub truncated: bool,
    pub is_binary: bool,
    pub encoding_error: Option<String>,
    pub limit_bytes: u64,
}

#[derive(Debug, serde::Serialize)]
pub struct WorkspaceShellResult {
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
    pub timed_out: bool,
    pub truncated: bool,
    pub duration_ms: u128,
}

#[derive(Debug, serde::Deserialize)]
pub struct WorkspaceShellRunRequest {
    pub cwd: String,
    pub command: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub max_output_bytes: Option<usize>,
}

#[tauri::command]
pub async fn workspace_info(path: String) -> Result<WorkspaceInfo, String> {
    let resolved = resolve_workspace_path(Some(path.trim()))?;
    Ok(WorkspaceInfo {
        name: workspace_name(&resolved),
        path: resolved.to_string_lossy().to_string(),
        is_git_repo: is_git_repo(&resolved),
    })
}

#[tauri::command]
pub async fn workspace_list_dir(cwd: String, path: String) -> Result<WorkspaceDirList, String> {
    let cwd_path = resolve_workspace_path(Some(&cwd))?;
    let target = crate::tools::context::resolve_and_validate_path(&cwd_path, &path)?;
    if !target.is_dir() {
        return Err(format!("'{}' is not a directory", path));
    }

    let mut entries = std::fs::read_dir(&target)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            let path = entry.path();
            Some(WorkspaceDirEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: relative_path(&cwd_path, &path),
                kind: if metadata.is_dir() {
                    "directory".to_string()
                } else {
                    "file".to_string()
                },
                size: metadata.is_file().then_some(metadata.len()),
            })
        })
        .collect::<Vec<_>>();

    entries.sort_by(|a, b| b.kind.cmp(&a.kind).then_with(|| a.name.cmp(&b.name)));

    Ok(WorkspaceDirList {
        path: relative_path(&cwd_path, &target),
        entries,
    })
}

#[tauri::command]
pub async fn workspace_read_text_file(
    cwd: String,
    path: String,
) -> Result<WorkspaceTextFile, String> {
    let cwd_path = resolve_workspace_path(Some(&cwd))?;
    let target = crate::tools::context::resolve_and_validate_path(&cwd_path, &path)?;
    if !target.is_file() {
        return Err(format!("'{}' is not a file", path));
    }
    let metadata = target
        .metadata()
        .map_err(|e| format!("Cannot read file metadata '{}': {}", path, e))?;
    let size = metadata.len();
    let mut bytes =
        std::fs::read(&target).map_err(|e| format!("Cannot read file '{}': {}", path, e))?;
    let truncated = size > MAX_TEXT_PREVIEW_BYTES;
    if truncated {
        bytes.truncate(MAX_TEXT_PREVIEW_BYTES as usize);
    }

    let is_binary = bytes.contains(&0);
    if is_binary {
        return Ok(WorkspaceTextFile {
            path: relative_path(&cwd_path, &target),
            content: None,
            size,
            truncated,
            is_binary: true,
            encoding_error: None,
            limit_bytes: MAX_TEXT_PREVIEW_BYTES,
        });
    }

    match String::from_utf8(bytes) {
        Ok(content) => Ok(WorkspaceTextFile {
            path: relative_path(&cwd_path, &target),
            content: Some(content),
            size,
            truncated,
            is_binary: false,
            encoding_error: None,
            limit_bytes: MAX_TEXT_PREVIEW_BYTES,
        }),
        Err(error) => Ok(WorkspaceTextFile {
            path: relative_path(&cwd_path, &target),
            content: None,
            size,
            truncated,
            is_binary: false,
            encoding_error: Some(error.to_string()),
            limit_bytes: MAX_TEXT_PREVIEW_BYTES,
        }),
    }
}

#[tauri::command]
pub async fn workspace_shell_run(
    request: WorkspaceShellRunRequest,
) -> Result<WorkspaceShellResult, String> {
    let cwd_path = resolve_workspace_path(Some(&request.cwd))?;
    let command = request.command.trim().to_string();
    if command.trim().is_empty() {
        return Err("Command cannot be empty".to_string());
    }
    if is_denied_shell_command(&command) {
        return Err(format!(
            "Command '{}' is denied by workspace shell policy",
            command
        ));
    }
    let settings = crate::infrastructure::config::load_settings();
    if settings
        .permission
        .denied_commands
        .iter()
        .any(|denied| !denied.trim().is_empty() && command.starts_with(denied.trim()))
    {
        return Err(format!("Command '{}' is denied by user settings", command));
    }

    let timeout_ms = request
        .timeout_ms
        .unwrap_or(DEFAULT_SHELL_TIMEOUT_MS)
        .min(MAX_SHELL_TIMEOUT_MS);
    let max_output_bytes = request
        .max_output_bytes
        .unwrap_or(DEFAULT_SHELL_OUTPUT_BYTES)
        .min(MAX_SHELL_OUTPUT_BYTES);
    let started_at = Instant::now();

    let mut child = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &command])
            .current_dir(&cwd_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    } else {
        Command::new("sh")
            .args(["-c", &command])
            .current_dir(&cwd_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }
    .map_err(|e| format!("Cannot run command '{}': {}", command, e))?;

    let mut timed_out = false;
    let output = loop {
        if let Some(_status) = child.try_wait().map_err(|e| e.to_string())? {
            break child.wait_with_output().map_err(|e| e.to_string())?;
        }
        if started_at.elapsed() >= Duration::from_millis(timeout_ms) {
            timed_out = true;
            let _ = child.kill();
            break child.wait_with_output().map_err(|e| e.to_string())?;
        }
        std::thread::sleep(Duration::from_millis(25));
    };

    let (stdout, stdout_truncated) = decode_limited_output(&output.stdout, max_output_bytes);
    let (stderr, stderr_truncated) = decode_limited_output(&output.stderr, max_output_bytes);

    Ok(WorkspaceShellResult {
        command,
        stdout,
        stderr,
        exit_code: output.status.code().unwrap_or(-1),
        success: output.status.success() && !timed_out,
        timed_out,
        truncated: stdout_truncated || stderr_truncated,
        duration_ms: started_at.elapsed().as_millis(),
    })
}

pub fn resolve_workspace_path(path: Option<&str>) -> Result<PathBuf, String> {
    let raw = match path.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => PathBuf::from(value),
        None => std::env::current_dir().map_err(|e| format!("Cannot read current dir: {e}"))?,
    };

    let canonical = raw
        .canonicalize()
        .map_err(|e| format!("Cannot resolve workspace '{}': {e}", raw.display()))?;

    if !canonical.is_dir() {
        return Err(format!(
            "Workspace '{}' is not a directory",
            canonical.display()
        ));
    }

    Ok(canonical)
}

fn workspace_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.display().to_string())
}

fn is_git_repo(path: &Path) -> bool {
    Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(path)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn is_denied_shell_command(command: &str) -> bool {
    let normalized = command.trim().to_ascii_lowercase();
    let denied_prefixes = [
        "rm -rf /",
        "sudo rm -rf",
        "shutdown",
        "reboot",
        "format ",
        "diskpart",
    ];

    denied_prefixes
        .iter()
        .any(|prefix| normalized.starts_with(prefix))
}

fn decode_limited_output(bytes: &[u8], max_bytes: usize) -> (String, bool) {
    let truncated = bytes.len() > max_bytes;
    let mut slice = if truncated {
        &bytes[..max_bytes]
    } else {
        bytes
    };
    let mut buffer = Vec::with_capacity(slice.len());
    let _ = slice.read_to_end(&mut buffer);
    (String::from_utf8_lossy(&buffer).to_string(), truncated)
}

fn relative_path(cwd: &Path, path: &Path) -> String {
    let base = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
    let resolved = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    resolved
        .strip_prefix(base)
        .map(|path| {
            let value = path.to_string_lossy().replace('\\', "/");
            if value.is_empty() {
                ".".to_string()
            } else {
                value
            }
        })
        .unwrap_or_else(|_| resolved.to_string_lossy().replace('\\', "/"))
}
