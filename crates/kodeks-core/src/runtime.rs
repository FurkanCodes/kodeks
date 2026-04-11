use std::collections::{HashMap, HashSet, VecDeque};
use std::env;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use kodeks_protocol::{
    normalize_request_id, spawn_app_server, AppServerHandle, ProtocolEvent, RequestIdValue,
    SpawnConfig,
};
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot, watch};

use crate::account_vault::{
    LegacyTokenMigrationOutcome, LocalAccountVault, StoredAccountCredential,
};
use crate::model::{
    AccountCredits, AccountRateLimitBucket, AccountRateLimits, AccountSnapshot, ApprovalEntry,
    DiagnosticTrace, DiagnosticWarning, DiffSnapshot, MetadataRow, ModelOption,
    ReasoningEffortOption,
    SavedAccountView,
    SessionSnapshot, ThreadConfigOverride, ThreadSummary, TimelineAttachment, TimelineEntry,
    TimelineFileChange, UserInputItem,
};

const TRACE_CAP: usize = 120;
const WARNING_CAP: usize = 32;
const OUTPUT_CAP: usize = 12_000;
const DIFF_CAP: usize = 24_000;
const TIMELINE_CAP: usize = 240;
const APPROVAL_CAP: usize = 80;
const STREAM_PUBLISH_INTERVAL: Duration = Duration::from_millis(40);
const THREAD_PAGE_SIZE: usize = 40;
const ACCOUNT_SWITCH_REFRESH_ATTEMPTS: usize = 10;
const ACCOUNT_SWITCH_REFRESH_DELAY: Duration = Duration::from_millis(200);

#[derive(Clone)]
pub struct RuntimeHandle {
    control_tx: mpsc::UnboundedSender<ControlMessage>,
    snapshot_rx: watch::Receiver<SessionSnapshot>,
}

impl RuntimeHandle {
    pub fn new(storage_dir: PathBuf) -> Self {
        let (control_tx, control_rx) = mpsc::unbounded_channel();
        let (snapshot_tx, snapshot_rx) = watch::channel(SessionSnapshot::default());
        let controller = Controller::new(control_rx, snapshot_tx, storage_dir);

        std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("failed to create Kodeks runtime");
            runtime.block_on(async move {
                controller.run().await;
            });
        });

        Self {
            control_tx,
            snapshot_rx,
        }
    }

    pub fn subscribe(&self) -> watch::Receiver<SessionSnapshot> {
        self.snapshot_rx.clone()
    }

    pub async fn snapshot(&self) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::Snapshot)
            .await
            .and_then(expect_snapshot)
    }

    pub async fn refresh(&self) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::Refresh)
            .await
            .and_then(expect_snapshot)
    }

    pub async fn refresh_rate_limits(&self) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::RefreshRateLimits)
            .await
            .and_then(expect_snapshot)
    }

    pub async fn restart(&self) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::Restart)
            .await
            .and_then(expect_snapshot)
    }

    pub async fn select_thread(&self, thread_id: String) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::SelectThread {
            thread_id,
            config: ThreadConfigOverride::default(),
        })
        .await
        .and_then(expect_snapshot)
    }

    pub async fn start_thread(
        &self,
        cwd: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::StartThread {
            cwd,
            prompt,
            attachments,
            config: ThreadConfigOverride::default(),
        })
        .await
        .and_then(expect_snapshot)
    }

    pub async fn send_prompt(
        &self,
        thread_id: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::SendPrompt {
            thread_id,
            prompt,
            attachments,
            config: ThreadConfigOverride::default(),
        })
        .await
        .and_then(expect_snapshot)
    }

    pub async fn steer_turn(
        &self,
        thread_id: String,
        turn_id: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::SteerTurn {
            thread_id,
            turn_id,
            prompt,
            attachments,
            config: ThreadConfigOverride::default(),
        })
        .await
        .and_then(expect_snapshot)
    }

    pub async fn interrupt_turn(
        &self,
        thread_id: String,
        turn_id: String,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::InterruptTurn { thread_id, turn_id })
            .await
            .and_then(expect_snapshot)
    }

    pub async fn login_chatgpt(&self) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::LoginChatgpt)
            .await
            .and_then(expect_snapshot)
    }

    pub async fn login_api_key(&self, api_key: String) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::LoginApiKey { api_key })
            .await
            .and_then(expect_snapshot)
    }

    pub async fn cancel_login(&self) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::CancelLogin)
            .await
            .and_then(expect_snapshot)
    }

    pub async fn logout(&self) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::Logout)
            .await
            .and_then(expect_snapshot)
    }

    pub async fn select_account(&self, account_id: String) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::SelectAccount { account_id })
            .await
            .and_then(expect_snapshot)
    }

    pub async fn disconnect_account(&self, account_id: String) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::DisconnectAccount { account_id })
            .await
            .and_then(expect_snapshot)
    }

    pub async fn resolve_approval(
        &self,
        request_id: String,
        decision: String,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::ResolveApproval {
            request_id,
            decision,
        })
        .await
        .and_then(expect_snapshot)
    }

    pub async fn select_thread_with_config(
        &self,
        thread_id: String,
        config: ThreadConfigOverride,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::SelectThread { thread_id, config })
            .await
            .and_then(expect_snapshot)
    }

    pub async fn start_thread_with_config(
        &self,
        cwd: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::StartThread {
            cwd,
            prompt,
            attachments,
            config,
        })
        .await
        .and_then(expect_snapshot)
    }

    pub async fn send_prompt_with_config(
        &self,
        thread_id: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::SendPrompt {
            thread_id,
            prompt,
            attachments,
            config,
        })
        .await
        .and_then(expect_snapshot)
    }

    pub async fn steer_turn_with_config(
        &self,
        thread_id: String,
        turn_id: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    ) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::SteerTurn {
            thread_id,
            turn_id,
            prompt,
            attachments,
            config,
        })
        .await
        .and_then(expect_snapshot)
    }

    pub async fn archive_thread(&self, thread_id: String) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::ArchiveThread { thread_id })
            .await
            .and_then(expect_snapshot)
    }

    pub async fn unarchive_thread(&self, thread_id: String) -> Result<SessionSnapshot> {
        self.send(ControlMessageKind::UnarchiveThread { thread_id })
            .await
            .and_then(expect_snapshot)
    }

    pub async fn list_models(&self) -> Result<Vec<ModelOption>> {
        self.send(ControlMessageKind::ListModels)
            .await
            .and_then(expect_models)
    }

    async fn send(&self, kind: ControlMessageKind) -> Result<ControlResponse> {
        let (reply_tx, reply_rx) = oneshot::channel();
        self.control_tx
            .send(ControlMessage { kind, reply_tx })
            .map_err(|_| anyhow!("runtime controller is not available"))?;
        reply_rx
            .await
            .context("runtime controller dropped response")?
    }
}

fn expect_snapshot(response: ControlResponse) -> Result<SessionSnapshot> {
    match response {
        ControlResponse::Snapshot(snapshot) => Ok(snapshot),
        ControlResponse::Models(_) => Err(anyhow!("runtime returned models instead of snapshot")),
    }
}

fn expect_models(response: ControlResponse) -> Result<Vec<ModelOption>> {
    match response {
        ControlResponse::Models(models) => Ok(models),
        ControlResponse::Snapshot(_) => Err(anyhow!("runtime returned snapshot instead of models")),
    }
}

struct ControlMessage {
    kind: ControlMessageKind,
    reply_tx: oneshot::Sender<Result<ControlResponse>>,
}

enum ControlMessageKind {
    Snapshot,
    Refresh,
    RefreshRateLimits,
    Restart,
    SelectThread {
        thread_id: String,
        config: ThreadConfigOverride,
    },
    StartThread {
        cwd: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    },
    SendPrompt {
        thread_id: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    },
    SteerTurn {
        thread_id: String,
        turn_id: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    },
    InterruptTurn {
        thread_id: String,
        turn_id: String,
    },
    LoginChatgpt,
    LoginApiKey {
        api_key: String,
    },
    CancelLogin,
    Logout,
    SelectAccount {
        account_id: String,
    },
    DisconnectAccount {
        account_id: String,
    },
    ResolveApproval {
        request_id: String,
        decision: String,
    },
    ArchiveThread {
        thread_id: String,
    },
    UnarchiveThread {
        thread_id: String,
    },
    ListModels,
}

enum ControlResponse {
    Snapshot(SessionSnapshot),
    Models(Vec<ModelOption>),
}

#[derive(Clone)]
struct PendingServerRequest {
    raw_id: RequestIdValue,
    method: String,
}

struct SavedAccountRefreshResponse {
    account_id: String,
    resolved_hint: Option<String>,
    chatgpt_account_id: String,
    plan: Option<String>,
    result: Value,
}

struct Controller {
    vault: LocalAccountVault,
    snapshot: SessionSnapshot,
    snapshot_tx: watch::Sender<SessionSnapshot>,
    control_rx: mpsc::UnboundedReceiver<ControlMessage>,
    protocol_rx: Option<mpsc::UnboundedReceiver<ProtocolEvent>>,
    app_server: Option<AppServerHandle>,
    active_item_index: HashMap<String, usize>,
    pending_server_requests: HashMap<String, PendingServerRequest>,
    turn_started_at: HashMap<String, Instant>,
    hydrated_threads: HashSet<String>,
    subscribed_thread_id: Option<String>,
    trace_ring: VecDeque<DiagnosticTrace>,
    warning_ring: VecDeque<DiagnosticWarning>,
    last_stream_publish_at: Option<Instant>,
    auto_recovery_attempted_since_ready: bool,
    pending_saved_account_switch_id: Option<String>,
}

impl Controller {
    fn new(
        control_rx: mpsc::UnboundedReceiver<ControlMessage>,
        snapshot_tx: watch::Sender<SessionSnapshot>,
        storage_dir: PathBuf,
    ) -> Self {
        Self::with_vault(control_rx, snapshot_tx, LocalAccountVault::new(storage_dir))
    }

    fn with_vault(
        control_rx: mpsc::UnboundedReceiver<ControlMessage>,
        snapshot_tx: watch::Sender<SessionSnapshot>,
        vault: LocalAccountVault,
    ) -> Self {
        Self {
            vault,
            snapshot: SessionSnapshot::default(),
            snapshot_tx,
            control_rx,
            protocol_rx: None,
            app_server: None,
            active_item_index: HashMap::new(),
            pending_server_requests: HashMap::new(),
            turn_started_at: HashMap::new(),
            hydrated_threads: HashSet::new(),
            subscribed_thread_id: None,
            trace_ring: VecDeque::new(),
            warning_ring: VecDeque::new(),
            last_stream_publish_at: None,
            auto_recovery_attempted_since_ready: false,
            pending_saved_account_switch_id: None,
        }
    }

    async fn run(mut self) {
        if let Err(error) = self.bootstrap().await {
            self.set_connection_state(
                "degraded",
                "Failed to start app-server",
                Some(error.to_string()),
            );
        }
        self.publish_snapshot();

        loop {
            tokio::select! {
                Some(message) = self.control_rx.recv() => {
                    let result = self.handle_control(message.kind).await;
                    let _ = message.reply_tx.send(result);
                }
                event = async {
                    match self.protocol_rx.as_mut() {
                        Some(receiver) => receiver.recv().await,
                        None => std::future::pending::<Option<ProtocolEvent>>().await,
                    }
                } => {
                    if let Some(event) = event {
                        self.handle_protocol_event(event).await;
                    }
                }
            }
        }
    }

    async fn bootstrap(&mut self) -> Result<()> {
        self.set_connection_state("starting", "Launching local codex app-server", None);

        let binary = resolve_codex_binary()?;
        let codex_home_override = env::var_os("KODEKS_CODEX_HOME").map(PathBuf::from);
        self.snapshot.connection.codex_binary = Some(binary.display().to_string());

        let (app_server, protocol_rx, child_metadata) = spawn_app_server(SpawnConfig {
            binary_path: binary,
            codex_home_override,
        })?;

        self.snapshot.connection.pid = child_metadata.pid;
        self.protocol_rx = Some(protocol_rx);
        self.app_server = Some(app_server.clone());
        self.set_connection_state("handshaking", "Negotiating capabilities with Codex", None);

        let initialize = app_server
            .request(
                "initialize",
                Some(json!({
                    "clientInfo": { "name": "Kodeks", "version": env!("CARGO_PKG_VERSION") },
                    "capabilities": {
                        "experimentalApi": true,
                    },
                })),
            )
            .await?;
        self.apply_initialize_result(&initialize);
        app_server.notify("initialized", None)?;

        self.migrate_saved_account_tokens()?;
        self.refresh_account().await?;
        if let Err(error) = self.capture_current_chatgpt_account(false).await {
            self.add_warning(
                "Could not save the current ChatGPT account".to_string(),
                Some(error.to_string()),
            );
        }
        if self.snapshot.account.status != "authenticated" {
            let _ = self.restore_saved_account_session().await;
        }
        let _ = self.refresh_rate_limits().await;
        self.refresh_threads(true).await?;
        self.auto_recovery_attempted_since_ready = false;
        self.set_connection_state("ready", "Connected to local Codex runtime", None);
        Ok(())
    }

    fn migrate_saved_account_tokens(&mut self) -> Result<Vec<LegacyTokenMigrationOutcome>> {
        let outcomes = self.vault.migrate_legacy_plaintext_tokens()?;
        if outcomes.is_empty() {
            return Ok(outcomes);
        }

        self.trace_account_event(
            "saved.migration.start",
            json!({
                "count": outcomes.len(),
            }),
        );

        for outcome in &outcomes {
            let event = if outcome.migrated {
                "saved.migration.succeeded"
            } else {
                "saved.migration.failed"
            };
            self.trace_account_event(
                event,
                json!({
                    "accountId": outcome.account_id,
                    "migrated": outcome.migrated,
                    "requiresReauth": outcome.requires_reauth,
                    "error": outcome.error,
                }),
            );
        }

        self.trace_account_event(
            "saved.migration.completed",
            json!({
                "count": outcomes.len(),
                "requiresReauthCount": outcomes.iter().filter(|outcome| outcome.requires_reauth).count(),
            }),
        );
        self.sync_snapshot_saved_accounts();
        Ok(outcomes)
    }

    async fn handle_control(&mut self, message: ControlMessageKind) -> Result<ControlResponse> {
        match message {
            ControlMessageKind::Snapshot => Ok(ControlResponse::Snapshot(self.snapshot.clone())),
            ControlMessageKind::Refresh => {
                self.refresh_runtime().await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::RefreshRateLimits => {
                let _ = self.refresh_rate_limits().await;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::Restart => {
                self.restart_runtime().await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::SelectThread { thread_id, config } => {
                self.select_thread_flow(thread_id, config).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::StartThread {
                cwd,
                prompt,
                attachments,
                config,
            } => {
                self.start_thread(cwd, prompt, attachments, config).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::SendPrompt {
                thread_id,
                prompt,
                attachments,
                config,
            } => {
                self.send_prompt(thread_id, prompt, attachments, config)
                    .await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::SteerTurn {
                thread_id,
                turn_id,
                prompt,
                attachments,
                config,
            } => {
                self.steer_turn(thread_id, turn_id, prompt, attachments, config)
                    .await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::InterruptTurn { thread_id, turn_id } => {
                self.interrupt_turn(thread_id, turn_id).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::LoginChatgpt => {
                self.login_chatgpt().await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::LoginApiKey { api_key } => {
                self.login_api_key(api_key).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::CancelLogin => {
                self.cancel_login().await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::Logout => {
                self.logout().await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::SelectAccount { account_id } => {
                self.select_account(account_id).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::DisconnectAccount { account_id } => {
                self.disconnect_account(account_id).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::ResolveApproval {
                request_id,
                decision,
            } => {
                self.resolve_approval(request_id, decision).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::ArchiveThread { thread_id } => {
                self.archive_thread(thread_id).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::UnarchiveThread { thread_id } => {
                self.unarchive_thread(thread_id).await?;
                Ok(ControlResponse::Snapshot(self.snapshot.clone()))
            }
            ControlMessageKind::ListModels => {
                let models = self.list_models().await?;
                Ok(ControlResponse::Models(models))
            }
        }
    }

    async fn refresh_runtime(&mut self) -> Result<()> {
        if self.app_server.is_none() {
            self.bootstrap().await?;
        } else {
            self.refresh_account().await?;
            let _ = self.refresh_rate_limits().await;
            self.refresh_threads(false).await?;
            if let Some(thread_id) = self.snapshot.active_thread_id.clone() {
                let _ = self.read_thread(&thread_id).await.map(|thread| {
                    self.apply_loaded_thread(&thread);
                });
            }
        }
        self.publish_snapshot();
        Ok(())
    }

    async fn restart_runtime(&mut self) -> Result<()> {
        self.set_connection_state("restarting", "Restarting local Codex runtime", None);
        self.auto_recovery_attempted_since_ready = false;
        self.detach_runtime();
        self.refresh_runtime().await
    }

    async fn refresh_account(&mut self) -> Result<()> {
        let app_server = self.app_server()?;
        let response = app_server
            .request("account/read", Some(json!({ "refreshToken": false })))
            .await?;
        self.apply_account_response(&response);
        self.sync_snapshot_saved_accounts();
        Ok(())
    }

    async fn refresh_account_state(&mut self) -> Result<()> {
        self.refresh_account().await?;
        let _ = self.refresh_rate_limits().await;
        Ok(())
    }

    async fn refresh_account_state_for_switch(
        &mut self,
        target_account_id: &str,
        target_runtime_account_id: Option<&str>,
        target_label: Option<&str>,
    ) -> Result<()> {
        self.trace_account_event(
            "switch.refresh.start",
            json!({
                "targetAccountId": target_account_id,
                "targetRuntimeAccountId": target_runtime_account_id,
                "targetLabel": target_label,
                "attemptLimit": ACCOUNT_SWITCH_REFRESH_ATTEMPTS,
            }),
        );
        let mut last_error = None;

        for attempt in 0..ACCOUNT_SWITCH_REFRESH_ATTEMPTS {
            match self.refresh_account_state().await {
                Ok(()) => {
                    let matched = self.snapshot_matches_account_target(
                        target_account_id,
                        target_runtime_account_id,
                        target_label,
                    );
                    self.trace_account_event(
                        "switch.refresh.attempt",
                        json!({
                            "attempt": attempt + 1,
                            "targetAccountId": target_account_id,
                            "targetRuntimeAccountId": target_runtime_account_id,
                            "targetLabel": target_label,
                            "matched": matched,
                        }),
                    );
                    if matched {
                        self.trace_account_event(
                            "switch.refresh.settled",
                            json!({
                                "attempt": attempt + 1,
                                "targetAccountId": target_account_id,
                            }),
                        );
                        return Ok(());
                    }
                }
                Err(error) => {
                    self.trace_account_event(
                        "switch.refresh.attempt_failed",
                        json!({
                            "attempt": attempt + 1,
                            "targetAccountId": target_account_id,
                            "error": error.to_string(),
                        }),
                    );
                    last_error = Some(error);
                }
            }

            if attempt + 1 < ACCOUNT_SWITCH_REFRESH_ATTEMPTS {
                tokio::time::sleep(ACCOUNT_SWITCH_REFRESH_DELAY).await;
            }
        }

        if let Some(error) = last_error {
            self.trace_account_event(
                "switch.refresh.failed",
                json!({
                    "targetAccountId": target_account_id,
                    "targetRuntimeAccountId": target_runtime_account_id,
                    "targetLabel": target_label,
                    "error": error.to_string(),
                }),
            );
            return Err(error);
        }

        let expected = target_label.unwrap_or(target_account_id);
        self.trace_account_event(
            "switch.refresh.failed",
            json!({
                "targetAccountId": target_account_id,
                "targetRuntimeAccountId": target_runtime_account_id,
                "targetLabel": target_label,
                "error": format!("account switch did not settle on {expected}"),
            }),
        );
        Err(anyhow!(
            "account switch did not settle on {expected}"
        ))
    }

    async fn refresh_rate_limits(&mut self) -> Result<()> {
        let app_server = self.app_server()?;
        let response = app_server.request("account/rateLimits/read", None).await?;
        self.apply_rate_limits_response(&response);
        Ok(())
    }

    async fn refresh_threads(&mut self, auto_select_first: bool) -> Result<()> {
        self.snapshot.threads = self.fetch_thread_list(false).await?;
        self.snapshot.archived_threads = self.fetch_thread_list(true).await?;
        self.snapshot
            .threads
            .sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        self.snapshot
            .archived_threads
            .sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        self.snapshot.session.loaded_thread_count = self.hydrated_threads.len();

        if auto_select_first && self.snapshot.active_thread_id.is_none() {
            if let Some(first) = self.snapshot.threads.first() {
                self.select_thread_flow(first.id.clone(), ThreadConfigOverride::default())
                    .await?;
                return Ok(());
            }
        }

        self.publish_snapshot();
        Ok(())
    }

    async fn restore_saved_account_session(&mut self) -> Result<()> {
        let active_id = self.vault.get_active_account_id()?;
        let fallback_id = self
            .vault
            .list_accounts()?
            .into_iter()
            .filter(|account| account.state == "connected")
            .max_by_key(|account| account.last_used_at.unwrap_or_default())
            .map(|account| account.id);

        let target_id = active_id.or(fallback_id);
        let Some(target_id) = target_id else {
            self.trace_account_event(
                "saved.restore.skipped",
                json!({
                    "reason": "no saved account available to restore",
                }),
            );
            self.sync_snapshot_saved_accounts();
            return Ok(());
        };
        self.trace_account_event(
            "saved.restore.start",
            json!({
                "targetAccountId": target_id,
            }),
        );
        let Some(stored) = self.vault.get_credential(&target_id)? else {
            self.trace_account_event(
                "saved.restore.missing_token",
                json!({
                    "targetAccountId": target_id,
                }),
            );
            let _ = self.vault.mark_state(&target_id, "reauth required");
            self.sync_snapshot_saved_accounts();
            return Ok(());
        };

        if let Err(error) = self.login_with_saved_account(&stored).await {
            self.trace_account_event(
                "saved.restore.failed",
                json!({
                    "targetAccountId": target_id,
                    "error": error.to_string(),
                }),
            );
            self.handle_saved_account_failure(
                &target_id,
                &error,
                "Saved account needs to sign in again".to_string(),
            );
        } else {
            self.trace_account_event(
                "saved.restore.succeeded",
                json!({
                    "targetAccountId": target_id,
                }),
            );
        }
        Ok(())
    }

    async fn login_with_saved_account(
        &mut self,
        stored: &StoredAccountCredential,
    ) -> Result<()> {
        let app_server = self.app_server()?;
        let account_id = stored.account.id.clone();
        let access_token = stored.access_token.clone();
        let chatgpt_account_id = stored.account.chatgpt_account_id.clone();
        let chatgpt_plan_type = stored.account.plan.clone();
        let label = stored.account.label.clone();

        self.trace_account_event(
            "saved.switch.login.start",
            json!({
                "targetAccountId": account_id,
                "targetRuntimeAccountId": chatgpt_account_id,
                "targetLabel": label,
                "targetPlan": chatgpt_plan_type,
                "accessTokenPresent": !access_token.trim().is_empty(),
            }),
        );
        self.pending_saved_account_switch_id = Some(account_id.clone());
        let login_result = async {
            app_server
                .request(
                    "account/login/start",
                    Some(json!({
                        "type": "chatgptAuthTokens",
                        "accessToken": access_token,
                        "chatgptAccountId": chatgpt_account_id,
                        "chatgptPlanType": chatgpt_plan_type,
                    })),
                )
                .await?;

            self.trace_account_event(
                "saved.switch.login.request_completed",
                json!({
                    "targetAccountId": account_id,
                }),
            );
            self.vault.mark_state(&account_id, "connected")?;
            self.vault.set_active_account(&account_id)?;
            self.refresh_account_state_for_switch(
                &account_id,
                Some(stored.account.chatgpt_account_id.as_str()),
                Some(stored.account.label.as_str()),
            )
            .await
        }
        .await;
        self.pending_saved_account_switch_id = None;
        match &login_result {
            Ok(()) => self.trace_account_event(
                "saved.switch.login.succeeded",
                json!({
                    "targetAccountId": account_id,
                }),
            ),
            Err(error) => self.trace_account_event(
                "saved.switch.login.failed",
                json!({
                    "targetAccountId": account_id,
                    "error": error.to_string(),
                }),
            ),
        }
        login_result
    }

    async fn capture_current_chatgpt_account(&mut self, refresh_token: bool) -> Result<()> {
        self.trace_account_event(
            "capture.current.start",
            json!({
                "refreshRequested": refresh_token,
            }),
        );
        if self.snapshot.account.status != "authenticated" {
            self.trace_account_event(
                "capture.current.skipped",
                json!({
                    "refreshRequested": refresh_token,
                    "reason": "snapshot is not authenticated",
                }),
            );
            return Ok(());
        }

        if self.snapshot.account.mode != "chatgpt" && self.snapshot.account.mode != "chatgptAuthTokens"
        {
            self.trace_account_event(
                "capture.current.skipped",
                json!({
                    "refreshRequested": refresh_token,
                    "reason": "snapshot mode is not ChatGPT-backed",
                }),
            );
            return Ok(());
        }

        let active_id = self
            .snapshot
            .account
            .active_account_id
            .clone()
            .context("active account id is unavailable")?;
        let label = self
            .snapshot
            .account
            .identity
            .clone()
            .context("active account identity is unavailable")?;
        let auth_status = self.read_auth_status(refresh_token).await?;
        let has_auth_token = auth_status
            .get("authToken")
            .and_then(Value::as_str)
            .map(str::trim)
            .is_some_and(|token| !token.is_empty());
        self.trace_account_event(
            "capture.current.auth_status",
            json!({
                "refreshRequested": refresh_token,
                "accountId": active_id,
                "label": label,
                "hasAuthToken": has_auth_token,
            }),
        );
        let access_token = auth_status
            .get("authToken")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .context("active account token is unavailable")?;

        self.vault.upsert_chatgpt_account(
            &active_id,
            &label,
            self.snapshot.account.plan.as_deref(),
            &active_id,
            access_token,
        )?;
        self.vault.set_active_account(&active_id)?;
        self.sync_snapshot_saved_accounts();
        self.trace_account_event(
            "capture.current.saved",
            json!({
                "accountId": active_id,
                "label": label,
            }),
        );
        Ok(())
    }

    async fn read_auth_status(&self, refresh_token: bool) -> Result<Value> {
        let app_server = self.app_server()?;
        app_server
            .request(
                "getAuthStatus",
                Some(json!({
                    "includeToken": true,
                    "refreshToken": refresh_token,
                })),
            )
            .await
    }

    async fn handle_chatgpt_token_refresh(
        &mut self,
        id: RequestIdValue,
        params: Value,
    ) -> Result<()> {
        let hints = self.saved_account_refresh_hints(&params);
        self.trace_account_event(
            "token.refresh.requested",
            json!({
                "requestId": &id,
                "hints": &hints,
                "params": &params,
            }),
        );
        let Some(refresh_response) = self.saved_account_refresh_response(&params)? else {
            self.trace_account_event(
                "token.refresh.missing_credentials",
                json!({
                    "requestId": &id,
                    "params": &params,
                }),
            );
            return Err(anyhow!(
                "saved account credentials are unavailable for token refresh"
            ));
        };
        let app_server = self.app_server()?;
        app_server.respond(id, refresh_response.result.clone())?;
        self.trace_account_event(
            "token.refresh.responded",
            json!({
                "accountId": refresh_response.account_id,
                "resolvedHint": refresh_response.resolved_hint,
                "chatgptAccountId": refresh_response.chatgpt_account_id,
                "plan": refresh_response.plan,
            }),
        );
        let _ = self.vault.mark_state(&refresh_response.account_id, "connected");
        Ok(())
    }

    fn saved_account_refresh_response(
        &self,
        params: &Value,
    ) -> Result<Option<SavedAccountRefreshResponse>> {
        let mut stored = None;
        let mut resolved_hint = None;
        for hint in self.saved_account_refresh_hints(params) {
            if let Some(credential) = self.vault.get_credential_by_hint(&hint)? {
                resolved_hint = Some(hint);
                stored = Some(credential);
                break;
            }
        }
        let Some(stored) = stored else {
            return Ok(None);
        };
        Ok(Some(SavedAccountRefreshResponse {
            account_id: stored.account.id.clone(),
            resolved_hint,
            chatgpt_account_id: stored.account.chatgpt_account_id.clone(),
            plan: stored.account.plan.clone(),
            result: json!({
                "accessToken": stored.access_token,
                "chatgptAccountId": stored.account.chatgpt_account_id,
                "chatgptPlanType": stored.account.plan,
            }),
        }))
    }

    fn saved_account_refresh_hints(&self, params: &Value) -> Vec<String> {
        let mut hints = Vec::new();

        let mut push_hint = |value: Option<String>| {
            let Some(value) = value else {
                return;
            };
            let trimmed = value.trim();
            if trimmed.is_empty() || hints.iter().any(|existing| existing == trimmed) {
                return;
            }
            hints.push(trimmed.to_string());
        };

        push_hint(stringish_at(
            params,
            &["previousAccountId", "previous_account_id"],
        ));
        push_hint(self.pending_saved_account_switch_id.clone());
        push_hint(self.snapshot.account.active_account_id.clone());
        push_hint(self.vault.get_active_account_id().ok().flatten());

        hints
    }

    fn resolve_saved_account_id_for_refresh(&self, params: &Value) -> Result<Option<String>> {
        for hint in self.saved_account_refresh_hints(params) {
            if let Some(account_id) = self.vault.resolve_account_id(&hint)? {
                return Ok(Some(account_id));
            }
        }

        Ok(None)
    }

    fn handle_saved_account_failure(
        &mut self,
        account_id: &str,
        error: &anyhow::Error,
        summary: String,
    ) {
        let requires_reauth = saved_account_error_requires_reauth(error);
        self.trace_account_event(
            "saved.account.failure",
            json!({
                "accountId": account_id,
                "summary": &summary,
                "error": error.to_string(),
                "requiresReauth": requires_reauth,
            }),
        );
        if requires_reauth {
            let _ = self.vault.mark_state(account_id, "reauth required");
        }

        self.add_warning(summary, Some(error.to_string()));
        self.sync_snapshot_saved_accounts();
    }

    fn sync_snapshot_saved_accounts(&mut self) {
        let saved_accounts = match self.vault.list_account_views() {
            Ok(accounts) => accounts,
            Err(error) => {
                self.add_warning(
                    "Saved accounts are unavailable".to_string(),
                    Some(error.to_string()),
                );
                return;
            }
        };

        if saved_accounts.is_empty() {
            return;
        }

        let vault_active_id = self.vault.get_active_account_id().ok().flatten();
        let runtime_active_id = self.snapshot.account.active_account_id.clone();
        let runtime_identity = self.snapshot.account.identity.clone();

        let matched_active_id = if self.snapshot.account.status == "authenticated" {
            runtime_active_id
                .clone()
                .and_then(|candidate| {
                    saved_accounts
                        .iter()
                        .find(|account| account.id == candidate)
                        .map(|account| account.id.clone())
                })
                .or_else(|| {
                    runtime_identity.as_deref().and_then(|identity| {
                        saved_accounts
                            .iter()
                            .find(|account| account.label == identity)
                            .map(|account| account.id.clone())
                    })
                })
        } else {
            vault_active_id.clone()
        };

        self.snapshot.account.accounts = saved_accounts
            .into_iter()
            .map(|account| SavedAccountView {
                is_active: matched_active_id
                    .as_deref()
                    .is_some_and(|active_id| account.id == active_id),
                ..account
            })
            .collect();

        if self.snapshot.account.status == "authenticated" {
            if let Some(active_id) = matched_active_id {
                self.snapshot.account.active_account_id = Some(active_id);
            }
        } else {
            self.snapshot.account.active_account_id = vault_active_id;
        }
    }

    async fn fetch_thread_list(&mut self, archived: bool) -> Result<Vec<ThreadSummary>> {
        let app_server = self.app_server()?;
        let response = app_server
            .request(
                "thread/list",
                Some(json!({
                    "limit": THREAD_PAGE_SIZE,
                    "archived": archived,
                })),
            )
            .await?;

        Ok(response
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|thread| self.thread_summary_from_value(thread))
            .collect())
    }

    async fn select_thread_flow(
        &mut self,
        thread_id: String,
        config: ThreadConfigOverride,
    ) -> Result<()> {
        let durable_thread = self.read_thread(&thread_id).await?;
        self.apply_loaded_thread(&durable_thread);
        self.hydrated_threads.insert(thread_id.clone());

        if self.subscribed_thread_id.as_deref() != Some(thread_id.as_str()) {
            if let Some(previous) = self.subscribed_thread_id.clone() {
                let _ = self.unsubscribe_thread(&previous).await;
            }

            let app_server = self.app_server()?;
            let response = app_server
                .request(
                    "thread/resume",
                    Some(build_thread_resume_payload(&thread_id, &config, false)),
                )
                .await?;

            let resumed_thread = response
                .get("thread")
                .cloned()
                .context("thread/resume response missing thread")?;
            self.subscribed_thread_id = resumed_thread
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string);
            self.apply_loaded_thread(&resumed_thread);
            self.apply_thread_defaults(&response);
        } else {
            self.apply_thread_config(&config);
        }

        self.snapshot.session.loaded_thread_count = self.hydrated_threads.len();
        self.snapshot.session.subscribed_thread_id = self.subscribed_thread_id.clone();
        self.publish_snapshot();
        Ok(())
    }

    async fn read_thread(&self, thread_id: &str) -> Result<Value> {
        let app_server = self.app_server()?;
        let response = app_server
            .request(
                "thread/read",
                Some(json!({
                    "threadId": thread_id,
                    "includeTurns": true,
                })),
            )
            .await?;
        response
            .get("thread")
            .cloned()
            .context("thread/read response missing thread")
    }

    async fn unsubscribe_thread(&mut self, thread_id: &str) -> Result<()> {
        let app_server = self.app_server()?;
        let _ = app_server
            .request(
                "thread/unsubscribe",
                Some(json!({
                    "threadId": thread_id,
                })),
            )
            .await?;
        if self.subscribed_thread_id.as_deref() == Some(thread_id) {
            self.subscribed_thread_id = None;
            self.snapshot.session.subscribed_thread_id = None;
        }
        Ok(())
    }

    async fn start_thread(
        &mut self,
        cwd: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    ) -> Result<()> {
        if let Some(previous) = self.subscribed_thread_id.clone() {
            let _ = self.unsubscribe_thread(&previous).await;
        }

        let app_server = self.app_server()?;
        let response = app_server
            .request(
                "thread/start",
                Some(build_thread_start_payload(&cwd, &config)),
            )
            .await?;

        let thread = response
            .get("thread")
            .cloned()
            .context("thread/start response missing thread")?;
        let thread_id = thread
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .context("thread/start returned thread without id")?;

        self.hydrated_threads.insert(thread_id.clone());
        self.subscribed_thread_id = Some(thread_id.clone());
        self.apply_loaded_thread(&thread);
        self.apply_thread_defaults(&response);
        self.snapshot.session.subscribed_thread_id = Some(thread_id.clone());
        self.snapshot.session.loaded_thread_count = self.hydrated_threads.len();

        if !self
            .snapshot
            .threads
            .iter()
            .any(|entry| entry.id == thread_id)
        {
            self.snapshot.threads.insert(
                0,
                self.thread_summary_from_value(&thread)
                    .unwrap_or_else(|| fallback_thread_summary(&thread_id, &cwd)),
            );
        } else {
            self.upsert_thread_summary(&thread);
        }

        self.publish_snapshot();

        if !prompt.trim().is_empty() || !attachments.is_empty() {
            self.send_prompt(thread_id, prompt, attachments, config)
                .await?;
        }
        Ok(())
    }

    async fn send_prompt(
        &mut self,
        thread_id: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    ) -> Result<()> {
        if self.subscribed_thread_id.as_deref() != Some(thread_id.as_str()) {
            self.select_thread_flow(thread_id.clone(), config.clone())
                .await?;
        } else {
            self.apply_thread_config(&config);
        }

        let app_server = self.app_server()?;
        app_server
            .request(
                "turn/start",
                Some(build_turn_start_payload(
                    &thread_id,
                    &prompt,
                    &attachments,
                    &config,
                )),
            )
            .await?;
        self.snapshot.session.thread_state = Some("inProgress".to_string());
        self.publish_snapshot();
        Ok(())
    }

    async fn steer_turn(
        &mut self,
        thread_id: String,
        turn_id: String,
        prompt: String,
        attachments: Vec<UserInputItem>,
        config: ThreadConfigOverride,
    ) -> Result<()> {
        let app_server = self.app_server()?;
        app_server
            .request(
                "turn/steer",
                Some(build_turn_steer_payload(
                    &thread_id,
                    &turn_id,
                    &prompt,
                    &attachments,
                    &config,
                )),
            )
            .await?;
        self.apply_thread_config(&config);
        self.snapshot.session.thread_state = Some("inProgress".to_string());
        self.publish_snapshot();
        Ok(())
    }

    async fn archive_thread(&mut self, thread_id: String) -> Result<()> {
        let app_server = self.app_server()?;
        app_server
            .request("thread/archive", Some(json!({ "threadId": thread_id })))
            .await?;
        self.refresh_threads(false).await?;
        if self.snapshot.active_thread_id.as_deref() == Some(thread_id.as_str()) {
            self.snapshot.active_thread_id = self
                .snapshot
                .threads
                .first()
                .map(|thread| thread.id.clone());
        }
        self.publish_snapshot();
        Ok(())
    }

    async fn unarchive_thread(&mut self, thread_id: String) -> Result<()> {
        let app_server = self.app_server()?;
        app_server
            .request("thread/unarchive", Some(json!({ "threadId": thread_id })))
            .await?;
        self.refresh_threads(false).await?;
        self.publish_snapshot();
        Ok(())
    }

    async fn list_models(&mut self) -> Result<Vec<ModelOption>> {
        let app_server = self.app_server()?;
        let response = app_server
            .request(
                "model/list",
                Some(json!({
                    "includeHidden": false,
                })),
            )
            .await?;

        Ok(response
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| parse_model_option(&value))
            .collect())
    }

    async fn interrupt_turn(&mut self, thread_id: String, turn_id: String) -> Result<()> {
        let app_server = self.app_server()?;
        app_server
            .request(
                "turn/interrupt",
                Some(build_turn_interrupt_payload(&thread_id, &turn_id)),
            )
            .await?;
        self.snapshot.session.thread_state = Some("interrupting".to_string());
        self.publish_snapshot();
        Ok(())
    }

    async fn login_chatgpt(&mut self) -> Result<()> {
        if let Err(error) = self.capture_current_chatgpt_account(true).await {
            self.add_warning(
                "Could not save the current ChatGPT account before adding another one"
                    .to_string(),
                Some(error.to_string()),
            );
        }
        let app_server = self.app_server()?;
        let has_saved_accounts = !self.snapshot.account.accounts.is_empty();
        self.snapshot.account.login_in_progress = true;
        self.snapshot.account.last_login_error = None;
        self.snapshot.account.status = if has_saved_accounts {
            "authenticated".to_string()
        } else {
            "authorizing".to_string()
        };
        self.publish_snapshot();
        let response = app_server
            .request("account/login/start", Some(json!({ "type": "chatgpt" })))
            .await?;
        self.apply_login_start_response(&response);
        Ok(())
    }

    async fn login_api_key(&mut self, api_key: String) -> Result<()> {
        if let Err(error) = self.capture_current_chatgpt_account(true).await {
            self.add_warning(
                "Could not save the current ChatGPT account before switching auth modes"
                    .to_string(),
                Some(error.to_string()),
            );
        }
        let app_server = self.app_server()?;
        let has_saved_accounts = !self.snapshot.account.accounts.is_empty();
        self.snapshot.account.login_in_progress = true;
        self.snapshot.account.last_login_error = None;
        self.snapshot.account.status = if has_saved_accounts {
            "authenticated".to_string()
        } else {
            "authorizing".to_string()
        };
        self.publish_snapshot();
        let response = app_server
            .request(
                "account/login/start",
                Some(json!({
                    "type": "apiKey",
                    "apiKey": api_key,
                })),
            )
            .await?;
        self.apply_login_start_response(&response);
        Ok(())
    }

    async fn cancel_login(&mut self) -> Result<()> {
        let login_id = self
            .snapshot
            .account
            .login_id
            .clone()
            .context("no login is currently cancelable")?;
        let app_server = self.app_server()?;
        let response = app_server
            .request("account/login/cancel", Some(json!({ "loginId": login_id })))
            .await?;
        let canceled = response
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("notFound");
        self.snapshot.account.login_in_progress = false;
        self.snapshot.account.login_id = None;
        self.snapshot.account.auth_notice = None;
        self.snapshot.account.auth_url = None;
        self.snapshot.account.auth_code = None;
        self.snapshot.account.status = "unauthenticated".to_string();
        if canceled == "notFound" {
            self.snapshot.account.last_login_error =
                Some("Login session was already unavailable.".to_string());
        }
        self.publish_snapshot();
        Ok(())
    }

    async fn logout(&mut self) -> Result<()> {
        let _ = self.capture_current_chatgpt_account(true).await;
        let app_server = self.app_server()?;
        let _ = app_server.request("account/logout", None).await?;
        self.refresh_account().await?;
        let _ = self.refresh_rate_limits().await;
        let _ = self.refresh_threads(false).await;
        self.publish_snapshot();
        Ok(())
    }

    async fn select_account(&mut self, account_id: String) -> Result<()> {
        self.trace_account_event(
            "select_account.start",
            json!({
                "targetAccountId": account_id,
            }),
        );
        let has_saved_account = self.vault.has_account(&account_id)?;
        self.trace_account_event(
            "select_account.lookup",
            json!({
                "targetAccountId": account_id,
                "hasSavedAccount": has_saved_account,
            }),
        );
        if has_saved_account {
            let _ = self.capture_current_chatgpt_account(true).await;
            let Some(stored) = self.vault.get_credential(&account_id)? else {
                self.trace_account_event(
                    "select_account.missing_token",
                    json!({
                        "targetAccountId": account_id,
                    }),
                );
                let _ = self.vault.mark_state(&account_id, "reauth required");
                self.sync_snapshot_saved_accounts();
                return Err(anyhow!(
                    "saved account is missing a stored token; add this account again to refresh it"
                ));
            };
            if let Err(error) = self.login_with_saved_account(&stored).await {
                self.handle_saved_account_failure(
                    &account_id,
                    &error,
                    "Saved account switch failed".to_string(),
                );
                return Err(error);
            }
            self.trace_account_event(
                "select_account.saved.succeeded",
                json!({
                    "targetAccountId": account_id,
                }),
            );
            self.publish_snapshot();
            return Ok(());
        }

        self.trace_account_event(
            "select_account.runtime.requested",
            json!({
                "targetAccountId": account_id,
            }),
        );
        let app_server = self.app_server()?;
        let _ = app_server
            .request("account/select", Some(json!({ "accountId": account_id })))
            .await?;
        self.refresh_account_state_for_switch(&account_id, None, None)
            .await?;
        self.trace_account_event(
            "select_account.runtime.succeeded",
            json!({
                "targetAccountId": account_id,
            }),
        );
        // Keep account switching snappy by avoiding a full thread reload on every switch.
        // Thread/account attribution catches up on normal thread events and explicit refreshes.
        self.publish_snapshot();
        Ok(())
    }

    async fn disconnect_account(&mut self, account_id: String) -> Result<()> {
        if self.vault.has_account(&account_id)? {
            let active_account_id = self.snapshot.account.active_account_id.clone();
            self.vault.remove_account(&account_id)?;

            if active_account_id.as_deref() == Some(account_id.as_str()) {
                if let Some(next_account) = self
                    .vault
                    .list_accounts()?
                    .into_iter()
                    .filter(|account| account.id != account_id && account.state == "connected")
                    .max_by_key(|account| account.last_used_at.unwrap_or_default())
                {
                if let Some(credential) = self.vault.get_credential(&next_account.id)? {
                    self.login_with_saved_account(&credential).await?;
                } else {
                        let app_server = self.app_server()?;
                        let _ = app_server.request("account/logout", None).await?;
                        self.refresh_account().await?;
                    }
                } else {
                    let app_server = self.app_server()?;
                    let _ = app_server.request("account/logout", None).await?;
                    self.refresh_account().await?;
                }
            } else {
                self.sync_snapshot_saved_accounts();
            }

            let _ = self.refresh_rate_limits().await;
            let _ = self.refresh_threads(false).await;
            if let Some(thread_id) = self.snapshot.active_thread_id.clone() {
                let _ = self.read_thread(&thread_id).await.map(|thread| {
                    self.apply_loaded_thread(&thread);
                });
            }
            self.publish_snapshot();
            return Ok(());
        }

        let app_server = self.app_server()?;
        let _ = app_server
            .request("account/disconnect", Some(json!({ "accountId": account_id })))
            .await?;
        self.refresh_account().await?;
        let _ = self.refresh_rate_limits().await;
        let _ = self.refresh_threads(false).await;
        if let Some(thread_id) = self.snapshot.active_thread_id.clone() {
            let _ = self.read_thread(&thread_id).await.map(|thread| {
                self.apply_loaded_thread(&thread);
            });
        }
        self.publish_snapshot();
        Ok(())
    }

    async fn resolve_approval(&mut self, request_id: String, decision: String) -> Result<()> {
        let app_server = self.app_server()?;
        let pending = self
            .pending_server_requests
            .get(&request_id)
            .cloned()
            .context("approval request no longer exists")?;

        let result = match pending.method.as_str() {
            "item/commandExecution/requestApproval" => {
                json!({ "decision": map_command_decision(&decision) })
            }
            "item/fileChange/requestApproval" => {
                json!({ "decision": map_file_change_decision(&decision) })
            }
            "execCommandApproval" | "applyPatchApproval" => {
                json!({ "decision": map_legacy_review_decision(&decision) })
            }
            method if method.contains("requestApproval") => {
                json!({ "decision": map_generic_approval_decision(&decision) })
            }
            other => return Err(anyhow!("approval method not yet supported: {other}")),
        };

        app_server.respond(pending.raw_id, result)?;
        if let Some(entry) = self
            .snapshot
            .approvals
            .iter_mut()
            .find(|entry| entry.request_id == request_id)
        {
            entry.status = "resolved".to_string();
        }
        self.publish_snapshot();
        Ok(())
    }

    async fn handle_protocol_event(&mut self, event: ProtocolEvent) {
        let mut publish_now = true;
        match event {
            ProtocolEvent::Outbound(message) => self.push_trace("out", message),
            ProtocolEvent::Notification { method, params } => {
                self.push_trace("in", format!("{method}: {}", summarize_json(&params)));
                match method.as_str() {
                    "configWarning" => self.add_warning(
                        params
                            .get("summary")
                            .and_then(Value::as_str)
                            .unwrap_or("Config warning")
                            .to_string(),
                        params
                            .get("details")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                    ),
                    "error" => self.set_connection_state(
                        "degraded",
                        "Runtime reported an error",
                        Some(summarize_json(&params)),
                    ),
                    "account/updated" => {
                        self.trace_account_event(
                            "notification.account.updated",
                            json!({
                                "params": &params,
                            }),
                        );
                        match self.refresh_account_state().await {
                            Ok(()) => self.trace_account_event(
                                "notification.account.updated.refreshed",
                                json!({}),
                            ),
                            Err(error) => self.trace_account_event(
                                "notification.account.updated.refresh_failed",
                                json!({
                                    "error": error.to_string(),
                                }),
                            ),
                        }
                    }
                    "account/rateLimits/updated" => {
                        let matches_active_account =
                            self.rate_limit_notification_matches_active_account(&params);
                        self.trace_account_event(
                            "notification.rate_limits.updated",
                            json!({
                                "matchesActiveAccount": matches_active_account,
                                "params": &params,
                            }),
                        );
                        if matches_active_account {
                            self.apply_rate_limits_response(&params);
                        }
                    }
                    "account/login/completed" => {
                        self.trace_account_event(
                            "notification.account.login_completed",
                            json!({
                                "params": &params,
                            }),
                        );
                        self.snapshot.account.login_in_progress = false;
                        self.snapshot.account.login_id = None;
                        let success = params
                            .get("success")
                            .and_then(Value::as_bool)
                            .unwrap_or(false);
                        if !success {
                            self.snapshot.account.last_login_error = params
                                .get("error")
                                .and_then(Value::as_str)
                                .map(str::to_string);
                            self.snapshot.account.status =
                                if self.snapshot.account.accounts.is_empty() {
                                    "unauthenticated".to_string()
                                } else {
                                    "authenticated".to_string()
                                };
                            self.snapshot.account.auth_notice = None;
                            self.snapshot.account.auth_url = None;
                            self.snapshot.account.auth_code = None;
                        }
                        let _ = self.refresh_account().await;
                        let _ = self.refresh_rate_limits().await;
                        if success {
                            if let Err(error) = self.capture_current_chatgpt_account(true).await {
                                self.add_warning(
                                    "Could not save the newly signed-in ChatGPT account"
                                        .to_string(),
                                    Some(error.to_string()),
                                );
                            }
                        }
                    }
                    "thread/started" => {
                        if let Some(thread) = params.get("thread") {
                            self.upsert_thread_summary(thread);
                        }
                    }
                    "thread/archived" => {
                        if let Some(thread_id) = params.get("threadId").and_then(Value::as_str) {
                            if let Some(index) = self
                                .snapshot
                                .threads
                                .iter()
                                .position(|thread| thread.id == thread_id)
                            {
                                let thread = self.snapshot.threads.remove(index);
                                self.snapshot
                                    .archived_threads
                                    .retain(|item| item.id != thread.id);
                                self.snapshot.archived_threads.insert(0, thread);
                            }
                            if self.snapshot.active_thread_id.as_deref() == Some(thread_id) {
                                self.snapshot.active_thread_id = self
                                    .snapshot
                                    .threads
                                    .first()
                                    .map(|thread| thread.id.clone());
                            }
                        }
                    }
                    "thread/unarchived" => {
                        if let Some(thread_id) = params.get("threadId").and_then(Value::as_str) {
                            self.snapshot
                                .archived_threads
                                .retain(|thread| thread.id != thread_id);
                            let _ = self.refresh_threads(false).await;
                        }
                    }
                    "thread/status/changed" => {
                        if let Some(thread_id) = params.get("threadId").and_then(Value::as_str) {
                            let status = format_thread_status(params.get("status"));
                            if let Some(thread) = self
                                .snapshot
                                .threads
                                .iter_mut()
                                .find(|thread| thread.id == thread_id)
                            {
                                thread.status = status.clone();
                            }
                            if self.snapshot.active_thread_id.as_deref() == Some(thread_id) {
                                self.snapshot.session.thread_state = Some(status);
                            }
                        }
                    }
                    "thread/closed" => {
                        if let Some(thread_id) = params.get("threadId").and_then(Value::as_str) {
                            if self.subscribed_thread_id.as_deref() == Some(thread_id) {
                                self.subscribed_thread_id = None;
                                self.snapshot.session.subscribed_thread_id = None;
                            }
                            if let Some(thread) = self
                                .snapshot
                                .threads
                                .iter_mut()
                                .find(|thread| thread.id == thread_id)
                            {
                                thread.status = "closed".to_string();
                                thread.presence = if self.hydrated_threads.contains(thread_id) {
                                    "cached".to_string()
                                } else {
                                    "preview".to_string()
                                };
                            }
                        }
                    }
                    "turn/started" => {
                        let turn_id = params
                            .get("turn")
                            .and_then(|turn| turn.get("id"))
                            .and_then(Value::as_str)
                            .map(str::to_string);
                        if let Some(turn_id) = turn_id.as_ref() {
                            self.turn_started_at.insert(turn_id.clone(), Instant::now());
                        }
                        self.snapshot.session.active_turn_id = turn_id;
                        self.snapshot.session.thread_state = Some("inProgress".to_string());
                    }
                    "turn/completed" => {
                        let completed_turn_id = self.snapshot.session.active_turn_id.clone();
                        self.snapshot.session.active_turn_id = None;
                        if let Some(turn) = params.get("turn") {
                            self.snapshot.session.thread_state = turn
                                .get("status")
                                .and_then(Value::as_str)
                                .map(str::to_string);
                        }
                        if let Some(turn_id) = completed_turn_id {
                            if let Some(started_at) = self.turn_started_at.remove(&turn_id) {
                                self.annotate_turn_elapsed(
                                    &turn_id,
                                    started_at.elapsed().as_millis() as u64,
                                );
                            }
                        }
                    }
                    "turn/diff/updated" => {
                        let thread_id = params
                            .get("threadId")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let turn_id = params
                            .get("turnId")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let diff = params
                            .get("diff")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string();
                        self.snapshot.active_diff = Some(DiffSnapshot {
                            thread_id: thread_id.to_string(),
                            turn_id: turn_id.to_string(),
                            diff: truncate_with_notice(diff, DIFF_CAP),
                        });
                    }
                    "item/started" => self.handle_item_started(&params),
                    "item/completed" => self.handle_item_completed(&params),
                    "item/agentMessage/delta" => {
                        self.append_item_delta(&params, false);
                        publish_now = self.should_publish_stream_update();
                    }
                    "item/commandExecution/outputDelta" => {
                        self.append_item_delta(&params, true);
                        publish_now = self.should_publish_stream_update();
                    }
                    "serverRequest/resolved" => {
                        let resolved_id = params.get("requestId").map(normalize_request_id);
                        if let Some(request_id) = resolved_id {
                            self.pending_server_requests.remove(&request_id);
                            if let Some(entry) = self
                                .snapshot
                                .approvals
                                .iter_mut()
                                .find(|entry| entry.request_id == request_id)
                            {
                                entry.status = "resolved".to_string();
                            }
                        }
                    }
                    _ => {}
                }
            }
            ProtocolEvent::ServerRequest { id, method, params } => {
                self.push_trace("in", format!("{method}: {}", summarize_json(&params)));
                if method == "account/chatgptAuthTokens/refresh" {
                    let refresh_target = self.resolve_saved_account_id_for_refresh(&params).ok().flatten();
                    if let Err(error) = self.handle_chatgpt_token_refresh(id, params).await {
                        if let Some(account_id) = refresh_target.as_deref() {
                            self.handle_saved_account_failure(
                                account_id,
                                &error,
                                "Saved account needs to sign in again".to_string(),
                            );
                        } else {
                            self.add_warning(
                                "Saved account needs to sign in again".to_string(),
                                Some(error.to_string()),
                            );
                        }
                    }
                } else {
                    self.handle_server_request(id, method, params);
                }
            }
            ProtocolEvent::Stderr(line) => {
                self.push_trace("stderr", line.clone());
                if line.contains("Could not resolve host")
                    || line.contains("failed to connect")
                    || line.contains("error sending request")
                {
                    self.snapshot.session.network_state = "degraded".to_string();
                }
                if line.contains(" WARN ") || line.contains(" ERROR ") {
                    self.add_warning("Codex runtime warning".to_string(), Some(line));
                }
            }
            ProtocolEvent::DecodeError(message) => {
                self.push_trace("diag", message.clone());
                self.add_warning("Protocol decode warning".to_string(), Some(message));
            }
            ProtocolEvent::Exited(code) => {
                self.detach_runtime();
                let detail = format!("Child process exited with status {:?}", code);
                self.set_connection_state(
                    "degraded",
                    "Codex app-server exited",
                    Some(detail.clone()),
                );
                self.add_warning("Codex runtime exited".to_string(), Some(detail));
                if self.should_attempt_auto_recovery() {
                    self.auto_recovery_attempted_since_ready = true;
                    self.set_connection_state(
                        "restarting",
                        "Attempting automatic runtime recovery",
                        None,
                    );
                    if let Err(error) = self.refresh_runtime().await {
                        self.set_connection_state(
                            "degraded",
                            "Automatic runtime recovery failed",
                            Some(error.to_string()),
                        );
                    }
                }
            }
        }
        if publish_now {
            self.publish_snapshot();
        }
    }

    fn handle_server_request(&mut self, id: RequestIdValue, method: String, params: Value) {
        let request_id = normalize_request_id(&id);
        let approval = build_approval_entry(&request_id, &method, &params);

        self.pending_server_requests.insert(
            request_id.clone(),
            PendingServerRequest { raw_id: id, method },
        );
        self.snapshot
            .approvals
            .retain(|entry| entry.request_id != request_id);
        self.snapshot.approvals.insert(0, approval);
        cap_approval_entries(&mut self.snapshot.approvals, APPROVAL_CAP);
    }

    fn handle_item_started(&mut self, params: &Value) {
        let thread_id = params
            .get("threadId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let turn_id = params
            .get("turnId")
            .and_then(Value::as_str)
            .map(str::to_string);
        if self.snapshot.active_thread_id.as_deref() != Some(thread_id.as_str()) {
            return;
        }
        if let Some(item) = params.get("item") {
            let entry = timeline_entry_from_item(&thread_id, turn_id, item);
            self.push_timeline_entry(entry);
        }
    }

    fn handle_item_completed(&mut self, params: &Value) {
        let thread_id = params
            .get("threadId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let turn_id = params
            .get("turnId")
            .and_then(Value::as_str)
            .map(str::to_string);
        if self.snapshot.active_thread_id.as_deref() != Some(thread_id.as_str()) {
            return;
        }
        if let Some(item) = params.get("item") {
            let entry = timeline_entry_from_item(&thread_id, turn_id, item);
            if let Some(index) = self.active_item_index.get(&entry.id).copied() {
                if let Some(slot) = self.snapshot.timeline.get_mut(index) {
                    *slot = entry;
                }
            } else {
                self.push_timeline_entry(entry);
            }
        }
    }

    fn append_item_delta(&mut self, params: &Value, append_to_detail: bool) {
        let thread_id = params
            .get("threadId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if self.snapshot.active_thread_id.as_deref() != Some(thread_id) {
            return;
        }
        let item_id = params
            .get("itemId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let delta = params
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if let Some(index) = self.active_item_index.get(item_id).copied() {
            if let Some(entry) = self.snapshot.timeline.get_mut(index) {
                if append_to_detail {
                    let detail = entry.detail.get_or_insert_with(String::new);
                    push_capped(detail, delta);
                } else {
                    push_capped(&mut entry.body, delta);
                }
                entry.status = "streaming".to_string();
            }
        }
    }

    fn annotate_turn_elapsed(&mut self, turn_id: &str, elapsed_ms: u64) {
        for entry in self
            .snapshot
            .timeline
            .iter_mut()
            .filter(|entry| entry.turn_id.as_deref() == Some(turn_id))
        {
            entry.turn_elapsed_ms = Some(elapsed_ms);
        }
    }

    fn apply_initialize_result(&mut self, value: &Value) {
        self.snapshot.connection.codex_home = value
            .get("codexHome")
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.connection.platform_family = value
            .get("platformFamily")
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.connection.platform_os = value
            .get("platformOs")
            .and_then(Value::as_str)
            .map(str::to_string);
    }

    fn apply_account_response(&mut self, value: &Value) {
        self.snapshot.account = build_account_snapshot(&self.snapshot.account, value);
    }

    fn apply_login_start_response(&mut self, value: &Value) {
        self.snapshot.account.login_id = value
            .get("loginId")
            .and_then(Value::as_str)
            .map(str::to_string);
        if let Some(notice) = login_notice(value) {
            self.snapshot.account.auth_notice = Some(notice);
        }
        self.snapshot.account.auth_url = login_action_url(value);
        self.snapshot.account.auth_code = login_code(value);
    }

    fn apply_rate_limits_response(&mut self, value: &Value) {
        if let Some(rate_limits) = account_rate_limits_payload(None, value) {
            self.snapshot.account.rate_limit_summary = Some(summarize_json(rate_limits));
            let structured = normalize_account_rate_limits(rate_limits);
            if let Some(plan) = structured.plan.clone() {
                self.snapshot.account.plan = Some(plan);
            }
            self.snapshot.account.rate_limits = Some(structured);
        } else {
            self.snapshot.account.rate_limit_summary = None;
            self.snapshot.account.rate_limits = None;
        }
    }

    fn rate_limit_notification_matches_active_account(&self, value: &Value) -> bool {
        let Some(account_id) = value
            .get("accountId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|candidate| !candidate.is_empty())
        else {
            return true;
        };

        self.snapshot
            .account
            .active_account_id
            .as_deref()
            .map_or(true, |active| active == account_id)
    }

    fn snapshot_matches_account_target(
        &self,
        target_account_id: &str,
        target_runtime_account_id: Option<&str>,
        target_label: Option<&str>,
    ) -> bool {
        if self.snapshot.account.active_account_id.as_deref() == Some(target_account_id) {
            return true;
        }

        if self
            .snapshot
            .account
            .accounts
            .iter()
            .find(|account| account.is_active)
            .is_some_and(|account| account.id == target_account_id)
        {
            return true;
        }

        if let Some(target_runtime_account_id) = target_runtime_account_id {
            if self.snapshot.account.active_account_id.as_deref() == Some(target_runtime_account_id) {
                return true;
            }
        }

        if let Some(target_label) = target_label {
            if self.snapshot.account.identity.as_deref() == Some(target_label) {
                return true;
            }
        }

        false
    }

    fn apply_loaded_thread(&mut self, thread: &Value) {
        let thread_id = thread.get("id").and_then(Value::as_str).map(str::to_string);
        self.upsert_thread_summary(thread);
        self.snapshot.active_thread_id = thread_id.clone();
        self.snapshot.session.cwd = thread
            .get("cwd")
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.session.repo = thread
            .get("gitInfo")
            .and_then(|value| value.get("repositoryRoot"))
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.session.branch = thread
            .get("gitInfo")
            .and_then(|value| value.get("branch"))
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.session.thread_state = Some(format_thread_status(thread.get("status")));

        self.snapshot.timeline.clear();
        self.active_item_index.clear();
        self.turn_started_at.clear();
        if let Some(turns) = thread.get("turns").and_then(Value::as_array) {
            for turn in turns {
                let turn_id = turn.get("id").and_then(Value::as_str).map(str::to_string);
                if let Some(items) = turn.get("items").and_then(Value::as_array) {
                    for item in items {
                        let entry = timeline_entry_from_item(
                            thread_id.as_deref().unwrap_or_default(),
                            turn_id.clone(),
                            item,
                        );
                        self.push_timeline_entry(entry);
                    }
                }
            }
        }
        self.snapshot.session.loaded_thread_count = self.hydrated_threads.len();
    }

    fn push_timeline_entry(&mut self, entry: TimelineEntry) {
        self.snapshot.timeline.push(entry);
        cap_timeline_entries(&mut self.snapshot.timeline, TIMELINE_CAP);
        rebuild_active_item_index(&self.snapshot.timeline, &mut self.active_item_index);
    }

    fn should_publish_stream_update(&mut self) -> bool {
        let now = Instant::now();
        if should_publish_stream_snapshot(self.last_stream_publish_at, now, STREAM_PUBLISH_INTERVAL)
        {
            self.last_stream_publish_at = Some(now);
            return true;
        }
        false
    }

    fn upsert_thread_summary(&mut self, thread: &Value) {
        if let Some(summary) = self.thread_summary_from_value(thread) {
            self.snapshot
                .archived_threads
                .retain(|current| current.id != summary.id);
            if let Some(existing) = self
                .snapshot
                .threads
                .iter_mut()
                .find(|current| current.id == summary.id)
            {
                *existing = summary;
            } else {
                self.snapshot.threads.push(summary);
            }
            self.snapshot
                .threads
                .sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        }
    }

    fn thread_summary_from_value(&self, value: &Value) -> Option<ThreadSummary> {
        let id = value.get("id")?.as_str()?.to_string();
        let presence = if self.subscribed_thread_id.as_deref() == Some(id.as_str()) {
            "live"
        } else if self.hydrated_threads.contains(id.as_str()) {
            "cached"
        } else {
            "preview"
        };

        Some(ThreadSummary {
            id,
            preview: value
                .get("preview")
                .and_then(Value::as_str)
                .unwrap_or("Untitled thread")
                .to_string(),
            name: value
                .get("name")
                .and_then(Value::as_str)
                .map(str::to_string),
            cwd: value.get("cwd")?.as_str()?.to_string(),
            status: format_thread_status(value.get("status")),
            model_provider: value
                .get("modelProvider")
                .and_then(Value::as_str)
                .unwrap_or("openai")
                .to_string(),
            updated_at: value
                .get("updatedAt")
                .and_then(Value::as_i64)
                .unwrap_or_default(),
            repo: value
                .get("gitInfo")
                .and_then(|inner| inner.get("repositoryRoot"))
                .and_then(Value::as_str)
                .map(str::to_string),
            branch: value
                .get("gitInfo")
                .and_then(|inner| inner.get("branch"))
                .and_then(Value::as_str)
                .map(str::to_string),
            presence: presence.to_string(),
            turn_count: value
                .get("turns")
                .and_then(Value::as_array)
                .map(|turns| turns.len())
                .unwrap_or_default(),
            last_account_id: stringish_at(value, &["lastAccountId", "last_account_id"]),
            last_account_label: stringish_at(value, &["lastAccountLabel", "last_account_label"]),
            last_account_plan: stringish_at(value, &["lastAccountPlan", "last_account_plan"]),
        })
    }

    fn apply_thread_defaults(&mut self, response: &Value) {
        self.snapshot.session.model = response
            .get("model")
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.session.model_provider = response
            .get("modelProvider")
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.session.reasoning_effort = response
            .get("effort")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| self.snapshot.session.reasoning_effort.clone());
        self.snapshot.session.approval_policy = response
            .get("approvalPolicy")
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.session.cwd = response
            .get("cwd")
            .and_then(Value::as_str)
            .map(str::to_string);
        self.snapshot.session.sandbox_mode = response.get("sandbox").map(summarize_json);
        self.snapshot.session.thread_state = Some("idle".to_string());
        self.snapshot.session.subscribed_thread_id = self.subscribed_thread_id.clone();
        if let Some(thread) = response.get("thread") {
            self.snapshot.session.repo = thread
                .get("gitInfo")
                .and_then(|value| value.get("repositoryRoot"))
                .and_then(Value::as_str)
                .map(str::to_string);
            self.snapshot.session.branch = thread
                .get("gitInfo")
                .and_then(|value| value.get("branch"))
                .and_then(Value::as_str)
                .map(str::to_string);
        }
    }

    fn apply_thread_config(&mut self, config: &ThreadConfigOverride) {
        if let Some(cwd) = config.cwd.as_ref() {
            self.snapshot.session.cwd = Some(cwd.clone());
        }
        if let Some(model) = config.model.as_ref() {
            self.snapshot.session.model = Some(model.clone());
        }
        if let Some(effort) = config.reasoning_effort.as_ref() {
            self.snapshot.session.reasoning_effort = Some(effort.clone());
        }
        if let Some(approval_policy) = config.approval_policy.as_ref() {
            self.snapshot.session.approval_policy = Some(approval_policy.clone());
        }
        if let Some(sandbox_mode) = config.sandbox_mode.as_ref() {
            self.snapshot.session.sandbox_mode = Some(sandbox_mode.clone());
        }
    }

    fn set_connection_state(&mut self, state: &str, detail: &str, error: Option<String>) {
        self.snapshot.connection.state = state.to_string();
        self.snapshot.connection.detail = detail.to_string();
        self.snapshot.connection.last_error = error;
        self.publish_snapshot();
    }

    fn should_attempt_auto_recovery(&self) -> bool {
        !self.auto_recovery_attempted_since_ready
    }

    fn detach_runtime(&mut self) {
        self.app_server = None;
        self.protocol_rx = None;
        self.pending_server_requests.clear();
        self.last_stream_publish_at = None;
        self.subscribed_thread_id = None;
        self.snapshot.session.subscribed_thread_id = None;
        self.snapshot.session.active_turn_id = None;
        if self
            .snapshot
            .session
            .thread_state
            .as_deref()
            .is_some_and(|state| state == "inProgress" || state == "interrupting")
        {
            self.snapshot.session.thread_state = Some("degraded".to_string());
        }
        for approval in &mut self.snapshot.approvals {
            if approval.status == "pending" {
                approval.status = "stale".to_string();
            }
        }
    }

    fn add_warning(&mut self, summary: String, details: Option<String>) {
        let details = details.map(|line| sanitize_trace_message(&line));
        self.warning_ring
            .push_front(DiagnosticWarning { summary, details });
        while self.warning_ring.len() > WARNING_CAP {
            self.warning_ring.pop_back();
        }
        self.snapshot.diagnostics.warnings = self.warning_ring.iter().cloned().collect();
    }

    fn push_trace(&mut self, direction: &str, message: String) {
        let message = sanitize_trace_message(&message);
        self.trace_ring.push_front(DiagnosticTrace {
            direction: direction.to_string(),
            message,
        });
        while self.trace_ring.len() > TRACE_CAP {
            self.trace_ring.pop_back();
        }
        self.snapshot.diagnostics.traces = self.trace_ring.iter().cloned().collect();
    }

    fn trace_account_event(&mut self, event: &str, details: Value) {
        let payload = json!({
            "event": event,
            "details": details,
            "context": {
                "status": &self.snapshot.account.status,
                "mode": &self.snapshot.account.mode,
                "identity": self.snapshot.account.identity.clone(),
                "plan": self.snapshot.account.plan.clone(),
                "activeAccountId": self.snapshot.account.active_account_id.clone(),
                "pendingSavedAccountSwitchId": self.pending_saved_account_switch_id.clone(),
                "vaultActiveAccountId": self.vault.get_active_account_id().ok().flatten(),
                "savedAccounts": self
                    .snapshot
                    .account
                    .accounts
                    .iter()
                    .map(|account| {
                        json!({
                            "id": &account.id,
                            "label": &account.label,
                            "state": &account.state,
                            "isActive": account.is_active,
                            "plan": account.plan.clone(),
                        })
                    })
                    .collect::<Vec<_>>(),
                "rateLimits": self.snapshot.account.rate_limits.as_ref().map(|limits| {
                    json!({
                        "plan": limits.plan.clone(),
                        "bucketCount": limits.buckets.len(),
                        "hasCredits": limits.credits.as_ref().map(|credits| credits.has_credits),
                        "unlimitedCredits": limits.credits.as_ref().map(|credits| credits.unlimited),
                        "balance": limits.credits.as_ref().and_then(|credits| credits.balance.clone()),
                    })
                }),
            },
        });
        let message = format!("{event}: {payload}");
        eprintln!("[kodeks:acct] {}", sanitize_trace_message(&message));
        self.push_trace("acct", message);
    }

    fn publish_snapshot(&mut self) {
        let _ = self.snapshot_tx.send(self.snapshot.clone());
    }

    fn app_server(&self) -> Result<AppServerHandle> {
        self.app_server
            .clone()
            .context("app-server is not connected yet")
    }
}

fn parse_model_option(value: &Value) -> Option<ModelOption> {
    let model = value.get("model")?.as_str()?.to_string();
    let display_name = value
        .get("displayName")
        .and_then(Value::as_str)
        .unwrap_or(model.as_str())
        .to_string();
    let description = value
        .get("description")
        .and_then(Value::as_str)
        .filter(|description| !description.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| fallback_model_description(&model, &display_name));

    Some(ModelOption {
        id: value.get("id")?.as_str()?.to_string(),
        model,
        display_name,
        description,
        hidden: value
            .get("hidden")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        is_default: value
            .get("isDefault")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        supported_reasoning_efforts: parse_reasoning_effort_options(
            value.get("supportedReasoningEfforts"),
        ),
        default_reasoning_effort: value
            .get("defaultReasoningEffort")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

fn fallback_model_description(model: &str, display_name: &str) -> String {
    let normalized = model.trim().to_ascii_lowercase();
    let display = display_name.trim().to_ascii_lowercase();

    if normalized.contains("gpt-5.4-mini") || display.contains("gpt-5.4-mini") {
        return "Smaller frontier agentic coding model.".to_string();
    }

    if normalized.contains("gpt-5.4") || display.contains("gpt-5.4") {
        return "Flagship frontier agentic coding model.".to_string();
    }

    if normalized.contains("gpt-5.3-codex") || display.contains("gpt-5.3-codex") {
        return "Frontier agentic coding model optimized for code editing.".to_string();
    }

    if normalized.contains("gpt-5.2") || display.contains("gpt-5.2") {
        return "Previous-generation frontier agentic coding model.".to_string();
    }

    String::new()
}

fn parse_reasoning_effort_options(value: Option<&Value>) -> Vec<ReasoningEffortOption> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(parse_reasoning_effort_option)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_reasoning_effort_option(value: &Value) -> Option<ReasoningEffortOption> {
    match value {
        Value::String(reasoning_effort) => Some(ReasoningEffortOption {
            reasoning_effort: reasoning_effort.to_string(),
            description: String::new(),
        }),
        Value::Object(map) => Some(ReasoningEffortOption {
            reasoning_effort: map
                .get("reasoningEffort")
                .and_then(Value::as_str)
                .or_else(|| map.get("id").and_then(Value::as_str))
                .or_else(|| map.get("value").and_then(Value::as_str))?
                .to_string(),
            description: map
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        }),
        _ => None,
    }
}

fn resolve_codex_binary() -> Result<PathBuf> {
    if let Some(path) = env::var_os("KODEKS_CODEX_BIN") {
        return Ok(PathBuf::from(path));
    }
    if let Some(path) = env::var_os("CODEX_BIN") {
        return Ok(PathBuf::from(path));
    }
    Ok(PathBuf::from("codex"))
}

fn fallback_thread_summary(thread_id: &str, cwd: &str) -> ThreadSummary {
    ThreadSummary {
        id: thread_id.to_string(),
        preview: "New thread".to_string(),
        name: None,
        cwd: cwd.to_string(),
        status: "idle".to_string(),
        model_provider: "openai".to_string(),
        updated_at: 0,
        repo: None,
        branch: None,
        presence: "live".to_string(),
        turn_count: 0,
        last_account_id: None,
        last_account_label: None,
        last_account_plan: None,
    }
}

fn format_thread_status(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(status)) => status.clone(),
        Some(Value::Object(status)) => status
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        _ => "unknown".to_string(),
    }
}

fn saved_account_error_requires_reauth(error: &anyhow::Error) -> bool {
    let message = error.to_string().to_ascii_lowercase();

    [
        "unauthorized",
        "forbidden",
        "reauth",
        "re-auth",
        "sign in again",
        "sign-in again",
        "login required",
        "authentication failed",
        "invalid token",
        "expired token",
        "token expired",
        "missing a stored token",
        "auth token is unavailable",
        "saved account credentials are unavailable",
        "missing local credentials",
        " 401",
        " 403",
    ]
    .iter()
    .any(|needle| message.contains(needle))
}

fn build_account_snapshot(previous: &AccountSnapshot, value: &Value) -> AccountSnapshot {
    let account_value = value.get("account").filter(|account| !account.is_null());
    let reported_active_account_id = stringish_at(value, &["activeAccountId", "active_account_id"]);
    let mut accounts =
        collect_saved_accounts(value, reported_active_account_id.as_deref(), account_value);

    let active_account_id = reported_active_account_id
        .or_else(|| account_value.and_then(account_id))
        .or_else(|| accounts.iter().find(|account| account.is_active).map(|account| account.id.clone()))
        .or_else(|| accounts.first().map(|account| account.id.clone()));

    if let Some(active_id) = active_account_id.as_deref() {
        for account in &mut accounts {
            account.is_active = account.id == active_id;
        }
    }

    let active_saved_account = active_account_id
        .as_deref()
        .and_then(|account_id| accounts.iter().find(|account| account.id == account_id));
    let active_value = account_value.or_else(|| {
        account_array(value).and_then(|items| {
            active_account_id.as_deref().and_then(|account_id| {
                items.iter().find(|item| {
                    account_id_from_value(item)
                        .as_deref()
                        .is_some_and(|candidate| candidate == account_id)
                })
            })
        })
    });

    let authenticated = active_value.is_some() || !accounts.is_empty();
    let rate_limits_payload = account_rate_limits_payload(active_value, value);
    let rate_limits = rate_limits_payload.map(normalize_account_rate_limits);
    let plan = active_value
        .and_then(account_plan)
        .or_else(|| active_saved_account.and_then(|account| account.plan.clone()))
        .or_else(|| rate_limits.as_ref().and_then(|limits| limits.plan.clone()));
    let mut account = AccountSnapshot {
        status: if authenticated {
            "authenticated".to_string()
        } else {
            "unauthenticated".to_string()
        },
        mode: active_value
            .map(account_mode)
            .or_else(|| active_saved_account.map(|account| account.mode.clone()))
            .unwrap_or_else(|| "unknown".to_string()),
        identity: active_value
            .and_then(account_identity)
            .or_else(|| active_saved_account.map(|account| account.label.clone())),
        plan,
        rate_limit_summary: rate_limits_payload.map(summarize_json),
        rate_limits,
        active_account_id,
        accounts,
        requires_openai_auth: value
            .get("requiresOpenaiAuth")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        login_in_progress: previous.login_in_progress,
        login_id: previous.login_id.clone(),
        last_login_error: previous.last_login_error.clone(),
        auth_notice: None,
        auth_url: None,
        auth_code: None,
    };

    if previous.login_in_progress {
        account.login_id = previous.login_id.clone();
        account.auth_notice = previous.auth_notice.clone();
        account.auth_url = previous.auth_url.clone();
        account.auth_code = previous.auth_code.clone();
    }

    account
}

fn account_identity(value: &Value) -> Option<String> {
    ["email", "name", "label", "id"]
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

fn account_id(value: &Value) -> Option<String> {
    account_id_from_value(value).or_else(|| account_identity(value))
}

fn account_id_from_value(value: &Value) -> Option<String> {
    stringish_at(
        value,
        &[
            "id",
            "accountId",
            "account_id",
            "chatgptAccountId",
            "chatgpt_account_id",
        ],
    )
}

fn account_mode(value: &Value) -> String {
    stringish_at(value, &["type", "authMode", "mode"]).unwrap_or_else(|| "unknown".to_string())
}

fn account_plan(value: &Value) -> Option<String> {
    ["planType", "plan", "subscription"]
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

fn account_state(value: &Value) -> String {
    stringish_at(value, &["state", "status", "authStatus"])
        .unwrap_or_else(|| "authenticated".to_string())
}

fn account_array<'a>(root: &'a Value) -> Option<&'a Vec<Value>> {
    root.get("accounts").and_then(Value::as_array)
}

fn collect_saved_accounts(
    root: &Value,
    active_account_id: Option<&str>,
    active_alias: Option<&Value>,
) -> Vec<SavedAccountView> {
    let mut accounts = account_array(root)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| saved_account_from_value(item, active_account_id, false))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if let Some(account) = active_alias.and_then(|item| saved_account_from_value(item, active_account_id, true)) {
        let exists = accounts
            .iter()
            .any(|current| current.id == account.id || current.label == account.label);
        if !exists {
            accounts.push(account);
        }
    }

    if active_account_id.is_none() {
        if accounts.len() == 1 {
            accounts[0].is_active = true;
        } else if !accounts.iter().any(|account| account.is_active) && !accounts.is_empty() {
            accounts[0].is_active = true;
        }
    }

    accounts
}

fn saved_account_from_value(
    value: &Value,
    active_account_id: Option<&str>,
    force_active: bool,
) -> Option<SavedAccountView> {
    let id = account_id(value)?;
    let label = account_identity(value).unwrap_or_else(|| id.clone());
    let is_active = force_active
        || active_account_id
            .map(|active| active == id)
            .unwrap_or(false)
        || value
            .get("isActive")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        || value
            .get("active")
            .and_then(Value::as_bool)
            .unwrap_or(false);

    Some(SavedAccountView {
        id,
        mode: account_mode(value),
        label,
        plan: account_plan(value),
        state: account_state(value),
        is_active,
        last_used_at: integer_at(value, &["lastUsedAt", "last_used_at"]),
    })
}

fn account_rate_limits_payload<'a>(
    account_value: Option<&'a Value>,
    root: &'a Value,
) -> Option<&'a Value> {
    account_value
        .and_then(|account| {
            ["rateLimit", "rateLimits", "limits", "usage"]
                .iter()
                .find_map(|key| account.get(*key))
        })
        .or_else(|| first_rate_limit_by_limit_id(root))
        .or_else(|| {
            ["rateLimit", "rateLimits", "limits", "usage"]
                .iter()
                .find_map(|key| root.get(*key))
        })
}

fn first_rate_limit_by_limit_id<'a>(value: &'a Value) -> Option<&'a Value> {
    value
        .get("rateLimitsByLimitId")
        .or_else(|| value.get("rate_limits_by_limit_id"))
        .and_then(Value::as_object)
        .and_then(|entries| entries.values().find(|candidate| candidate.is_object()))
}

fn normalize_account_rate_limits(value: &Value) -> AccountRateLimits {
    let plan = ["planType", "plan", "subscription"]
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string));
    let credits = value.get("credits").and_then(parse_account_credits);

    let mut buckets = Vec::new();

    if rate_limit_bucket_like(value) {
        buckets.push(parse_rate_limit_bucket("primary", value));
    }

    if let Some(object) = value.as_object() {
        for (key, nested) in object {
            if is_rate_limit_metadata_key(key) || !rate_limit_bucket_like(nested) {
                continue;
            }
            if buckets
                .iter()
                .any(|bucket: &AccountRateLimitBucket| bucket.key == *key)
            {
                continue;
            }
            buckets.push(parse_rate_limit_bucket(key, nested));
        }
    }

    AccountRateLimits {
        plan,
        credits,
        buckets,
    }
}

fn parse_rate_limit_bucket(key: &str, value: &Value) -> AccountRateLimitBucket {
    AccountRateLimitBucket {
        key: key.to_string(),
        label: humanize_rate_limit_key(key),
        remaining: number_at(value, &["remaining"]),
        limit: number_at(value, &["limit", "max", "total"]),
        used: number_at(value, &["used"]),
        used_percent: number_at(value, &["usedPercent", "used_percent"]),
        reset_at: stringish_at(value, &["resetAt", "reset_at", "resetsAt", "resets_at"]),
        window_minutes: parse_window_minutes(value),
    }
}

fn parse_account_credits(value: &Value) -> Option<AccountCredits> {
    if !value.is_object() {
        return None;
    }

    let has_credits = value
        .get("hasCredits")
        .and_then(Value::as_bool)
        .or_else(|| value.get("has_credits").and_then(Value::as_bool));
    let unlimited = value.get("unlimited").and_then(Value::as_bool);
    let balance = stringish_at(value, &["balance"]);

    if has_credits.is_none() && unlimited.is_none() && balance.is_none() {
        return None;
    }

    Some(AccountCredits {
        has_credits: has_credits.unwrap_or(false),
        unlimited: unlimited.unwrap_or(false),
        balance,
    })
}

fn parse_window_minutes(value: &Value) -> Option<f64> {
    number_at(value, &["windowDurationMins", "windowMinutes"])
        .or_else(|| {
            number_at(value, &["windowDurationSecs", "windowSeconds"]).map(|seconds| seconds / 60.0)
        })
        .or_else(|| {
            number_at(value, &["windowDurationMs"]).map(|milliseconds| milliseconds / 60_000.0)
        })
}

fn number_at(value: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_f64))
}

fn integer_at(value: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_i64)
            .or_else(|| value.get(*key).and_then(Value::as_u64).and_then(|number| i64::try_from(number).ok()))
            .or_else(|| {
                value
                    .get(*key)
                    .and_then(Value::as_str)
                    .and_then(|text| text.parse::<i64>().ok())
            })
    })
}

fn stringish_at(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|candidate| {
            candidate
                .as_str()
                .map(str::to_string)
                .or_else(|| candidate.as_i64().map(|number| number.to_string()))
                .or_else(|| candidate.as_u64().map(|number| number.to_string()))
                .or_else(|| candidate.as_f64().map(|number| number.to_string()))
        })
    })
}

fn is_rate_limit_metadata_key(key: &str) -> bool {
    matches!(
        key,
        "planType" | "plan" | "subscription" | "updatedAt" | "updated_at" | "type" | "credits"
    )
}

fn rate_limit_bucket_like(value: &Value) -> bool {
    value.is_object()
        && [
            "remaining",
            "limit",
            "max",
            "total",
            "used",
            "usedPercent",
            "used_percent",
            "resetAt",
            "reset_at",
            "resetsAt",
            "resets_at",
            "windowDurationMins",
            "windowMinutes",
            "windowDurationSecs",
            "windowSeconds",
            "windowDurationMs",
        ]
        .iter()
        .any(|key| value.get(*key).is_some())
}

fn humanize_rate_limit_key(value: &str) -> String {
    let cleaned = value.trim().replace('_', " ").replace('-', " ");
    if cleaned.is_empty() {
        return "Primary".to_string();
    }

    cleaned
        .split_whitespace()
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let mut output = String::new();
                    output.extend(first.to_uppercase());
                    output.push_str(chars.as_str().to_lowercase().as_str());
                    output
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn login_notice(value: &Value) -> Option<String> {
    let mut lines = Vec::new();
    for key in ["message", "instructions", "description"] {
        if let Some(text) = value.get(key).and_then(Value::as_str) {
            lines.push(text.to_string());
        }
    }

    if let Some(url) = login_action_url(value) {
        lines.push(format!("Open: {url}"));
    }
    if let Some(code) = login_code(value) {
        lines.push(format!("Code: {code}"));
    }

    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n"))
    }
}

fn login_action_url(value: &Value) -> Option<String> {
    ["authUrl", "url", "verificationUri", "verification_uri"]
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

fn login_code(value: &Value) -> Option<String> {
    ["code", "userCode", "user_code"]
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

fn timeline_entry_from_item(
    thread_id: &str,
    turn_id: Option<String>,
    item: &Value,
) -> TimelineEntry {
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("system");
    let id = item
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or(item_type)
        .to_string();

    match item_type {
        "userMessage" => TimelineEntry {
            id,
            thread_id: thread_id.to_string(),
            turn_id,
            kind: "user".to_string(),
            title: "You".to_string(),
            body: summarize_user_message_text(item.get("content")),
            status: "completed".to_string(),
            detail: None,
            metadata: Vec::new(),
            file_changes: Vec::new(),
            attachments: summarize_user_attachments(item.get("content")),
            turn_elapsed_ms: None,
        },
        "agentMessage" => TimelineEntry {
            id,
            thread_id: thread_id.to_string(),
            turn_id,
            kind: "assistant".to_string(),
            title: "Assistant".to_string(),
            body: item
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            status: item
                .get("phase")
                .and_then(Value::as_str)
                .unwrap_or("completed")
                .to_string(),
            detail: None,
            metadata: Vec::new(),
            file_changes: Vec::new(),
            attachments: Vec::new(),
            turn_elapsed_ms: None,
        },
        "commandExecution" => TimelineEntry {
            id,
            thread_id: thread_id.to_string(),
            turn_id,
            kind: "command".to_string(),
            title: "Command".to_string(),
            body: item
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            status: item
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("inProgress")
                .to_string(),
            detail: item
                .get("aggregatedOutput")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    item.get("output")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                }),
            metadata: command_execution_metadata(item),
            file_changes: Vec::new(),
            attachments: Vec::new(),
            turn_elapsed_ms: None,
        },
        "plan" => TimelineEntry {
            id,
            thread_id: thread_id.to_string(),
            turn_id,
            kind: "plan".to_string(),
            title: "Plan".to_string(),
            body: item
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            status: "completed".to_string(),
            detail: None,
            metadata: Vec::new(),
            file_changes: Vec::new(),
            attachments: Vec::new(),
            turn_elapsed_ms: None,
        },
        "reasoning" => TimelineEntry {
            id,
            thread_id: thread_id.to_string(),
            turn_id,
            kind: "reasoning".to_string(),
            title: "Reasoning".to_string(),
            body: item
                .get("summary")
                .and_then(Value::as_array)
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default(),
            status: "completed".to_string(),
            detail: item.get("content").and_then(Value::as_array).map(|parts| {
                parts
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join("\n")
            }),
            metadata: Vec::new(),
            file_changes: Vec::new(),
            attachments: Vec::new(),
            turn_elapsed_ms: None,
        },
        "fileChange" => TimelineEntry {
            id,
            thread_id: thread_id.to_string(),
            turn_id,
            kind: "diff".to_string(),
            title: "File changes".to_string(),
            body: format!(
                "{} file changes",
                item.get("changes")
                    .and_then(Value::as_array)
                    .map(|changes| changes.len())
                    .unwrap_or_default(),
            ),
            status: item
                .get("status")
                .map(summarize_json)
                .unwrap_or_else(|| "pending".to_string()),
            detail: None,
            metadata: Vec::new(),
            file_changes: summarize_file_changes(item),
            attachments: Vec::new(),
            turn_elapsed_ms: None,
        },
        other => TimelineEntry {
            id,
            thread_id: thread_id.to_string(),
            turn_id,
            kind: "system".to_string(),
            title: other.to_string(),
            body: summarize_json(item),
            status: "completed".to_string(),
            detail: None,
            metadata: Vec::new(),
            file_changes: Vec::new(),
            attachments: Vec::new(),
            turn_elapsed_ms: None,
        },
    }
}

fn summarize_file_changes(item: &Value) -> Vec<TimelineFileChange> {
    item.get("changes")
        .and_then(Value::as_array)
        .map(|changes| {
            changes
                .iter()
                .filter_map(|change| {
                    let path = change.get("path").and_then(Value::as_str)?.to_string();
                    let diff = change
                        .get("diff")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let (additions, deletions) = summarize_diff_counts(diff);
                    Some(TimelineFileChange {
                        path,
                        status: patch_change_status(change),
                        additions,
                        deletions,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn patch_change_status(change: &Value) -> String {
    match change
        .get("kind")
        .and_then(|kind| kind.get("type"))
        .and_then(Value::as_str)
    {
        Some("add") => "A".to_string(),
        Some("delete") => "D".to_string(),
        _ => "M".to_string(),
    }
}

fn summarize_diff_counts(diff: &str) -> (usize, usize) {
    let mut additions = 0usize;
    let mut deletions = 0usize;

    for line in diff.lines() {
        if line.starts_with('+') && !line.starts_with("+++") {
            additions += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            deletions += 1;
        }
    }

    (additions, deletions)
}

fn summarize_user_message_text(content: Option<&Value>) -> String {
    content
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    match item.get("type").and_then(Value::as_str).unwrap_or_default() {
                        "text" => Some(
                            item.get("text")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                        ),
                        _ => None,
                    }
                })
                .filter(|value| !value.trim().is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

fn summarize_user_attachments(content: Option<&Value>) -> Vec<TimelineAttachment> {
    content
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    match item.get("type").and_then(Value::as_str).unwrap_or_default() {
                        "localImage" => Some(TimelineAttachment {
                            kind: "localImage".to_string(),
                            path: item.get("path").and_then(Value::as_str).map(str::to_string),
                        }),
                        "image" => Some(TimelineAttachment {
                            kind: "image".to_string(),
                            path: None,
                        }),
                        _ => None,
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn summarize_json(value: &Value) -> String {
    let redacted = redact_json_value(value);
    match &redacted {
        Value::Null => "null".to_string(),
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::Array(_) | Value::Object(_) => {
            serde_json::to_string_pretty(&redacted).unwrap_or_else(|_| "<invalid json>".to_string())
        }
    }
}

fn sanitize_trace_message(message: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<Value>(message) {
        return summarize_json(&parsed);
    }

    if let Some((prefix, payload)) = split_prefixed_json(message) {
        if let Ok(parsed) = serde_json::from_str::<Value>(payload) {
            return format!("{prefix}: {}", summarize_json(&parsed));
        }
    }

    message.to_string()
}

fn split_prefixed_json(message: &str) -> Option<(&str, &str)> {
    let (prefix, payload) = message.split_once(": ")?;
    let trimmed_payload = payload.trim_start();
    if trimmed_payload.starts_with('{') || trimmed_payload.starts_with('[') {
        return Some((prefix, trimmed_payload));
    }
    None
}

fn redact_json_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut redacted_map = serde_json::Map::with_capacity(map.len());
            for (key, item) in map {
                if is_sensitive_key(key) {
                    redacted_map.insert(key.clone(), Value::String("[REDACTED]".to_string()));
                } else {
                    redacted_map.insert(key.clone(), redact_json_value(item));
                }
            }
            Value::Object(redacted_map)
        }
        Value::Array(items) => Value::Array(items.iter().map(redact_json_value).collect()),
        _ => value.clone(),
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase().replace('-', "_");
    let collapsed = normalized.replace('_', "");
    matches!(
        normalized.as_str(),
        "authorization"
            | "proxy_authorization"
            | "api_key"
            | "apikey"
            | "openai_api_key"
            | "access_token"
            | "refresh_token"
            | "id_token"
            | "session_token"
            | "password"
            | "secret"
            | "cookie"
            | "set_cookie"
            | "x_api_key"
    ) || matches!(
        collapsed.as_str(),
        "accesstoken" | "refreshtoken" | "idtoken" | "sessiontoken" | "authtoken"
    )
        || normalized.ends_with("_token")
        || normalized.ends_with("_secret")
        || normalized.ends_with("_password")
        || normalized.ends_with("_api_key")
}

fn push_capped(target: &mut String, delta: &str) {
    target.push_str(delta);
    if target.len() > OUTPUT_CAP {
        let overflow = target.len() - OUTPUT_CAP;
        target.drain(..overflow);
    }
}

fn truncate_with_notice(mut value: String, cap: usize) -> String {
    if value.len() <= cap {
        return value;
    }

    let notice = "\n…\n[truncated]";
    let available = cap.saturating_sub(notice.len());
    value.truncate(available);
    value.push_str(notice);
    value
}

fn cap_timeline_entries(entries: &mut Vec<TimelineEntry>, cap: usize) {
    if entries.len() <= cap {
        return;
    }

    let overflow = entries.len() - cap;
    entries.drain(..overflow);
}

fn cap_approval_entries(entries: &mut Vec<ApprovalEntry>, cap: usize) {
    if entries.len() <= cap {
        return;
    }

    entries.truncate(cap);
}

fn rebuild_active_item_index(
    timeline: &[TimelineEntry],
    active_item_index: &mut HashMap<String, usize>,
) {
    active_item_index.clear();
    for (index, entry) in timeline.iter().enumerate() {
        active_item_index.insert(entry.id.clone(), index);
    }
}

fn should_publish_stream_snapshot(
    last_publish_at: Option<Instant>,
    now: Instant,
    interval: Duration,
) -> bool {
    match last_publish_at {
        None => true,
        Some(previous) => now.duration_since(previous) >= interval,
    }
}

fn build_turn_input(prompt: &str, attachments: &[UserInputItem]) -> Value {
    let mut input = Vec::new();

    if !prompt.trim().is_empty() {
        input.push(json!({
            "type": "text",
            "text": prompt,
            "text_elements": [],
        }));
    }

    for attachment in attachments {
        match attachment {
            UserInputItem::Text {
                text,
                text_elements,
            } => {
                if !text.trim().is_empty() {
                    input.push(json!({
                        "type": "text",
                        "text": text,
                        "text_elements": text_elements,
                    }));
                }
            }
            UserInputItem::LocalImage { path } => {
                input.push(json!({
                    "type": "localImage",
                    "path": path,
                }));
            }
        }
    }

    Value::Array(input)
}

fn build_thread_start_payload(cwd: &str, config: &ThreadConfigOverride) -> Value {
    let mut payload = json!({
        "cwd": cwd,
        "approvalPolicy": "on-request",
        "sandbox": "workspace-write",
        "experimentalRawEvents": false,
        "persistExtendedHistory": false,
    });

    if let Some(model) = config.model.as_ref() {
        payload["model"] = Value::String(model.clone());
    }
    if let Some(approval_policy) = config.approval_policy.as_ref() {
        payload["approvalPolicy"] = Value::String(approval_policy.clone());
    }
    if let Some(sandbox_mode) = config.sandbox_mode.as_ref() {
        payload["sandbox"] = Value::String(sandbox_mode.clone());
    }

    payload
}

fn build_thread_resume_payload(
    thread_id: &str,
    config: &ThreadConfigOverride,
    persist_extended_history: bool,
) -> Value {
    let mut payload = json!({
        "threadId": thread_id,
        "persistExtendedHistory": persist_extended_history,
    });

    if let Some(cwd) = config.cwd.as_ref() {
        payload["cwd"] = Value::String(cwd.clone());
    }
    if let Some(model) = config.model.as_ref() {
        payload["model"] = Value::String(model.clone());
    }
    if let Some(approval_policy) = config.approval_policy.as_ref() {
        payload["approvalPolicy"] = Value::String(approval_policy.clone());
    }
    if let Some(sandbox_mode) = config.sandbox_mode.as_ref() {
        payload["sandbox"] = Value::String(sandbox_mode.clone());
    }

    payload
}

fn build_turn_start_payload(
    thread_id: &str,
    prompt: &str,
    attachments: &[UserInputItem],
    config: &ThreadConfigOverride,
) -> Value {
    let mut payload = json!({
        "threadId": thread_id,
        "input": build_turn_input(prompt, attachments),
    });

    if let Some(cwd) = config.cwd.as_ref() {
        payload["cwd"] = Value::String(cwd.clone());
    }
    if let Some(model) = config.model.as_ref() {
        payload["model"] = Value::String(model.clone());
    }
    if let Some(effort) = config.reasoning_effort.as_ref() {
        payload["effort"] = Value::String(effort.clone());
    }

    payload
}

fn build_turn_steer_payload(
    thread_id: &str,
    turn_id: &str,
    prompt: &str,
    attachments: &[UserInputItem],
    config: &ThreadConfigOverride,
) -> Value {
    let mut payload = json!({
        "threadId": thread_id,
        "turnId": turn_id,
        "input": build_turn_input(prompt, attachments),
    });

    if let Some(cwd) = config.cwd.as_ref() {
        payload["cwd"] = Value::String(cwd.clone());
    }
    if let Some(model) = config.model.as_ref() {
        payload["model"] = Value::String(model.clone());
    }
    if let Some(effort) = config.reasoning_effort.as_ref() {
        payload["effort"] = Value::String(effort.clone());
    }

    payload
}

fn build_turn_interrupt_payload(thread_id: &str, turn_id: &str) -> Value {
    json!({
        "threadId": thread_id,
        "turnId": turn_id,
    })
}

fn map_command_decision(decision: &str) -> Value {
    match decision {
        "acceptForSession" => Value::String("acceptForSession".to_string()),
        "decline" => Value::String("decline".to_string()),
        "cancel" => Value::String("cancel".to_string()),
        _ => Value::String("accept".to_string()),
    }
}

fn map_file_change_decision(decision: &str) -> Value {
    match decision {
        "acceptForSession" => Value::String("acceptForSession".to_string()),
        "cancel" => Value::String("cancel".to_string()),
        "decline" => Value::String("decline".to_string()),
        _ => Value::String("accept".to_string()),
    }
}

fn map_legacy_review_decision(decision: &str) -> Value {
    match decision {
        "approved_for_session" => Value::String("approved_for_session".to_string()),
        "abort" => Value::String("abort".to_string()),
        "denied" => Value::String("denied".to_string()),
        _ => Value::String("approved".to_string()),
    }
}

fn map_generic_approval_decision(decision: &str) -> Value {
    match decision {
        "acceptForSession" => Value::String("acceptForSession".to_string()),
        "decline" => Value::String("decline".to_string()),
        "cancel" => Value::String("cancel".to_string()),
        _ => Value::String("accept".to_string()),
    }
}

fn build_approval_entry(request_id: &str, method: &str, params: &Value) -> ApprovalEntry {
    match method {
        "item/commandExecution/requestApproval" => ApprovalEntry {
            request_id: request_id.to_string(),
            thread_id: approval_thread_id(method, params),
            kind: "command".to_string(),
            title: "Command approval requested".to_string(),
            body: format!(
                "{}\n{}",
                params
                    .get("command")
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown command"),
                params
                    .get("cwd")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            ),
            available_decisions: vec!["accept".to_string(), "decline".to_string()],
            status: "pending".to_string(),
        },
        "item/fileChange/requestApproval" => ApprovalEntry {
            request_id: request_id.to_string(),
            thread_id: approval_thread_id(method, params),
            kind: "file-change".to_string(),
            title: "File change approval requested".to_string(),
            body: params
                .get("reason")
                .and_then(Value::as_str)
                .unwrap_or("Approve file changes")
                .to_string(),
            available_decisions: vec!["accept".to_string(), "decline".to_string()],
            status: "pending".to_string(),
        },
        method if method.contains("network") && method.contains("requestApproval") => {
            ApprovalEntry {
                request_id: request_id.to_string(),
                thread_id: approval_thread_id(method, params),
                kind: "network".to_string(),
                title: "Network approval requested".to_string(),
                body: format_approval_body(params, &["url", "host", "method", "reason"]),
                available_decisions: vec![
                    "accept".to_string(),
                    "decline".to_string(),
                    "cancel".to_string(),
                ],
                status: "pending".to_string(),
            }
        }
        method if method.contains("userInput") && method.contains("requestApproval") => {
            ApprovalEntry {
                request_id: request_id.to_string(),
                thread_id: approval_thread_id(method, params),
                kind: "user-input".to_string(),
                title: "User input approval requested".to_string(),
                body: format_approval_body(
                    params,
                    &["title", "prompt", "description", "reason", "context"],
                ),
                available_decisions: vec![
                    "accept".to_string(),
                    "decline".to_string(),
                    "cancel".to_string(),
                ],
                status: "pending".to_string(),
            }
        }
        method if method.contains("permission") && method.contains("requestApproval") => {
            ApprovalEntry {
                request_id: request_id.to_string(),
                thread_id: approval_thread_id(method, params),
                kind: "permission".to_string(),
                title: "Permission approval requested".to_string(),
                body: format_approval_body(
                    params,
                    &["kind", "path", "pattern", "reason", "description"],
                ),
                available_decisions: vec![
                    "accept".to_string(),
                    "decline".to_string(),
                    "cancel".to_string(),
                ],
                status: "pending".to_string(),
            }
        }
        method if method.contains("requestApproval") => ApprovalEntry {
            request_id: request_id.to_string(),
            thread_id: approval_thread_id(method, params),
            kind: "approval".to_string(),
            title: "Approval requested".to_string(),
            body: summarize_json(params),
            available_decisions: vec![
                "accept".to_string(),
                "decline".to_string(),
                "cancel".to_string(),
            ],
            status: "pending".to_string(),
        },
        "execCommandApproval" => ApprovalEntry {
            request_id: request_id.to_string(),
            thread_id: approval_thread_id(method, params),
            kind: "command".to_string(),
            title: "Legacy command approval requested".to_string(),
            body: summarize_json(params),
            available_decisions: vec!["approved".to_string(), "denied".to_string()],
            status: "pending".to_string(),
        },
        "applyPatchApproval" => ApprovalEntry {
            request_id: request_id.to_string(),
            thread_id: approval_thread_id(method, params),
            kind: "patch".to_string(),
            title: "Patch approval requested".to_string(),
            body: summarize_json(params),
            available_decisions: vec!["approved".to_string(), "denied".to_string()],
            status: "pending".to_string(),
        },
        other => ApprovalEntry {
            request_id: request_id.to_string(),
            thread_id: approval_thread_id(method, params),
            kind: "unsupported".to_string(),
            title: format!("Unsupported server request: {other}"),
            body: summarize_json(params),
            available_decisions: Vec::new(),
            status: "pending".to_string(),
        },
    }
}

fn approval_thread_id(method: &str, params: &Value) -> String {
    if method == "execCommandApproval" {
        return params
            .get("conversationId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
    }

    params
        .get("threadId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn format_approval_body(params: &Value, keys: &[&str]) -> String {
    let mut rows = Vec::new();
    for key in keys {
        if let Some(value) = params.get(*key) {
            rows.push(format!("{key}: {}", summarize_json(value)));
        }
    }

    if rows.is_empty() {
        summarize_json(params)
    } else {
        rows.join("\n")
    }
}

fn command_execution_metadata(item: &Value) -> Vec<MetadataRow> {
    let mut metadata = vec![
        MetadataRow {
            label: "cwd".to_string(),
            value: item
                .get("cwd")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        },
        MetadataRow {
            label: "exit".to_string(),
            value: item
                .get("exitCode")
                .map(summarize_json)
                .unwrap_or_else(|| "-".to_string()),
        },
    ];

    if let Some(duration) = format_command_duration(item) {
        metadata.push(MetadataRow {
            label: "duration".to_string(),
            value: duration,
        });
    }

    metadata
}

fn format_command_duration(item: &Value) -> Option<String> {
    let milliseconds = item
        .get("durationMs")
        .or_else(|| item.get("duration_ms"))
        .or_else(|| item.get("duration"))
        .and_then(Value::as_f64)?;
    if milliseconds.is_sign_negative() {
        return None;
    }
    Some(format_duration_ms(milliseconds))
}

fn format_duration_ms(milliseconds: f64) -> String {
    if milliseconds < 1_000.0 {
        return format!("{milliseconds:.0}ms");
    }

    let seconds = milliseconds / 1_000.0;
    if seconds < 60.0 {
        return format!("{seconds:.1}s");
    }

    let minutes = (seconds / 60.0).floor();
    let remaining_seconds = seconds - (minutes * 60.0);
    format!("{minutes:.0}m {remaining_seconds:.0}s")
}

#[cfg(test)]
mod tests {
    use super::{
        build_account_snapshot, build_approval_entry, build_thread_resume_payload,
        build_thread_start_payload, build_turn_input, build_turn_interrupt_payload,
        build_turn_start_payload, build_turn_steer_payload, cap_approval_entries,
        cap_timeline_entries, command_execution_metadata, fallback_thread_summary,
        format_approval_body, format_duration_ms, login_notice, map_generic_approval_decision,
        parse_model_option, parse_reasoning_effort_option, parse_reasoning_effort_options,
        push_capped, redact_json_value, sanitize_trace_message,
        saved_account_error_requires_reauth, should_publish_stream_snapshot,
        truncate_with_notice, AccountSnapshot, ApprovalEntry, Controller, MetadataRow,
        SavedAccountView, TimelineEntry, OUTPUT_CAP,
    };
    use crate::account_vault::{InMemorySecretStore, LocalAccountVault};
    use crate::{ReasoningEffortOption, ThreadConfigOverride};
    use kodeks_protocol::ProtocolEvent;
    use serde::Deserialize;
    use serde_json::{json, Value};
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    use tokio::sync::{mpsc, watch};

    #[derive(Deserialize)]
    struct FixtureEvent {
        kind: String,
        id: Option<Value>,
        method: Option<String>,
        params: Option<Value>,
        message: Option<String>,
        code: Option<i32>,
    }

    fn test_storage_dir(name: &str) -> std::path::PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        std::env::temp_dir().join(format!("kodeks-runtime-tests-{name}-{unique}"))
    }

    fn test_controller() -> Controller {
        let (_control_tx, control_rx) = mpsc::unbounded_channel();
        let (snapshot_tx, _snapshot_rx) = watch::channel(super::SessionSnapshot::default());
        Controller::new(control_rx, snapshot_tx, test_storage_dir("default"))
    }

    fn test_controller_with_vault(vault: LocalAccountVault) -> Controller {
        let (_control_tx, control_rx) = mpsc::unbounded_channel();
        let (snapshot_tx, _snapshot_rx) = watch::channel(super::SessionSnapshot::default());
        Controller::with_vault(control_rx, snapshot_tx, vault)
    }

    fn test_secret_vault(name: &str) -> (LocalAccountVault, InMemorySecretStore) {
        let store = InMemorySecretStore::default();
        let vault =
            LocalAccountVault::with_secret_store(test_storage_dir(name), Arc::new(store.clone()));
        (vault, store)
    }

    fn load_protocol_fixture(name: &str) -> Vec<ProtocolEvent> {
        let raw = match name {
            "turn-stream" => include_str!("../tests/fixtures/turn-stream.json"),
            "review-smoke" => include_str!("../tests/fixtures/review-smoke.json"),
            other => panic!("unknown protocol fixture: {other}"),
        };

        serde_json::from_str::<Vec<FixtureEvent>>(raw)
            .expect("fixture should deserialize")
            .into_iter()
            .map(|entry| match entry.kind.as_str() {
                "notification" => ProtocolEvent::Notification {
                    method: entry.method.expect("notification method"),
                    params: entry.params.unwrap_or(Value::Null),
                },
                "stderr" => ProtocolEvent::Stderr(entry.message.unwrap_or_default()),
                "decodeError" => ProtocolEvent::DecodeError(entry.message.unwrap_or_default()),
                "exited" => ProtocolEvent::Exited(entry.code),
                "serverRequest" => ProtocolEvent::ServerRequest {
                    id: entry
                        .id
                        .unwrap_or(Value::String("fixture-request".to_string())),
                    method: entry.method.expect("serverRequest method"),
                    params: entry.params.unwrap_or(Value::Null),
                },
                other => panic!("unsupported fixture event kind: {other}"),
            })
            .collect()
    }

    fn resumed_thread_fixture() -> Value {
        json!({
            "id": "thread-1",
            "cwd": "/repo",
            "status": { "type": "idle" },
            "gitInfo": {
                "repositoryRoot": "/repo",
                "branch": "main"
            },
            "title": "Resume smoke thread",
            "summary": "Smoke scenario",
            "updatedAt": "2026-03-31T20:00:00.000Z",
            "turns": [
                {
                    "id": "turn-0",
                    "items": [
                        {
                            "id": "user-1",
                            "type": "userMessage",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Resume the task"
                                }
                            ]
                        },
                        {
                            "id": "assistant-1",
                            "type": "agentMessage",
                            "phase": "completed",
                            "text": "Resumed successfully"
                        }
                    ]
                }
            ]
        })
    }

    #[test]
    fn redacts_sensitive_json_fields_recursively() {
        let redacted = redact_json_value(&json!({
            "authorization": "Bearer secret",
            "nested": {
                "api_key": "sk-secret",
                "safe": "ok"
            },
            "items": [
                { "refresh_token": "refresh-secret" }
            ]
        }));

        assert_eq!(
            redacted["authorization"],
            Value::String("[REDACTED]".to_string())
        );
        assert_eq!(
            redacted["nested"]["api_key"],
            Value::String("[REDACTED]".to_string())
        );
        assert_eq!(redacted["nested"]["safe"], Value::String("ok".to_string()));
        assert_eq!(
            redacted["items"][0]["refresh_token"],
            Value::String("[REDACTED]".to_string())
        );
    }

    #[test]
    fn sanitizes_prefixed_trace_json_payloads() {
        let sanitized = sanitize_trace_message(
            "account/login/start: {\"type\":\"apiKey\",\"apiKey\":\"sk-secret\"}",
        );

        assert!(sanitized.contains("account/login/start:"));
        assert!(sanitized.contains("[REDACTED]"));
        assert!(!sanitized.contains("sk-secret"));
    }

    #[test]
    fn approval_body_prefers_requested_fields() {
        let body = format_approval_body(
            &json!({
                "url": "https://api.openai.com/v1/models",
                "method": "GET",
                "reason": "Fetch models",
                "ignored": "value"
            }),
            &["url", "method", "reason"],
        );

        assert!(body.contains("url: https://api.openai.com/v1/models"));
        assert!(body.contains("method: GET"));
        assert!(body.contains("reason: Fetch models"));
        assert!(!body.contains("ignored"));
    }

    #[test]
    fn generic_approval_decision_maps_known_values() {
        assert_eq!(
            map_generic_approval_decision("acceptForSession"),
            Value::String("acceptForSession".to_string())
        );
        assert_eq!(
            map_generic_approval_decision("decline"),
            Value::String("decline".to_string())
        );
        assert_eq!(
            map_generic_approval_decision("cancel"),
            Value::String("cancel".to_string())
        );
        assert_eq!(
            map_generic_approval_decision("anything-else"),
            Value::String("accept".to_string())
        );
    }

    #[test]
    fn parses_structured_reasoning_effort_options_from_model_list_payload() {
        let options = parse_reasoning_effort_options(Some(&json!([
            {
                "reasoningEffort": "low",
                "description": "Fast responses with lighter reasoning."
            },
            {
                "reasoningEffort": "xhigh",
                "description": "Extra high reasoning depth for complex tasks."
            }
        ])));

        assert_eq!(
            options,
            vec![
                ReasoningEffortOption {
                    reasoning_effort: "low".to_string(),
                    description: "Fast responses with lighter reasoning.".to_string(),
                },
                ReasoningEffortOption {
                    reasoning_effort: "xhigh".to_string(),
                    description: "Extra high reasoning depth for complex tasks.".to_string(),
                },
            ]
        );
    }

    #[test]
    fn reasoning_effort_option_parser_keeps_legacy_string_and_object_shapes() {
        assert_eq!(
            parse_reasoning_effort_option(&json!("high")),
            Some(ReasoningEffortOption {
                reasoning_effort: "high".to_string(),
                description: String::new(),
            })
        );
        assert_eq!(
            parse_reasoning_effort_option(&json!({
                "id": "medium",
                "description": "Balanced reasoning."
            })),
            Some(ReasoningEffortOption {
                reasoning_effort: "medium".to_string(),
                description: "Balanced reasoning.".to_string(),
            })
        );
    }

    #[test]
    fn account_snapshot_extracts_authenticated_details_and_rate_limits() {
        let previous = AccountSnapshot {
            status: "authorizing".to_string(),
            mode: "unknown".to_string(),
            identity: None,
            plan: None,
            rate_limit_summary: None,
            rate_limits: None,
            active_account_id: None,
            accounts: Vec::new(),
            requires_openai_auth: true,
            login_in_progress: false,
            login_id: None,
            last_login_error: None,
            auth_notice: None,
            auth_url: None,
            auth_code: None,
        };

        let snapshot = build_account_snapshot(
            &previous,
            &json!({
                "requiresOpenaiAuth": true,
                "rateLimit": {
                    "remaining": 42,
                    "resetAt": "2026-04-01T00:00:00Z"
                },
                "account": {
                    "type": "chatgpt",
                    "email": "furkan@example.com",
                    "planType": "pro"
                }
            }),
        );

        assert_eq!(snapshot.status, "authenticated");
        assert_eq!(snapshot.mode, "chatgpt");
        assert_eq!(snapshot.identity.as_deref(), Some("furkan@example.com"));
        assert_eq!(snapshot.plan.as_deref(), Some("pro"));
        assert_eq!(snapshot.active_account_id.as_deref(), Some("furkan@example.com"));
        assert_eq!(snapshot.accounts.len(), 1);
        assert!(snapshot.accounts[0].is_active);
        assert_eq!(snapshot.accounts[0].label, "furkan@example.com");
        assert!(snapshot
            .rate_limit_summary
            .as_deref()
            .unwrap_or_default()
            .contains("\"remaining\": 42"));
        assert_eq!(
            snapshot
                .rate_limits
                .as_ref()
                .and_then(|limits| limits.buckets.first())
                .and_then(|bucket| bucket.remaining),
            Some(42.0)
        );
        assert_eq!(
            snapshot
                .rate_limits
                .as_ref()
                .and_then(|limits| limits.buckets.first())
                .and_then(|bucket| bucket.reset_at.as_deref()),
            Some("2026-04-01T00:00:00Z")
        );
    }

    #[test]
    fn account_snapshot_normalizes_rate_limits_buckets() {
        let previous = AccountSnapshot {
            status: "authorizing".to_string(),
            mode: "unknown".to_string(),
            identity: None,
            plan: None,
            rate_limit_summary: None,
            rate_limits: None,
            active_account_id: None,
            accounts: Vec::new(),
            requires_openai_auth: true,
            login_in_progress: false,
            login_id: None,
            last_login_error: None,
            auth_notice: None,
            auth_url: None,
            auth_code: None,
        };

        let snapshot = build_account_snapshot(
            &previous,
            &json!({
                "rateLimits": {
                    "planType": "pro",
                    "credits": {
                        "hasCredits": true,
                        "unlimited": false,
                        "balance": "$24.50"
                    },
                    "primary": {
                        "remaining": 12,
                        "limit": 50,
                        "usedPercent": 76,
                        "windowDurationMins": 60
                    },
                    "secondary_bucket": {
                        "used": 25,
                        "windowSeconds": 1800
                    }
                },
                "account": {
                    "type": "chatgpt",
                    "email": "furkan@example.com"
                }
            }),
        );

        let limits = snapshot
            .rate_limits
            .as_ref()
            .expect("expected structured limits");
        assert_eq!(snapshot.accounts.len(), 1);
        assert_eq!(snapshot.accounts[0].mode, "chatgpt");
        assert_eq!(limits.plan.as_deref(), Some("pro"));
        assert_eq!(
            limits
                .credits
                .as_ref()
                .and_then(|credits| credits.balance.as_deref()),
            Some("$24.50")
        );
        assert_eq!(
            limits.credits.as_ref().map(|credits| credits.has_credits),
            Some(true)
        );
        assert_eq!(limits.buckets.len(), 2);
        assert_eq!(limits.buckets[0].label, "Primary");
        assert_eq!(limits.buckets[0].remaining, Some(12.0));
        assert_eq!(limits.buckets[0].limit, Some(50.0));
        assert_eq!(limits.buckets[0].used_percent, Some(76.0));
        assert_eq!(limits.buckets[0].window_minutes, Some(60.0));
        assert_eq!(limits.buckets[1].label, "Secondary Bucket");
        assert_eq!(limits.buckets[1].remaining, None);
        assert_eq!(limits.buckets[1].used, Some(25.0));
        assert_eq!(limits.buckets[1].window_minutes, Some(30.0));
    }

    #[test]
    fn account_snapshot_prefers_rate_limits_by_limit_id_when_available() {
        let previous = AccountSnapshot {
            status: "authorizing".to_string(),
            mode: "unknown".to_string(),
            identity: None,
            plan: None,
            rate_limit_summary: None,
            rate_limits: None,
            active_account_id: None,
            accounts: Vec::new(),
            requires_openai_auth: true,
            login_in_progress: false,
            login_id: None,
            last_login_error: None,
            auth_notice: None,
            auth_url: None,
            auth_code: None,
        };

        let snapshot = build_account_snapshot(
            &previous,
            &json!({
                "rateLimits": {
                    "planType": "pro",
                    "primary": {
                        "usedPercent": 76
                    }
                },
                "rateLimitsByLimitId": {
                    "codex": {
                        "planType": "pro",
                        "credits": {
                            "hasCredits": true,
                            "unlimited": false,
                            "balance": "$32.00"
                        },
                        "primary": {
                            "remaining": 18,
                            "windowDurationMins": 60
                        }
                    }
                },
                "account": {
                    "type": "chatgpt",
                    "email": "furkan@example.com"
                }
            }),
        );

        let limits = snapshot
            .rate_limits
            .as_ref()
            .expect("expected structured limits");
        assert_eq!(
            limits
                .credits
                .as_ref()
                .and_then(|credits| credits.balance.as_deref()),
            Some("$32.00")
        );
        assert_eq!(
            limits.buckets.first().and_then(|bucket| bucket.remaining),
            Some(18.0)
        );
    }

    #[test]
    fn account_snapshot_reads_saved_accounts_and_active_account_id() {
        let previous = AccountSnapshot {
            status: "checking".to_string(),
            mode: "unknown".to_string(),
            identity: None,
            plan: None,
            rate_limit_summary: None,
            rate_limits: None,
            active_account_id: None,
            accounts: Vec::new(),
            requires_openai_auth: false,
            login_in_progress: false,
            login_id: None,
            last_login_error: None,
            auth_notice: None,
            auth_url: None,
            auth_code: None,
        };

        let snapshot = build_account_snapshot(
            &previous,
            &json!({
                "activeAccountId": "acct-b",
                "accounts": [
                    {
                        "id": "acct-a",
                        "type": "chatgpt",
                        "email": "first@example.com",
                        "planType": "pro",
                        "state": "connected",
                        "lastUsedAt": 1775782000
                    },
                    {
                        "id": "acct-b",
                        "type": "chatgpt",
                        "email": "second@example.com",
                        "planType": "plus",
                        "state": "connected",
                        "lastUsedAt": 1775783000
                    }
                ]
            }),
        );

        assert_eq!(snapshot.status, "authenticated");
        assert_eq!(snapshot.active_account_id.as_deref(), Some("acct-b"));
        assert_eq!(snapshot.identity.as_deref(), Some("second@example.com"));
        assert_eq!(snapshot.mode, "chatgpt");
        assert_eq!(snapshot.plan.as_deref(), Some("plus"));
        assert_eq!(snapshot.accounts.len(), 2);
        assert_eq!(snapshot.accounts[0].id, "acct-a");
        assert_eq!(snapshot.accounts[1].id, "acct-b");
        assert!(!snapshot.accounts[0].is_active);
        assert!(snapshot.accounts[1].is_active);
        assert_eq!(snapshot.accounts[1].last_used_at, Some(1775783000));
    }

    #[test]
    fn account_snapshot_preserves_login_handoff_hints_while_authorizing() {
        let previous = AccountSnapshot {
            status: "authorizing".to_string(),
            mode: "unknown".to_string(),
            identity: None,
            plan: None,
            rate_limit_summary: None,
            rate_limits: None,
            active_account_id: None,
            accounts: Vec::new(),
            requires_openai_auth: false,
            login_in_progress: true,
            login_id: Some("login-1".to_string()),
            last_login_error: None,
            auth_notice: Some("Open: https://chatgpt.com/login".to_string()),
            auth_url: Some("https://chatgpt.com/login".to_string()),
            auth_code: Some("ABCD-1234".to_string()),
        };

        let snapshot = build_account_snapshot(
            &previous,
            &json!({
                "requiresOpenaiAuth": false,
                "account": null
            }),
        );

        assert_eq!(snapshot.status, "unauthenticated");
        assert!(snapshot.login_in_progress);
        assert_eq!(
            snapshot.auth_url.as_deref(),
            Some("https://chatgpt.com/login")
        );
        assert_eq!(snapshot.login_id.as_deref(), Some("login-1"));
        assert_eq!(snapshot.auth_code.as_deref(), Some("ABCD-1234"));
        assert!(snapshot.rate_limits.is_none());
    }

    #[test]
    fn saved_account_error_classification_stays_conservative() {
        assert!(saved_account_error_requires_reauth(&anyhow::anyhow!(
            "request failed with 401 unauthorized"
        )));
        assert!(saved_account_error_requires_reauth(&anyhow::anyhow!(
            "saved account credentials are unavailable for token refresh"
        )));
        assert!(!saved_account_error_requires_reauth(&anyhow::anyhow!(
            "failed to connect to local codex app-server"
        )));
    }

    #[test]
    fn saved_account_refresh_hints_prefer_previous_account_id() {
        let mut controller = test_controller();
        controller.pending_saved_account_switch_id = Some("acct-pending".to_string());
        controller.snapshot.account.active_account_id = Some("acct-active".to_string());

        let hints = controller.saved_account_refresh_hints(&json!({
            "previousAccountId": "acct-previous"
        }));

        assert_eq!(
            hints,
            vec![
                "acct-previous".to_string(),
                "acct-pending".to_string(),
                "acct-active".to_string()
            ]
        );
    }

    #[test]
    fn saved_account_boot_migration_moves_plaintext_tokens_before_restore() {
        let (vault, store) = test_secret_vault("boot-migration");
        vault
            .seed_legacy_plaintext_account(
                "acct-a",
                "first@example.com",
                Some("plus"),
                "connected",
                "acct-a",
                "legacy-token",
            )
            .expect("seed should succeed");
        let mut controller = test_controller_with_vault(vault);

        let outcomes = controller
            .migrate_saved_account_tokens()
            .expect("migration should succeed");

        assert_eq!(outcomes.len(), 1);
        assert!(outcomes[0].migrated);
        assert_eq!(store.secret("acct-a").as_deref(), Some("legacy-token"));
        assert_eq!(
            controller
                .vault
                .plaintext_access_token_for_test("acct-a")
                .expect("query should succeed"),
            None
        );
        assert_eq!(
            controller
                .vault
                .get_credential("acct-a")
                .expect("credential lookup should succeed")
                .map(|credential| credential.access_token),
            Some("legacy-token".to_string())
        );
    }

    #[tokio::test]
    async fn select_account_without_secure_credential_marks_reauth_required() {
        let (vault, _store) = test_secret_vault("select-missing-secret");
        vault
            .seed_legacy_plaintext_account(
                "acct-a",
                "first@example.com",
                Some("plus"),
                "connected",
                "acct-a",
                "legacy-token",
            )
            .expect("seed should succeed");
        let mut controller = test_controller_with_vault(vault);

        let error = controller
            .select_account("acct-a".to_string())
            .await
            .expect_err("selection should fail without secure credential");

        assert!(error
            .to_string()
            .contains("missing a stored token"));
        assert_eq!(
            controller
                .vault
                .account_state_for_test("acct-a")
                .expect("query should succeed")
                .as_deref(),
            Some("reauth required")
        );
    }

    #[test]
    fn token_refresh_payloads_source_credentials_only_from_secure_storage() {
        let (vault, _store) = test_secret_vault("refresh-payload");
        vault
            .seed_legacy_plaintext_account(
                "acct-a",
                "first@example.com",
                Some("plus"),
                "connected",
                "acct-a",
                "legacy-token",
            )
            .expect("seed should succeed");
        let mut controller = test_controller_with_vault(vault);
        controller.pending_saved_account_switch_id = Some("acct-a".to_string());

        assert!(controller
            .saved_account_refresh_response(&json!({
                "previousAccountId": "acct-a"
            }))
            .expect("refresh lookup should succeed")
            .is_none());

        controller
            .migrate_saved_account_tokens()
            .expect("migration should succeed");

        let payload = controller
            .saved_account_refresh_response(&json!({
                "previousAccountId": "acct-a"
            }))
            .expect("refresh lookup should succeed")
            .expect("secure credential should now be available");

        assert_eq!(payload.account_id, "acct-a");
        assert_eq!(payload.resolved_hint.as_deref(), Some("acct-a"));
        assert_eq!(payload.result["accessToken"], "legacy-token");
        assert_eq!(payload.result["chatgptAccountId"], "acct-a");
        assert_eq!(payload.result["chatgptPlanType"], "plus");
    }

    #[test]
    fn snapshot_matches_account_target_accepts_identity_aliases() {
        let mut controller = test_controller();
        controller.snapshot.account.identity = Some("target@example.com".to_string());
        controller.snapshot.account.accounts = vec![SavedAccountView {
            id: "acct-target".to_string(),
            mode: "chatgpt".to_string(),
            label: "target@example.com".to_string(),
            plan: Some("plus".to_string()),
            state: "connected".to_string(),
            is_active: true,
            last_used_at: None,
        }];

        assert!(controller.snapshot_matches_account_target(
            "acct-target",
            Some("workspace-target"),
            Some("target@example.com"),
        ));
    }

    #[test]
    fn login_start_response_tracks_cancelable_chatgpt_login() {
        let mut controller = test_controller();

        controller.apply_login_start_response(&json!({
            "type": "chatgpt",
            "loginId": "login-42",
            "authUrl": "https://chatgpt.com/auth"
        }));

        assert_eq!(
            controller.snapshot.account.login_id.as_deref(),
            Some("login-42")
        );
        assert_eq!(
            controller.snapshot.account.auth_url.as_deref(),
            Some("https://chatgpt.com/auth")
        );
    }

    #[test]
    fn login_notice_collects_messages_links_and_codes() {
        let notice = login_notice(&json!({
            "message": "Finish login in your browser",
            "verificationUri": "https://chatgpt.com/device",
            "userCode": "ABCD-1234"
        }))
        .expect("notice should exist");

        assert!(notice.contains("Finish login in your browser"));
        assert!(notice.contains("https://chatgpt.com/device"));
        assert!(notice.contains("ABCD-1234"));
    }

    #[test]
    fn builds_network_approval_entries_with_specific_context() {
        let approval = build_approval_entry(
            "req-1",
            "item/networkAccess/requestApproval",
            &json!({
                "threadId": "thread-1",
                "url": "https://api.example.com",
                "method": "GET",
                "reason": "Fetch data"
            }),
        );

        assert_eq!(approval.kind, "network");
        assert_eq!(approval.thread_id, "thread-1");
        assert!(approval.body.contains("url: https://api.example.com"));
        assert_eq!(
            approval.available_decisions,
            vec!["accept", "decline", "cancel"]
        );
    }

    #[test]
    fn builds_permission_approval_entries_with_permission_fields() {
        let approval = build_approval_entry(
            "req-2",
            "item/permission/requestApproval",
            &json!({
                "threadId": "thread-2",
                "kind": "filesystem",
                "path": "/tmp/output.log",
                "reason": "Write logs"
            }),
        );

        assert_eq!(approval.kind, "permission");
        assert_eq!(approval.title, "Permission approval requested");
        assert!(approval.body.contains("kind: filesystem"));
        assert!(approval.body.contains("path: /tmp/output.log"));
    }

    #[test]
    fn builds_user_input_approval_entries_with_prompt_fields() {
        let approval = build_approval_entry(
            "req-3",
            "item/userInput/requestApproval",
            &json!({
                "threadId": "thread-3",
                "title": "Need a value",
                "prompt": "Choose environment",
                "description": "Used for deployment"
            }),
        );

        assert_eq!(approval.kind, "user-input");
        assert!(approval.body.contains("title: Need a value"));
        assert!(approval.body.contains("prompt: Choose environment"));
    }

    #[test]
    fn command_metadata_includes_duration_when_present() {
        let metadata = command_execution_metadata(&json!({
            "cwd": "/tmp/workspace",
            "exitCode": 0,
            "durationMs": 1_250
        }));

        assert_eq!(metadata.len(), 3);
        assert_eq!(metadata[0].label, "cwd");
        assert_eq!(metadata[0].value, "/tmp/workspace");
        assert_eq!(metadata[1].label, "exit");
        assert_eq!(metadata[1].value, "0");
        assert_eq!(metadata[2].label, "duration");
        assert_eq!(metadata[2].value, "1.2s");
    }

    #[test]
    fn duration_formatting_covers_short_and_long_cases() {
        assert_eq!(format_duration_ms(900.0), "900ms");
        assert_eq!(format_duration_ms(1_250.0), "1.2s");
        assert_eq!(format_duration_ms(61_000.0), "1m 1s");
    }

    #[test]
    fn push_capped_keeps_only_the_latest_output_window() {
        let mut output = "a".repeat(OUTPUT_CAP - 4);

        push_capped(&mut output, "bcdefghi");

        assert_eq!(output.len(), OUTPUT_CAP);
        assert!(output.ends_with("bcdefghi"));
        assert_eq!(output.chars().next(), Some('a'));
    }

    #[test]
    fn truncate_with_notice_caps_large_diff_payloads() {
        let truncated = truncate_with_notice("x".repeat(128), 40);

        assert!(truncated.len() <= 40);
        assert!(truncated.ends_with("\n…\n[truncated]"));
    }

    #[test]
    fn cap_timeline_entries_keeps_the_most_recent_entries() {
        let mut entries = (0..5)
            .map(|index| TimelineEntry {
                id: format!("entry-{index}"),
                thread_id: "thread-1".to_string(),
                turn_id: None,
                kind: "system".to_string(),
                title: format!("Entry {index}"),
                body: String::new(),
                status: "completed".to_string(),
                detail: None,
                metadata: Vec::<MetadataRow>::new(),
                file_changes: Vec::new(),
                attachments: Vec::new(),
                turn_elapsed_ms: None,
            })
            .collect::<Vec<_>>();

        cap_timeline_entries(&mut entries, 3);

        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].id, "entry-2");
        assert_eq!(entries[2].id, "entry-4");
    }

    #[test]
    fn cap_approval_entries_keeps_recent_history_window() {
        let mut entries = (0..5)
            .map(|index| ApprovalEntry {
                request_id: format!("req-{index}"),
                thread_id: "thread-1".to_string(),
                kind: "command".to_string(),
                title: format!("Approval {index}"),
                body: String::new(),
                available_decisions: vec!["accept".to_string()],
                status: "pending".to_string(),
            })
            .collect::<Vec<_>>();

        cap_approval_entries(&mut entries, 3);

        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].request_id, "req-0");
        assert_eq!(entries[2].request_id, "req-2");
    }

    #[test]
    fn stream_snapshot_publish_rule_coalesces_rapid_updates() {
        let now = Instant::now();
        let recent = now.checked_sub(Duration::from_millis(10)).unwrap_or(now);
        let older = now.checked_sub(Duration::from_millis(80)).unwrap_or(now);

        assert!(should_publish_stream_snapshot(
            None,
            now,
            Duration::from_millis(40)
        ));
        assert!(!should_publish_stream_snapshot(
            Some(recent),
            now,
            Duration::from_millis(40)
        ));
        assert!(should_publish_stream_snapshot(
            Some(older),
            now,
            Duration::from_millis(40)
        ));
    }

    #[test]
    fn turn_payload_builders_match_expected_shapes() {
        let attachments: Vec<crate::UserInputItem> = Vec::new();

        let input = build_turn_input("hello", &attachments);
        assert_eq!(input[0]["type"], "text");
        assert_eq!(input[0]["text"], "hello");

        let config = ThreadConfigOverride {
            cwd: Some("/tmp/demo".to_string()),
            model: Some("gpt-5".to_string()),
            reasoning_effort: Some("high".to_string()),
            approval_policy: Some("never".to_string()),
            sandbox_mode: Some("danger-full-access".to_string()),
        };

        let thread = build_thread_start_payload("/tmp/demo", &config);
        assert_eq!(thread["approvalPolicy"], "never");
        assert_eq!(thread["sandbox"], "danger-full-access");

        let resumed = build_thread_resume_payload("thread-1", &config, false);
        assert_eq!(resumed["approvalPolicy"], "never");
        assert_eq!(resumed["sandbox"], "danger-full-access");

        let start = build_turn_start_payload("thread-1", "hello", &attachments, &config);
        assert_eq!(start["threadId"], "thread-1");
        assert_eq!(start["input"][0]["text"], "hello");
        assert_eq!(start["model"], "gpt-5");
        assert_eq!(start["effort"], "high");

        let steer = build_turn_steer_payload("thread-1", "turn-9", "adjust", &attachments, &config);
        assert_eq!(steer["threadId"], "thread-1");
        assert_eq!(steer["turnId"], "turn-9");
        assert_eq!(steer["input"][0]["text"], "adjust");
        assert_eq!(steer["cwd"], "/tmp/demo");

        let interrupt = build_turn_interrupt_payload("thread-1", "turn-9");
        assert_eq!(interrupt["threadId"], "thread-1");
        assert_eq!(interrupt["turnId"], "turn-9");
    }

    #[tokio::test]
    async fn protocol_fixture_replay_updates_runtime_snapshot() {
        let mut controller = test_controller();
        controller.snapshot.active_thread_id = Some("thread-1".to_string());

        for event in load_protocol_fixture("turn-stream") {
            controller.handle_protocol_event(event).await;
        }

        assert_eq!(
            controller.snapshot.session.thread_state.as_deref(),
            Some("completed")
        );
        assert_eq!(controller.snapshot.session.active_turn_id, None);
        assert_eq!(controller.snapshot.timeline.len(), 2);
        assert_eq!(controller.snapshot.timeline[0].kind, "assistant");
        assert_eq!(controller.snapshot.timeline[0].body, "Planning update");
        assert_eq!(controller.snapshot.timeline[1].kind, "command");
        assert_eq!(controller.snapshot.timeline[1].status, "completed");
        assert_eq!(
            controller.snapshot.timeline[1].detail.as_deref(),
            Some("running tests\nall green")
        );
        assert_eq!(
            controller.snapshot.timeline[1]
                .metadata
                .iter()
                .find(|row| row.label == "duration")
                .map(|row| row.value.as_str()),
            Some("1.5s")
        );
        assert_eq!(
            controller
                .snapshot
                .active_diff
                .as_ref()
                .map(|diff| diff.turn_id.as_str()),
            Some("turn-1")
        );
    }

    #[tokio::test]
    async fn smoke_review_and_diagnostics_fixture_keeps_core_surfaces_alive() {
        let mut controller = test_controller();
        controller.snapshot.active_thread_id = Some("thread-1".to_string());
        controller.apply_loaded_thread(&resumed_thread_fixture());

        for event in load_protocol_fixture("review-smoke") {
            controller.handle_protocol_event(event).await;
        }

        assert_eq!(
            controller.snapshot.active_thread_id.as_deref(),
            Some("thread-1")
        );
        assert_eq!(controller.snapshot.timeline.len(), 2);
        assert_eq!(controller.snapshot.approvals.len(), 1);
        assert_eq!(controller.snapshot.approvals[0].status, "resolved");
        assert_eq!(controller.snapshot.approvals[0].kind, "permission");
        assert_eq!(controller.snapshot.diagnostics.warnings.len(), 1);
        assert!(controller.snapshot.diagnostics.warnings[0]
            .summary
            .contains("Codex runtime warning"));
        assert_eq!(
            controller
                .snapshot
                .active_diff
                .as_ref()
                .map(|diff| diff.turn_id.as_str()),
            Some("turn-2")
        );
    }

    #[tokio::test]
    async fn approval_requests_pause_and_resolve_cleanly() {
        let mut controller = test_controller();

        controller
            .handle_protocol_event(ProtocolEvent::ServerRequest {
                id: json!("req-approval"),
                method: "item/permission/requestApproval".to_string(),
                params: json!({
                    "threadId": "thread-1",
                    "kind": "filesystem",
                    "path": "/tmp/out.log",
                    "reason": "Write logs"
                }),
            })
            .await;

        assert_eq!(controller.snapshot.approvals.len(), 1);
        assert_eq!(controller.snapshot.approvals[0].status, "pending");
        assert_eq!(controller.snapshot.approvals[0].kind, "permission");
        assert!(controller
            .pending_server_requests
            .contains_key("req-approval"));

        controller
            .handle_protocol_event(ProtocolEvent::Notification {
                method: "serverRequest/resolved".to_string(),
                params: json!({
                    "requestId": "req-approval"
                }),
            })
            .await;

        assert_eq!(controller.snapshot.approvals[0].status, "resolved");
        assert!(!controller
            .pending_server_requests
            .contains_key("req-approval"));
    }

    #[tokio::test]
    async fn smoke_archive_notifications_move_threads_between_sidebar_buckets() {
        let mut controller = test_controller();
        let mut first = fallback_thread_summary("thread-1", "/repo");
        first.preview = "First thread".to_string();
        first.updated_at = 20;
        first.repo = Some("/repo".to_string());
        first.branch = Some("main".to_string());
        first.presence = "cached".to_string();

        let mut second = fallback_thread_summary("thread-2", "/repo");
        second.preview = "Second thread".to_string();
        second.updated_at = 10;
        second.repo = Some("/repo".to_string());
        second.branch = Some("main".to_string());
        second.presence = "preview".to_string();

        controller.snapshot.threads = vec![first, second];
        controller.snapshot.active_thread_id = Some("thread-1".to_string());

        controller
            .handle_protocol_event(ProtocolEvent::Notification {
                method: "thread/archived".to_string(),
                params: json!({
                    "threadId": "thread-1"
                }),
            })
            .await;

        assert_eq!(
            controller
                .snapshot
                .threads
                .iter()
                .map(|thread| thread.id.as_str())
                .collect::<Vec<_>>(),
            vec!["thread-2"]
        );
        assert_eq!(
            controller
                .snapshot
                .archived_threads
                .iter()
                .map(|thread| thread.id.as_str())
                .collect::<Vec<_>>(),
            vec!["thread-1"]
        );
        assert_eq!(
            controller.snapshot.active_thread_id.as_deref(),
            Some("thread-2")
        );
    }

    #[tokio::test]
    async fn smoke_unarchive_notifications_remove_threads_from_archived_cache() {
        let mut controller = test_controller();
        let mut archived = fallback_thread_summary("thread-9", "/repo");
        archived.preview = "Archived thread".to_string();
        controller.snapshot.archived_threads = vec![archived];

        controller
            .handle_protocol_event(ProtocolEvent::Notification {
                method: "thread/unarchived".to_string(),
                params: json!({
                    "threadId": "thread-9"
                }),
            })
            .await;

        assert!(controller.snapshot.archived_threads.is_empty());
    }

    #[test]
    fn smoke_auth_state_is_diagnosable_without_terminal_access() {
        let previous = AccountSnapshot {
            status: "checking".to_string(),
            mode: "unknown".to_string(),
            identity: None,
            plan: None,
            rate_limit_summary: None,
            rate_limits: None,
            active_account_id: None,
            accounts: Vec::new(),
            requires_openai_auth: false,
            login_in_progress: true,
            login_id: Some("login-99".to_string()),
            last_login_error: Some("Login cancelled by provider".to_string()),
            auth_notice: Some("Finish login in your browser".to_string()),
            auth_url: Some("https://chatgpt.com/device".to_string()),
            auth_code: Some("ABCD-1234".to_string()),
        };

        let snapshot = build_account_snapshot(
            &previous,
            &json!({
                "requiresOpenaiAuth": true,
                "account": null
            }),
        );

        assert!(snapshot.login_in_progress);
        assert_eq!(
            snapshot.last_login_error.as_deref(),
            Some("Login cancelled by provider")
        );
        assert_eq!(snapshot.auth_code.as_deref(), Some("ABCD-1234"));
    }

    #[tokio::test]
    async fn failed_login_completion_keeps_error_visible_without_terminal_logs() {
        let mut controller = test_controller();
        controller.snapshot.account.login_in_progress = true;
        controller.snapshot.account.login_id = Some("login-99".to_string());
        controller.snapshot.account.auth_notice = Some("Finish login in your browser".to_string());
        controller.snapshot.account.auth_url = Some("https://chatgpt.com/device".to_string());
        controller.snapshot.account.auth_code = Some("ABCD-1234".to_string());

        controller
            .handle_protocol_event(ProtocolEvent::Notification {
                method: "account/login/completed".to_string(),
                params: json!({
                    "loginId": "login-99",
                    "success": false,
                    "error": "Login cancelled by provider"
                }),
            })
            .await;

        assert!(!controller.snapshot.account.login_in_progress);
        assert_eq!(controller.snapshot.account.login_id, None);
        assert_eq!(
            controller.snapshot.account.last_login_error.as_deref(),
            Some("Login cancelled by provider")
        );
        assert_eq!(controller.snapshot.account.auth_notice, None);
        assert_eq!(controller.snapshot.account.auth_url, None);
        assert_eq!(controller.snapshot.account.auth_code, None);
        assert_eq!(controller.snapshot.account.status, "unauthenticated");
    }

    #[test]
    fn smoke_thread_resume_hydrates_cached_history() {
        let mut controller = test_controller();
        controller.hydrated_threads.insert("thread-1".to_string());
        controller.apply_loaded_thread(&resumed_thread_fixture());

        assert_eq!(
            controller.snapshot.active_thread_id.as_deref(),
            Some("thread-1")
        );
        assert_eq!(controller.snapshot.session.repo.as_deref(), Some("/repo"));
        assert_eq!(controller.snapshot.session.branch.as_deref(), Some("main"));
        assert_eq!(controller.snapshot.timeline.len(), 2);
        assert_eq!(controller.snapshot.timeline[0].kind, "user");
        assert_eq!(controller.snapshot.timeline[1].kind, "assistant");
    }

    #[test]
    fn thread_summary_keeps_last_account_context() {
        let controller = test_controller();
        let summary = controller
            .thread_summary_from_value(&json!({
                "id": "thread-123",
                "preview": "Refactor auth",
                "cwd": "/repo",
                "status": "idle",
                "modelProvider": "openai",
                "updatedAt": 1775780000,
                "lastAccountId": "acct-a",
                "lastAccountLabel": "first@example.com",
                "lastAccountPlan": "pro"
            }))
            .expect("expected thread summary");

        assert_eq!(summary.last_account_id.as_deref(), Some("acct-a"));
        assert_eq!(summary.last_account_label.as_deref(), Some("first@example.com"));
        assert_eq!(summary.last_account_plan.as_deref(), Some("pro"));
    }

    #[tokio::test]
    async fn rate_limit_notifications_update_account_summary() {
        let mut controller = test_controller();

        controller
            .handle_protocol_event(ProtocolEvent::Notification {
                method: "account/rateLimits/updated".to_string(),
                params: json!({
                    "rateLimits": {
                        "planType": "pro",
                        "credits": {
                            "hasCredits": true,
                            "unlimited": false,
                            "balance": "$11.00"
                        },
                        "primary": {
                            "usedPercent": 64,
                            "windowDurationMins": 60
                        }
                    }
                }),
            })
            .await;

        assert_eq!(controller.snapshot.account.plan.as_deref(), Some("pro"));
        assert!(controller
            .snapshot
            .account
            .rate_limit_summary
            .as_deref()
            .unwrap_or_default()
            .contains("\"usedPercent\": 64"));
        assert_eq!(
            controller
                .snapshot
                .account
                .rate_limits
                .as_ref()
                .and_then(|limits| limits.plan.as_deref()),
            Some("pro")
        );
        assert_eq!(
            controller
                .snapshot
                .account
                .rate_limits
                .as_ref()
                .and_then(|limits| limits.credits.as_ref())
                .and_then(|credits| credits.balance.as_deref()),
            Some("$11.00")
        );
        assert_eq!(
            controller
                .snapshot
                .account
                .rate_limits
                .as_ref()
                .and_then(|limits| limits.buckets.first())
                .and_then(|bucket| bucket.used_percent),
            Some(64.0)
        );
    }

    #[tokio::test]
    async fn rate_limit_notifications_ignore_updates_for_other_accounts() {
        let mut controller = test_controller();
        controller.snapshot.account.active_account_id = Some("acct-a".to_string());

        controller
            .handle_protocol_event(ProtocolEvent::Notification {
                method: "account/rateLimits/updated".to_string(),
                params: json!({
                    "accountId": "acct-b",
                    "rateLimits": {
                        "planType": "pro",
                        "primary": {
                            "usedPercent": 64
                        }
                    }
                }),
            })
            .await;

        assert!(controller.snapshot.account.rate_limit_summary.is_none());
        assert!(controller.snapshot.account.rate_limits.is_none());

        controller
            .handle_protocol_event(ProtocolEvent::Notification {
                method: "account/rateLimits/updated".to_string(),
                params: json!({
                    "accountId": "acct-a",
                    "rateLimits": {
                        "planType": "pro",
                        "primary": {
                            "usedPercent": 64
                        }
                    }
                }),
            })
            .await;

        assert_eq!(controller.snapshot.account.plan.as_deref(), Some("pro"));
        assert_eq!(
            controller
                .snapshot
                .account
                .rate_limits
                .as_ref()
                .and_then(|limits| limits.buckets.first())
                .and_then(|bucket| bucket.used_percent),
            Some(64.0)
        );
    }

    #[tokio::test]
    async fn performance_long_session_replay_stays_bounded_and_fast() {
        let mut controller = test_controller();
        controller.snapshot.active_thread_id = Some("thread-1".to_string());

        let started_at = Instant::now();
        for index in 0..1_200 {
            let turn_id = format!("turn-{index}");
            let item_id = format!("assistant-{index}");
            controller
                .handle_protocol_event(ProtocolEvent::Notification {
                    method: "item/started".to_string(),
                    params: json!({
                        "threadId": "thread-1",
                        "turnId": turn_id,
                        "item": {
                            "id": item_id,
                            "type": "agentMessage",
                            "phase": "streaming",
                            "text": "Planning"
                        }
                    }),
                })
                .await;
            controller
                .handle_protocol_event(ProtocolEvent::Notification {
                    method: "item/agentMessage/delta".to_string(),
                    params: json!({
                        "threadId": "thread-1",
                        "itemId": format!("assistant-{index}"),
                        "delta": " detail"
                    }),
                })
                .await;
            controller
                .handle_protocol_event(ProtocolEvent::Notification {
                    method: "turn/diff/updated".to_string(),
                    params: json!({
                        "threadId": "thread-1",
                        "turnId": format!("turn-{index}"),
                        "diff": format!(
                            "diff --git a/file-{index}.rs b/file-{index}.rs\n@@ -1 +1 @@\n-old\n+new\n"
                        )
                    }),
                })
                .await;
        }

        let elapsed = started_at.elapsed();
        assert!(elapsed < Duration::from_secs(2));
        assert!(controller.snapshot.timeline.len() <= super::TIMELINE_CAP);
        assert!(controller
            .snapshot
            .active_diff
            .as_ref()
            .map(|diff| diff.diff.len() <= super::DIFF_CAP)
            .unwrap_or(false));
    }

    #[tokio::test]
    async fn exited_runtime_event_detaches_live_runtime_state() {
        let mut controller = test_controller();
        controller.auto_recovery_attempted_since_ready = true;
        controller.snapshot.session.subscribed_thread_id = Some("thread-1".to_string());
        controller.snapshot.session.active_turn_id = Some("turn-1".to_string());
        controller.snapshot.session.thread_state = Some("inProgress".to_string());
        controller.snapshot.approvals.push(ApprovalEntry {
            request_id: "req-1".to_string(),
            thread_id: "thread-1".to_string(),
            kind: "command".to_string(),
            title: "Approval".to_string(),
            body: String::new(),
            available_decisions: vec!["accept".to_string()],
            status: "pending".to_string(),
        });
        controller.subscribed_thread_id = Some("thread-1".to_string());

        controller
            .handle_protocol_event(ProtocolEvent::Exited(Some(1)))
            .await;

        assert_eq!(controller.snapshot.connection.state, "degraded");
        assert_eq!(controller.snapshot.session.subscribed_thread_id, None);
        assert_eq!(controller.snapshot.session.active_turn_id, None);
        assert_eq!(
            controller.snapshot.session.thread_state.as_deref(),
            Some("degraded")
        );
        assert_eq!(controller.snapshot.approvals[0].status, "stale");
    }

    #[test]
    fn auto_recovery_is_limited_to_one_attempt_per_ready_cycle() {
        let mut controller = test_controller();

        assert!(controller.should_attempt_auto_recovery());
        controller.auto_recovery_attempted_since_ready = true;
        assert!(!controller.should_attempt_auto_recovery());
        controller.auto_recovery_attempted_since_ready = false;
        assert!(controller.should_attempt_auto_recovery());
    }

    #[test]
    fn parse_model_option_keeps_runtime_description() {
        let parsed = parse_model_option(&json!({
            "id": "gpt-5.4",
            "model": "gpt-5.4",
            "displayName": "GPT-5.4",
            "description": "Flagship frontier agentic coding model.",
            "hidden": false,
            "isDefault": true,
            "supportedReasoningEfforts": []
        }))
        .expect("model option should parse");

        assert_eq!(
            parsed.description,
            "Flagship frontier agentic coding model."
        );
    }

    #[test]
    fn parse_model_option_uses_builtin_description_fallback() {
        let parsed = parse_model_option(&json!({
            "id": "gpt-5.4-mini",
            "model": "gpt-5.4-mini",
            "displayName": "GPT-5.4-Mini",
            "hidden": false,
            "isDefault": false,
            "supportedReasoningEfforts": []
        }))
        .expect("model option should parse");

        assert_eq!(parsed.description, "Smaller frontier agentic coding model.");
    }

    #[test]
    fn parse_model_option_leaves_unknown_models_without_description() {
        let parsed = parse_model_option(&json!({
            "id": "custom-model",
            "model": "custom-model",
            "displayName": "Custom Model",
            "hidden": false,
            "isDefault": false,
            "supportedReasoningEfforts": []
        }))
        .expect("model option should parse");

        assert!(parsed.description.is_empty());
    }
}
