use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

const WORKSPACE_STORE_FILE: &str = "workspace-store.json";
const SIDEBAR_WIDTH_MIN: u16 = 248;
const SIDEBAR_WIDTH_MAX: u16 = 420;
const SIDEBAR_WIDTH_DEFAULT: u16 = 304;
const INSPECTOR_WIDTH_MIN: u16 = 340;
const INSPECTOR_WIDTH_MAX: u16 = 760;
const INSPECTOR_WIDTH_DEFAULT: u16 = 440;
const TERMINAL_HEIGHT_MIN: u16 = 160;
const TERMINAL_HEIGHT_MAX: u16 = 720;
const TERMINAL_HEIGHT_DEFAULT: u16 = 280;
const DEFAULT_BROWSER_VIEWPORT_PRESET_ID: &str = "responsive";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStorePayload {
    #[serde(default)]
    pub projects: Vec<SavedProjectPayload>,
    #[serde(default)]
    pub thread_preferences: BTreeMap<String, ThreadPreferencePayload>,
    #[serde(default)]
    pub browser_project_preferences: BTreeMap<String, BrowserProjectPreferencePayload>,
    #[serde(default)]
    pub ui: WorkspaceUiStatePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedProjectPayload {
    pub root_path: String,
    pub label: String,
    #[serde(default)]
    pub removed: bool,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadPreferencePayload {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BrowserViewportOrientation {
    #[default]
    Portrait,
    Landscape,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProjectPreferencePayload {
    #[serde(default = "default_browser_viewport_preset_id")]
    pub viewport_preset_id: String,
    #[serde(default)]
    pub orientation: BrowserViewportOrientation,
    #[serde(default)]
    pub touch_enabled: bool,
}

impl Default for BrowserProjectPreferencePayload {
    fn default() -> Self {
        Self {
            viewport_preset_id: default_browser_viewport_preset_id(),
            orientation: BrowserViewportOrientation::default(),
            touch_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUiStatePayload {
    #[serde(default)]
    pub sidebar_collapsed: bool,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u16,
    #[serde(default = "default_inspector_width")]
    pub inspector_width: u16,
    #[serde(default = "default_show_composer_rate_limits")]
    pub show_composer_rate_limits: bool,
    #[serde(default)]
    pub terminal_open: bool,
    #[serde(default = "default_terminal_height")]
    pub terminal_height: u16,
}

impl Default for WorkspaceUiStatePayload {
    fn default() -> Self {
        Self {
            sidebar_collapsed: false,
            sidebar_width: default_sidebar_width(),
            inspector_width: default_inspector_width(),
            show_composer_rate_limits: default_show_composer_rate_limits(),
            terminal_open: false,
            terminal_height: default_terminal_height(),
        }
    }
}

fn default_show_composer_rate_limits() -> bool {
    true
}

fn default_sidebar_width() -> u16 {
    SIDEBAR_WIDTH_DEFAULT
}

fn default_inspector_width() -> u16 {
    INSPECTOR_WIDTH_DEFAULT
}

fn default_terminal_height() -> u16 {
    TERMINAL_HEIGHT_DEFAULT
}

fn default_browser_viewport_preset_id() -> String {
    DEFAULT_BROWSER_VIEWPORT_PRESET_ID.to_string()
}

impl BrowserProjectPreferencePayload {
    fn normalized(mut self) -> Self {
        let trimmed = self.viewport_preset_id.trim();
        self.viewport_preset_id = if trimmed.is_empty() {
            default_browser_viewport_preset_id()
        } else {
            trimmed.to_string()
        };
        self
    }

    fn is_default(&self) -> bool {
        self.viewport_preset_id == DEFAULT_BROWSER_VIEWPORT_PRESET_ID
            && self.orientation == BrowserViewportOrientation::default()
            && !self.touch_enabled
    }
}

impl WorkspaceStorePayload {
    fn normalized(mut self) -> Self {
        self.projects
            .retain(|project| !project.root_path.trim().is_empty());
        self.thread_preferences.retain(|thread_id, preference| {
            !thread_id.trim().is_empty()
                && (preference.model.is_some() || preference.reasoning_effort.is_some())
        });
        self.browser_project_preferences = self
            .browser_project_preferences
            .into_iter()
            .filter_map(|(root_path, preference)| {
                let normalized_root_path = normalize_root_path(&root_path)?;
                let normalized_preference = preference.normalized();
                if normalized_preference.is_default() {
                    return None;
                }
                Some((normalized_root_path, normalized_preference))
            })
            .collect();
        self.ui.sidebar_width = self
            .ui
            .sidebar_width
            .clamp(SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
        self.ui.inspector_width = self
            .ui
            .inspector_width
            .clamp(INSPECTOR_WIDTH_MIN, INSPECTOR_WIDTH_MAX);
        self.ui.terminal_height = self
            .ui
            .terminal_height
            .clamp(TERMINAL_HEIGHT_MIN, TERMINAL_HEIGHT_MAX);
        self
    }
}

pub fn load_workspace_store(base_dir: &Path) -> Result<WorkspaceStorePayload> {
    let path = workspace_store_path(base_dir);
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str::<WorkspaceStorePayload>(&raw)
            .map(WorkspaceStorePayload::normalized)
            .or_else(|error| {
                eprintln!(
                    "[kodeks-workspace-store] failed to parse {}: {error}",
                    path.display()
                );
                Ok(WorkspaceStorePayload::default())
            }),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(WorkspaceStorePayload::default()),
        Err(error) => {
            eprintln!(
                "[kodeks-workspace-store] failed to read {}: {error}",
                path.display()
            );
            Ok(WorkspaceStorePayload::default())
        }
    }
}

pub fn save_workspace_store(base_dir: &Path, store: &WorkspaceStorePayload) -> Result<()> {
    fs::create_dir_all(base_dir)
        .with_context(|| format!("failed to create {}", base_dir.display()))?;

    let path = workspace_store_path(base_dir);
    let temp_path = temp_workspace_store_path(base_dir);
    let payload = serde_json::to_vec_pretty(&store.clone().normalized())
        .context("failed to serialize workspace store")?;

    fs::write(&temp_path, payload)
        .with_context(|| format!("failed to write {}", temp_path.display()))?;

    replace_file(&temp_path, &path)?;
    Ok(())
}

fn normalize_root_path(value: &str) -> Option<String> {
    let normalized = value.trim().replace('\\', "/");
    if normalized.is_empty() {
        return None;
    }

    let without_trailing = normalized.trim_end_matches('/');
    if without_trailing.is_empty() {
        Some(normalized)
    } else {
        Some(without_trailing.to_string())
    }
}

fn workspace_store_path(base_dir: &Path) -> PathBuf {
    base_dir.join(WORKSPACE_STORE_FILE)
}

fn temp_workspace_store_path(base_dir: &Path) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    base_dir.join(format!(".{WORKSPACE_STORE_FILE}.{timestamp}.tmp"))
}

fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    match fs::rename(source, destination) {
        Ok(()) => Ok(()),
        Err(error) if destination.exists() => {
            fs::remove_file(destination)
                .with_context(|| format!("failed to replace existing {}", destination.display()))?;
            fs::rename(source, destination).with_context(|| {
                format!(
                    "failed to move {} into {} after removing the existing file",
                    source.display(),
                    destination.display()
                )
            })
        }
        Err(error) => Err(anyhow!(error)).with_context(|| {
            format!(
                "failed to move {} into {}",
                source.display(),
                destination.display()
            )
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        load_workspace_store, save_workspace_store, BrowserProjectPreferencePayload,
        BrowserViewportOrientation, SavedProjectPayload, ThreadPreferencePayload,
        WorkspaceStorePayload, WorkspaceUiStatePayload, INSPECTOR_WIDTH_MAX, SIDEBAR_WIDTH_MIN,
        TERMINAL_HEIGHT_MIN,
    };
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn missing_workspace_store_loads_defaults() {
        let base_dir = unique_test_dir("missing");
        let loaded = load_workspace_store(&base_dir).expect("workspace store should load");

        assert_eq!(loaded, WorkspaceStorePayload::default());
        cleanup_dir(&base_dir);
    }

    #[test]
    fn workspace_store_round_trips_through_disk() {
        let base_dir = unique_test_dir("round-trip");
        let store = WorkspaceStorePayload {
            projects: vec![SavedProjectPayload {
                root_path: "/work/kodeks".to_string(),
                label: "Kodeks".to_string(),
                removed: false,
                last_used_at: 1775900000,
            }],
            thread_preferences: BTreeMap::from([(
                "thread-1".to_string(),
                ThreadPreferencePayload {
                    model: Some("gpt-5.4".to_string()),
                    reasoning_effort: Some("high".to_string()),
                },
            )]),
            browser_project_preferences: BTreeMap::from([(
                "/work/kodeks".to_string(),
                BrowserProjectPreferencePayload {
                    viewport_preset_id: "iphone-14".to_string(),
                    orientation: BrowserViewportOrientation::Portrait,
                    touch_enabled: true,
                },
            )]),
            ui: WorkspaceUiStatePayload {
                sidebar_collapsed: true,
                sidebar_width: 320,
                inspector_width: 520,
                show_composer_rate_limits: false,
                terminal_open: true,
                terminal_height: 360,
            },
        };

        save_workspace_store(&base_dir, &store).expect("workspace store should save");
        let loaded = load_workspace_store(&base_dir).expect("workspace store should load");

        assert_eq!(loaded, store);
        cleanup_dir(&base_dir);
    }

    #[test]
    fn workspace_store_normalizes_terminal_height_bounds() {
        let store = WorkspaceStorePayload {
            ui: WorkspaceUiStatePayload {
                sidebar_collapsed: false,
                sidebar_width: 10,
                inspector_width: 900,
                show_composer_rate_limits: true,
                terminal_open: false,
                terminal_height: 10,
            },
            ..WorkspaceStorePayload::default()
        };

        let normalized = store.normalized();
        assert_eq!(normalized.ui.terminal_height, TERMINAL_HEIGHT_MIN);
        assert_eq!(normalized.ui.sidebar_width, SIDEBAR_WIDTH_MIN);
        assert_eq!(normalized.ui.inspector_width, INSPECTOR_WIDTH_MAX);
    }

    #[test]
    fn workspace_store_drops_default_browser_preferences() {
        let store = WorkspaceStorePayload {
            browser_project_preferences: BTreeMap::from([
                (
                    "/work/default".to_string(),
                    BrowserProjectPreferencePayload::default(),
                ),
                (
                    "/work/mobile".to_string(),
                    BrowserProjectPreferencePayload {
                        viewport_preset_id: "iphone-14".to_string(),
                        orientation: BrowserViewportOrientation::Portrait,
                        touch_enabled: true,
                    },
                ),
            ]),
            ..WorkspaceStorePayload::default()
        };

        let normalized = store.normalized();
        assert_eq!(normalized.browser_project_preferences.len(), 1);
        assert!(
            normalized
                .browser_project_preferences
                .contains_key("/work/mobile")
        );
    }

    fn unique_test_dir(label: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        std::env::temp_dir().join(format!("kodeks-workspace-store-{label}-{timestamp}"))
    }

    fn cleanup_dir(path: &PathBuf) {
        let _ = fs::remove_dir_all(path);
    }
}
