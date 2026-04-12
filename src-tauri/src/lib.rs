use std::env;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result as AnyhowResult, anyhow};
use kodeks_core::{ModelOption, RuntimeHandle, SessionSnapshot, ThreadConfigOverride, UserInputItem};
use serde::Deserialize;
use tauri::{Emitter, Manager, State};
use workspace_store::WorkspaceStorePayload;

mod git;
mod workspace_store;

struct DesktopState {
    runtime: RuntimeHandle,
    _single_instance: Option<SingleInstanceGuard>,
}

struct SingleInstanceGuard {
    _listener: TcpListener,
}

impl SingleInstanceGuard {
    fn acquire_for_current_session() -> AnyhowResult<Option<Self>> {
        if multi_instance_allowed() {
            return Ok(None);
        }

        let scope = user_session_scope();
        let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, session_lock_port_for_scope(&scope));
        Self::acquire(addr).map(Some)
    }

    fn acquire(addr: SocketAddrV4) -> AnyhowResult<Self> {
        let listener = match TcpListener::bind(addr) {
            Ok(listener) => listener,
            Err(error) if error.kind() == ErrorKind::AddrInUse => {
                return Err(anyhow!(
                    "Kodeks is already running for this user session. Set KODEKS_ALLOW_MULTI_INSTANCE=1 to allow multiple instances. Lock address: {addr}"
                ));
            }
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("failed to acquire the Kodeks single-instance lock on {addr}")
                });
            }
        };
        listener
            .set_nonblocking(true)
            .context("failed to configure the single-instance listener")?;
        Ok(Self {
            _listener: listener,
        })
    }
}

fn multi_instance_allowed() -> bool {
    env_flag("KODEKS_ALLOW_MULTI_INSTANCE")
}

fn env_flag(key: &str) -> bool {
    env::var(key)
        .ok()
        .map(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

fn user_session_scope() -> String {
    let user = ["USER", "USERNAME"]
        .iter()
        .find_map(|key| env::var(key).ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "shared-user".to_string());
    let session = [
        "XDG_SESSION_ID",
        "SESSIONNAME",
        "WAYLAND_DISPLAY",
        "DISPLAY",
        "DESKTOP_SESSION",
    ]
    .iter()
    .find_map(|key| env::var(key).ok())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| "default-session".to_string());

    format!("{user}:{session}")
}

fn session_lock_port_for_scope(scope: &str) -> u16 {
    const BASE_PORT: u16 = 45_100;
    const PORT_SPREAD: u16 = 2_000;

    let hash = scope.bytes().fold(2_166_136_261u32, |acc, byte| {
        acc.wrapping_mul(16_777_619) ^ u32::from(byte)
    });
    BASE_PORT + (hash % u32::from(PORT_SPREAD)) as u16
}

#[tauri::command]
async fn get_snapshot(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state.runtime.snapshot().await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn refresh_runtime(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state.runtime.refresh().await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn refresh_rate_limits(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .refresh_rate_limits()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn load_workspace_store(app: tauri::AppHandle) -> Result<WorkspaceStorePayload, String> {
    let base_dir = workspace_store_base_dir(&app).map_err(|error| error.to_string())?;
    workspace_store::load_workspace_store(&base_dir).map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_workspace_store(
    app: tauri::AppHandle,
    store: WorkspaceStorePayload,
) -> Result<(), String> {
    let base_dir = workspace_store_base_dir(&app).map_err(|error| error.to_string())?;
    workspace_store::save_workspace_store(&base_dir, &store).map_err(|error| error.to_string())
}

#[tauri::command]
async fn restart_runtime(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state.runtime.restart().await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn select_thread(
    state: State<'_, DesktopState>,
    thread_id: String,
    config: Option<ThreadConfigOverride>,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .select_thread_with_config(thread_id, config.unwrap_or_default())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn start_thread(
    state: State<'_, DesktopState>,
    cwd: String,
    prompt: String,
    attachments: Option<Vec<UserInputItem>>,
    config: Option<ThreadConfigOverride>,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .start_thread_with_config(
            cwd,
            prompt,
            attachments.unwrap_or_default(),
            config.unwrap_or_default(),
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn send_prompt(
    state: State<'_, DesktopState>,
    thread_id: String,
    prompt: String,
    attachments: Option<Vec<UserInputItem>>,
    config: Option<ThreadConfigOverride>,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .send_prompt_with_config(
            thread_id,
            prompt,
            attachments.unwrap_or_default(),
            config.unwrap_or_default(),
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn steer_turn(
    state: State<'_, DesktopState>,
    thread_id: String,
    turn_id: String,
    prompt: String,
    attachments: Option<Vec<UserInputItem>>,
    config: Option<ThreadConfigOverride>,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .steer_turn_with_config(
            thread_id,
            turn_id,
            prompt,
            attachments.unwrap_or_default(),
            config.unwrap_or_default(),
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn interrupt_turn(
    state: State<'_, DesktopState>,
    thread_id: String,
    turn_id: String,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .interrupt_turn(thread_id, turn_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn login_chatgpt(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .login_chatgpt()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn login_api_key(
    state: State<'_, DesktopState>,
    api_key: String,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .login_api_key(api_key)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn cancel_login(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .cancel_login()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn logout(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state.runtime.logout().await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn select_account(
    state: State<'_, DesktopState>,
    account_id: String,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .select_account(account_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn disconnect_account(
    state: State<'_, DesktopState>,
    account_id: String,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .disconnect_account(account_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn resolve_approval(
    state: State<'_, DesktopState>,
    request_id: String,
    decision: String,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .resolve_approval(request_id, decision)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn archive_thread(
    state: State<'_, DesktopState>,
    thread_id: String,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .archive_thread(thread_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn unarchive_thread(
    state: State<'_, DesktopState>,
    thread_id: String,
) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .unarchive_thread(thread_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_models(state: State<'_, DesktopState>) -> Result<Vec<ModelOption>, String> {
    state
        .runtime
        .list_models()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_workspace_file(base_dir: String, relative_path: String) -> Result<(), String> {
    let resolved =
        resolve_workspace_path(&base_dir, &relative_path).map_err(|error| error.to_string())?;
    open_in_system_editor(&resolved).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("only http/https URLs are supported".to_string());
    }
    open_external_target(trimmed).map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
struct WorkspaceFileSearchOptions {
    limit: Option<usize>,
}

#[tauri::command]
async fn pick_workspace_folder() -> Result<Option<String>, String> {
    pick_workspace_folder_impl().map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_workspace_files(
    base_dir: String,
    options: Option<WorkspaceFileSearchOptions>,
) -> Result<Vec<String>, String> {
    let root = resolve_workspace_root(&base_dir).map_err(|error| error.to_string())?;
    let limit = options.and_then(|value| value.limit).unwrap_or(600);
    list_workspace_files_impl(&root, limit).map_err(|error| error.to_string())
}

#[tauri::command]
async fn read_workspace_file(base_dir: String, relative_path: String) -> Result<String, String> {
    let resolved =
        resolve_workspace_path(&base_dir, &relative_path).map_err(|error| error.to_string())?;
    std::fs::read_to_string(&resolved)
        .with_context(|| format!("failed to read {}", resolved.display()))
        .map(truncate_file_content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_pasted_image(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    mime_type: Option<String>,
) -> Result<String, String> {
    let base_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("pasted-images");
    std::fs::create_dir_all(&base_dir)
        .with_context(|| format!("failed to create {}", base_dir.display()))
        .map_err(|error| error.to_string())?;

    let extension = image_extension_for_mime(mime_type.as_deref());
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let file_path = base_dir.join(format!("screenshot-{timestamp}.{extension}"));

    std::fs::write(&file_path, bytes)
        .with_context(|| format!("failed to write {}", file_path.display()))
        .map_err(|error| error.to_string())?;

    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn get_git_project(project_root: String) -> Result<Option<git::GitProjectSnapshot>, String> {
    git::get_git_project(project_root)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn read_git_file_diff(
    project_root: String,
    path: String,
    target: git::GitDiffTarget,
) -> Result<String, String> {
    git::read_git_file_diff(project_root, &path, target)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn stage_git_paths(
    project_root: String,
    paths: Vec<String>,
) -> Result<git::GitMutationResult, String> {
    git::stage_git_paths(project_root, paths)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn unstage_git_paths(
    project_root: String,
    paths: Vec<String>,
) -> Result<git::GitMutationResult, String> {
    git::unstage_git_paths(project_root, paths)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_git_branch(
    project_root: String,
    branch_name: String,
    checkout: bool,
) -> Result<git::GitMutationResult, String> {
    git::create_git_branch(project_root, &branch_name, checkout)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn checkout_git_branch(
    project_root: String,
    branch_name: String,
) -> Result<git::GitMutationResult, String> {
    git::checkout_git_branch(project_root, &branch_name)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn commit_git_index(
    project_root: String,
    request: git::GitCommitRequest,
) -> Result<git::GitMutationResult, String> {
    git::commit_git_index(project_root, request)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn push_git_branch(project_root: String) -> Result<git::GitMutationResult, String> {
    git::push_git_branch(project_root)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_git_snapshot(project_root: String) -> Result<git::GitMutationResult, String> {
    git::create_git_snapshot(project_root)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn restore_git_snapshot(
    project_root: String,
    snapshot_id: String,
) -> Result<git::GitMutationResult, String> {
    git::restore_git_snapshot(project_root, &snapshot_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn build_git_commit_prompt(
    project_root: String,
) -> Result<git::GitCommitPromptPayload, String> {
    git::build_git_commit_prompt(project_root)
        .await
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let single_instance = SingleInstanceGuard::acquire_for_current_session()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let account_storage_dir = workspace_store_base_dir(&app.handle())
                .map_err(|error| std::io::Error::other(error.to_string()))?
                .join("account-vault");
            let runtime = RuntimeHandle::new(account_storage_dir);
            let app_handle = app.handle().clone();
            let mut snapshot_rx = runtime.subscribe();

            tauri::async_runtime::spawn(async move {
                while snapshot_rx.changed().await.is_ok() {
                    let snapshot = snapshot_rx.borrow().clone();
                    let _ = app_handle.emit("kodeks://snapshot", snapshot);
                }
            });

            app.manage(DesktopState {
                runtime,
                _single_instance: single_instance,
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
    get_snapshot,
    refresh_runtime,
    refresh_rate_limits,
    load_workspace_store,
    save_workspace_store,
    restart_runtime,
            select_thread,
            start_thread,
            send_prompt,
            steer_turn,
            interrupt_turn,
            login_chatgpt,
            login_api_key,
            cancel_login,
            logout,
            select_account,
            disconnect_account,
            resolve_approval,
            archive_thread,
            unarchive_thread,
            list_models,
            pick_workspace_folder,
            list_workspace_files,
            read_workspace_file,
            open_workspace_file,
            open_external_url,
            save_pasted_image,
            get_git_project,
            read_git_file_diff,
            stage_git_paths,
            unstage_git_paths,
            create_git_branch,
            checkout_git_branch,
            commit_git_index,
            push_git_branch,
            create_git_snapshot,
            restore_git_snapshot,
            build_git_commit_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn image_extension_for_mime(mime_type: Option<&str>) -> &'static str {
    match mime_type.unwrap_or_default() {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

fn workspace_store_base_dir(app: &tauri::AppHandle) -> AnyhowResult<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|error| anyhow!(error.to_string()))
}

fn resolve_workspace_path(base_dir: &str, relative_path: &str) -> AnyhowResult<PathBuf> {
    let relative = PathBuf::from(relative_path);
    let candidate = if relative.is_absolute() {
        relative
    } else {
        PathBuf::from(base_dir).join(relative)
    };

    candidate
        .canonicalize()
        .with_context(|| format!("failed to resolve workspace file {}", candidate.display()))
}

fn resolve_workspace_root(base_dir: &str) -> AnyhowResult<PathBuf> {
    PathBuf::from(base_dir)
        .canonicalize()
        .with_context(|| format!("failed to resolve workspace root {}", base_dir))
}

fn open_in_system_editor(path: &PathBuf) -> AnyhowResult<()> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", &path.to_string_lossy()]);
        command
    };

    command
        .spawn()
        .with_context(|| format!("failed to open {}", path.display()))?;
    Ok(())
}

fn open_external_target(target: &str) -> AnyhowResult<()> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(target);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(target);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", target]);
        command
    };

    command
        .spawn()
        .with_context(|| format!("failed to open external target {target}"))?;
    Ok(())
}

fn pick_workspace_folder_impl() -> AnyhowResult<Option<String>> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args([
                "-e",
                r#"try
set chosenFolder to POSIX path of (choose folder with prompt "Choose workspace folder")
return chosenFolder
on error number -128
return ""
end try"#,
            ])
            .output()
            .context("failed to launch folder picker")?;

        if !output.status.success() {
            return Err(anyhow!("folder picker exited unsuccessfully"));
        }

        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if value.is_empty() {
            return Ok(None);
        }
        return Ok(Some(value));
    }

    #[cfg(target_os = "linux")]
    {
        let candidates = [
            ("zenity", vec!["--file-selection", "--directory"]),
            ("kdialog", vec!["--getexistingdirectory"]),
        ];

        for (binary, args) in candidates {
            if let Ok(output) = Command::new(binary).args(args).output() {
                if output.status.success() {
                    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if value.is_empty() {
                        return Ok(None);
                    }
                    return Ok(Some(value));
                }
            }
        }

        Err(anyhow!("no supported folder picker is available on this system"))
    }

    #[cfg(target_os = "windows")]
    {
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
"#;
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", script])
            .output()
            .context("failed to launch folder picker")?;
        if !output.status.success() {
            return Err(anyhow!("folder picker exited unsuccessfully"));
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if value.is_empty() {
            return Ok(None);
        }
        Ok(Some(value))
    }
}

fn list_workspace_files_impl(root: &Path, limit: usize) -> AnyhowResult<Vec<String>> {
    let mut files = Vec::new();
    collect_workspace_files(root, root, limit, &mut files)?;
    files.sort();
    Ok(files)
}

fn collect_workspace_files(
    root: &Path,
    current: &Path,
    limit: usize,
    files: &mut Vec<String>,
) -> AnyhowResult<()> {
    if files.len() >= limit {
        return Ok(());
    }

    for entry in std::fs::read_dir(current)
        .with_context(|| format!("failed to read {}", current.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();

        if should_skip_workspace_entry(&file_name) {
            continue;
        }

        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            collect_workspace_files(root, &path, limit, files)?;
            if files.len() >= limit {
                return Ok(());
            }
            continue;
        }

        if !is_supported_workspace_file(&path) {
            continue;
        }

        if let Ok(relative) = path.strip_prefix(root) {
            files.push(relative.to_string_lossy().replace('\\', "/"));
            if files.len() >= limit {
                return Ok(());
            }
        }
    }

    Ok(())
}

fn should_skip_workspace_entry(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "node_modules"
            | "dist"
            | "build"
            | "coverage"
            | "target"
            | ".next"
            | ".turbo"
            | ".cache"
    )
}

fn is_supported_workspace_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).unwrap_or_default(),
        "ts" | "tsx" | "js" | "jsx" | "rs" | "json" | "md" | "css" | "html" | "toml" | "yml" | "yaml"
    )
}

fn truncate_file_content(mut value: String) -> String {
    const LIMIT: usize = 200_000;
    if value.len() <= LIMIT {
        return value;
    }

    value.truncate(LIMIT);
    value.push_str("\n…\n[truncated]");
    value
}

#[cfg(test)]
mod tests {
    use super::session_lock_port_for_scope;

    #[test]
    fn session_lock_port_is_stable_for_the_same_scope() {
        let scope = "furkan:desktop-session";
        let first = session_lock_port_for_scope(scope);
        let second = session_lock_port_for_scope(scope);

        assert_eq!(first, second);
        assert!((45_100..47_100).contains(&first));
    }

    #[test]
    fn session_lock_port_varies_with_scope() {
        let first = session_lock_port_for_scope("furkan:desktop-session");
        let second = session_lock_port_for_scope("furkan:second-session");

        assert_ne!(first, second);
    }
}
