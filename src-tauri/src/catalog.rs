use std::collections::{BTreeMap, HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result as AnyhowResult, anyhow};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use toml::Value as TomlValue;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginSourceScope {
    Official,
    Personal,
    Repo,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginCategory {
    Collaboration,
    DeveloperTools,
    Documentation,
    Productivity,
    Design,
    Infrastructure,
    NativeTooling,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PluginCapability {
    IssuesAndPullRequests,
    Messaging,
    Documents,
    Calendar,
    DesignToCode,
    Deployments,
    Observability,
    DatasetsAndModels,
    NativeBuilds,
    Automation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginAuthPolicy {
    None,
    Optional,
    Required,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginInstallationPolicy {
    Marketplace,
    LocalManifest,
    Bundled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginAuthStatus {
    NotRequired,
    NeedsAuth,
    Connected,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginInstallStatus {
    Available,
    Installing,
    Installed,
    Disabled,
    UpdateAvailable,
    Bundled,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginSection {
    Featured,
    Coding,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginSource {
    pub id: String,
    pub display_name: String,
    pub publisher: String,
    pub is_curated: bool,
    pub scope: PluginSourceScope,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginCatalogEntry {
    pub plugin_id: String,
    pub name: String,
    pub display_name: String,
    pub short_description: String,
    pub long_description: String,
    pub category: PluginCategory,
    pub capabilities: Vec<PluginCapability>,
    pub auth_policy: PluginAuthPolicy,
    pub installation_policy: PluginInstallationPolicy,
    pub logo: Option<String>,
    pub screenshots: Vec<String>,
    pub developer_name: String,
    pub website_url: Option<String>,
    pub privacy_policy_url: Option<String>,
    pub terms_of_service_url: Option<String>,
    pub bundled_skills: Vec<String>,
    pub bundled_apps: Vec<String>,
    pub bundled_mcp_servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstalledPluginState {
    pub plugin_id: String,
    pub installed_version: Option<String>,
    pub is_installed: bool,
    pub is_enabled: bool,
    pub auth_status: PluginAuthStatus,
    pub has_update: bool,
    pub install_status: PluginInstallStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginListEntry {
    pub section: PluginSection,
    pub source_id: String,
    pub catalog: PluginCatalogEntry,
    pub installed_state: InstalledPluginState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginCatalogPayload {
    pub sources: Vec<PluginSource>,
    pub entries: Vec<PluginListEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginDetails {
    pub source: PluginSource,
    pub catalog: PluginCatalogEntry,
    pub installed_state: InstalledPluginState,
    pub management_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillScope {
    Recommended,
    System,
    Personal,
    Repo,
    PluginBundled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillSourceKind {
    Catalog,
    System,
    UserInstalled,
    LocalRepo,
    PluginBundled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillDependencyKind {
    Skill,
    App,
    McpServer,
    Binary,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillDependency {
    pub kind: SkillDependencyKind,
    pub value: String,
    pub label: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillRecord {
    pub skill_id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub short_description: String,
    pub scope: SkillScope,
    pub path: Option<String>,
    pub enabled: bool,
    pub is_installed: bool,
    pub source_kind: SkillSourceKind,
    pub allow_implicit_invocation: bool,
    pub default_prompt: Option<String>,
    pub icon: Option<String>,
    pub brand_color: Option<String>,
    pub dependencies: Vec<SkillDependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillSection {
    Recommended,
    System,
    Personal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillListEntry {
    pub section: SkillSection,
    pub record: SkillRecord,
    pub bundled_by_plugin_id: Option<String>,
    pub bundled_by_plugin_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillCatalogPayload {
    pub entries: Vec<SkillListEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillInvocationBehavior {
    ExplicitOnly,
    ExplicitOrImplicit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillDetails {
    pub record: SkillRecord,
    pub bundled_by_plugin_id: Option<String>,
    pub bundled_by_plugin_name: Option<String>,
    pub invocation_behavior: SkillInvocationBehavior,
    pub dependency_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillScaffoldScope {
    Repo,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreateSkillScaffoldRequest {
    pub name: String,
    pub display_name: Option<String>,
    pub description: String,
    pub scope: SkillScaffoldScope,
    pub destination_root: Option<String>,
    pub allow_implicit_invocation: bool,
    pub default_prompt: Option<String>,
    pub brand_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreateSkillScaffoldResult {
    pub skill_id: String,
    pub scope: SkillScope,
    pub path: String,
    pub created_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginScaffoldScope {
    Repo,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreatePluginScaffoldRequest {
    pub name: String,
    pub display_name: Option<String>,
    pub description: String,
    pub scope: PluginScaffoldScope,
    pub destination_root: Option<String>,
    pub category: PluginCategory,
    pub with_skills: bool,
    pub with_apps: bool,
    pub with_mcp_server: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CreatePluginScaffoldResult {
    pub plugin_id: String,
    pub source_id: String,
    pub path: String,
    pub marketplace_path: String,
    pub created_files: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerPluginListResponse {
    #[serde(default)]
    pub marketplaces: Vec<AppServerPluginMarketplaceEntry>,
    #[serde(default)]
    pub featured_plugin_ids: Vec<String>,
    #[serde(default)]
    pub marketplace_load_errors: Vec<AppServerMarketplaceLoadError>,
    pub remote_sync_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppServerPluginMarketplaceEntry {
    pub name: String,
    pub path: String,
    pub interface: Option<AppServerMarketplaceInterface>,
    #[serde(default)]
    pub plugins: Vec<AppServerPluginSummary>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerMarketplaceInterface {
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppServerMarketplaceLoadError {
    #[serde(rename = "marketplacePath")]
    pub marketplace_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerPluginReadResponse {
    pub plugin: AppServerPluginDetail,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerPluginDetail {
    pub marketplace_name: String,
    pub marketplace_path: String,
    pub summary: AppServerPluginSummary,
    pub description: Option<String>,
    #[serde(default)]
    pub skills: Vec<AppServerSkillSummary>,
    #[serde(default)]
    pub apps: Vec<AppServerAppSummary>,
    #[serde(default)]
    pub mcp_servers: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerPluginSummary {
    pub id: String,
    pub name: String,
    pub source: AppServerPluginSource,
    pub installed: bool,
    pub enabled: bool,
    pub install_policy: AppServerPluginInstallPolicy,
    pub auth_policy: AppServerPluginAuthPolicy,
    pub interface: Option<AppServerPluginInterface>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppServerPluginSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AppServerPluginInstallPolicy {
    NotAvailable,
    Available,
    InstalledByDefault,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AppServerPluginAuthPolicy {
    OnInstall,
    OnUse,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerPluginInterface {
    pub display_name: Option<String>,
    pub short_description: Option<String>,
    pub long_description: Option<String>,
    pub developer_name: Option<String>,
    pub category: Option<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub website_url: Option<String>,
    pub privacy_policy_url: Option<String>,
    pub terms_of_service_url: Option<String>,
    pub default_prompt: Option<Vec<String>>,
    pub brand_color: Option<String>,
    pub composer_icon: Option<String>,
    pub logo: Option<String>,
    #[serde(default)]
    pub screenshots: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerSkillSummary {
    pub name: String,
    pub description: String,
    pub short_description: Option<String>,
    pub interface: Option<AppServerSkillInterface>,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerSkillInterface {
    pub display_name: Option<String>,
    pub short_description: Option<String>,
    pub icon_small: Option<String>,
    pub icon_large: Option<String>,
    pub brand_color: Option<String>,
    pub default_prompt: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerAppSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub install_url: Option<String>,
    pub needs_auth: bool,
}

#[derive(Debug, Clone)]
pub struct AppServerPluginLocator {
    pub marketplace_path: String,
    pub plugin_name: String,
}

#[derive(Debug, Clone, Default)]
pub struct CatalogRepository;

#[derive(Debug, Clone)]
struct CatalogSnapshot {
    sources: Vec<PluginSource>,
    plugins: Vec<PluginListEntry>,
    skills: Vec<SkillListEntry>,
    plugin_contexts: HashMap<String, PluginContext>,
}

#[derive(Debug, Clone)]
struct PluginContext {
    source: PluginSource,
    entry: PluginListEntry,
    config_key: Option<String>,
    skill_root: Option<PathBuf>,
    available_version: Option<String>,
    app_ids: Vec<String>,
    app_server_locator: Option<AppServerPluginLocator>,
}

#[derive(Debug, Default)]
struct ResolvedConfig {
    plugin_enabled: HashMap<String, bool>,
    configured_apps: HashSet<String>,
    catalog_plugins: HashMap<String, PersistedPluginState>,
    catalog_skills: HashMap<String, PersistedSkillState>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
struct PersistedPluginState {
    installed_version: Option<String>,
    is_installed: Option<bool>,
    is_enabled: Option<bool>,
    auth_status: Option<PluginAuthStatus>,
    has_update: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
struct PersistedSkillState {
    enabled: Option<bool>,
    is_installed: Option<bool>,
    scope: Option<SkillScope>,
    source_kind: Option<SkillSourceKind>,
    path: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
struct PluginManifest {
    name: String,
    version: Option<String>,
    description: Option<String>,
    author: Option<PluginManifestAuthor>,
    homepage: Option<String>,
    repository: Option<String>,
    license: Option<String>,
    skills: Option<String>,
    apps: Option<String>,
    #[serde(rename = "mcpServers")]
    mcp_servers: Option<String>,
    interface: Option<PluginManifestInterface>,
}

#[derive(Debug, Deserialize)]
struct PluginManifestAuthor {
    name: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifestInterface {
    display_name: Option<String>,
    short_description: Option<String>,
    long_description: Option<String>,
    developer_name: Option<String>,
    category: Option<String>,
    capabilities: Option<Vec<String>>,
    website_url: Option<String>,
    privacy_policy_url: Option<String>,
    terms_of_service_url: Option<String>,
    default_prompt: Option<StringOrVec>,
    brand_color: Option<String>,
    composer_icon: Option<String>,
    logo: Option<String>,
    screenshots: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum StringOrVec {
    One(String),
    Many(Vec<String>),
}

#[derive(Debug, Deserialize, Default)]
struct PluginAppFile {
    apps: HashMap<String, PluginAppEntry>,
}

#[derive(Debug, Deserialize, Default)]
struct PluginAppEntry {
    id: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct PluginMcpFile {
    #[serde(rename = "mcpServers")]
    mcp_servers: HashMap<String, JsonValue>,
}

#[derive(Debug, Deserialize, Default)]
struct MarketplaceFile {
    name: Option<String>,
    interface: Option<MarketplaceInterface>,
    #[serde(default)]
    plugins: Vec<MarketplacePluginEntry>,
}

#[derive(Debug, Deserialize, Default)]
struct MarketplaceInterface {
    #[serde(alias = "displayName")]
    display_name: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct MarketplacePluginEntry {
    name: String,
    source: MarketplacePluginSource,
    policy: Option<MarketplacePluginPolicy>,
    category: Option<String>,
    version: Option<String>,
    #[serde(alias = "latestVersion")]
    latest_version: Option<String>,
    interface: Option<MarketplacePluginInterface>,
}

#[derive(Debug, Deserialize, Default)]
struct MarketplacePluginSource {
    source: String,
    path: String,
}

#[derive(Debug, Deserialize, Default)]
struct MarketplacePluginPolicy {
    installation: Option<String>,
    authentication: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct MarketplacePluginInterface {
    display_name: Option<String>,
    short_description: Option<String>,
    long_description: Option<String>,
    developer_name: Option<String>,
    capabilities: Option<Vec<String>>,
    website_url: Option<String>,
    privacy_policy_url: Option<String>,
    terms_of_service_url: Option<String>,
    screenshots: Option<Vec<String>>,
}

#[derive(Debug, Default)]
struct CatalogMetadataIndex {
    by_marketplace: HashMap<String, MarketplaceCatalogMetadata>,
}

#[derive(Debug, Default, Clone)]
struct MarketplaceCatalogMetadata {
    source: Option<PluginSource>,
    plugins: HashMap<String, MarketplacePluginMetadata>,
}

#[derive(Debug, Default, Clone)]
struct MarketplacePluginMetadata {
    version: Option<String>,
    latest_version: Option<String>,
    display_name: Option<String>,
    short_description: Option<String>,
    long_description: Option<String>,
    category: Option<String>,
    capabilities: Vec<String>,
    developer_name: Option<String>,
    website_url: Option<String>,
    privacy_policy_url: Option<String>,
    terms_of_service_url: Option<String>,
    screenshots: Vec<String>,
}

#[derive(Debug, Deserialize, Default)]
struct SkillMetadataFile {
    interface: Option<SkillInterfaceMetadata>,
    display_name: Option<String>,
    short_description: Option<String>,
    allow_implicit_invocation: Option<bool>,
    default_prompt: Option<String>,
    icon_small: Option<String>,
    icon_large: Option<String>,
    brand_color: Option<String>,
    dependencies: Option<SkillDependenciesFile>,
}

#[derive(Debug, Deserialize, Default)]
struct SkillInterfaceMetadata {
    display_name: Option<String>,
    short_description: Option<String>,
    allow_implicit_invocation: Option<bool>,
    default_prompt: Option<String>,
    icon_small: Option<String>,
    icon_large: Option<String>,
    brand_color: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct SkillDependenciesFile {
    #[serde(default)]
    tools: Vec<SkillDependencyFile>,
    #[serde(default)]
    files: Vec<SkillDependencyFile>,
}

#[derive(Debug, Deserialize, Default)]
struct SkillDependencyFile {
    #[serde(rename = "type")]
    kind: Option<String>,
    value: Option<String>,
    description: Option<String>,
    required: Option<bool>,
}

#[derive(Debug, Deserialize, Default)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct SkillLockFile {
    #[serde(default)]
    skills: HashMap<String, SkillLockEntry>,
}

#[derive(Debug, Deserialize, Default)]
struct SkillLockEntry {
    source: Option<String>,
    #[serde(rename = "sourceType")]
    source_type: Option<String>,
    #[serde(rename = "sourceUrl")]
    source_url: Option<String>,
}

impl CatalogRepository {
    pub fn new_mock() -> Self {
        Self::default()
    }

    pub fn list_plugins(
        &self,
        project_root: Option<&str>,
        app_server_plugins: Option<&AppServerPluginListResponse>,
    ) -> AnyhowResult<PluginCatalogPayload> {
        let snapshot = self.build_snapshot(project_root, app_server_plugins)?;
        Ok(PluginCatalogPayload {
            sources: snapshot.sources,
            entries: snapshot.plugins,
        })
    }

    pub fn get_plugin_details(
        &self,
        plugin_id: &str,
        project_root: Option<&str>,
        app_server_plugins: Option<&AppServerPluginListResponse>,
        app_server_detail: Option<&AppServerPluginReadResponse>,
    ) -> AnyhowResult<PluginDetails> {
        let snapshot = self.build_snapshot(project_root, app_server_plugins)?;
        let mut context = snapshot
            .plugin_contexts
            .get(plugin_id)
            .cloned()
            .ok_or_else(|| anyhow!("unknown plugin `{plugin_id}`"))?;

        if let Some(detail) = app_server_detail.filter(|detail| detail.plugin.summary.id == plugin_id) {
            apply_app_server_plugin_detail(&mut context.entry, detail);
        }

        Ok(PluginDetails {
            source: context.source,
            management_notes: plugin_management_notes(&context.entry.catalog, &context.entry.installed_state),
            catalog: context.entry.catalog,
            installed_state: context.entry.installed_state,
        })
    }

    pub fn resolve_app_server_plugin_locator(
        &self,
        plugin_id: &str,
        project_root: Option<&str>,
        app_server_plugins: Option<&AppServerPluginListResponse>,
    ) -> AnyhowResult<Option<AppServerPluginLocator>> {
        let snapshot = self.build_snapshot(project_root, app_server_plugins)?;
        Ok(snapshot
            .plugin_contexts
            .get(plugin_id)
            .and_then(|context| context.app_server_locator.clone()))
    }

    pub fn install_plugin(
        &mut self,
        plugin_id: &str,
        project_root: Option<&str>,
    ) -> AnyhowResult<InstalledPluginState> {
        let snapshot = self.build_snapshot(project_root, None)?;
        let context = snapshot
            .plugin_contexts
            .get(plugin_id)
            .ok_or_else(|| anyhow!("unknown plugin `{plugin_id}`"))?;

        let mut state = context.entry.installed_state.clone();
        state.is_installed = true;
        state.is_enabled = true;
        if state.installed_version.is_none() {
            state.installed_version = context.available_version.clone().or_else(|| Some("0.1.0".to_string()));
        }
        state.auth_status = auth_status_after_install(&context.entry.catalog, &context.source.scope);
        state.install_status = if state.auth_status == PluginAuthStatus::Connected {
            PluginInstallStatus::Installed
        } else {
            PluginInstallStatus::Installed
        };

        // TODO: replace these session overrides with a real installer once Codex exposes install APIs.
        if let Some(config_key) = &context.config_key {
            write_plugin_enabled_to_config(config_key, true)?;
        }
        write_catalog_plugin_state(plugin_id, &PersistedPluginState {
            installed_version: state.installed_version.clone(),
            is_installed: Some(true),
            is_enabled: Some(true),
            auth_status: Some(state.auth_status.clone()),
            has_update: Some(state.has_update),
        })?;
        Ok(state)
    }

    pub fn uninstall_plugin(
        &mut self,
        plugin_id: &str,
        project_root: Option<&str>,
    ) -> AnyhowResult<InstalledPluginState> {
        let snapshot = self.build_snapshot(project_root, None)?;
        let context = snapshot
            .plugin_contexts
            .get(plugin_id)
            .ok_or_else(|| anyhow!("unknown plugin `{plugin_id}`"))?;

        let state = InstalledPluginState {
            plugin_id: plugin_id.to_string(),
            installed_version: None,
            is_installed: false,
            is_enabled: false,
            auth_status: auth_status_before_install(&context.entry.catalog),
            has_update: false,
            install_status: PluginInstallStatus::Available,
        };

        if let Some(config_key) = &context.config_key {
            write_plugin_enabled_to_config(config_key, false)?;
        }
        write_catalog_plugin_state(plugin_id, &PersistedPluginState {
            installed_version: None,
            is_installed: Some(false),
            is_enabled: Some(false),
            auth_status: Some(state.auth_status.clone()),
            has_update: Some(false),
        })?;
        Ok(state)
    }

    pub fn set_plugin_enabled(
        &mut self,
        plugin_id: &str,
        enabled: bool,
        project_root: Option<&str>,
        app_server_plugins: Option<&AppServerPluginListResponse>,
    ) -> AnyhowResult<InstalledPluginState> {
        let snapshot = self.build_snapshot(project_root, app_server_plugins)?;
        let context = snapshot
            .plugin_contexts
            .get(plugin_id)
            .ok_or_else(|| anyhow!("unknown plugin `{plugin_id}`"))?;

        if !context.entry.installed_state.is_installed {
            return Err(anyhow!("plugin `{plugin_id}` is not installed"));
        }

        let mut state = context.entry.installed_state.clone();
        state.is_enabled = enabled;
        state.install_status = if enabled {
            if state.has_update {
                PluginInstallStatus::UpdateAvailable
            } else {
                PluginInstallStatus::Installed
            }
        } else {
            PluginInstallStatus::Disabled
        };

        if let Some(config_key) = &context.config_key {
            write_plugin_enabled_to_config(config_key, enabled)?;
        }

        write_catalog_plugin_state(plugin_id, &PersistedPluginState {
            installed_version: state.installed_version.clone(),
            is_installed: Some(state.is_installed),
            is_enabled: Some(state.is_enabled),
            auth_status: Some(state.auth_status.clone()),
            has_update: Some(state.has_update),
        })?;
        Ok(state)
    }

    pub fn complete_plugin_auth(
        &mut self,
        plugin_id: &str,
        project_root: Option<&str>,
        app_server_plugins: Option<&AppServerPluginListResponse>,
    ) -> AnyhowResult<InstalledPluginState> {
        let snapshot = self.build_snapshot(project_root, app_server_plugins)?;
        let context = snapshot
            .plugin_contexts
            .get(plugin_id)
            .ok_or_else(|| anyhow!("unknown plugin `{plugin_id}`"))?;

        if !context.entry.installed_state.is_installed {
            return Err(anyhow!("plugin `{plugin_id}` is not installed"));
        }

        let mut state = context.entry.installed_state.clone();
        state.auth_status = match context.entry.catalog.auth_policy {
            PluginAuthPolicy::None => PluginAuthStatus::NotRequired,
            PluginAuthPolicy::Optional | PluginAuthPolicy::Required => PluginAuthStatus::Connected,
        };

        for app_id in &context.app_ids {
            write_app_connected_to_config(app_id, true)?;
        }

        // TODO: persist connector auth state when Codex exposes a stable desktop auth contract.
        write_catalog_plugin_state(plugin_id, &PersistedPluginState {
            installed_version: state.installed_version.clone(),
            is_installed: Some(state.is_installed),
            is_enabled: Some(state.is_enabled),
            auth_status: Some(state.auth_status.clone()),
            has_update: Some(state.has_update),
        })?;
        Ok(state)
    }

    pub fn list_skills(&self, project_root: Option<&str>) -> AnyhowResult<SkillCatalogPayload> {
        let snapshot = self.build_snapshot(project_root, None)?;
        Ok(SkillCatalogPayload {
            entries: snapshot.skills,
        })
    }

    pub fn get_skill_details(
        &self,
        skill_id: &str,
        project_root: Option<&str>,
    ) -> AnyhowResult<SkillDetails> {
        let snapshot = self.build_snapshot(project_root, None)?;
        let entry = snapshot
            .skills
            .into_iter()
            .find(|entry| entry.record.skill_id == skill_id)
            .ok_or_else(|| anyhow!("unknown skill `{skill_id}`"))?;

        Ok(SkillDetails {
            invocation_behavior: if entry.record.allow_implicit_invocation {
                SkillInvocationBehavior::ExplicitOrImplicit
            } else {
                SkillInvocationBehavior::ExplicitOnly
            },
            dependency_notes: entry
                .record
                .dependencies
                .iter()
                .map(skill_dependency_note)
                .collect(),
            record: entry.record,
            bundled_by_plugin_id: entry.bundled_by_plugin_id,
            bundled_by_plugin_name: entry.bundled_by_plugin_name,
        })
    }

    pub fn install_skill(
        &mut self,
        skill_id: &str,
        project_root: Option<&str>,
    ) -> AnyhowResult<SkillRecord> {
        let snapshot = self.build_snapshot(project_root, None)?;
        let entry = snapshot
            .skills
            .into_iter()
            .find(|entry| entry.record.skill_id == skill_id)
            .ok_or_else(|| anyhow!("unknown skill `{skill_id}`"))?;

        if entry.record.source_kind == SkillSourceKind::PluginBundled {
            return Err(anyhow!(
                "skill `{skill_id}` is bundled with a plugin and should be installed from that plugin"
            ));
        }

        let persisted = PersistedSkillState {
            enabled: Some(true),
            is_installed: Some(true),
            scope: Some(match entry.record.scope {
                SkillScope::Repo => SkillScope::Repo,
                SkillScope::System => SkillScope::System,
                _ => SkillScope::Personal,
            }),
            source_kind: Some(match entry.record.source_kind {
                SkillSourceKind::LocalRepo => SkillSourceKind::LocalRepo,
                SkillSourceKind::System => SkillSourceKind::System,
                _ => SkillSourceKind::UserInstalled,
            }),
            path: Some(entry.record.path.clone()),
        };

        // TODO: wire real curated-skill installation once Codex exposes a stable installer API.
        write_catalog_skill_state(skill_id, &persisted)?;

        let mut record = entry.record;
        record.is_installed = true;
        record.enabled = true;
        record.scope = match record.scope {
            SkillScope::Repo => SkillScope::Repo,
            SkillScope::System => SkillScope::System,
            _ => SkillScope::Personal,
        };
        record.source_kind = match record.source_kind {
            SkillSourceKind::LocalRepo => SkillSourceKind::LocalRepo,
            SkillSourceKind::System => SkillSourceKind::System,
            _ => SkillSourceKind::UserInstalled,
        };

        Ok(record)
    }

    pub fn set_skill_enabled(
        &mut self,
        skill_id: &str,
        enabled: bool,
        project_root: Option<&str>,
    ) -> AnyhowResult<SkillRecord> {
        let snapshot = self.build_snapshot(project_root, None)?;
        let entry = snapshot
            .skills
            .into_iter()
            .find(|entry| entry.record.skill_id == skill_id)
            .ok_or_else(|| anyhow!("unknown skill `{skill_id}`"))?;

        if !entry.record.is_installed {
            return Err(anyhow!("skill `{skill_id}` is not installed"));
        }

        let persisted = PersistedSkillState {
            enabled: Some(enabled),
            is_installed: Some(entry.record.is_installed),
            scope: Some(entry.record.scope.clone()),
            source_kind: Some(entry.record.source_kind.clone()),
            path: Some(entry.record.path.clone()),
        };
        write_catalog_skill_state(skill_id, &persisted)?;

        let mut record = entry.record;
        record.enabled = enabled && record.is_installed;
        Ok(record)
    }

    pub fn create_skill_scaffold(
        &mut self,
        request: CreateSkillScaffoldRequest,
    ) -> AnyhowResult<CreateSkillScaffoldResult> {
        let skill_id = slugify_name(&request.name);
        if skill_id.is_empty() {
            return Err(anyhow!("skill name must contain at least one alphanumeric character"));
        }

        let display_name = request
            .display_name
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| titleize(&request.name));
        let destination_dir =
            resolve_skill_scaffold_directory(&request.scope, request.destination_root.as_deref())?;
        let skill_dir = destination_dir.join(&skill_id);

        if skill_dir.exists() {
            return Err(anyhow!(
                "skill scaffold already exists at {}",
                skill_dir.display()
            ));
        }

        fs::create_dir_all(skill_dir.join("agents"))
            .with_context(|| format!("failed to create {}", skill_dir.display()))?;

        let skill_md_path = skill_dir.join("SKILL.md");
        let metadata_path = skill_dir.join("agents").join("openai.yaml");
        fs::write(
            &skill_md_path,
            build_skill_markdown(&skill_id, &display_name, &request.description),
        )
        .with_context(|| format!("failed to write {}", skill_md_path.display()))?;
        fs::write(
            &metadata_path,
            build_skill_metadata(
                &display_name,
                &request.description,
                request.allow_implicit_invocation,
                request.default_prompt.as_deref(),
                request.brand_color.as_deref(),
            ),
        )
        .with_context(|| format!("failed to write {}", metadata_path.display()))?;

        let scope = match request.scope {
            SkillScaffoldScope::Repo => SkillScope::Repo,
            SkillScaffoldScope::User => SkillScope::Personal,
        };

        Ok(CreateSkillScaffoldResult {
            skill_id,
            scope,
            path: skill_dir.to_string_lossy().into_owned(),
            created_files: vec![
                skill_md_path.to_string_lossy().into_owned(),
                metadata_path.to_string_lossy().into_owned(),
            ],
        })
    }

    pub fn create_plugin_scaffold(
        &mut self,
        request: CreatePluginScaffoldRequest,
    ) -> AnyhowResult<CreatePluginScaffoldResult> {
        let plugin_id = slugify_name(&request.name);
        if plugin_id.is_empty() {
            return Err(anyhow!("plugin name must contain at least one alphanumeric character"));
        }

        let display_name = request
            .display_name
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| titleize(&request.name));

        let plugin_parent =
            resolve_plugin_scaffold_parent(&request.scope, request.destination_root.as_deref())?;
        let plugin_dir = plugin_parent.join(&plugin_id);
        if plugin_dir.exists() {
            return Err(anyhow!(
                "plugin scaffold already exists at {}",
                plugin_dir.display()
            ));
        }

        fs::create_dir_all(plugin_dir.join(".codex-plugin"))
            .with_context(|| format!("failed to create {}", plugin_dir.display()))?;

        let manifest_path = plugin_dir.join(".codex-plugin").join("plugin.json");
        let readme_path = plugin_dir.join("README.md");
        let mut created_files = Vec::new();
        let assets_dir = plugin_dir.join("assets");
        fs::create_dir_all(&assets_dir)
            .with_context(|| format!("failed to create {}", assets_dir.display()))?;

        let icon_path = assets_dir.join(format!("{plugin_id}-icon.svg"));
        let logo_path = assets_dir.join(format!("{plugin_id}-logo.svg"));
        fs::write(&icon_path, build_plugin_icon_svg(&display_name, true))
            .with_context(|| format!("failed to write {}", icon_path.display()))?;
        fs::write(&logo_path, build_plugin_icon_svg(&display_name, false))
            .with_context(|| format!("failed to write {}", logo_path.display()))?;
        created_files.push(icon_path.to_string_lossy().into_owned());
        created_files.push(logo_path.to_string_lossy().into_owned());

        fs::write(
            &manifest_path,
            build_plugin_manifest(
                &plugin_id,
                &display_name,
                &request.description,
                request.category.clone(),
                &format!("./assets/{plugin_id}-icon.svg"),
                &format!("./assets/{plugin_id}-logo.svg"),
                request.with_skills,
                request.with_apps,
                request.with_mcp_server,
            ),
        )
        .with_context(|| format!("failed to write {}", manifest_path.display()))?;
        created_files.push(manifest_path.to_string_lossy().into_owned());

        fs::write(
            &readme_path,
            build_plugin_readme(&display_name, &request.description),
        )
        .with_context(|| format!("failed to write {}", readme_path.display()))?;
        created_files.push(readme_path.to_string_lossy().into_owned());

        if request.with_skills {
            let skills_dir = plugin_dir.join("skills");
            fs::create_dir_all(&skills_dir)
                .with_context(|| format!("failed to create {}", skills_dir.display()))?;
            let starter_skill_id = format!("{plugin_id}-workflow");
            let starter_skill_dir = skills_dir.join(&starter_skill_id);
            fs::create_dir_all(starter_skill_dir.join("agents"))
                .with_context(|| format!("failed to create {}", starter_skill_dir.display()))?;
            let starter_skill_markdown = starter_skill_dir.join("SKILL.md");
            let starter_skill_metadata = starter_skill_dir.join("agents").join("openai.yaml");
            let starter_skill_description = format!(
                "Starter bundled skill for {}. Replace the workflow with the plugin's primary automation.",
                display_name
            );
            fs::write(
                &starter_skill_markdown,
                build_skill_markdown(
                    &starter_skill_id,
                    &format!("{display_name} Workflow"),
                    &starter_skill_description,
                ),
            )
            .with_context(|| format!("failed to write {}", starter_skill_markdown.display()))?;
            fs::write(
                &starter_skill_metadata,
                build_skill_metadata(
                    &format!("{display_name} Workflow"),
                    &starter_skill_description,
                    true,
                    Some(&format!("Use {display_name} for its primary workflow.")),
                    Some(plugin_default_brand_color(&request.category)),
                ),
            )
            .with_context(|| format!("failed to write {}", starter_skill_metadata.display()))?;
            created_files.push(starter_skill_markdown.to_string_lossy().into_owned());
            created_files.push(starter_skill_metadata.to_string_lossy().into_owned());
        }

        if request.with_apps {
            let app_path = plugin_dir.join(".app.json");
            fs::write(&app_path, build_plugin_app_placeholder(&plugin_id))
                .with_context(|| format!("failed to write {}", app_path.display()))?;
            created_files.push(app_path.to_string_lossy().into_owned());
            let app_template_path = plugin_dir.join("connector-template.md");
            fs::write(
                &app_template_path,
                build_connector_template_markdown(&display_name, "app connector"),
            )
            .with_context(|| format!("failed to write {}", app_template_path.display()))?;
            created_files.push(app_template_path.to_string_lossy().into_owned());
        }

        if request.with_mcp_server {
            let mcp_path = plugin_dir.join(".mcp.json");
            fs::write(&mcp_path, build_plugin_mcp_placeholder(&plugin_id))
                .with_context(|| format!("failed to write {}", mcp_path.display()))?;
            created_files.push(mcp_path.to_string_lossy().into_owned());
            let mcp_template_path = plugin_dir.join("mcp-template.md");
            fs::write(
                &mcp_template_path,
                build_connector_template_markdown(&display_name, "MCP server"),
            )
            .with_context(|| format!("failed to write {}", mcp_template_path.display()))?;
            created_files.push(mcp_template_path.to_string_lossy().into_owned());
        }

        let marketplace_path =
            resolve_marketplace_path(&request.scope, request.destination_root.as_deref())?;
        update_marketplace_file(
            &marketplace_path,
            &request.scope,
            &plugin_id,
            request.category.clone(),
        )?;
        created_files.push(marketplace_path.to_string_lossy().into_owned());

        Ok(CreatePluginScaffoldResult {
            plugin_id,
            source_id: match request.scope {
                PluginScaffoldScope::Repo => "repo".to_string(),
                PluginScaffoldScope::User => "personal".to_string(),
            },
            path: plugin_dir.to_string_lossy().into_owned(),
            marketplace_path: marketplace_path.to_string_lossy().into_owned(),
            created_files,
        })
    }

    fn build_snapshot(
        &self,
        project_root: Option<&str>,
        app_server_plugins: Option<&AppServerPluginListResponse>,
    ) -> AnyhowResult<CatalogSnapshot> {
        let config = load_codex_config().unwrap_or_default();
        let skill_lock = load_skill_lock().unwrap_or_default();
        let metadata_index = load_catalog_metadata(project_root).unwrap_or_default();

        let mut plugin_contexts = BTreeMap::<String, PluginContext>::new();

        if let Some(app_server_plugins) = app_server_plugins {
            discover_app_server_plugins(
                app_server_plugins,
                project_root,
                &config,
                &metadata_index,
                &mut plugin_contexts,
            )?;
        } else {
            discover_cached_plugins(&config, &metadata_index, &mut plugin_contexts)?;
            discover_marketplace_plugins(
                project_root,
                PluginScaffoldScope::Repo,
                &config,
                &metadata_index,
                &mut plugin_contexts,
            )?;
            discover_marketplace_plugins(
                None,
                PluginScaffoldScope::User,
                &config,
                &metadata_index,
                &mut plugin_contexts,
            )?;
        }
        insert_seed_plugins(&mut plugin_contexts);

        for context in plugin_contexts.values_mut() {
            if let Some(persisted) = config.catalog_plugins.get(&context.entry.catalog.plugin_id) {
                apply_persisted_plugin_state(&mut context.entry.installed_state, persisted);
            }
            refresh_plugin_update_state(
                &mut context.entry.installed_state,
                context.available_version.as_deref(),
            );
        }

        let mut sources = BTreeMap::<String, PluginSource>::new();
        let mut plugins = Vec::new();
        for context in plugin_contexts.values() {
            sources
                .entry(context.source.id.clone())
                .or_insert_with(|| context.source.clone());
            plugins.push(context.entry.clone());
        }
        plugins.sort_by(plugin_sort_key);

        let mut skills = seed_recommended_skills();
        discover_codex_skills(&mut skills, &skill_lock, SkillSection::System, SkillScope::System)?;
        discover_user_skills(&mut skills, &skill_lock)?;
        if let Some(project_root) = project_root.filter(|value| !value.trim().is_empty()) {
            discover_repo_skills(Path::new(project_root), &mut skills)?;
        }
        discover_plugin_bundled_skills(&plugin_contexts, &mut skills)?;

        let mut skill_entries = Vec::new();
        for mut entry in skills.into_values() {
            if let Some(persisted) = config.catalog_skills.get(&entry.record.skill_id) {
                apply_persisted_skill_state(&mut entry, persisted);
            }
            skill_entries.push(entry);
        }
        skill_entries.sort_by(skill_sort_key);

        Ok(CatalogSnapshot {
            sources: ordered_sources(sources),
            plugins,
            skills: skill_entries,
            plugin_contexts: plugin_contexts.into_iter().collect(),
        })
    }

}

fn discover_cached_plugins(
    config: &ResolvedConfig,
    metadata_index: &CatalogMetadataIndex,
    plugin_contexts: &mut BTreeMap<String, PluginContext>,
) -> AnyhowResult<()> {
    let cache_root = home_dir()?.join(".codex").join("plugins").join("cache");
    if !cache_root.exists() {
        return Ok(());
    }

    for marketplace_dir in read_dir_dirs(&cache_root)? {
        let marketplace_name = file_name_string(&marketplace_dir.path())?;
        let marketplace_metadata = metadata_index.by_marketplace.get(&marketplace_name);
        for plugin_dir in read_dir_dirs(&marketplace_dir.path())? {
            let version_dir = latest_child_dir(&plugin_dir.path())?;
            let manifest_path = version_dir.path().join(".codex-plugin").join("plugin.json");
            let Some(manifest) = read_optional_json::<PluginManifest>(&manifest_path)? else {
                continue;
            };

            let source = marketplace_metadata
                .and_then(|metadata| metadata.source.clone())
                .unwrap_or_else(|| source_for_marketplace(&marketplace_name, None));
            let app_data = read_plugin_apps(&version_dir.path(), manifest.apps.as_deref())?;
            let mcp_servers = read_plugin_mcp_servers(&version_dir.path(), manifest.mcp_servers.as_deref())?;
            let skill_root = resolve_optional_relative_dir(&version_dir.path(), manifest.skills.as_deref());
            let bundled_skills = list_skill_folder_names(skill_root.as_deref())?;
            let plugin_metadata = marketplace_metadata
                .and_then(|metadata| metadata.plugins.get(&manifest.name));

            let catalog = build_plugin_catalog_from_manifest(
                &manifest,
                manifest.name.as_str(),
                PluginInstallationPolicy::Marketplace,
                bundled_skills,
                app_data.names.clone(),
                mcp_servers.clone(),
                None,
                plugin_metadata,
            );

            let config_key = format!("{}@{}", catalog.plugin_id, marketplace_name);
            let enabled = config.plugin_enabled.get(&config_key).copied().unwrap_or(true);
            let auth_status = infer_plugin_auth_status(
                &catalog,
                &source.scope,
                true,
                enabled,
                &app_data.ids,
                &config.configured_apps,
            );
            let state = InstalledPluginState {
                plugin_id: catalog.plugin_id.clone(),
                installed_version: manifest.version.clone(),
                is_installed: true,
                is_enabled: enabled,
                auth_status,
                has_update: plugin_has_update(
                    manifest.version.as_deref(),
                    plugin_metadata
                        .and_then(plugin_metadata_latest_version)
                        .or_else(|| manifest.version.as_deref()),
                ),
                install_status: install_status_for_plugin(
                    true,
                    enabled,
                    plugin_has_update(
                        manifest.version.as_deref(),
                        plugin_metadata
                            .and_then(plugin_metadata_latest_version)
                            .or_else(|| manifest.version.as_deref()),
                    ),
                ),
            };

            plugin_contexts.insert(
                catalog.plugin_id.clone(),
                PluginContext {
                    source: source.clone(),
                    config_key: Some(config_key),
                    skill_root,
                    available_version: plugin_metadata
                        .and_then(plugin_metadata_latest_version)
                        .map(str::to_string)
                        .or_else(|| manifest.version.clone()),
                    app_ids: app_data.ids.clone(),
                    app_server_locator: None,
                    entry: PluginListEntry {
                        section: plugin_section_for_category(&catalog.category),
                        source_id: source.id.clone(),
                        catalog,
                        installed_state: state,
                    },
                },
            );
        }
    }

    Ok(())
}

fn discover_app_server_plugins(
    response: &AppServerPluginListResponse,
    project_root: Option<&str>,
    config: &ResolvedConfig,
    metadata_index: &CatalogMetadataIndex,
    plugin_contexts: &mut BTreeMap<String, PluginContext>,
) -> AnyhowResult<()> {
    let featured_ids = response
        .featured_plugin_ids
        .iter()
        .cloned()
        .collect::<HashSet<_>>();

    for marketplace in &response.marketplaces {
        let source = source_for_app_server_marketplace(marketplace, project_root)?;
        let metadata = metadata_index
            .by_marketplace
            .get(&marketplace.name)
            .or_else(|| metadata_index.by_marketplace.get(&source.id));

        for plugin in &marketplace.plugins {
            let plugin_root = PathBuf::from(&plugin.source.path);
            let manifest = read_optional_json::<PluginManifest>(
                &plugin_root.join(".codex-plugin").join("plugin.json"),
            )?;
            let app_data = if let Some(manifest) = manifest.as_ref() {
                read_plugin_apps(&plugin_root, manifest.apps.as_deref())?
            } else {
                PluginAppData::default()
            };
            let mcp_servers = if let Some(manifest) = manifest.as_ref() {
                read_plugin_mcp_servers(&plugin_root, manifest.mcp_servers.as_deref())?
            } else {
                Vec::new()
            };
            let skill_root = manifest
                .as_ref()
                .and_then(|manifest| resolve_optional_relative_dir(&plugin_root, manifest.skills.as_deref()))
                .or_else(|| {
                    let candidate = plugin_root.join("skills");
                    candidate.exists().then_some(candidate)
                });
            let bundled_skills = list_skill_folder_names(skill_root.as_deref())?;
            let summary_metadata = app_server_plugin_metadata(plugin);
            let plugin_metadata = metadata
                .and_then(|metadata| metadata.plugins.get(&plugin.name))
                .or_else(|| metadata.and_then(|metadata| metadata.plugins.get(&plugin.id)));
            let mut catalog = if let Some(manifest) = manifest.as_ref() {
                build_plugin_catalog_from_manifest(
                    manifest,
                    &plugin.name,
                    plugin_installation_policy_for_scope(&source.scope),
                    bundled_skills,
                    app_data.names.clone(),
                    mcp_servers.clone(),
                    plugin.interface.as_ref().and_then(|interface| interface.category.as_deref()),
                    Some(&summary_metadata),
                )
            } else {
                build_plugin_catalog_from_app_server_summary(
                    plugin,
                    &source.scope,
                    app_data.names.clone(),
                    mcp_servers.clone(),
                    bundled_skills,
                )
            };
            if let Some(plugin_metadata) = plugin_metadata {
                overlay_marketplace_plugin_metadata(&mut catalog, plugin_metadata);
            }

            let available_version = plugin_metadata
                .and_then(plugin_metadata_latest_version)
                .map(str::to_string);
            let installed_version = manifest.as_ref().and_then(|manifest| manifest.version.clone());
            let has_update = plugin_has_update(installed_version.as_deref(), available_version.as_deref());
            let auth_status = infer_plugin_auth_status(
                &catalog,
                &source.scope,
                plugin.installed,
                plugin.enabled,
                &app_data.ids,
                &config.configured_apps,
            );
            let state = InstalledPluginState {
                plugin_id: catalog.plugin_id.clone(),
                installed_version,
                is_installed: plugin.installed,
                is_enabled: plugin.enabled,
                auth_status,
                has_update,
                install_status: install_status_for_plugin(plugin.installed, plugin.enabled, has_update),
            };
            let is_featured = featured_ids.contains(&plugin.id) || featured_ids.contains(&plugin.name);

            plugin_contexts.insert(
                catalog.plugin_id.clone(),
                PluginContext {
                    source: source.clone(),
                    config_key: config_key_for_marketplace(&source.scope, &marketplace.name, &catalog.plugin_id),
                    skill_root,
                    available_version,
                    app_ids: app_data.ids.clone(),
                    app_server_locator: Some(AppServerPluginLocator {
                        marketplace_path: marketplace.path.clone(),
                        plugin_name: plugin.name.clone(),
                    }),
                    entry: PluginListEntry {
                        section: if is_featured {
                            PluginSection::Featured
                        } else {
                            plugin_section_for_category(&catalog.category)
                        },
                        source_id: source.id.clone(),
                        catalog,
                        installed_state: state,
                    },
                },
            );
        }
    }

    Ok(())
}

fn discover_marketplace_plugins(
    project_root: Option<&str>,
    scope: PluginScaffoldScope,
    config: &ResolvedConfig,
    metadata_index: &CatalogMetadataIndex,
    plugin_contexts: &mut BTreeMap<String, PluginContext>,
) -> AnyhowResult<()> {
    let marketplace_path = match scope {
        PluginScaffoldScope::Repo => match project_root.filter(|value| !value.trim().is_empty()) {
            Some(root) => PathBuf::from(root).join(".agents").join("plugins").join("marketplace.json"),
            None => return Ok(()),
        },
        PluginScaffoldScope::User => home_dir()?.join(".agents").join("plugins").join("marketplace.json"),
    };

    if !marketplace_path.exists() {
        return Ok(());
    }

    let Some(marketplace) = read_optional_json::<MarketplaceFile>(&marketplace_path)? else {
        return Ok(());
    };
    let base_root = marketplace_base_root(&marketplace_path)?;
    let marketplace_display_name = marketplace
        .interface
        .as_ref()
        .and_then(|interface| interface.display_name.as_deref())
        .or(marketplace.name.as_deref());
    let marketplace_key = marketplace_key_for_scope(&scope, marketplace_display_name);
    let source = metadata_index
        .by_marketplace
        .get(&marketplace_key)
        .and_then(|metadata| metadata.source.clone())
        .unwrap_or_else(|| source_for_scope(&scope, marketplace_display_name));

    for plugin in marketplace.plugins {
        let plugin_root = resolve_marketplace_plugin_root(&base_root, &plugin.source.path);
        let manifest_path = plugin_root.join(".codex-plugin").join("plugin.json");
        let manifest = read_optional_json::<PluginManifest>(&manifest_path)?;
        let app_data = if let Some(manifest) = manifest.as_ref() {
            read_plugin_apps(&plugin_root, manifest.apps.as_deref())?
        } else {
            PluginAppData::default()
        };
        let mcp_servers = if let Some(manifest) = manifest.as_ref() {
            read_plugin_mcp_servers(&plugin_root, manifest.mcp_servers.as_deref())?
        } else {
            Vec::new()
        };
        let skill_root = manifest
            .as_ref()
            .and_then(|manifest| resolve_optional_relative_dir(&plugin_root, manifest.skills.as_deref()));
        let bundled_skills = list_skill_folder_names(skill_root.as_deref())?;
        let plugin_metadata = metadata_index
            .by_marketplace
            .get(&marketplace_key)
            .and_then(|metadata| metadata.plugins.get(&plugin.name));
        let marketplace_metadata = marketplace_plugin_metadata(&plugin);

        let auth_policy = plugin
            .policy
            .as_ref()
            .and_then(|policy| policy.authentication.as_deref())
            .map(plugin_auth_policy_from_marketplace)
            .unwrap_or_else(|| default_auth_policy(&app_data.names, &mcp_servers));
        let installation_policy = PluginInstallationPolicy::LocalManifest;
        let is_installed = false;
        let enabled = false;

        let mut catalog = if let Some(manifest) = manifest.as_ref() {
            build_plugin_catalog_from_manifest(
                manifest,
                &plugin.name,
                installation_policy,
                bundled_skills,
                app_data.names.clone(),
                mcp_servers.clone(),
                plugin.category.as_deref(),
                plugin_metadata.or(Some(&marketplace_metadata)),
            )
        } else {
            build_plugin_catalog_from_marketplace(
                &plugin,
                auth_policy.clone(),
                installation_policy,
                app_data.names.clone(),
                mcp_servers.clone(),
                bundled_skills,
            )
        };
        catalog.auth_policy = auth_policy.clone();

        let config_key = None::<String>;
        let state = InstalledPluginState {
            plugin_id: catalog.plugin_id.clone(),
            installed_version: None,
            is_installed,
            is_enabled: enabled,
            auth_status: infer_plugin_auth_status(
                &catalog,
                &source.scope,
                is_installed,
                enabled,
                &app_data.ids,
                &config.configured_apps,
            ),
            has_update: false,
            install_status: install_status_for_plugin(is_installed, enabled, false),
        };

        plugin_contexts.insert(
            catalog.plugin_id.clone(),
            PluginContext {
                source: source.clone(),
                config_key,
                skill_root,
                available_version: manifest
                    .as_ref()
                    .and_then(|manifest| manifest.version.clone())
                    .or_else(|| {
                        plugin_metadata
                            .and_then(plugin_metadata_latest_version)
                            .map(str::to_string)
                    })
                    .or_else(|| plugin.latest_version.clone())
                    .or_else(|| plugin.version.clone()),
                app_ids: app_data.ids.clone(),
                app_server_locator: None,
                entry: PluginListEntry {
                    section: plugin_section_for_category(&catalog.category),
                    source_id: source.id.clone(),
                    catalog,
                    installed_state: state,
                },
            },
        );
    }

    Ok(())
}

fn insert_seed_plugins(
    plugin_contexts: &mut BTreeMap<String, PluginContext>,
) {
    let source = official_source();
    for entry in seed_plugins() {
        if plugin_contexts.contains_key(&entry.catalog.plugin_id) {
            continue;
        }
        let plugin_id = entry.catalog.plugin_id.clone();
        plugin_contexts.insert(
            plugin_id.clone(),
            PluginContext {
                source: source.clone(),
                config_key: None,
                skill_root: None,
                available_version: None,
                app_ids: Vec::new(),
                app_server_locator: None,
                entry,
            },
        );
    }
}

fn apply_persisted_plugin_state(
    state: &mut InstalledPluginState,
    persisted: &PersistedPluginState,
) {
    if let Some(installed_version) = &persisted.installed_version {
        state.installed_version = Some(installed_version.clone());
    }
    if let Some(is_installed) = persisted.is_installed {
        state.is_installed = is_installed;
    }
    if let Some(is_enabled) = persisted.is_enabled {
        state.is_enabled = is_enabled;
    }
    if let Some(auth_status) = &persisted.auth_status {
        state.auth_status = auth_status.clone();
    }
    if let Some(has_update) = persisted.has_update {
        state.has_update = has_update;
    }
    state.install_status = install_status_for_plugin(state.is_installed, state.is_enabled, state.has_update);
}

fn apply_persisted_skill_state(entry: &mut SkillListEntry, persisted: &PersistedSkillState) {
    if let Some(is_installed) = persisted.is_installed {
        entry.record.is_installed = is_installed;
    }
    if let Some(scope) = &persisted.scope {
        entry.record.scope = scope.clone();
    }
    if let Some(source_kind) = &persisted.source_kind {
        entry.record.source_kind = source_kind.clone();
    }
    if let Some(path) = &persisted.path {
        entry.record.path = path.clone();
    }
    if let Some(enabled) = persisted.enabled {
        entry.record.enabled = enabled && entry.record.is_installed;
    }

    entry.section = section_for_skill_scope(&entry.record.scope);
    if entry.record.scope == SkillScope::PluginBundled && !entry.record.is_installed {
        entry.record.enabled = false;
    }
}

fn discover_plugin_bundled_skills(
    plugin_contexts: &BTreeMap<String, PluginContext>,
    skills: &mut BTreeMap<String, SkillListEntry>,
) -> AnyhowResult<()> {
    for context in plugin_contexts.values() {
        let Some(skill_root) = &context.skill_root else {
            continue;
        };

        for skill_dir in read_dir_dirs(skill_root)? {
            let Some(entry) = build_skill_entry_from_dir(
                &skill_dir.path(),
                SkillSection::Personal,
                SkillScope::PluginBundled,
                SkillSourceKind::PluginBundled,
                context.entry.installed_state.is_installed,
                context.entry.installed_state.is_installed && context.entry.installed_state.is_enabled,
                Some(context.entry.catalog.plugin_id.clone()),
                Some(context.entry.catalog.display_name.clone()),
            )? else {
                continue;
            };

            skills.insert(entry.record.skill_id.clone(), entry);
        }
    }

    Ok(())
}

fn discover_codex_skills(
    skills: &mut BTreeMap<String, SkillListEntry>,
    skill_lock: &SkillLockFile,
    section: SkillSection,
    scope: SkillScope,
) -> AnyhowResult<()> {
    let codex_skills_root = home_dir()?.join(".codex").join("skills");
    if !codex_skills_root.exists() {
        return Ok(());
    }

    let roots = match scope {
        SkillScope::System => {
            let mut paths = Vec::new();
            let system_root = codex_skills_root.join(".system");
            if system_root.exists() {
                paths.push(system_root);
            }
            for dir in read_dir_dirs(&codex_skills_root)? {
                let name = file_name_string(&dir.path())?;
                if name != ".system" {
                    paths.push(dir.path());
                }
            }
            paths
        }
        _ => vec![codex_skills_root],
    };

    for root in roots {
        if root.join("SKILL.md").exists() {
            if let Some(entry) = build_skill_entry_from_dir(
                &root,
                section.clone(),
                scope.clone(),
                SkillSourceKind::System,
                true,
                true,
                None,
                None,
            )? {
                skills.insert(entry.record.skill_id.clone(), decorate_skill_lock(entry, skill_lock));
            }
            continue;
        }

        for skill_dir in read_dir_dirs(&root)? {
            if let Some(entry) = build_skill_entry_from_dir(
                &skill_dir.path(),
                section.clone(),
                scope.clone(),
                SkillSourceKind::System,
                true,
                true,
                None,
                None,
            )? {
                skills.insert(entry.record.skill_id.clone(), decorate_skill_lock(entry, skill_lock));
            }
        }
    }

    Ok(())
}

fn discover_user_skills(
    skills: &mut BTreeMap<String, SkillListEntry>,
    skill_lock: &SkillLockFile,
) -> AnyhowResult<()> {
    let user_root = home_dir()?.join(".agents").join("skills");
    if !user_root.exists() {
        return Ok(());
    }

    for skill_dir in read_dir_dirs(&user_root)? {
        if let Some(entry) = build_skill_entry_from_dir(
            &skill_dir.path(),
            SkillSection::Personal,
            SkillScope::Personal,
            SkillSourceKind::UserInstalled,
            true,
            true,
            None,
            None,
        )? {
            skills.insert(entry.record.skill_id.clone(), decorate_skill_lock(entry, skill_lock));
        }
    }

    Ok(())
}

fn discover_repo_skills(project_root: &Path, skills: &mut BTreeMap<String, SkillListEntry>) -> AnyhowResult<()> {
    let repo_root = project_root.join(".agents").join("skills");
    if !repo_root.exists() {
        return Ok(());
    }

    for skill_dir in read_dir_dirs(&repo_root)? {
        if let Some(entry) = build_skill_entry_from_dir(
            &skill_dir.path(),
            SkillSection::Personal,
            SkillScope::Repo,
            SkillSourceKind::LocalRepo,
            true,
            true,
            None,
            None,
        )? {
            skills.insert(entry.record.skill_id.clone(), entry);
        }
    }

    Ok(())
}

fn build_skill_entry_from_dir(
    skill_dir: &Path,
    section: SkillSection,
    scope: SkillScope,
    source_kind: SkillSourceKind,
    is_installed: bool,
    enabled: bool,
    bundled_by_plugin_id: Option<String>,
    bundled_by_plugin_name: Option<String>,
) -> AnyhowResult<Option<SkillListEntry>> {
    let skill_md_path = skill_dir.join("SKILL.md");
    if !skill_md_path.exists() {
        return Ok(None);
    }

    let folder_name = file_name_string(skill_dir)?;
    let markdown = fs::read_to_string(&skill_md_path)
        .with_context(|| format!("failed to read {}", skill_md_path.display()))?;
    let frontmatter = parse_markdown_frontmatter::<SkillFrontmatter>(&markdown).unwrap_or_default();
    let metadata = read_optional_yaml::<SkillMetadataFile>(&skill_dir.join("agents").join("openai.yaml"))?
        .unwrap_or_default();

    let display_name = skill_display_name(&folder_name, &frontmatter, &metadata);
    let description = skill_description(&markdown, &frontmatter, &metadata);
    let short_description = skill_short_description(&description, &metadata);
    let icon = skill_icon_key(&folder_name, &metadata);
    let dependencies = skill_dependencies(&metadata);
    let allow_implicit_invocation = metadata
        .interface
        .as_ref()
        .and_then(|value| value.allow_implicit_invocation)
        .or(metadata.allow_implicit_invocation)
        .unwrap_or(false);
    let default_prompt = metadata
        .interface
        .as_ref()
        .and_then(|value| value.default_prompt.clone())
        .or(metadata.default_prompt.clone());
    let brand_color = metadata
        .interface
        .as_ref()
        .and_then(|value| value.brand_color.clone())
        .or(metadata.brand_color.clone());

    Ok(Some(SkillListEntry {
        section,
        bundled_by_plugin_id,
        bundled_by_plugin_name,
        record: SkillRecord {
            skill_id: folder_name.clone(),
            name: folder_name.clone(),
            display_name,
            description,
            short_description,
            scope,
            path: Some(skill_md_path.to_string_lossy().into_owned()),
            enabled,
            is_installed,
            source_kind,
            allow_implicit_invocation,
            default_prompt,
            icon,
            brand_color,
            dependencies,
        },
    }))
}

fn decorate_skill_lock(mut entry: SkillListEntry, skill_lock: &SkillLockFile) -> SkillListEntry {
    if let Some(lock_entry) = skill_lock.skills.get(&entry.record.skill_id) {
        if let Some(source) = lock_entry.source.as_deref() {
            entry.record.dependencies.push(SkillDependency {
                kind: SkillDependencyKind::File,
                value: source.to_string(),
                label: format!("Installed from {source}"),
                required: false,
            });
        } else if let Some(url) = lock_entry.source_url.as_deref() {
            entry.record.dependencies.push(SkillDependency {
                kind: SkillDependencyKind::File,
                value: url.to_string(),
                label: format!(
                    "Installed via {}",
                    lock_entry
                        .source_type
                        .as_deref()
                        .unwrap_or("external source")
                ),
                required: false,
            });
        }
    }

    entry
}

fn apply_app_server_plugin_detail(entry: &mut PluginListEntry, detail: &AppServerPluginReadResponse) {
    let plugin = &detail.plugin;
    if let Some(description) = detail.plugin.description.as_ref().filter(|value| !value.trim().is_empty()) {
        entry.catalog.long_description = description.clone();
    }
    entry.catalog.bundled_skills = plugin
        .skills
        .iter()
        .map(|skill| {
            skill
                .interface
                .as_ref()
                .and_then(|interface| interface.display_name.clone())
                .unwrap_or_else(|| titleize(&skill.name))
        })
        .collect();
    entry.catalog.bundled_apps = plugin.apps.iter().map(|app| app.name.clone()).collect();
    entry.catalog.bundled_mcp_servers = plugin.mcp_servers.clone();

    entry.installed_state.auth_status = auth_status_from_app_server_detail(
        &entry.catalog,
        plugin,
        entry.installed_state.is_installed,
    );
    entry.installed_state.install_status = install_status_for_plugin(
        entry.installed_state.is_installed,
        entry.installed_state.is_enabled,
        entry.installed_state.has_update,
    );
}

fn auth_status_from_app_server_detail(
    catalog: &PluginCatalogEntry,
    detail: &AppServerPluginDetail,
    is_installed: bool,
) -> PluginAuthStatus {
    if catalog.auth_policy == PluginAuthPolicy::None {
        return PluginAuthStatus::NotRequired;
    }
    if !is_installed {
        return PluginAuthStatus::NeedsAuth;
    }
    if detail.apps.iter().any(|app| app.needs_auth) {
        PluginAuthStatus::NeedsAuth
    } else {
        PluginAuthStatus::Connected
    }
}

fn build_plugin_catalog_from_app_server_summary(
    plugin: &AppServerPluginSummary,
    source_scope: &PluginSourceScope,
    bundled_apps: Vec<String>,
    bundled_mcp_servers: Vec<String>,
    bundled_skills: Vec<String>,
) -> PluginCatalogEntry {
    let metadata = app_server_plugin_metadata(plugin);
    let raw_category = metadata.category.as_deref().unwrap_or("Productivity");
    let category = plugin_category_from_str(raw_category);
    let display_name = metadata
        .display_name
        .clone()
        .unwrap_or_else(|| titleize(&plugin.name));
    let short_description = metadata
        .short_description
        .clone()
        .unwrap_or_else(|| "Plugin available from Codex app-server discovery.".to_string());
    let long_description = metadata
        .long_description
        .clone()
        .unwrap_or_else(|| short_description.clone());
    let logo = plugin
        .interface
        .as_ref()
        .and_then(|value| value.logo.as_deref().or(value.composer_icon.as_deref()))
        .map(infer_icon_key)
        .or_else(|| Some(infer_icon_key(&plugin.name)));

    PluginCatalogEntry {
        plugin_id: plugin.id.clone(),
        name: plugin.name.clone(),
        display_name,
        short_description,
        long_description,
        category,
        capabilities: infer_plugin_capabilities(
            &plugin.name,
            raw_category,
            metadata.capabilities.clone(),
            &bundled_apps,
            &bundled_mcp_servers,
        ),
        auth_policy: app_server_auth_policy_to_plugin_auth_policy(&plugin.auth_policy),
        installation_policy: plugin_installation_policy_for_scope(source_scope),
        logo,
        screenshots: metadata.screenshots.clone(),
        developer_name: metadata
            .developer_name
            .clone()
            .unwrap_or_else(|| plugin_source_label(source_scope).to_string()),
        website_url: metadata.website_url.clone(),
        privacy_policy_url: metadata.privacy_policy_url.clone(),
        terms_of_service_url: metadata.terms_of_service_url.clone(),
        bundled_skills,
        bundled_apps,
        bundled_mcp_servers,
    }
}

fn overlay_marketplace_plugin_metadata(
    catalog: &mut PluginCatalogEntry,
    metadata: &MarketplacePluginMetadata,
) {
    if let Some(display_name) = metadata.display_name.as_ref().filter(|value| !value.trim().is_empty()) {
        catalog.display_name = display_name.clone();
    }
    if let Some(short_description) =
        metadata.short_description.as_ref().filter(|value| !value.trim().is_empty())
    {
        catalog.short_description = short_description.clone();
    }
    if let Some(long_description) =
        metadata.long_description.as_ref().filter(|value| !value.trim().is_empty())
    {
        catalog.long_description = long_description.clone();
    }
    if let Some(category) = metadata.category.as_deref() {
        catalog.category = plugin_category_from_str(category);
    }
    if !metadata.capabilities.is_empty() {
        catalog.capabilities = infer_plugin_capabilities(
            &catalog.name,
            plugin_category_display_name(&catalog.category),
            metadata.capabilities.clone(),
            &catalog.bundled_apps,
            &catalog.bundled_mcp_servers,
        );
    }
    if let Some(developer_name) =
        metadata.developer_name.as_ref().filter(|value| !value.trim().is_empty())
    {
        catalog.developer_name = developer_name.clone();
    }
    if let Some(website_url) = metadata.website_url.as_ref() {
        catalog.website_url = Some(website_url.clone());
    }
    if let Some(privacy_policy_url) = metadata.privacy_policy_url.as_ref() {
        catalog.privacy_policy_url = Some(privacy_policy_url.clone());
    }
    if let Some(terms_of_service_url) = metadata.terms_of_service_url.as_ref() {
        catalog.terms_of_service_url = Some(terms_of_service_url.clone());
    }
    if !metadata.screenshots.is_empty() {
        catalog.screenshots = metadata.screenshots.clone();
    }
}

fn app_server_plugin_metadata(plugin: &AppServerPluginSummary) -> MarketplacePluginMetadata {
    let interface = plugin.interface.as_ref();
    MarketplacePluginMetadata {
        display_name: interface.and_then(|value| value.display_name.clone()),
        short_description: interface.and_then(|value| value.short_description.clone()),
        long_description: interface.and_then(|value| value.long_description.clone()),
        category: interface.and_then(|value| value.category.clone()),
        capabilities: interface
            .map(|value| value.capabilities.clone())
            .unwrap_or_default(),
        developer_name: interface.and_then(|value| value.developer_name.clone()),
        website_url: interface.and_then(|value| value.website_url.clone()),
        privacy_policy_url: interface.and_then(|value| value.privacy_policy_url.clone()),
        terms_of_service_url: interface.and_then(|value| value.terms_of_service_url.clone()),
        screenshots: interface
            .map(|value| value.screenshots.clone())
            .unwrap_or_default(),
        ..Default::default()
    }
}

fn app_server_auth_policy_to_plugin_auth_policy(
    value: &AppServerPluginAuthPolicy,
) -> PluginAuthPolicy {
    match value {
        AppServerPluginAuthPolicy::OnInstall | AppServerPluginAuthPolicy::OnUse => {
            PluginAuthPolicy::Required
        }
    }
}

fn plugin_installation_policy_for_scope(scope: &PluginSourceScope) -> PluginInstallationPolicy {
    match scope {
        PluginSourceScope::Official => PluginInstallationPolicy::Marketplace,
        PluginSourceScope::Personal | PluginSourceScope::Repo => PluginInstallationPolicy::LocalManifest,
    }
}

fn config_key_for_marketplace(
    scope: &PluginSourceScope,
    marketplace_name: &str,
    plugin_id: &str,
) -> Option<String> {
    match scope {
        PluginSourceScope::Official => Some(format!("{plugin_id}@{marketplace_name}")),
        PluginSourceScope::Personal | PluginSourceScope::Repo => None,
    }
}

fn source_for_app_server_marketplace(
    marketplace: &AppServerPluginMarketplaceEntry,
    project_root: Option<&str>,
) -> AnyhowResult<PluginSource> {
    let display_name_hint = marketplace
        .interface
        .as_ref()
        .and_then(|interface| interface.display_name.as_deref())
        .or(Some(marketplace.name.as_str()));
    let path = PathBuf::from(&marketplace.path);

    if marketplace.name.contains("openai")
        || marketplace
            .interface
            .as_ref()
            .and_then(|interface| interface.display_name.as_deref())
            .map(|value| value.to_ascii_lowercase().contains("openai"))
            .unwrap_or(false)
    {
        return Ok(official_source());
    }

    if let Some(project_root) = project_root.filter(|value| !value.trim().is_empty()) {
        if path.starts_with(Path::new(project_root)) {
            return Ok(repo_source(display_name_hint));
        }
    }

    if path.starts_with(home_dir()?) {
        return Ok(personal_source(display_name_hint));
    }

    Ok(repo_source(display_name_hint))
}

fn plugin_source_label(scope: &PluginSourceScope) -> &'static str {
    match scope {
        PluginSourceScope::Official => "OpenAI curated",
        PluginSourceScope::Personal => "Personal marketplace",
        PluginSourceScope::Repo => "Workspace marketplace",
    }
}

fn build_plugin_catalog_from_manifest(
    manifest: &PluginManifest,
    fallback_name: &str,
    installation_policy: PluginInstallationPolicy,
    bundled_skills: Vec<String>,
    bundled_apps: Vec<String>,
    bundled_mcp_servers: Vec<String>,
    marketplace_category: Option<&str>,
    marketplace_metadata: Option<&MarketplacePluginMetadata>,
) -> PluginCatalogEntry {
    let interface = manifest.interface.as_ref();
    let raw_category = interface
        .and_then(|value| value.category.as_deref())
        .or_else(|| marketplace_metadata.and_then(|metadata| metadata.category.as_deref()))
        .or(marketplace_category)
        .unwrap_or("Productivity");
    let category = plugin_category_from_str(raw_category);
    let display_name = interface
        .and_then(|value| value.display_name.clone())
        .or_else(|| marketplace_metadata.and_then(|metadata| metadata.display_name.clone()))
        .unwrap_or_else(|| titleize(&manifest.name));
    let short_description = interface
        .and_then(|value| value.short_description.clone())
        .or_else(|| marketplace_metadata.and_then(|metadata| metadata.short_description.clone()))
        .or_else(|| manifest.description.clone())
        .unwrap_or_else(|| titleize(fallback_name));
    let long_description = interface
        .and_then(|value| value.long_description.clone())
        .or_else(|| marketplace_metadata.and_then(|metadata| metadata.long_description.clone()))
        .or_else(|| manifest.description.clone())
        .unwrap_or_else(|| short_description.clone());
    let developer_name = interface
        .and_then(|value| value.developer_name.clone())
        .or_else(|| marketplace_metadata.and_then(|metadata| metadata.developer_name.clone()))
        .or_else(|| manifest.author.as_ref().and_then(|author| author.name.clone()))
        .unwrap_or_else(|| "Unknown publisher".to_string());
    let website_url = interface
        .and_then(|value| value.website_url.clone())
        .or_else(|| marketplace_metadata.and_then(|metadata| metadata.website_url.clone()))
        .or_else(|| manifest.homepage.clone())
        .or_else(|| manifest.author.as_ref().and_then(|author| author.url.clone()));
    let privacy_policy_url = interface
        .and_then(|value| value.privacy_policy_url.clone())
        .or_else(|| marketplace_metadata.and_then(|metadata| metadata.privacy_policy_url.clone()));
    let terms_of_service_url = interface
        .and_then(|value| value.terms_of_service_url.clone())
        .or_else(|| marketplace_metadata.and_then(|metadata| metadata.terms_of_service_url.clone()));
    let capabilities = infer_plugin_capabilities(
        &manifest.name,
        raw_category,
        interface
            .and_then(|value| value.capabilities.clone())
            .or_else(|| marketplace_metadata.map(|metadata| metadata.capabilities.clone()))
            .unwrap_or_default(),
        &bundled_apps,
        &bundled_mcp_servers,
    );
    let auth_policy = default_auth_policy(&bundled_apps, &bundled_mcp_servers);
    let logo = interface
        .and_then(|value| value.logo.clone())
        .map(|_| infer_icon_key(&manifest.name));
    let screenshots = interface
        .and_then(|value| value.screenshots.clone())
        .or_else(|| marketplace_metadata.map(|metadata| metadata.screenshots.clone()))
        .unwrap_or_default();

    PluginCatalogEntry {
        plugin_id: manifest.name.clone(),
        name: manifest.name.clone(),
        display_name,
        short_description,
        long_description,
        category,
        capabilities,
        auth_policy,
        installation_policy,
        logo,
        screenshots,
        developer_name,
        website_url,
        privacy_policy_url,
        terms_of_service_url,
        bundled_skills,
        bundled_apps,
        bundled_mcp_servers,
    }
}

fn build_plugin_catalog_from_marketplace(
    plugin: &MarketplacePluginEntry,
    auth_policy: PluginAuthPolicy,
    installation_policy: PluginInstallationPolicy,
    bundled_apps: Vec<String>,
    bundled_mcp_servers: Vec<String>,
    bundled_skills: Vec<String>,
) -> PluginCatalogEntry {
    let metadata = marketplace_plugin_metadata(plugin);
    let raw_category = metadata
        .category
        .as_deref()
        .or(plugin.category.as_deref())
        .unwrap_or("Productivity");
    let category = plugin_category_from_str(raw_category);
    let display_name = metadata
        .display_name
        .unwrap_or_else(|| titleize(&plugin.name));
    let capabilities = infer_plugin_capabilities(
        &plugin.name,
        raw_category,
        metadata.capabilities,
        &bundled_apps,
        &bundled_mcp_servers,
    );

    PluginCatalogEntry {
        plugin_id: plugin.name.clone(),
        name: plugin.name.clone(),
        display_name: display_name.clone(),
        short_description: metadata.short_description.unwrap_or_else(|| {
            "Local plugin scaffold ready for authoring and installation.".to_string()
        }),
        long_description: metadata.long_description.unwrap_or_else(|| {
            "This plugin comes from a local marketplace entry. Open the scaffold to edit the manifest, add bundled skills, and wire connectors or MCP servers.".to_string()
        }),
        category,
        capabilities,
        auth_policy,
        installation_policy,
        logo: None,
        screenshots: metadata.screenshots,
        developer_name: metadata
            .developer_name
            .unwrap_or_else(|| "Local workspace".to_string()),
        website_url: metadata.website_url,
        privacy_policy_url: metadata.privacy_policy_url,
        terms_of_service_url: metadata.terms_of_service_url,
        bundled_skills,
        bundled_apps,
        bundled_mcp_servers,
    }
}

fn marketplace_plugin_metadata(plugin: &MarketplacePluginEntry) -> MarketplacePluginMetadata {
    MarketplacePluginMetadata {
        version: plugin.version.clone(),
        latest_version: plugin.latest_version.clone(),
        display_name: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.display_name.clone()),
        short_description: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.short_description.clone()),
        long_description: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.long_description.clone()),
        category: plugin.category.clone(),
        capabilities: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.capabilities.clone())
            .unwrap_or_default(),
        developer_name: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.developer_name.clone()),
        website_url: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.website_url.clone()),
        privacy_policy_url: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.privacy_policy_url.clone()),
        terms_of_service_url: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.terms_of_service_url.clone()),
        screenshots: plugin
            .interface
            .as_ref()
            .and_then(|interface| interface.screenshots.clone())
            .unwrap_or_default(),
    }
}

fn plugin_metadata_latest_version(metadata: &MarketplacePluginMetadata) -> Option<&str> {
    metadata
        .latest_version
        .as_deref()
        .or(metadata.version.as_deref())
}

fn read_plugin_apps(root: &Path, relative_path: Option<&str>) -> AnyhowResult<PluginAppData> {
    let Some(path) = resolve_optional_relative_file(root, relative_path) else {
        return Ok(PluginAppData::default());
    };
    let Some(file) = read_optional_json::<PluginAppFile>(&path)? else {
        return Ok(PluginAppData::default());
    };

    let names = file.apps.keys().cloned().collect::<Vec<_>>();
    let ids = file
        .apps
        .values()
        .filter_map(|entry| entry.id.clone())
        .collect::<Vec<_>>();
    Ok(PluginAppData { names, ids })
}

fn read_plugin_mcp_servers(root: &Path, relative_path: Option<&str>) -> AnyhowResult<Vec<String>> {
    let Some(path) = resolve_optional_relative_file(root, relative_path) else {
        return Ok(Vec::new());
    };
    let Some(file) = read_optional_json::<PluginMcpFile>(&path)? else {
        return Ok(Vec::new());
    };
    Ok(file.mcp_servers.keys().cloned().collect())
}

#[derive(Debug, Default)]
struct PluginAppData {
    names: Vec<String>,
    ids: Vec<String>,
}

fn resolve_optional_relative_file(root: &Path, relative_path: Option<&str>) -> Option<PathBuf> {
    let relative_path = relative_path?.trim();
    if relative_path.is_empty() {
        return None;
    }
    let relative_path = relative_path.trim_start_matches("./");
    Some(root.join(relative_path))
}

fn resolve_optional_relative_dir(root: &Path, relative_path: Option<&str>) -> Option<PathBuf> {
    let candidate = resolve_optional_relative_file(root, relative_path)?;
    candidate.exists().then_some(candidate)
}

fn list_skill_folder_names(root: Option<&Path>) -> AnyhowResult<Vec<String>> {
    let Some(root) = root else {
        return Ok(Vec::new());
    };
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut names = Vec::new();
    for dir in read_dir_dirs(root)? {
        if dir.path().join("SKILL.md").exists() {
            names.push(file_name_string(&dir.path())?);
        }
    }
    names.sort();
    Ok(names)
}

fn seed_plugins() -> Vec<PluginListEntry> {
    let source_id = official_source().id;
    vec![
        seed_plugin(
            PluginSection::Featured,
            &source_id,
            "slack",
            "Slack",
            "Read and manage Slack",
            "Search channels, summarize threads, and coordinate approvals without leaving the desktop shell. Requires a workspace connection before actions can run.",
            PluginCategory::Collaboration,
            vec![PluginCapability::Messaging, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Featured,
            &source_id,
            "notion",
            "Notion",
            "Notion workflows for specs, research, and docs",
            "Turn workspace notes into shippable context, sync project docs, and keep captured research available as reusable skills and references.",
            PluginCategory::Documentation,
            vec![PluginCapability::Documents, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Featured,
            &source_id,
            "gmail",
            "Gmail",
            "Read and manage Gmail",
            "Work through email triage, label messages, and create follow-up tasks directly from inbox context.",
            PluginCategory::Productivity,
            vec![PluginCapability::Automation, PluginCapability::Documents],
        ),
        seed_plugin(
            PluginSection::Featured,
            &source_id,
            "google-calendar",
            "Google Calendar",
            "Manage Google Calendar events and schedules",
            "See upcoming meetings, coordinate calendar changes, and prep context before a session starts.",
            PluginCategory::Productivity,
            vec![PluginCapability::Calendar, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Featured,
            &source_id,
            "google-drive",
            "Google Drive",
            "Work across Drive, Docs, Sheets, and Slides",
            "Pull research files into threads, summarize docs, and hand structured data back into other automations.",
            PluginCategory::Documentation,
            vec![PluginCapability::Documents, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Featured,
            &source_id,
            "vercel",
            "Vercel",
            "Build and deploy web apps and agents",
            "Connect deployments, preview environments, and release checks to the desktop workflow.",
            PluginCategory::Infrastructure,
            vec![PluginCapability::Deployments, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Coding,
            &source_id,
            "hugging-face",
            "Hugging Face",
            "Inspect models, datasets, Spaces, and repos",
            "Browse model cards, inspect datasets, and bring ML context into threads and workflow automations.",
            PluginCategory::DeveloperTools,
            vec![PluginCapability::DatasetsAndModels, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Coding,
            &source_id,
            "game-studio",
            "Game Studio",
            "Design, prototype, and ship browser games",
            "Scaffold mechanics, playtest loops, and content pipelines from a dedicated coding plugin.",
            PluginCategory::DeveloperTools,
            vec![PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Coding,
            &source_id,
            "sentry",
            "Sentry",
            "Inspect recent Sentry issues and events",
            "Pull issue details, correlate crashes, and drive fix workflows without leaving the desktop shell.",
            PluginCategory::Infrastructure,
            vec![PluginCapability::Observability, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Coding,
            &source_id,
            "netlify",
            "Netlify",
            "Deploy projects and manage releases",
            "Inspect builds, deploy previews, and manage release state for frontend projects and tools.",
            PluginCategory::Infrastructure,
            vec![PluginCapability::Deployments, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Coding,
            &source_id,
            "cloudflare",
            "Cloudflare",
            "Cloudflare platform guidance with official tooling",
            "Manage Workers, routes, and edge infrastructure with a connector-first desktop workflow.",
            PluginCategory::Infrastructure,
            vec![PluginCapability::Deployments, PluginCapability::Automation],
        ),
        seed_plugin(
            PluginSection::Coding,
            &source_id,
            "build-ios-apps",
            "Build iOS Apps",
            "Build, refine, and debug iOS apps with app tooling",
            "Bring mobile build automation, simulator runs, and review context into the same workspace flow.",
            PluginCategory::NativeTooling,
            vec![PluginCapability::NativeBuilds, PluginCapability::Automation],
        ),
    ]
}

fn seed_plugin(
    section: PluginSection,
    source_id: &str,
    plugin_id: &str,
    display_name: &str,
    short_description: &str,
    long_description: &str,
    category: PluginCategory,
    capabilities: Vec<PluginCapability>,
) -> PluginListEntry {
    let auth_policy = PluginAuthPolicy::Required;
    PluginListEntry {
        section,
        source_id: source_id.to_string(),
        catalog: PluginCatalogEntry {
            plugin_id: plugin_id.to_string(),
            name: plugin_id.to_string(),
            display_name: display_name.to_string(),
            short_description: short_description.to_string(),
            long_description: long_description.to_string(),
            category,
            capabilities,
            auth_policy: auth_policy.clone(),
            installation_policy: PluginInstallationPolicy::Marketplace,
            logo: Some(plugin_id.to_string()),
            screenshots: Vec::new(),
            developer_name: "OpenAI".to_string(),
            website_url: None,
            privacy_policy_url: None,
            terms_of_service_url: None,
            bundled_skills: Vec::new(),
            bundled_apps: vec![display_name.to_string()],
            bundled_mcp_servers: Vec::new(),
        },
        installed_state: InstalledPluginState {
            plugin_id: plugin_id.to_string(),
            installed_version: None,
            is_installed: false,
            is_enabled: false,
            auth_status: match auth_policy {
                PluginAuthPolicy::None => PluginAuthStatus::NotRequired,
                PluginAuthPolicy::Optional | PluginAuthPolicy::Required => PluginAuthStatus::NeedsAuth,
            },
            has_update: false,
            install_status: PluginInstallStatus::Available,
        },
    }
}

fn seed_recommended_skills() -> BTreeMap<String, SkillListEntry> {
    let mut skills = BTreeMap::new();
    for entry in [
        seed_recommended_skill(
            "sora",
            "Sora",
            "Generate, edit, extend, and manage Sora workflows",
            "Use Sora for generation and editing workflows",
            Some("sora"),
        ),
        seed_recommended_skill(
            "doc",
            "Doc",
            "Edit and review docx files",
            "Open, review, and transform document files",
            Some("doc"),
        ),
        seed_recommended_skill(
            "spreadsheet",
            "Spreadsheet",
            "Create, edit, and analyze spreadsheets",
            "Work through spreadsheet analysis and transformations",
            Some("spreadsheet"),
        ),
    ] {
        skills.insert(entry.record.skill_id.clone(), entry);
    }
    skills
}

fn seed_recommended_skill(
    skill_id: &str,
    display_name: &str,
    description: &str,
    short_description: &str,
    icon: Option<&str>,
) -> SkillListEntry {
    SkillListEntry {
        section: SkillSection::Recommended,
        bundled_by_plugin_id: None,
        bundled_by_plugin_name: None,
        record: SkillRecord {
            skill_id: skill_id.to_string(),
            name: skill_id.to_string(),
            display_name: display_name.to_string(),
            description: description.to_string(),
            short_description: short_description.to_string(),
            scope: SkillScope::Recommended,
            path: None,
            enabled: false,
            is_installed: false,
            source_kind: SkillSourceKind::Catalog,
            allow_implicit_invocation: true,
            default_prompt: None,
            icon: icon.map(str::to_string),
            brand_color: None,
            dependencies: Vec::new(),
        },
    }
}

fn plugin_management_notes(
    catalog: &PluginCatalogEntry,
    state: &InstalledPluginState,
) -> Vec<String> {
    let mut notes = Vec::new();
    if !state.is_installed {
        notes.push("Available to install from the selected source.".to_string());
    } else if state.is_enabled {
        notes.push("Enabled for use in new desktop sessions and tool calls.".to_string());
    } else {
        notes.push("Installed locally but currently disabled.".to_string());
    }

    match state.auth_status {
        PluginAuthStatus::Connected => {
            notes.push("Connection is ready and live actions can run.".to_string())
        }
        PluginAuthStatus::NeedsAuth => notes.push(
            "Install is available, but account connection still needs to be completed.".to_string(),
        ),
        PluginAuthStatus::Expired => notes
            .push("Connection expired and should be refreshed before the next action.".to_string()),
        PluginAuthStatus::NotRequired => {
            notes.push("This plugin does not require an external connection.".to_string())
        }
    }

    if state.has_update {
        notes.push("A newer version is available and can be applied during the next refresh.".to_string());
    }

    if !catalog.bundled_skills.is_empty() {
        notes.push(format!(
            "Bundled skills follow the plugin install state: {}.",
            catalog.bundled_skills.join(", ")
        ));
    }

    if matches!(
        catalog.installation_policy,
        PluginInstallationPolicy::Marketplace | PluginInstallationPolicy::LocalManifest
    ) {
        notes.push("Install, auth, and uninstall are session-backed today; keep the filesystem-backed manifest as the long-term source of truth.".to_string());
    }

    notes
}

fn skill_dependency_note(dependency: &SkillDependency) -> String {
    let requirement = if dependency.required {
        "Required"
    } else {
        "Optional"
    };
    format!(
        "{requirement} {} dependency: {}",
        dependency_label(&dependency.kind),
        dependency.label
    )
}

fn dependency_label(kind: &SkillDependencyKind) -> &'static str {
    match kind {
        SkillDependencyKind::Skill => "skill",
        SkillDependencyKind::App => "app",
        SkillDependencyKind::McpServer => "MCP server",
        SkillDependencyKind::Binary => "binary",
        SkillDependencyKind::File => "file",
    }
}

fn skill_display_name(
    folder_name: &str,
    frontmatter: &SkillFrontmatter,
    metadata: &SkillMetadataFile,
) -> String {
    metadata
        .interface
        .as_ref()
        .and_then(|value| value.display_name.clone())
        .or(metadata.display_name.clone())
        .or(frontmatter.name.clone())
        .unwrap_or_else(|| titleize(folder_name))
}

fn skill_short_description(description: &str, metadata: &SkillMetadataFile) -> String {
    metadata
        .interface
        .as_ref()
        .and_then(|value| value.short_description.clone())
        .or(metadata.short_description.clone())
        .unwrap_or_else(|| description.to_string())
}

fn skill_description(
    markdown: &str,
    frontmatter: &SkillFrontmatter,
    metadata: &SkillMetadataFile,
) -> String {
    metadata
        .interface
        .as_ref()
        .and_then(|value| value.short_description.clone())
        .or(metadata.short_description.clone())
        .or(frontmatter.description.clone())
        .or_else(|| first_markdown_paragraph(markdown))
        .unwrap_or_else(|| "Reusable skill".to_string())
}

fn skill_icon_key(folder_name: &str, metadata: &SkillMetadataFile) -> Option<String> {
    let icon_path = metadata
        .interface
        .as_ref()
        .and_then(|value| value.icon_large.clone().or(value.icon_small.clone()))
        .or(metadata.icon_large.clone())
        .or(metadata.icon_small.clone());

    match icon_path {
        Some(path) => Some(infer_icon_key(&path)),
        None => Some(infer_icon_key(folder_name)),
    }
}

fn skill_dependencies(metadata: &SkillMetadataFile) -> Vec<SkillDependency> {
    let Some(dependencies) = &metadata.dependencies else {
        return Vec::new();
    };

    let mut values = Vec::new();
    for dependency in &dependencies.tools {
        if let Some(value) = dependency.value.as_ref() {
            values.push(SkillDependency {
                kind: skill_dependency_kind_from_str(dependency.kind.as_deref()),
                value: value.clone(),
                label: dependency
                    .description
                    .clone()
                    .unwrap_or_else(|| value.clone()),
                required: dependency.required.unwrap_or(true),
            });
        }
    }
    for dependency in &dependencies.files {
        if let Some(value) = dependency.value.as_ref() {
            values.push(SkillDependency {
                kind: SkillDependencyKind::File,
                value: value.clone(),
                label: dependency
                    .description
                    .clone()
                    .unwrap_or_else(|| value.clone()),
                required: dependency.required.unwrap_or(false),
            });
        }
    }

    values
}

fn load_codex_config() -> AnyhowResult<ResolvedConfig> {
    let path = codex_config_path();
    if !path.exists() {
        return Ok(ResolvedConfig::default());
    }
    let content = fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let value: TomlValue = toml::from_str(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;

    let mut plugin_enabled = HashMap::new();
    let mut configured_apps = HashSet::new();

    if let Some(plugins) = value.get("plugins").and_then(|value| value.as_table()) {
        for (key, plugin_value) in plugins {
            if let Some(enabled) = plugin_value.get("enabled").and_then(|value| value.as_bool()) {
                plugin_enabled.insert(key.clone(), enabled);
            }
        }
    }

    if let Some(apps) = value.get("apps").and_then(|value| value.as_table()) {
        for key in apps.keys() {
            configured_apps.insert(key.clone());
        }
    }

    let catalog_plugins = value
        .get("kodeks_catalog")
        .and_then(|value| value.get("plugins"))
        .and_then(toml_table_to_hashmap::<PersistedPluginState>)
        .unwrap_or_default();
    let catalog_skills = value
        .get("kodeks_catalog")
        .and_then(|value| value.get("skills"))
        .and_then(toml_table_to_hashmap::<PersistedSkillState>)
        .unwrap_or_default();

    Ok(ResolvedConfig {
        plugin_enabled,
        configured_apps,
        catalog_plugins,
        catalog_skills,
    })
}

fn toml_table_to_hashmap<T: DeserializeOwned>(value: &TomlValue) -> Option<HashMap<String, T>> {
    let table = value.as_table()?;
    let mut result = HashMap::new();
    for (key, item) in table {
        if let Ok(parsed) = item.clone().try_into::<T>() {
            result.insert(key.clone(), parsed);
        }
    }
    Some(result)
}

fn load_skill_lock() -> AnyhowResult<SkillLockFile> {
    let path = home_dir()?.join(".agents").join(".skill-lock.json");
    Ok(read_optional_json::<SkillLockFile>(&path)?.unwrap_or_default())
}

fn write_plugin_enabled_to_config(config_key: &str, enabled: bool) -> AnyhowResult<()> {
    let path = codex_config_path();
    let mut value = load_or_create_codex_config_value(&path)?;
    let root = toml_root_mut(&mut value, &path)?;
    let plugins = root
        .entry("plugins")
        .or_insert_with(|| TomlValue::Table(Default::default()))
        .as_table_mut()
        .ok_or_else(|| anyhow!("expected [plugins] to be a TOML table"))?;
    let plugin = plugins
        .entry(config_key.to_string())
        .or_insert_with(|| TomlValue::Table(Default::default()))
        .as_table_mut()
        .ok_or_else(|| anyhow!("expected [plugins.\"{config_key}\"] to be a TOML table"))?;
    plugin.insert("enabled".to_string(), TomlValue::Boolean(enabled));

    fs::write(&path, toml::to_string_pretty(&value)?)
        .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

fn write_app_connected_to_config(app_id: &str, connected: bool) -> AnyhowResult<()> {
    if app_id.trim().is_empty() {
        return Ok(());
    }

    let path = codex_config_path();
    let mut value = load_or_create_codex_config_value(&path)?;
    let root = toml_root_mut(&mut value, &path)?;
    let apps = root
        .entry("apps")
        .or_insert_with(|| TomlValue::Table(Default::default()))
        .as_table_mut()
        .ok_or_else(|| anyhow!("expected [apps] to be a TOML table"))?;

    if connected {
        let app = apps
            .entry(app_id.to_string())
            .or_insert_with(|| TomlValue::Table(Default::default()))
            .as_table_mut()
            .ok_or_else(|| anyhow!("expected [apps.\"{app_id}\"] to be a TOML table"))?;
        app.insert("connected".to_string(), TomlValue::Boolean(true));
    } else {
        apps.remove(app_id);
    }

    fs::write(&path, toml::to_string_pretty(&value)?)
        .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

fn write_catalog_plugin_state(plugin_id: &str, state: &PersistedPluginState) -> AnyhowResult<()> {
    let path = codex_config_path();
    let mut value = load_or_create_codex_config_value(&path)?;
    let root = toml_root_mut(&mut value, &path)?;
    let kodeks_catalog = root
        .entry("kodeks_catalog")
        .or_insert_with(|| TomlValue::Table(Default::default()))
        .as_table_mut()
        .ok_or_else(|| anyhow!("expected [kodeks_catalog] to be a TOML table"))?;
    let plugins = kodeks_catalog
        .entry("plugins")
        .or_insert_with(|| TomlValue::Table(Default::default()))
        .as_table_mut()
        .ok_or_else(|| anyhow!("expected [kodeks_catalog.plugins] to be a TOML table"))?;
    plugins.insert(plugin_id.to_string(), toml::Value::try_from(state.clone())?);

    fs::write(&path, toml::to_string_pretty(&value)?)
        .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

fn write_catalog_skill_state(skill_id: &str, state: &PersistedSkillState) -> AnyhowResult<()> {
    let path = codex_config_path();
    let mut value = load_or_create_codex_config_value(&path)?;
    let root = toml_root_mut(&mut value, &path)?;
    let kodeks_catalog = root
        .entry("kodeks_catalog")
        .or_insert_with(|| TomlValue::Table(Default::default()))
        .as_table_mut()
        .ok_or_else(|| anyhow!("expected [kodeks_catalog] to be a TOML table"))?;
    let skills = kodeks_catalog
        .entry("skills")
        .or_insert_with(|| TomlValue::Table(Default::default()))
        .as_table_mut()
        .ok_or_else(|| anyhow!("expected [kodeks_catalog.skills] to be a TOML table"))?;
    skills.insert(skill_id.to_string(), toml::Value::try_from(state.clone())?);

    fs::write(&path, toml::to_string_pretty(&value)?)
        .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

fn load_or_create_codex_config_value(path: &Path) -> AnyhowResult<TomlValue> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    if path.exists() {
        let content = fs::read_to_string(path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        toml::from_str::<TomlValue>(&content)
            .with_context(|| format!("failed to parse {}", path.display()))
    } else {
        Ok(TomlValue::Table(Default::default()))
    }
}

fn toml_root_mut<'a>(
    value: &'a mut TomlValue,
    path: &Path,
) -> AnyhowResult<&'a mut toml::map::Map<String, TomlValue>> {
    value
        .as_table_mut()
        .ok_or_else(|| anyhow!("expected a TOML table at {}", path.display()))
}

fn codex_config_path() -> PathBuf {
    codex_home_dir()
        .unwrap_or_else(|_| PathBuf::from(".").join(".codex"))
        .join("config.toml")
}

fn codex_home_dir() -> AnyhowResult<PathBuf> {
    env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .or_else(|| home_dir().ok().map(|path| path.join(".codex")))
        .ok_or_else(|| anyhow!("failed to resolve Codex home directory"))
}

fn official_source() -> PluginSource {
    PluginSource {
        id: "official".to_string(),
        display_name: "Built by OpenAI".to_string(),
        publisher: "OpenAI curated".to_string(),
        is_curated: true,
        scope: PluginSourceScope::Official,
    }
}

fn repo_source(display_name_hint: Option<&str>) -> PluginSource {
    let display_name = display_name_hint.unwrap_or("Workspace");
    let slug = slugify_name(display_name);
    PluginSource {
        id: if slug.is_empty() || slug == "workspace" {
            "repo".to_string()
        } else {
            format!("repo:{slug}")
        },
        display_name: display_name.to_string(),
        publisher: "Workspace marketplace".to_string(),
        is_curated: false,
        scope: PluginSourceScope::Repo,
    }
}

fn personal_source(display_name_hint: Option<&str>) -> PluginSource {
    let display_name = display_name_hint.unwrap_or("Personal");
    let slug = slugify_name(display_name);
    PluginSource {
        id: if slug.is_empty() || slug == "personal" {
            "personal".to_string()
        } else {
            format!("personal:{slug}")
        },
        display_name: display_name.to_string(),
        publisher: "Home marketplace".to_string(),
        is_curated: false,
        scope: PluginSourceScope::Personal,
    }
}

fn source_for_marketplace(marketplace_name: &str, display_name_hint: Option<&str>) -> PluginSource {
    if marketplace_name.contains("openai") {
        official_source()
    } else {
        let fallback_display_name = titleize(marketplace_name);
        personal_source(display_name_hint.or(Some(fallback_display_name.as_str())))
    }
}

fn source_for_scope(scope: &PluginScaffoldScope, display_name_hint: Option<&str>) -> PluginSource {
    match scope {
        PluginScaffoldScope::Repo => repo_source(display_name_hint),
        PluginScaffoldScope::User => personal_source(display_name_hint),
    }
}

fn marketplace_key_for_scope(scope: &PluginScaffoldScope, display_name_hint: Option<&str>) -> String {
    let display_name = display_name_hint.unwrap_or(match scope {
        PluginScaffoldScope::Repo => "workspace",
        PluginScaffoldScope::User => "personal",
    });
    let slug = slugify_name(display_name);
    match scope {
        PluginScaffoldScope::Repo => format!("repo:{}", if slug.is_empty() { "workspace" } else { &slug }),
        PluginScaffoldScope::User => format!("personal:{}", if slug.is_empty() { "personal" } else { &slug }),
    }
}

fn load_catalog_metadata(project_root: Option<&str>) -> AnyhowResult<CatalogMetadataIndex> {
    let mut index = CatalogMetadataIndex::default();

    for (marketplace_key, path, source) in catalog_metadata_candidates(project_root)? {
        let Some(file) = read_optional_json::<MarketplaceFile>(&path)? else {
            continue;
        };

        let mut metadata = MarketplaceCatalogMetadata {
            source: Some(source),
            ..Default::default()
        };
        for plugin in file.plugins {
            metadata
                .plugins
                .insert(plugin.name.clone(), marketplace_plugin_metadata(&plugin));
        }

        if !metadata.plugins.is_empty() {
            index.by_marketplace.insert(marketplace_key, metadata);
        }
    }

    Ok(index)
}

fn catalog_metadata_candidates(
    project_root: Option<&str>,
) -> AnyhowResult<Vec<(String, PathBuf, PluginSource)>> {
    let mut values = Vec::new();
    let codex_catalogs = codex_home_dir()?.join("plugins").join("catalogs");
    if codex_catalogs.exists() {
        append_catalog_metadata_dir(
            &mut values,
            &codex_catalogs,
            PluginSourceScope::Official,
            true,
            "Built by OpenAI",
            "OpenAI catalog cache",
        )?;
    }

    let personal_catalogs = home_dir()?.join(".agents").join("plugins").join("catalogs");
    if personal_catalogs.exists() {
        append_catalog_metadata_dir(
            &mut values,
            &personal_catalogs,
            PluginSourceScope::Personal,
            false,
            "Personal Catalog",
            "Home marketplace",
        )?;
    }

    if let Some(project_root) = project_root.filter(|value| !value.trim().is_empty()) {
        let repo_catalogs = PathBuf::from(project_root)
            .join(".agents")
            .join("plugins")
            .join("catalogs");
        if repo_catalogs.exists() {
            append_catalog_metadata_dir(
                &mut values,
                &repo_catalogs,
                PluginSourceScope::Repo,
                false,
                "Workspace Catalog",
                "Workspace marketplace",
            )?;
        }
    }

    Ok(values)
}

fn append_catalog_metadata_dir(
    values: &mut Vec<(String, PathBuf, PluginSource)>,
    root: &Path,
    scope: PluginSourceScope,
    is_curated: bool,
    fallback_display_name: &str,
    publisher: &str,
) -> AnyhowResult<()> {
    for entry in read_dir_files(root)? {
        if entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("json"))
            != Some(true)
        {
            continue;
        }

        let file_stem = entry
            .path()
            .file_stem()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "catalog".to_string());
        let marketplace_name = titleize(&file_stem);
        let source = PluginSource {
            id: match scope {
                PluginSourceScope::Official => {
                    if file_stem.contains("openai") {
                        "official".to_string()
                    } else {
                        format!("official:{}", slugify_name(&file_stem))
                    }
                }
                PluginSourceScope::Repo => format!("repo:{}", slugify_name(&file_stem)),
                PluginSourceScope::Personal => format!("personal:{}", slugify_name(&file_stem)),
            },
            display_name: if scope == PluginSourceScope::Official && file_stem.contains("openai") {
                fallback_display_name.to_string()
            } else {
                marketplace_name.clone()
            },
            publisher: publisher.to_string(),
            is_curated,
            scope: scope.clone(),
        };
        values.push((file_stem, entry.path(), source));
    }

    Ok(())
}

fn refresh_plugin_update_state(state: &mut InstalledPluginState, available_version: Option<&str>) {
    if state.is_installed {
        state.has_update = plugin_has_update(state.installed_version.as_deref(), available_version);
    } else {
        state.has_update = false;
    }
    state.install_status = install_status_for_plugin(state.is_installed, state.is_enabled, state.has_update);
}

fn plugin_has_update(installed_version: Option<&str>, available_version: Option<&str>) -> bool {
    match (installed_version, available_version) {
        (Some(installed), Some(available)) => compare_versions(available, installed).is_gt(),
        _ => false,
    }
}

fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let left_parts = version_parts(left);
    let right_parts = version_parts(right);
    let max_len = left_parts.len().max(right_parts.len());

    for index in 0..max_len {
        let left_value = left_parts.get(index).copied().unwrap_or_default();
        let right_value = right_parts.get(index).copied().unwrap_or_default();
        match left_value.cmp(&right_value) {
            std::cmp::Ordering::Equal => continue,
            ordering => return ordering,
        }
    }

    left.trim().cmp(right.trim())
}

fn version_parts(value: &str) -> Vec<u32> {
    value
        .trim()
        .trim_start_matches('v')
        .split(['-', '+'])
        .next()
        .unwrap_or_default()
        .split('.')
        .filter_map(|segment| {
            let digits = segment
                .chars()
                .take_while(|ch| ch.is_ascii_digit())
                .collect::<String>();
            if digits.is_empty() {
                None
            } else {
                digits.parse::<u32>().ok()
            }
        })
        .collect()
}

fn plugin_category_from_str(value: &str) -> PluginCategory {
    let normalized = value.trim().to_ascii_lowercase().replace([' ', '-'], "_");
    match normalized.as_str() {
        "collaboration" => PluginCategory::Collaboration,
        "coding" | "developer_tools" | "developer" => PluginCategory::DeveloperTools,
        "documentation" | "docs" => PluginCategory::Documentation,
        "design" => PluginCategory::Design,
        "infrastructure" | "infra" => PluginCategory::Infrastructure,
        "native_tooling" | "native" | "mobile" => PluginCategory::NativeTooling,
        _ => PluginCategory::Productivity,
    }
}

fn plugin_auth_policy_from_marketplace(value: &str) -> PluginAuthPolicy {
    match value.trim().to_ascii_uppercase().as_str() {
        "ON_INSTALL" | "ON_USE" => PluginAuthPolicy::Required,
        _ => PluginAuthPolicy::None,
    }
}

fn default_auth_policy(apps: &[String], mcp_servers: &[String]) -> PluginAuthPolicy {
    if apps.is_empty() && mcp_servers.is_empty() {
        PluginAuthPolicy::None
    } else {
        PluginAuthPolicy::Required
    }
}

fn infer_plugin_capabilities(
    plugin_name: &str,
    raw_category: &str,
    manifest_capabilities: Vec<String>,
    apps: &[String],
    mcp_servers: &[String],
) -> Vec<PluginCapability> {
    let mut values = Vec::<PluginCapability>::new();
    let normalized_name = plugin_name.to_ascii_lowercase();
    let normalized_category = raw_category.to_ascii_lowercase();

    if normalized_name.contains("github") || normalized_name.contains("linear") {
        values.push(PluginCapability::IssuesAndPullRequests);
    }
    if normalized_name.contains("figma") || normalized_category.contains("design") {
        values.push(PluginCapability::DesignToCode);
    }
    if normalized_name.contains("slack") {
        values.push(PluginCapability::Messaging);
    }
    if normalized_name.contains("calendar") {
        values.push(PluginCapability::Calendar);
    }
    if normalized_name.contains("gmail")
        || normalized_name.contains("drive")
        || normalized_category.contains("document")
    {
        values.push(PluginCapability::Documents);
    }
    if normalized_name.contains("vercel")
        || normalized_name.contains("cloudflare")
        || normalized_name.contains("netlify")
        || normalized_category.contains("infrastructure")
    {
        values.push(PluginCapability::Deployments);
    }
    if normalized_name.contains("sentry") {
        values.push(PluginCapability::Observability);
    }
    if normalized_name.contains("hugging-face") {
        values.push(PluginCapability::DatasetsAndModels);
    }
    if normalized_name.contains("ios") || normalized_category.contains("native") {
        values.push(PluginCapability::NativeBuilds);
    }
    if !manifest_capabilities.is_empty() || !apps.is_empty() || !mcp_servers.is_empty() {
        values.push(PluginCapability::Automation);
    }

    unique_capabilities(values)
}

fn unique_capabilities(values: Vec<PluginCapability>) -> Vec<PluginCapability> {
    let mut seen = HashSet::new();
    let mut ordered = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            ordered.push(value);
        }
    }
    ordered
}

fn plugin_section_for_category(category: &PluginCategory) -> PluginSection {
    match category {
        PluginCategory::DeveloperTools
        | PluginCategory::Infrastructure
        | PluginCategory::NativeTooling => PluginSection::Coding,
        _ => PluginSection::Featured,
    }
}

fn install_status_for_plugin(
    is_installed: bool,
    is_enabled: bool,
    has_update: bool,
) -> PluginInstallStatus {
    if !is_installed {
        PluginInstallStatus::Available
    } else if has_update {
        PluginInstallStatus::UpdateAvailable
    } else if is_enabled {
        PluginInstallStatus::Installed
    } else {
        PluginInstallStatus::Disabled
    }
}

fn infer_plugin_auth_status(
    catalog: &PluginCatalogEntry,
    source_scope: &PluginSourceScope,
    is_installed: bool,
    is_enabled: bool,
    app_ids: &[String],
    configured_apps: &HashSet<String>,
) -> PluginAuthStatus {
    if catalog.auth_policy == PluginAuthPolicy::None {
        return PluginAuthStatus::NotRequired;
    }
    if !is_installed {
        return PluginAuthStatus::NeedsAuth;
    }
    if app_ids.iter().any(|id| configured_apps.contains(id)) {
        return PluginAuthStatus::Connected;
    }
    if matches!(source_scope, PluginSourceScope::Official) && is_enabled {
        return PluginAuthStatus::Connected;
    }
    PluginAuthStatus::NeedsAuth
}

fn auth_status_after_install(
    catalog: &PluginCatalogEntry,
    source_scope: &PluginSourceScope,
) -> PluginAuthStatus {
    match catalog.auth_policy {
        PluginAuthPolicy::None => PluginAuthStatus::NotRequired,
        PluginAuthPolicy::Optional | PluginAuthPolicy::Required => {
            if matches!(source_scope, PluginSourceScope::Official) {
                PluginAuthStatus::Connected
            } else {
                PluginAuthStatus::NeedsAuth
            }
        }
    }
}

fn auth_status_before_install(catalog: &PluginCatalogEntry) -> PluginAuthStatus {
    match catalog.auth_policy {
        PluginAuthPolicy::None => PluginAuthStatus::NotRequired,
        PluginAuthPolicy::Optional | PluginAuthPolicy::Required => PluginAuthStatus::NeedsAuth,
    }
}

fn section_for_skill_scope(scope: &SkillScope) -> SkillSection {
    match scope {
        SkillScope::Recommended => SkillSection::Recommended,
        SkillScope::System => SkillSection::System,
        SkillScope::Personal | SkillScope::Repo | SkillScope::PluginBundled => SkillSection::Personal,
    }
}

fn skill_dependency_kind_from_str(kind: Option<&str>) -> SkillDependencyKind {
    match kind.unwrap_or_default().trim().to_ascii_lowercase().as_str() {
        "app" => SkillDependencyKind::App,
        "mcp" | "mcp_server" | "mcpserver" => SkillDependencyKind::McpServer,
        "binary" | "command" => SkillDependencyKind::Binary,
        "file" => SkillDependencyKind::File,
        _ => SkillDependencyKind::Skill,
    }
}

fn ordered_sources(sources: BTreeMap<String, PluginSource>) -> Vec<PluginSource> {
    let mut values = sources.into_values().collect::<Vec<_>>();
    values.sort_by(|left, right| {
        source_sort_rank(left)
            .cmp(&source_sort_rank(right))
            .then_with(|| left.display_name.cmp(&right.display_name))
    });
    values
}

fn source_sort_rank(source: &PluginSource) -> usize {
    match source.scope {
        PluginSourceScope::Official => 0,
        PluginSourceScope::Repo => 1,
        PluginSourceScope::Personal => 2,
    }
}

fn plugin_sort_key(left: &PluginListEntry, right: &PluginListEntry) -> std::cmp::Ordering {
    section_sort_rank(&left.section)
        .cmp(&section_sort_rank(&right.section))
        .then_with(|| left.catalog.display_name.cmp(&right.catalog.display_name))
}

fn section_sort_rank(section: &PluginSection) -> usize {
    match section {
        PluginSection::Featured => 0,
        PluginSection::Coding => 1,
    }
}

fn skill_sort_key(left: &SkillListEntry, right: &SkillListEntry) -> std::cmp::Ordering {
    skill_section_sort_rank(&left.section)
        .cmp(&skill_section_sort_rank(&right.section))
        .then_with(|| left.record.display_name.cmp(&right.record.display_name))
}

fn skill_section_sort_rank(section: &SkillSection) -> usize {
    match section {
        SkillSection::Recommended => 0,
        SkillSection::System => 1,
        SkillSection::Personal => 2,
    }
}

fn resolve_skill_scaffold_directory(
    scope: &SkillScaffoldScope,
    destination_root: Option<&str>,
) -> AnyhowResult<PathBuf> {
    match scope {
        SkillScaffoldScope::Repo => {
            let root = destination_root
                .map(PathBuf::from)
                .filter(|path| !path.as_os_str().is_empty())
                .unwrap_or(env::current_dir().context("failed to determine current directory")?);
            Ok(root.join(".agents").join("skills"))
        }
        SkillScaffoldScope::User => Ok(home_dir()?.join(".agents").join("skills")),
    }
}

fn resolve_plugin_scaffold_parent(
    scope: &PluginScaffoldScope,
    destination_root: Option<&str>,
) -> AnyhowResult<PathBuf> {
    match scope {
        PluginScaffoldScope::Repo => {
            let root = destination_root
                .map(PathBuf::from)
                .filter(|path| !path.as_os_str().is_empty())
                .unwrap_or(env::current_dir().context("failed to determine current directory")?);
            Ok(root.join("plugins"))
        }
        PluginScaffoldScope::User => Ok(home_dir()?.join("plugins")),
    }
}

fn resolve_marketplace_path(
    scope: &PluginScaffoldScope,
    destination_root: Option<&str>,
) -> AnyhowResult<PathBuf> {
    match scope {
        PluginScaffoldScope::Repo => {
            let root = destination_root
                .map(PathBuf::from)
                .filter(|path| !path.as_os_str().is_empty())
                .unwrap_or(env::current_dir().context("failed to determine current directory")?);
            Ok(root.join(".agents").join("plugins").join("marketplace.json"))
        }
        PluginScaffoldScope::User => Ok(home_dir()?.join(".agents").join("plugins").join("marketplace.json")),
    }
}

fn update_marketplace_file(
    marketplace_path: &Path,
    scope: &PluginScaffoldScope,
    plugin_id: &str,
    category: PluginCategory,
) -> AnyhowResult<()> {
    if let Some(parent) = marketplace_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    let mut root = if marketplace_path.exists() {
        let content = fs::read_to_string(marketplace_path)
            .with_context(|| format!("failed to read {}", marketplace_path.display()))?;
        serde_json::from_str::<JsonValue>(&content)
            .with_context(|| format!("failed to parse {}", marketplace_path.display()))?
    } else {
        serde_json::json!({
            "name": "[TODO: marketplace-name]",
            "interface": {
                "displayName": match scope {
                    PluginScaffoldScope::Repo => "Workspace Marketplace",
                    PluginScaffoldScope::User => "Personal Marketplace",
                }
            },
            "plugins": []
        })
    };

    let root_object = root
        .as_object_mut()
        .ok_or_else(|| anyhow!("marketplace root must be a JSON object"))?;
    let plugins_value = root_object
        .entry("plugins".to_string())
        .or_insert_with(|| JsonValue::Array(Vec::new()));
    let plugins = plugins_value
        .as_array_mut()
        .ok_or_else(|| anyhow!("marketplace `plugins` must be an array"))?;

    let already_exists = plugins.iter().any(|entry| {
        entry
            .get("name")
            .and_then(|value| value.as_str())
            .map(|value| value == plugin_id)
            .unwrap_or(false)
    });
    if already_exists {
        return Err(anyhow!(
            "marketplace already contains an entry for `{plugin_id}`"
        ));
    }

    let mut source = JsonMap::new();
    source.insert("source".to_string(), JsonValue::String("local".to_string()));
    source.insert(
        "path".to_string(),
        JsonValue::String(format!("./plugins/{plugin_id}")),
    );

    let mut policy = JsonMap::new();
    policy.insert(
        "installation".to_string(),
        JsonValue::String("AVAILABLE".to_string()),
    );
    policy.insert(
        "authentication".to_string(),
        JsonValue::String("ON_INSTALL".to_string()),
    );

    let mut plugin = JsonMap::new();
    plugin.insert("name".to_string(), JsonValue::String(plugin_id.to_string()));
    plugin.insert("source".to_string(), JsonValue::Object(source));
    plugin.insert("policy".to_string(), JsonValue::Object(policy));
    plugin.insert(
        "category".to_string(),
        JsonValue::String(plugin_category_display_name(&category).to_string()),
    );
    plugins.push(JsonValue::Object(plugin));

    fs::write(marketplace_path, serde_json::to_string_pretty(&root)?)
        .with_context(|| format!("failed to write {}", marketplace_path.display()))?;
    Ok(())
}

fn marketplace_base_root(marketplace_path: &Path) -> AnyhowResult<PathBuf> {
    marketplace_path
        .parent()
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .ok_or_else(|| anyhow!("failed to resolve marketplace base root from {}", marketplace_path.display()))
}

fn resolve_marketplace_plugin_root(base_root: &Path, relative_path: &str) -> PathBuf {
    base_root.join(relative_path.trim_start_matches("./"))
}

fn build_plugin_manifest(
    plugin_id: &str,
    display_name: &str,
    description: &str,
    category: PluginCategory,
    composer_icon_path: &str,
    logo_path: &str,
    with_skills: bool,
    with_apps: bool,
    with_mcp_server: bool,
) -> String {
    let mut root = JsonMap::new();
    root.insert("name".to_string(), JsonValue::String(plugin_id.to_string()));
    root.insert("version".to_string(), JsonValue::String("0.1.0".to_string()));
    root.insert("description".to_string(), JsonValue::String(description.to_string()));
    root.insert(
        "author".to_string(),
        serde_json::json!({
            "name": "[TODO: developer-name]",
            "url": "[TODO: developer-url]"
        }),
    );
    root.insert(
        "homepage".to_string(),
        JsonValue::String("[TODO: plugin-homepage]".to_string()),
    );
    root.insert(
        "repository".to_string(),
        JsonValue::String("[TODO: plugin-repository]".to_string()),
    );
    root.insert("license".to_string(), JsonValue::String("MIT".to_string()));
    if with_skills {
        root.insert("skills".to_string(), JsonValue::String("./skills/".to_string()));
    }
    if with_apps {
        root.insert("apps".to_string(), JsonValue::String("./.app.json".to_string()));
    }
    if with_mcp_server {
        root.insert(
            "mcpServers".to_string(),
            JsonValue::String("./.mcp.json".to_string()),
        );
    }
    root.insert(
        "interface".to_string(),
        serde_json::json!({
            "displayName": display_name,
            "shortDescription": description,
            "longDescription": description,
            "developerName": "[TODO: developer-name]",
            "category": plugin_category_display_name(&category),
            "capabilities": [],
            "websiteURL": "[TODO: website-url]",
            "privacyPolicyURL": "[TODO: privacy-policy-url]",
            "termsOfServiceURL": "[TODO: terms-of-service-url]",
            "brandColor": plugin_default_brand_color(&category),
            "composerIcon": composer_icon_path,
            "logo": logo_path,
            "defaultPrompt": [
                format!("Use {display_name} for its primary workflow")
            ],
            "screenshots": []
        }),
    );

    serde_json::to_string_pretty(&JsonValue::Object(root)).unwrap_or_default()
}

fn build_plugin_readme(display_name: &str, description: &str) -> String {
    format!(
        "# {display_name}\n\n{description}\n\n## Next steps\n- Update `.codex-plugin/plugin.json` with real metadata.\n- Add bundled skills, connector manifests, or MCP configuration.\n- Install the plugin from the Plugins catalog when it is ready for use.\n"
    )
}

fn build_plugin_app_placeholder(plugin_id: &str) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "apps": {
            plugin_id: {
                "id": format!("{plugin_id}_app")
            }
        }
    }))
    .unwrap_or_default()
}

fn build_plugin_mcp_placeholder(plugin_id: &str) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "mcpServers": {
            plugin_id: {
                "type": "stdio",
                "command": "[TODO: command]"
            }
        }
    }))
    .unwrap_or_default()
}

fn build_connector_template_markdown(display_name: &str, integration_kind: &str) -> String {
    format!(
        "# {display_name} {integration_kind}\n\n## Purpose\n- Replace this placeholder with the production contract for the {integration_kind}.\n\n## Inputs\n- Document authentication requirements.\n- List expected environment variables or config.\n- Note any external service identifiers.\n\n## Output contract\n- Describe the actions, tools, or endpoints exposed by the integration.\n- Capture failure modes and retry behavior.\n- Link back to `.codex-plugin/plugin.json` once the manifest is finalized.\n"
    )
}

fn plugin_category_display_name(category: &PluginCategory) -> &'static str {
    match category {
        PluginCategory::Collaboration => "Collaboration",
        PluginCategory::DeveloperTools => "Developer Tools",
        PluginCategory::Documentation => "Documentation",
        PluginCategory::Productivity => "Productivity",
        PluginCategory::Design => "Design",
        PluginCategory::Infrastructure => "Infrastructure",
        PluginCategory::NativeTooling => "Native Tooling",
    }
}

fn plugin_default_brand_color(category: &PluginCategory) -> &'static str {
    match category {
        PluginCategory::Collaboration => "#4f46e5",
        PluginCategory::DeveloperTools => "#0f766e",
        PluginCategory::Documentation => "#2563eb",
        PluginCategory::Productivity => "#d97706",
        PluginCategory::Design => "#db2777",
        PluginCategory::Infrastructure => "#7c3aed",
        PluginCategory::NativeTooling => "#059669",
    }
}

fn build_plugin_icon_svg(display_name: &str, compact: bool) -> String {
    let initials = display_name
        .split_whitespace()
        .filter_map(|segment| segment.chars().next())
        .take(if compact { 1 } else { 2 })
        .collect::<String>()
        .to_uppercase();
    let (width, height, radius, font_size) = if compact {
        (128u32, 128u32, 28u32, 52u32)
    } else {
        (640u32, 360u32, 36u32, 124u32)
    };

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{display_name}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1f2937" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
  </defs>
  <rect width="{width}" height="{height}" rx="{radius}" fill="url(#g)" />
  <rect x="8" y="8" width="{inner_width}" height="{inner_height}" rx="{inner_radius}" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" />
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="{font_size}" font-weight="700" letter-spacing="-0.05em">{initials}</text>
</svg>"##,
        width = width,
        height = height,
        radius = radius,
        inner_width = width - 16,
        inner_height = height - 16,
        inner_radius = radius.saturating_sub(8),
        font_size = font_size,
        display_name = display_name,
        initials = if initials.is_empty() { "P" } else { initials.as_str() },
    )
}

fn build_skill_markdown(skill_id: &str, display_name: &str, description: &str) -> String {
    format!(
        "---\nname: {skill_id}\ndescription: {description}\n---\n\n# {display_name}\n\n{description}\n\n## When to use\n- Replace this section with concrete trigger language.\n\n## Workflow\n1. Describe how the skill should inspect context.\n2. Describe what it should produce or change.\n3. Document safety rails and follow-up checks.\n"
    )
}

fn build_skill_metadata(
    display_name: &str,
    description: &str,
    allow_implicit_invocation: bool,
    default_prompt: Option<&str>,
    brand_color: Option<&str>,
) -> String {
    let mut content = format!(
        "interface:\n  display_name: \"{display_name}\"\n  short_description: \"{description}\"\n  allow_implicit_invocation: {}\n",
        if allow_implicit_invocation { "true" } else { "false" }
    );

    if let Some(prompt) = default_prompt.filter(|value| !value.trim().is_empty()) {
        content.push_str(&format!("  default_prompt: \"{}\"\n", escape_yaml_string(prompt)));
    }
    if let Some(color) = brand_color.filter(|value| !value.trim().is_empty()) {
        content.push_str(&format!("  brand_color: \"{}\"\n", escape_yaml_string(color)));
    }
    content
}

fn escape_yaml_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn first_markdown_paragraph(markdown: &str) -> Option<String> {
    let content = if markdown.starts_with("---\n") {
        let rest = markdown.trim_start_matches("---\n");
        let (_, rest) = rest.split_once("\n---\n")?;
        rest
    } else {
        markdown
    };

    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with('-') && !line.starts_with("```"))
        .map(str::to_string)
}

fn parse_markdown_frontmatter<T: DeserializeOwned>(markdown: &str) -> Option<T> {
    if !markdown.starts_with("---\n") {
        return None;
    }
    let rest = markdown.trim_start_matches("---\n");
    let (frontmatter, _) = rest.split_once("\n---\n")?;
    serde_yaml::from_str(frontmatter).ok()
}

fn read_optional_json<T: DeserializeOwned>(path: &Path) -> AnyhowResult<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let value = serde_json::from_str::<T>(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(Some(value))
}

fn read_optional_yaml<T: DeserializeOwned>(path: &Path) -> AnyhowResult<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let value = serde_yaml::from_str::<T>(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(Some(value))
}

fn read_dir_dirs(path: &Path) -> AnyhowResult<Vec<fs::DirEntry>> {
    let mut dirs = Vec::new();
    for entry in fs::read_dir(path).with_context(|| format!("failed to read {}", path.display()))? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            dirs.push(entry);
        }
    }
    dirs.sort_by_key(|entry| entry.file_name());
    Ok(dirs)
}

fn read_dir_files(path: &Path) -> AnyhowResult<Vec<fs::DirEntry>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(path).with_context(|| format!("failed to read {}", path.display()))? {
        let entry = entry?;
        if entry.file_type()?.is_file() {
            files.push(entry);
        }
    }
    files.sort_by_key(|entry| entry.file_name());
    Ok(files)
}

fn latest_child_dir(path: &Path) -> AnyhowResult<fs::DirEntry> {
    let mut dirs = read_dir_dirs(path)?;
    dirs.pop()
        .ok_or_else(|| anyhow!("expected at least one version directory under {}", path.display()))
}

fn file_name_string(path: &Path) -> AnyhowResult<String> {
    path.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .ok_or_else(|| anyhow!("path has no file name: {}", path.display()))
}

fn infer_icon_key(value: &str) -> String {
    let basename = Path::new(value)
        .file_stem()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_else(|| value.to_ascii_lowercase());
    let normalized = basename
        .replace("app-icon", "")
        .replace("icon", "")
        .replace("small", "")
        .replace("large", "")
        .replace(['_', ' '], "-")
        .trim_matches('-')
        .to_string();
    if normalized.is_empty() {
        "skill".to_string()
    } else if normalized.contains("github") {
        "github".to_string()
    } else if normalized.contains("figma") {
        "figma".to_string()
    } else if normalized.contains("linear") {
        "linear".to_string()
    } else if normalized.contains("openai") && normalized.contains("doc") {
        "openai-docs".to_string()
    } else {
        normalized
    }
}

fn slugify_name(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_dash = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            previous_was_dash = false;
            continue;
        }

        if !previous_was_dash && !slug.is_empty() {
            slug.push('-');
            previous_was_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

fn titleize(value: &str) -> String {
    value
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => {
                    let mut word = String::new();
                    word.push(first.to_ascii_uppercase());
                    word.push_str(chars.as_str());
                    word
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn home_dir() -> AnyhowResult<PathBuf> {
    let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    env::var_os(key)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| anyhow!("failed to resolve the current user's home directory"))
}

fn unique_temp_root(label: &str) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    env::temp_dir().join(format!("kodeks-{label}-{millis}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn with_test_environment<T>(label: &str, run: impl FnOnce(PathBuf) -> T) -> T {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        let guard = LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("test environment lock should be available");
        let root = unique_temp_root(label);
        fs::create_dir_all(root.join(".codex")).expect("test codex home should be created");

        let previous_home = env::var_os("HOME");
        let previous_user_profile = env::var_os("USERPROFILE");
        let previous_codex_home = env::var_os("CODEX_HOME");

        unsafe {
            env::set_var("HOME", &root);
            env::set_var("USERPROFILE", &root);
            env::set_var("CODEX_HOME", root.join(".codex"));
        }

        let result = run(root.clone());

        match previous_home {
            Some(value) => unsafe { env::set_var("HOME", value) },
            None => unsafe { env::remove_var("HOME") },
        }
        match previous_user_profile {
            Some(value) => unsafe { env::set_var("USERPROFILE", value) },
            None => unsafe { env::remove_var("USERPROFILE") },
        }
        match previous_codex_home {
            Some(value) => unsafe { env::set_var("CODEX_HOME", value) },
            None => unsafe { env::remove_var("CODEX_HOME") },
        }

        drop(guard);
        let _ = fs::remove_dir_all(root);
        result
    }

    #[test]
    fn installing_recommended_skill_promotes_it_to_personal_scope() {
        with_test_environment("install-skill", |_| {
            let mut repository = CatalogRepository::new_mock();
            let record = repository
                .install_skill("sora", None)
                .expect("recommended skill should install");

            assert_eq!(record.scope, SkillScope::Personal);
            assert_eq!(record.source_kind, SkillSourceKind::UserInstalled);
            assert!(record.enabled);
            assert!(record.is_installed);
        });
    }

    #[test]
    fn create_skill_scaffold_writes_expected_files() {
        with_test_environment("skill-scaffold", |_| {
            let mut repository = CatalogRepository::new_mock();
            let destination_root = unique_temp_root("skill-scaffold-workspace");
            let result = repository
                .create_skill_scaffold(CreateSkillScaffoldRequest {
                    name: "Release Checklist".to_string(),
                    display_name: None,
                    description: "Checks a release branch before shipping.".to_string(),
                    scope: SkillScaffoldScope::Repo,
                    destination_root: Some(destination_root.to_string_lossy().into_owned()),
                    allow_implicit_invocation: true,
                    default_prompt: Some("Start with the highest-risk release checks.".to_string()),
                    brand_color: Some("#f59e0b".to_string()),
                })
                .expect("scaffold should succeed");

            assert!(result.path.ends_with(".agents/skills/release-checklist"));
            for file in &result.created_files {
                assert!(Path::new(file).exists(), "expected scaffold file to exist: {file}");
            }

            let _ = fs::remove_dir_all(destination_root);
        });
    }

    #[test]
    fn create_plugin_scaffold_writes_manifest_and_marketplace() {
        with_test_environment("plugin-scaffold", |_| {
            let mut repository = CatalogRepository::new_mock();
            let destination_root = unique_temp_root("plugin-scaffold-workspace");
            let result = repository
                .create_plugin_scaffold(CreatePluginScaffoldRequest {
                    name: "Release Assistant".to_string(),
                    display_name: Some("Release Assistant".to_string()),
                    description: "Bundle release checks and automation.".to_string(),
                    scope: PluginScaffoldScope::Repo,
                    destination_root: Some(destination_root.to_string_lossy().into_owned()),
                    category: PluginCategory::DeveloperTools,
                    with_skills: true,
                    with_apps: true,
                    with_mcp_server: true,
                })
                .expect("plugin scaffold should succeed");

            assert!(result.path.ends_with("plugins/release-assistant"));
            assert!(result.marketplace_path.ends_with(".agents/plugins/marketplace.json"));
            for file in &result.created_files {
                assert!(Path::new(file).exists(), "expected scaffold file to exist: {file}");
            }

            let marketplace = fs::read_to_string(&result.marketplace_path)
                .expect("marketplace should be readable");
            assert!(marketplace.contains("\"release-assistant\""));

            let _ = fs::remove_dir_all(destination_root);
        });
    }

    #[test]
    fn repo_plugin_scaffold_is_discoverable_from_marketplace() {
        with_test_environment("plugin-discovery", |_| {
            let mut repository = CatalogRepository::new_mock();
            let destination_root = unique_temp_root("plugin-discovery-workspace");
            repository
                .create_plugin_scaffold(CreatePluginScaffoldRequest {
                    name: "Delivery Helper".to_string(),
                    display_name: Some("Delivery Helper".to_string()),
                    description: "Assist with delivery workflows.".to_string(),
                    scope: PluginScaffoldScope::Repo,
                    destination_root: Some(destination_root.to_string_lossy().into_owned()),
                    category: PluginCategory::Productivity,
                    with_skills: false,
                    with_apps: false,
                    with_mcp_server: false,
                })
                .expect("plugin scaffold should succeed");

            let plugins = repository
                .list_plugins(Some(destination_root.to_string_lossy().as_ref()), None)
                .expect("plugins should load");
            assert!(plugins.entries.iter().any(|entry| {
                entry.catalog.plugin_id == "delivery-helper" && entry.source_id.starts_with("repo")
            }));

            let _ = fs::remove_dir_all(destination_root);
        });
    }

    #[test]
    fn compare_versions_detects_newer_available_release() {
        assert!(plugin_has_update(Some("1.2.3"), Some("1.3.0")));
        assert!(plugin_has_update(Some("v1.9.9"), Some("2.0.0")));
        assert!(!plugin_has_update(Some("1.3.0"), Some("1.3.0")));
        assert!(!plugin_has_update(Some("2.0.0"), Some("1.9.9")));
    }

    #[test]
    fn app_server_marketplace_detection_marks_official_source() {
        let marketplace = AppServerPluginMarketplaceEntry {
            name: "openai-curated".to_string(),
            path: "/tmp/openai-curated.json".to_string(),
            interface: Some(AppServerMarketplaceInterface {
                display_name: Some("Built by OpenAI".to_string()),
            }),
            plugins: Vec::new(),
        };

        let source = source_for_app_server_marketplace(&marketplace, None)
            .expect("official source should resolve");

        assert_eq!(source.scope, PluginSourceScope::Official);
        assert_eq!(source.id, "official");
    }

    #[test]
    fn app_server_summary_builds_plugin_catalog_entry() {
        let plugin = AppServerPluginSummary {
            id: "github".to_string(),
            name: "github".to_string(),
            source: AppServerPluginSource {
                source_type: "local".to_string(),
                path: "/tmp/plugins/github".to_string(),
            },
            installed: true,
            enabled: true,
            install_policy: AppServerPluginInstallPolicy::Available,
            auth_policy: AppServerPluginAuthPolicy::OnInstall,
            interface: Some(AppServerPluginInterface {
                display_name: Some("GitHub".to_string()),
                short_description: Some("Inspect PRs and issues.".to_string()),
                long_description: Some("Inspect pull requests, issues, and CI.".to_string()),
                developer_name: Some("OpenAI".to_string()),
                category: Some("Developer Tools".to_string()),
                capabilities: vec!["issues_and_pull_requests".to_string()],
                website_url: Some("https://github.com".to_string()),
                privacy_policy_url: None,
                terms_of_service_url: None,
                default_prompt: None,
                brand_color: None,
                composer_icon: Some("/tmp/icon.svg".to_string()),
                logo: None,
                screenshots: vec!["/tmp/shot.png".to_string()],
            }),
        };

        let catalog = build_plugin_catalog_from_app_server_summary(
            &plugin,
            &PluginSourceScope::Official,
            Vec::new(),
            Vec::new(),
            vec!["gh-workflow".to_string()],
        );

        assert_eq!(catalog.plugin_id, "github");
        assert_eq!(catalog.display_name, "GitHub");
        assert_eq!(catalog.category, PluginCategory::DeveloperTools);
        assert_eq!(catalog.auth_policy, PluginAuthPolicy::Required);
        assert_eq!(catalog.installation_policy, PluginInstallationPolicy::Marketplace);
        assert_eq!(catalog.bundled_skills, vec!["gh-workflow".to_string()]);
    }
}
