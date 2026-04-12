use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};

const WORKSPACE_STORE_FILE: &str = "workspace-store.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStorePayload {
    #[serde(default)]
    pub projects: Vec<SavedProjectPayload>,
    #[serde(default)]
    pub thread_preferences: BTreeMap<String, ThreadPreferencePayload>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUiStatePayload {
    pub sidebar_collapsed: bool,
    pub show_composer_rate_limits: bool,
}

impl Default for WorkspaceUiStatePayload {
    fn default() -> Self {
        Self {
            sidebar_collapsed: false,
            show_composer_rate_limits: true,
        }
    }
}

impl WorkspaceStorePayload {
    fn normalized(mut self) -> Self {
        self.projects.retain(|project| !project.root_path.trim().is_empty());
        self.thread_preferences.retain(|thread_id, preference| {
            !thread_id.trim().is_empty()
                && (preference.model.is_some() || preference.reasoning_effort.is_some())
        });
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
            fs::remove_file(destination).with_context(|| {
                format!("failed to replace existing {}", destination.display())
            })?;
            fs::rename(source, destination).with_context(|| {
                format!(
                    "failed to move {} into {} after removing the existing file",
                    source.display(),
                    destination.display()
                )
            })
        }
        Err(error) => Err(anyhow!(error)).with_context(|| {
            format!("failed to move {} into {}", source.display(), destination.display())
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        SavedProjectPayload, ThreadPreferencePayload, WorkspaceStorePayload,
        WorkspaceUiStatePayload, load_workspace_store, save_workspace_store,
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
            ui: WorkspaceUiStatePayload {
                sidebar_collapsed: true,
                show_composer_rate_limits: false,
            },
        };

        save_workspace_store(&base_dir, &store).expect("workspace store should save");
        let loaded = load_workspace_store(&base_dir).expect("workspace store should load");

        assert_eq!(loaded, store);
        cleanup_dir(&base_dir);
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
