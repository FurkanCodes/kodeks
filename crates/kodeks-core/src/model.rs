use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct SessionSnapshot {
    pub app_name: String,
    pub connection: ConnectionSnapshot,
    pub account: AccountSnapshot,
    pub session: SessionContext,
    pub threads: Vec<ThreadSummary>,
    pub archived_threads: Vec<ThreadSummary>,
    pub active_thread_id: Option<String>,
    pub timeline: Vec<TimelineEntry>,
    pub approvals: Vec<ApprovalEntry>,
    pub diagnostics: DiagnosticsSnapshot,
    pub active_diff: Option<DiffSnapshot>,
}

impl Default for SessionSnapshot {
    fn default() -> Self {
        Self {
            app_name: "Kodeks".to_string(),
            connection: ConnectionSnapshot {
                state: "starting".to_string(),
                detail: "Bootstrapping local Codex runtime".to_string(),
                codex_binary: None,
                codex_home: None,
                pid: None,
                platform_os: None,
                platform_family: None,
                last_error: None,
            },
            account: AccountSnapshot {
                status: "checking".to_string(),
                mode: "unknown".to_string(),
                identity: None,
                plan: None,
                rate_limit_summary: None,
                rate_limits: None,
                requires_openai_auth: false,
                login_in_progress: false,
                login_id: None,
                last_login_error: None,
                auth_notice: None,
                auth_url: None,
                auth_code: None,
            },
            session: SessionContext::default(),
            threads: Vec::new(),
            archived_threads: Vec::new(),
            active_thread_id: None,
            timeline: Vec::new(),
            approvals: Vec::new(),
            diagnostics: DiagnosticsSnapshot::default(),
            active_diff: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionSnapshot {
    pub state: String,
    pub detail: String,
    pub codex_binary: Option<String>,
    pub codex_home: Option<String>,
    pub pid: Option<u32>,
    pub platform_os: Option<String>,
    pub platform_family: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountSnapshot {
    pub status: String,
    pub mode: String,
    pub identity: Option<String>,
    pub plan: Option<String>,
    pub rate_limit_summary: Option<String>,
    pub rate_limits: Option<AccountRateLimits>,
    pub requires_openai_auth: bool,
    pub login_in_progress: bool,
    pub login_id: Option<String>,
    pub last_login_error: Option<String>,
    pub auth_notice: Option<String>,
    pub auth_url: Option<String>,
    pub auth_code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountRateLimits {
    pub plan: Option<String>,
    pub buckets: Vec<AccountRateLimitBucket>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountRateLimitBucket {
    pub key: String,
    pub label: String,
    pub remaining: Option<f64>,
    pub limit: Option<f64>,
    pub used: Option<f64>,
    pub used_percent: Option<f64>,
    pub reset_at: Option<String>,
    pub window_minutes: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionContext {
    pub model: Option<String>,
    pub model_provider: Option<String>,
    pub reasoning_effort: Option<String>,
    pub sandbox_mode: Option<String>,
    pub approval_policy: Option<String>,
    pub network_state: String,
    pub cwd: Option<String>,
    pub repo: Option<String>,
    pub branch: Option<String>,
    pub thread_state: Option<String>,
    pub active_turn_id: Option<String>,
    pub subscribed_thread_id: Option<String>,
    pub loaded_thread_count: usize,
}

impl Default for SessionContext {
    fn default() -> Self {
        Self {
            model: None,
            model_provider: None,
            reasoning_effort: None,
            sandbox_mode: None,
            approval_policy: None,
            network_state: "local".to_string(),
            cwd: None,
            repo: None,
            branch: None,
            thread_state: None,
            active_turn_id: None,
            subscribed_thread_id: None,
            loaded_thread_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ThreadSummary {
    pub id: String,
    pub preview: String,
    pub name: Option<String>,
    pub cwd: String,
    pub status: String,
    pub model_provider: String,
    pub updated_at: i64,
    pub repo: Option<String>,
    pub branch: Option<String>,
    pub presence: String,
    pub turn_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineEntry {
    pub id: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub status: String,
    pub detail: Option<String>,
    pub metadata: Vec<MetadataRow>,
    pub file_changes: Vec<TimelineFileChange>,
    pub attachments: Vec<TimelineAttachment>,
    pub turn_elapsed_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineAttachment {
    pub kind: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataRow {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineFileChange {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApprovalEntry {
    pub request_id: String,
    pub thread_id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub available_decisions: Vec<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DiagnosticsSnapshot {
    pub warnings: Vec<DiagnosticWarning>,
    pub traces: Vec<DiagnosticTrace>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticWarning {
    pub summary: String,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticTrace {
    pub direction: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiffSnapshot {
    pub thread_id: String,
    pub turn_id: String,
    pub diff: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThreadConfigOverride {
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub approval_policy: Option<String>,
    pub sandbox_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum UserInputItem {
    #[serde(rename = "text")]
    Text {
        text: String,
        text_elements: Vec<serde_json::Value>,
    },
    #[serde(rename = "localImage")]
    LocalImage { path: String },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ReasoningEffortOption {
    pub reasoning_effort: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelOption {
    pub id: String,
    pub model: String,
    pub display_name: String,
    pub description: String,
    pub hidden: bool,
    pub is_default: bool,
    pub supported_reasoning_efforts: Vec<ReasoningEffortOption>,
    pub default_reasoning_effort: Option<String>,
}
