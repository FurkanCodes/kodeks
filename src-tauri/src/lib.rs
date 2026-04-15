use std::env;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result as AnyhowResult};
use kodeks_core::{
    ModelOption, RuntimeHandle, SessionSnapshot, ThreadConfigOverride, UserInputItem,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use tauri::{Emitter, Manager, State};
use workspace_store::WorkspaceStorePayload;

mod catalog;
mod browser;
mod git;
mod terminal;
mod workspace_store;

struct DesktopState {
    catalog: Mutex<catalog::CatalogRepository>,
    browser: Mutex<browser::BrowserManager>,
    terminal: Mutex<terminal::TerminalManager>,
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
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes"
            )
        })
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

fn catalog_state<'a>(
    state: &'a State<'_, DesktopState>,
) -> Result<MutexGuard<'a, catalog::CatalogRepository>, String> {
    state
        .catalog
        .lock()
        .map_err(|_| "catalog state is unavailable".to_string())
}

fn terminal_state<'a>(
    state: &'a State<'_, DesktopState>,
) -> Result<MutexGuard<'a, terminal::TerminalManager>, String> {
    state
        .terminal
        .lock()
        .map_err(|_| "terminal state is unavailable".to_string())
}

fn browser_state<'a>(
    state: &'a State<'_, DesktopState>,
) -> Result<MutexGuard<'a, browser::BrowserManager>, String> {
    state
        .browser
        .lock()
        .map_err(|_| "browser state is unavailable".to_string())
}

async fn fetch_app_server_plugins(
    runtime: &RuntimeHandle,
    project_root: Option<&str>,
    force_remote_sync: bool,
) -> Option<catalog::AppServerPluginListResponse> {
    let mut params = serde_json::Map::new();
    if let Some(project_root) = project_root.filter(|value| !value.trim().is_empty()) {
        params.insert("cwds".to_string(), json!([project_root]));
    }
    if force_remote_sync {
        params.insert("forceRemoteSync".to_string(), JsonValue::Bool(true));
    }

    runtime
        .request_app_server("plugin/list".to_string(), Some(JsonValue::Object(params)))
        .await
        .ok()
        .and_then(|value| {
            serde_json::from_value::<catalog::AppServerPluginListResponse>(value).ok()
        })
}

async fn fetch_app_server_plugin_detail(
    runtime: &RuntimeHandle,
    locator: &catalog::AppServerPluginLocator,
) -> Option<catalog::AppServerPluginReadResponse> {
    runtime
        .request_app_server(
            "plugin/read".to_string(),
            Some(json!({
                "marketplacePath": locator.marketplace_path,
                "pluginName": locator.plugin_name,
            })),
        )
        .await
        .ok()
        .and_then(|value| {
            serde_json::from_value::<catalog::AppServerPluginReadResponse>(value).ok()
        })
}

#[tauri::command]
async fn get_snapshot(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .snapshot()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn refresh_runtime(state: State<'_, DesktopState>) -> Result<SessionSnapshot, String> {
    state
        .runtime
        .refresh()
        .await
        .map_err(|error| error.to_string())
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
async fn list_plugins(
    state: State<'_, DesktopState>,
    project_root: Option<String>,
    force_remote_sync: Option<bool>,
) -> Result<catalog::PluginCatalogPayload, String> {
    let app_server_plugins = fetch_app_server_plugins(
        &state.runtime,
        project_root.as_deref(),
        force_remote_sync.unwrap_or(false),
    )
    .await;
    catalog_state(&state)?
        .list_plugins(project_root.as_deref(), app_server_plugins.as_ref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_plugin_details(
    state: State<'_, DesktopState>,
    plugin_id: String,
    project_root: Option<String>,
) -> Result<catalog::PluginDetails, String> {
    let app_server_plugins =
        fetch_app_server_plugins(&state.runtime, project_root.as_deref(), false).await;
    let locator = if let Some(app_server_plugins) = app_server_plugins.as_ref() {
        catalog_state(&state)?
            .resolve_app_server_plugin_locator(
                &plugin_id,
                project_root.as_deref(),
                Some(app_server_plugins),
            )
            .map_err(|error| error.to_string())?
    } else {
        None
    };
    let app_server_detail = if let Some(locator) = locator.as_ref() {
        fetch_app_server_plugin_detail(&state.runtime, locator).await
    } else {
        None
    };

    catalog_state(&state)?
        .get_plugin_details(
            &plugin_id,
            project_root.as_deref(),
            app_server_plugins.as_ref(),
            app_server_detail.as_ref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn install_plugin(
    state: State<'_, DesktopState>,
    plugin_id: String,
    project_root: Option<String>,
) -> Result<catalog::InstalledPluginState, String> {
    let app_server_plugins =
        fetch_app_server_plugins(&state.runtime, project_root.as_deref(), false).await;
    let locator = if let Some(app_server_plugins) = app_server_plugins.as_ref() {
        catalog_state(&state)?
            .resolve_app_server_plugin_locator(
                &plugin_id,
                project_root.as_deref(),
                Some(app_server_plugins),
            )
            .map_err(|error| error.to_string())?
    } else {
        None
    };

    if let Some(locator) = locator {
        state
            .runtime
            .request_app_server(
                "plugin/install".to_string(),
                Some(json!({
                    "marketplacePath": locator.marketplace_path,
                    "pluginName": locator.plugin_name,
                    "forceRemoteSync": true,
                })),
            )
            .await
            .map_err(|error| error.to_string())?;

        let refreshed_plugins =
            fetch_app_server_plugins(&state.runtime, project_root.as_deref(), false).await;
        let refreshed_locator = if let Some(app_server_plugins) = refreshed_plugins.as_ref() {
            catalog_state(&state)?
                .resolve_app_server_plugin_locator(
                    &plugin_id,
                    project_root.as_deref(),
                    Some(app_server_plugins),
                )
                .map_err(|error| error.to_string())?
        } else {
            None
        };
        let detail = if let Some(locator) = refreshed_locator.as_ref() {
            fetch_app_server_plugin_detail(&state.runtime, locator).await
        } else {
            None
        };

        return catalog_state(&state)?
            .get_plugin_details(
                &plugin_id,
                project_root.as_deref(),
                refreshed_plugins.as_ref(),
                detail.as_ref(),
            )
            .map(|details| details.installed_state)
            .map_err(|error| error.to_string());
    }

    catalog_state(&state)?
        .install_plugin(&plugin_id, project_root.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn uninstall_plugin(
    state: State<'_, DesktopState>,
    plugin_id: String,
    project_root: Option<String>,
) -> Result<catalog::InstalledPluginState, String> {
    let app_server_plugins =
        fetch_app_server_plugins(&state.runtime, project_root.as_deref(), false).await;
    let locator = if let Some(app_server_plugins) = app_server_plugins.as_ref() {
        catalog_state(&state)?
            .resolve_app_server_plugin_locator(
                &plugin_id,
                project_root.as_deref(),
                Some(app_server_plugins),
            )
            .map_err(|error| error.to_string())?
    } else {
        None
    };

    if locator.is_some() {
        state
            .runtime
            .request_app_server(
                "plugin/uninstall".to_string(),
                Some(json!({
                    "pluginId": plugin_id,
                    "forceRemoteSync": false,
                })),
            )
            .await
            .map_err(|error| error.to_string())?;

        let refreshed_plugins =
            fetch_app_server_plugins(&state.runtime, project_root.as_deref(), false).await;
        return catalog_state(&state)?
            .get_plugin_details(
                &plugin_id,
                project_root.as_deref(),
                refreshed_plugins.as_ref(),
                None,
            )
            .map(|details| details.installed_state)
            .map_err(|error| error.to_string());
    }

    catalog_state(&state)?
        .uninstall_plugin(&plugin_id, project_root.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_plugin_enabled(
    state: State<'_, DesktopState>,
    plugin_id: String,
    enabled: bool,
    project_root: Option<String>,
) -> Result<catalog::InstalledPluginState, String> {
    let app_server_plugins =
        fetch_app_server_plugins(&state.runtime, project_root.as_deref(), false).await;
    catalog_state(&state)?
        .set_plugin_enabled(
            &plugin_id,
            enabled,
            project_root.as_deref(),
            app_server_plugins.as_ref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn complete_plugin_auth(
    state: State<'_, DesktopState>,
    plugin_id: String,
    project_root: Option<String>,
) -> Result<catalog::InstalledPluginState, String> {
    let app_server_plugins =
        fetch_app_server_plugins(&state.runtime, project_root.as_deref(), false).await;
    catalog_state(&state)?
        .complete_plugin_auth(
            &plugin_id,
            project_root.as_deref(),
            app_server_plugins.as_ref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_skills(
    state: State<'_, DesktopState>,
    project_root: Option<String>,
) -> Result<catalog::SkillCatalogPayload, String> {
    catalog_state(&state)?
        .list_skills(project_root.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_skill_details(
    state: State<'_, DesktopState>,
    skill_id: String,
    project_root: Option<String>,
) -> Result<catalog::SkillDetails, String> {
    catalog_state(&state)?
        .get_skill_details(&skill_id, project_root.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn install_skill(
    state: State<'_, DesktopState>,
    skill_id: String,
    project_root: Option<String>,
) -> Result<catalog::SkillRecord, String> {
    catalog_state(&state)?
        .install_skill(&skill_id, project_root.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_skill_enabled(
    state: State<'_, DesktopState>,
    skill_id: String,
    enabled: bool,
    project_root: Option<String>,
) -> Result<catalog::SkillRecord, String> {
    catalog_state(&state)?
        .set_skill_enabled(&skill_id, enabled, project_root.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_skill_scaffold(
    state: State<'_, DesktopState>,
    request: catalog::CreateSkillScaffoldRequest,
) -> Result<catalog::CreateSkillScaffoldResult, String> {
    catalog_state(&state)?
        .create_skill_scaffold(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_plugin_scaffold(
    state: State<'_, DesktopState>,
    request: catalog::CreatePluginScaffoldRequest,
) -> Result<catalog::CreatePluginScaffoldResult, String> {
    catalog_state(&state)?
        .create_plugin_scaffold(request)
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
    state
        .runtime
        .restart()
        .await
        .map_err(|error| error.to_string())
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
    state
        .runtime
        .logout()
        .await
        .map_err(|error| error.to_string())
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenWithTargetPayload {
    id: String,
    label: String,
}

#[tauri::command]
async fn list_open_with_targets(
    base_dir: String,
    relative_path: String,
) -> Result<Vec<OpenWithTargetPayload>, String> {
    let resolved =
        resolve_workspace_path(&base_dir, &relative_path).map_err(|error| error.to_string())?;
    Ok(list_open_with_targets_for_path(&resolved))
}

#[tauri::command]
async fn open_workspace_file_with(
    base_dir: String,
    relative_path: String,
    target_id: String,
) -> Result<(), String> {
    let resolved =
        resolve_workspace_path(&base_dir, &relative_path).map_err(|error| error.to_string())?;
    open_workspace_path_with_target(&resolved, &target_id).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("only http/https URLs are supported".to_string());
    }
    open_external_target(trimmed).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_in_app_browser(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    url: String,
) -> Result<(), String> {
    browser_state(&state)?
        .open(&app, &url)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn navigate_in_app_browser(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    url: String,
) -> Result<(), String> {
    browser_state(&state)?
        .navigate(&app, &url)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn reload_in_app_browser(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    browser_state(&state)?
        .reload(&app)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_in_app_browser_visible(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    visible: bool,
) -> Result<(), String> {
    browser_state(&state)?
        .set_visible(&app, visible)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_in_app_browser_bounds(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    bounds: browser::BrowserViewport,
) -> Result<(), String> {
    browser_state(&state)?
        .set_bounds(&app, bounds)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_in_app_browser_emulation(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    emulation: browser::BrowserEmulation,
) -> Result<(), String> {
    browser_state(&state)?
        .set_emulation(&app, emulation)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn toggle_in_app_browser_devtools(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    force_open: Option<bool>,
) -> Result<bool, String> {
    browser_state(&state)?
        .toggle_devtools(&app, force_open)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn clear_in_app_browser_data(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    target: browser::BrowserClearTarget,
) -> Result<(), String> {
    browser_state(&state)?
        .clear_data(&app, target)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_in_app_browser_inspect_mode(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    browser_state(&state)?
        .set_inspect_mode(&app, enabled)
        .map_err(|error| error.to_string())
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

#[tauri::command]
async fn ensure_project_terminal(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    project_root: String,
    cols: u16,
    rows: u16,
) -> Result<terminal::ProjectTerminalSession, String> {
    terminal_state(&state)?
        .ensure_session(&app, project_root, cols, rows)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_project_terminal(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    project_root: String,
    cols: u16,
    rows: u16,
) -> Result<terminal::ProjectTerminalSession, String> {
    terminal_state(&state)?
        .create_session(&app, project_root, cols, rows)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn write_project_terminal(
    state: State<'_, DesktopState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    terminal_state(&state)?
        .write_session(&session_id, &data)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn resize_project_terminal(
    state: State<'_, DesktopState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminal_state(&state)?
        .resize_session(&session_id, cols, rows)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn kill_project_terminal(
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<(), String> {
    terminal_state(&state)?
        .kill_session(&session_id)
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
                catalog: Mutex::new(catalog::CatalogRepository::new_mock()),
                browser: Mutex::new(browser::BrowserManager::default()),
                terminal: Mutex::new(terminal::TerminalManager::default()),
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
            list_plugins,
            get_plugin_details,
            install_plugin,
            uninstall_plugin,
            set_plugin_enabled,
            complete_plugin_auth,
            list_skills,
            get_skill_details,
            install_skill,
            set_skill_enabled,
            create_skill_scaffold,
            create_plugin_scaffold,
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
            list_open_with_targets,
            open_workspace_file_with,
            open_external_url,
            open_in_app_browser,
            navigate_in_app_browser,
            reload_in_app_browser,
            set_in_app_browser_visible,
            set_in_app_browser_bounds,
            set_in_app_browser_emulation,
            toggle_in_app_browser_devtools,
            clear_in_app_browser_data,
            set_in_app_browser_inspect_mode,
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
            ensure_project_terminal,
            create_project_terminal,
            write_project_terminal,
            resize_project_terminal,
            kill_project_terminal,
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

fn open_in_system_editor(path: &Path) -> AnyhowResult<()> {
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

fn list_open_with_targets_for_path(_path: &Path) -> Vec<OpenWithTargetPayload> {
    let mut targets = vec![OpenWithTargetPayload {
        id: "default".to_string(),
        label: "Default app".to_string(),
    }];

    #[cfg(target_os = "macos")]
    {
        targets.push(OpenWithTargetPayload {
            id: "finder".to_string(),
            label: "Finder".to_string(),
        });

        for (id, label, app_name) in [
            ("vscode", "Visual Studio Code", "Visual Studio Code"),
            ("cursor", "Cursor", "Cursor"),
            ("zed", "Zed", "Zed"),
            ("sublime", "Sublime Text", "Sublime Text"),
            ("xcode", "Xcode", "Xcode"),
            ("textedit", "TextEdit", "TextEdit"),
        ] {
            if macos_app_available(app_name) {
                targets.push(OpenWithTargetPayload {
                    id: id.to_string(),
                    label: label.to_string(),
                });
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        targets.push(OpenWithTargetPayload {
            id: "explorer".to_string(),
            label: "File Explorer".to_string(),
        });
        targets.push(OpenWithTargetPayload {
            id: "notepad".to_string(),
            label: "Notepad".to_string(),
        });
        if command_is_available("code") {
            targets.push(OpenWithTargetPayload {
                id: "vscode".to_string(),
                label: "Visual Studio Code".to_string(),
            });
        }
        if command_is_available("cursor") {
            targets.push(OpenWithTargetPayload {
                id: "cursor".to_string(),
                label: "Cursor".to_string(),
            });
        }
    }

    #[cfg(target_os = "linux")]
    {
        targets.push(OpenWithTargetPayload {
            id: "file-manager".to_string(),
            label: "File Manager".to_string(),
        });
        for (id, label, command) in [
            ("vscode", "Visual Studio Code", "code"),
            ("cursor", "Cursor", "cursor"),
            ("zed", "Zed", "zed"),
            ("gedit", "gedit", "gedit"),
        ] {
            if command_is_available(command) {
                targets.push(OpenWithTargetPayload {
                    id: id.to_string(),
                    label: label.to_string(),
                });
            }
        }
    }

    targets
}

fn open_workspace_path_with_target(path: &Path, target_id: &str) -> AnyhowResult<()> {
    if target_id.trim().is_empty() || target_id == "default" {
        return open_in_system_editor(path);
    }

    #[cfg(target_os = "macos")]
    {
        match target_id {
            "finder" => {
                Command::new("open")
                    .arg("-R")
                    .arg(path)
                    .spawn()
                    .with_context(|| format!("failed to reveal {} in Finder", path.display()))?;
                return Ok(());
            }
            "vscode" => return open_in_macos_app(path, "Visual Studio Code"),
            "cursor" => return open_in_macos_app(path, "Cursor"),
            "zed" => return open_in_macos_app(path, "Zed"),
            "sublime" => return open_in_macos_app(path, "Sublime Text"),
            "xcode" => return open_in_macos_app(path, "Xcode"),
            "textedit" => return open_in_macos_app(path, "TextEdit"),
            _ => {
                return Err(anyhow!("unknown open target: {target_id}"));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        match target_id {
            "explorer" => {
                Command::new("explorer")
                    .arg(format!("/select,{}", path.display()))
                    .spawn()
                    .with_context(|| format!("failed to reveal {} in Explorer", path.display()))?;
                return Ok(());
            }
            "notepad" => {
                Command::new("notepad")
                    .arg(path)
                    .spawn()
                    .with_context(|| format!("failed to open {} in Notepad", path.display()))?;
                return Ok(());
            }
            "vscode" => {
                Command::new("code")
                    .args(["-g", &path.to_string_lossy()])
                    .spawn()
                    .with_context(|| format!("failed to open {} in VS Code", path.display()))?;
                return Ok(());
            }
            "cursor" => {
                Command::new("cursor")
                    .arg(path)
                    .spawn()
                    .with_context(|| format!("failed to open {} in Cursor", path.display()))?;
                return Ok(());
            }
            _ => {
                return Err(anyhow!("unknown open target: {target_id}"));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        match target_id {
            "file-manager" => {
                Command::new("xdg-open")
                    .arg(path.parent().unwrap_or(path))
                    .spawn()
                    .with_context(|| format!("failed to reveal {} in file manager", path.display()))?;
                return Ok(());
            }
            "vscode" => {
                Command::new("code")
                    .args(["-g", &path.to_string_lossy()])
                    .spawn()
                    .with_context(|| format!("failed to open {} in VS Code", path.display()))?;
                return Ok(());
            }
            "cursor" => {
                Command::new("cursor")
                    .arg(path)
                    .spawn()
                    .with_context(|| format!("failed to open {} in Cursor", path.display()))?;
                return Ok(());
            }
            "zed" => {
                Command::new("zed")
                    .arg(path)
                    .spawn()
                    .with_context(|| format!("failed to open {} in Zed", path.display()))?;
                return Ok(());
            }
            "gedit" => {
                Command::new("gedit")
                    .arg(path)
                    .spawn()
                    .with_context(|| format!("failed to open {} in gedit", path.display()))?;
                return Ok(());
            }
            _ => {
                return Err(anyhow!("unknown open target: {target_id}"));
            }
        }
    }

    #[allow(unreachable_code)]
    Err(anyhow!("open-with is not supported on this platform"))
}

fn command_is_available(command: &str) -> bool {
    Command::new(command).arg("--version").output().is_ok()
}

#[cfg(target_os = "macos")]
fn macos_app_available(app_name: &str) -> bool {
    let app_bundle = format!("{app_name}.app");
    let system_path = PathBuf::from("/Applications").join(&app_bundle);
    if system_path.exists() {
        return true;
    }

    std::env::var_os("HOME")
        .map(PathBuf::from)
        .map(|home| home.join("Applications").join(app_bundle).exists())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn open_in_macos_app(path: &Path, app_name: &str) -> AnyhowResult<()> {
    Command::new("open")
        .arg("-a")
        .arg(app_name)
        .arg(path)
        .spawn()
        .with_context(|| format!("failed to open {} in {}", path.display(), app_name))?;
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

        Err(anyhow!(
            "no supported folder picker is available on this system"
        ))
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
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default(),
        "ts" | "tsx"
            | "js"
            | "jsx"
            | "rs"
            | "json"
            | "md"
            | "css"
            | "html"
            | "toml"
            | "yml"
            | "yaml"
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
