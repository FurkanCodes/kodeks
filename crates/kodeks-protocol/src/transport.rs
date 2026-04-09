use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::{Context, Result, anyhow};
use serde::Serialize;
use serde_json::{Map, Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, mpsc, oneshot};

pub type RequestIdValue = Value;

#[derive(Debug, Clone)]
pub struct SpawnConfig {
    pub binary_path: PathBuf,
    pub codex_home_override: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct ChildMetadata {
    pub pid: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum ProtocolEvent {
    Outbound(String),
    Notification { method: String, params: Value },
    ServerRequest { id: RequestIdValue, method: String, params: Value },
    Stderr(String),
    DecodeError(String),
    Exited(Option<i32>),
}

#[derive(Debug, Clone)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
}

impl std::fmt::Display for RpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.message, self.code)
    }
}

impl std::error::Error for RpcError {}

#[derive(Clone)]
pub struct AppServerHandle {
    writer_tx: mpsc::UnboundedSender<String>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<std::result::Result<Value, RpcError>>>>>,
    next_id: Arc<AtomicU64>,
}

impl AppServerHandle {
    pub async fn request(&self, method: &str, params: Option<Value>) -> Result<Value> {
        let request_id = format!("kodeks-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let payload = build_request_payload(Some(Value::String(request_id.clone())), method, params)?;
        let serialized = serde_json::to_string(&payload)?;
        let (reply_tx, reply_rx) = oneshot::channel();
        self.pending.lock().await.insert(request_id.clone(), reply_tx);
        self.writer_tx
            .send(serialized)
            .map_err(|_| anyhow!("app-server writer task is closed"))?;

        match reply_rx.await.context("app-server response channel closed")? {
            Ok(result) => Ok(result),
            Err(error) => Err(anyhow!(error)),
        }
    }

    pub fn notify(&self, method: &str, params: Option<Value>) -> Result<()> {
        let payload = build_request_payload(None, method, params)?;
        let serialized = serde_json::to_string(&payload)?;
        self.writer_tx
            .send(serialized)
            .map_err(|_| anyhow!("app-server writer task is closed"))
    }

    pub fn respond<T: Serialize>(&self, id: RequestIdValue, result: T) -> Result<()> {
        let payload = json!({
            "id": id,
            "result": result,
        });
        let serialized = serde_json::to_string(&payload)?;
        self.writer_tx
            .send(serialized)
            .map_err(|_| anyhow!("app-server writer task is closed"))
    }
}

pub fn spawn_app_server(
    config: SpawnConfig,
) -> Result<(AppServerHandle, mpsc::UnboundedReceiver<ProtocolEvent>, ChildMetadata)> {
    let mut command = Command::new(&config.binary_path);
    command
        .arg("app-server")
        .arg("--listen")
        .arg("stdio://")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(codex_home) = &config.codex_home_override {
        command.env("CODEX_HOME", codex_home);
    }

    let mut child = command.spawn().with_context(|| {
        format!(
            "failed to spawn codex app-server from {}",
            config.binary_path.display()
        )
    })?;

    let pid = child.id();
    let stdout = child
        .stdout
        .take()
        .context("app-server stdout pipe unavailable")?;
    let stderr = child
        .stderr
        .take()
        .context("app-server stderr pipe unavailable")?;
    let mut stdin = child
        .stdin
        .take()
        .context("app-server stdin pipe unavailable")?;

    let (writer_tx, mut writer_rx) = mpsc::unbounded_channel::<String>();
    let (event_tx, event_rx) = mpsc::unbounded_channel::<ProtocolEvent>();
    let pending: Arc<Mutex<HashMap<String, oneshot::Sender<std::result::Result<Value, RpcError>>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    {
        let event_tx = event_tx.clone();
        tokio::spawn(async move {
            while let Some(line) = writer_rx.recv().await {
                let _ = event_tx.send(ProtocolEvent::Outbound(line.clone()));
                if stdin.write_all(line.as_bytes()).await.is_err() {
                    break;
                }
                if stdin.write_all(b"\n").await.is_err() {
                    break;
                }
                if stdin.flush().await.is_err() {
                    break;
                }
            }
        });
    }

    {
        let event_tx = event_tx.clone();
        let pending = pending.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        if line.trim().is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<Value>(&line) {
                            Ok(value) => {
                                if let Some(id_value) = value.get("id").cloned() {
                                    if value.get("method").is_some() {
                                        let method = value
                                            .get("method")
                                            .and_then(Value::as_str)
                                            .unwrap_or_default()
                                            .to_string();
                                        let params = value.get("params").cloned().unwrap_or(Value::Null);
                                        let _ = event_tx.send(ProtocolEvent::ServerRequest {
                                            id: id_value,
                                            method,
                                            params,
                                        });
                                    } else {
                                        let key = normalize_request_id(&id_value);
                                        let result = if let Some(error) = value.get("error") {
                                            Err(RpcError {
                                                code: error.get("code").and_then(Value::as_i64).unwrap_or(-1),
                                                message: error
                                                    .get("message")
                                                    .and_then(Value::as_str)
                                                    .unwrap_or("unknown app-server error")
                                                    .to_string(),
                                            })
                                        } else {
                                            Ok(value.get("result").cloned().unwrap_or(Value::Null))
                                        };
                                        if let Some(sender) = pending.lock().await.remove(&key) {
                                            let _ = sender.send(result);
                                        }
                                    }
                                } else if let Some(method) = value.get("method").and_then(Value::as_str) {
                                    let params = value.get("params").cloned().unwrap_or(Value::Null);
                                    let _ = event_tx.send(ProtocolEvent::Notification {
                                        method: method.to_string(),
                                        params,
                                    });
                                } else {
                                    let _ = event_tx.send(ProtocolEvent::DecodeError(format!(
                                        "unrecognized app-server frame: {line}"
                                    )));
                                }
                            }
                            Err(error) => {
                                let _ = event_tx.send(ProtocolEvent::DecodeError(format!(
                                    "failed to decode app-server frame: {error}; raw={line}"
                                )));
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        let _ = event_tx.send(ProtocolEvent::DecodeError(format!(
                            "failed to read app-server stdout: {error}"
                        )));
                        break;
                    }
                }
            }
        });
    }

    {
        let event_tx = event_tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        let _ = event_tx.send(ProtocolEvent::Stderr(line));
                    }
                    Ok(None) => break,
                    Err(error) => {
                        let _ = event_tx.send(ProtocolEvent::Stderr(format!(
                            "failed to read app-server stderr: {error}"
                        )));
                        break;
                    }
                }
            }
        });
    }

    {
        let event_tx = event_tx.clone();
        tokio::spawn(async move {
            let status = child.wait().await.ok();
            let _ = event_tx.send(ProtocolEvent::Exited(status.and_then(|value| value.code())));
        });
    }

    let handle = AppServerHandle {
        writer_tx,
        pending,
        next_id: Arc::new(AtomicU64::new(1)),
    };

    Ok((handle, event_rx, ChildMetadata { pid }))
}

fn build_request_payload(id: Option<Value>, method: &str, params: Option<Value>) -> Result<Value> {
    let mut object = Map::new();
    if let Some(id) = id {
        object.insert("id".to_string(), id);
    }
    object.insert("method".to_string(), Value::String(method.to_string()));
    if let Some(params) = params {
        object.insert("params".to_string(), params);
    }
    Ok(Value::Object(object))
}

pub fn normalize_request_id(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        other => other.to_string(),
    }
}
