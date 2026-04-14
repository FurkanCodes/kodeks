use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const DEFAULT_COLS: u16 = 120;
const DEFAULT_ROWS: u16 = 32;
const MIN_COLS: u16 = 24;
const MAX_COLS: u16 = 400;
const MIN_ROWS: u16 = 8;
const MAX_ROWS: u16 = 300;
const OUTPUT_CHUNK_SIZE: usize = 8192;

#[derive(Debug, Clone, Serialize)]
pub struct ProjectTerminalSession {
    pub session_id: String,
    pub project_root: String,
    pub shell: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectTerminalOutputEvent {
    pub session_id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectTerminalExitEvent {
    pub session_id: String,
    pub code: Option<u32>,
    pub signal: Option<String>,
    pub reason: Option<String>,
}

struct TerminalSession {
    id: String,
    project_root: String,
    shell: String,
    pid: Option<u32>,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    alive: Arc<AtomicBool>,
}

impl TerminalSession {
    fn snapshot(&self) -> ProjectTerminalSession {
        ProjectTerminalSession {
            session_id: self.id.clone(),
            project_root: self.project_root.clone(),
            shell: self.shell.clone(),
            pid: self.pid,
        }
    }

    fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }

    fn write_all(&mut self, data: &str) -> Result<()> {
        if !self.is_alive() {
            return Err(anyhow!("terminal session has already exited"));
        }
        self.writer
            .write_all(data.as_bytes())
            .context("failed to write to terminal pty")?;
        self.writer
            .flush()
            .context("failed to flush terminal input stream")
    }

    fn resize(&mut self, cols: u16, rows: u16) -> Result<()> {
        self.master
            .resize(PtySize {
                rows: clamp_rows(rows),
                cols: clamp_cols(cols),
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("failed to resize terminal pty")
    }

    fn kill(&mut self) -> Result<()> {
        self.alive.store(false, Ordering::Relaxed);
        self.killer
            .kill()
            .context("failed to terminate terminal process")
    }
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: HashMap<String, TerminalSession>,
    sessions_by_root: HashMap<String, Vec<String>>,
    next_session_index: u64,
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        for session in self.sessions.values_mut() {
            let _ = session.kill();
        }
    }
}

impl TerminalManager {
    pub fn ensure_session(
        &mut self,
        app: &AppHandle,
        project_root: String,
        cols: u16,
        rows: u16,
    ) -> Result<ProjectTerminalSession> {
        let canonical_root = canonical_project_root(&project_root)?;
        self.prune_dead_sessions();

        let existing_session_id = latest_session_id_for_root(
            &self.sessions_by_root,
            &canonical_root,
            |session_id| self.sessions.contains_key(session_id),
        );
        if let Some(existing_session_id) = existing_session_id {
            if let Some(session) = self.sessions.get_mut(&existing_session_id) {
                let _ = session.resize(cols, rows);
                return Ok(session.snapshot());
            }
            self.sessions_by_root.remove(&canonical_root);
        }

        self.spawn_and_insert_session(app, canonical_root, cols, rows)
    }

    pub fn create_session(
        &mut self,
        app: &AppHandle,
        project_root: String,
        cols: u16,
        rows: u16,
    ) -> Result<ProjectTerminalSession> {
        let canonical_root = canonical_project_root(&project_root)?;
        self.prune_dead_sessions();
        self.spawn_and_insert_session(app, canonical_root, cols, rows)
    }

    fn spawn_and_insert_session(
        &mut self,
        app: &AppHandle,
        canonical_root: String,
        cols: u16,
        rows: u16,
    ) -> Result<ProjectTerminalSession> {
        let session_id = self.allocate_session_id();
        let session = spawn_terminal_session(
            app.clone(),
            session_id.clone(),
            canonical_root.clone(),
            cols,
            rows,
        )?;
        let snapshot = session.snapshot();
        self.sessions.insert(session_id.clone(), session);
        self.sessions_by_root
            .entry(canonical_root)
            .or_default()
            .push(session_id);
        Ok(snapshot)
    }

    pub fn write_session(&mut self, session_id: &str, data: &str) -> Result<()> {
        self.prune_dead_sessions();
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| anyhow!("unknown terminal session: {session_id}"))?;
        session.write_all(data)
    }

    pub fn resize_session(&mut self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        self.prune_dead_sessions();
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| anyhow!("unknown terminal session: {session_id}"))?;
        session.resize(cols, rows)
    }

    pub fn kill_session(&mut self, session_id: &str) -> Result<()> {
        self.prune_dead_sessions();
        let mut session = self
            .sessions
            .remove(session_id)
            .ok_or_else(|| anyhow!("unknown terminal session: {session_id}"))?;
        remove_session_id_from_root_index(
            &mut self.sessions_by_root,
            &session.project_root,
            session_id,
        );
        session.kill()
    }

    fn allocate_session_id(&mut self) -> String {
        self.next_session_index += 1;
        format!("term-{}", self.next_session_index)
    }

    fn prune_dead_sessions(&mut self) {
        let dead: Vec<String> = self
            .sessions
            .iter()
            .filter_map(|(session_id, session)| {
                if session.is_alive() {
                    None
                } else {
                    Some(session_id.clone())
                }
            })
            .collect();

        for session_id in dead {
            if let Some(session) = self.sessions.remove(&session_id) {
                remove_session_id_from_root_index(
                    &mut self.sessions_by_root,
                    &session.project_root,
                    &session_id,
                );
            }
        }
    }
}

fn latest_session_id_for_root(
    sessions_by_root: &HashMap<String, Vec<String>>,
    project_root: &str,
    exists: impl Fn(&str) -> bool,
) -> Option<String> {
    sessions_by_root.get(project_root).and_then(|session_ids| {
        session_ids
            .iter()
            .rev()
            .find(|session_id| exists(session_id))
            .cloned()
    })
}

fn remove_session_id_from_root_index(
    sessions_by_root: &mut HashMap<String, Vec<String>>,
    project_root: &str,
    session_id: &str,
) {
    let Some(session_ids) = sessions_by_root.get_mut(project_root) else {
        return;
    };
    session_ids.retain(|candidate| candidate != session_id);
    if session_ids.is_empty() {
        sessions_by_root.remove(project_root);
    }
}

fn spawn_terminal_session(
    app: AppHandle,
    session_id: String,
    project_root: String,
    cols: u16,
    rows: u16,
) -> Result<TerminalSession> {
    let mut last_error: Option<anyhow::Error> = None;

    for shell in shell_candidates() {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: clamp_rows(rows),
                cols: clamp_cols(cols),
                pixel_width: 0,
                pixel_height: 0,
            })
            .with_context(|| format!("failed to allocate pty for shell {shell}"))?;

        let mut command = CommandBuilder::new(&shell);
        command.cwd(PathBuf::from(&project_root));
        command.env("TERM", "xterm-256color");

        let child = match pair.slave.spawn_command(command) {
            Ok(child) => child,
            Err(error) => {
                last_error = Some(error.into());
                continue;
            }
        };
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .context("failed to clone terminal output reader")?;
        let writer = pair
            .master
            .take_writer()
            .context("failed to acquire terminal input writer")?;
        let killer = child.clone_killer();
        let pid = child.process_id();
        let alive = Arc::new(AtomicBool::new(true));

        spawn_terminal_output_stream(app.clone(), session_id.clone(), reader, alive.clone());
        spawn_terminal_waiter(app.clone(), session_id.clone(), child, alive.clone());

        return Ok(TerminalSession {
            id: session_id,
            project_root,
            shell,
            pid,
            writer,
            master: pair.master,
            killer,
            alive,
        });
    }

    let detail = match last_error {
        Some(error) => error.to_string(),
        None => "no shell candidates available".to_string(),
    };
    Err(anyhow!("failed to launch project terminal: {detail}"))
}

fn spawn_terminal_output_stream(
    app: AppHandle,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
    alive: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; OUTPUT_CHUNK_SIZE];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    let chunk = String::from_utf8_lossy(&buffer[..read]).into_owned();
                    if chunk.is_empty() {
                        continue;
                    }
                    let _ = app.emit(
                        "kodeks://terminal-output",
                        ProjectTerminalOutputEvent {
                            session_id: session_id.clone(),
                            chunk,
                        },
                    );
                }
                Err(error) if error.kind() == ErrorKind::Interrupted => continue,
                Err(error) => {
                    if alive.load(Ordering::Relaxed) {
                        let _ = app.emit(
                            "kodeks://terminal-exit",
                            ProjectTerminalExitEvent {
                                session_id: session_id.clone(),
                                code: None,
                                signal: None,
                                reason: Some(format!("terminal output stream failed: {error}")),
                            },
                        );
                    }
                    break;
                }
            }
        }
    });
}

fn spawn_terminal_waiter(
    app: AppHandle,
    session_id: String,
    mut child: Box<dyn Child + Send + Sync>,
    alive: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let payload = match child.wait() {
            Ok(status) => ProjectTerminalExitEvent {
                session_id,
                code: Some(status.exit_code()),
                signal: status.signal().map(str::to_string),
                reason: None,
            },
            Err(error) => ProjectTerminalExitEvent {
                session_id,
                code: None,
                signal: None,
                reason: Some(format!("failed to read terminal exit status: {error}")),
            },
        };

        alive.store(false, Ordering::Relaxed);
        let _ = app.emit("kodeks://terminal-exit", payload);
    });
}

fn canonical_project_root(project_root: &str) -> Result<String> {
    let canonical = PathBuf::from(project_root)
        .canonicalize()
        .with_context(|| format!("failed to resolve project root {project_root}"))?;

    if !canonical.is_dir() {
        return Err(anyhow!(
            "project root is not a directory: {}",
            canonical.display()
        ));
    }

    Ok(canonical.to_string_lossy().into_owned())
}

fn shell_candidates() -> Vec<String> {
    let mut candidates = Vec::new();

    if let Some(shell) = std::env::var("SHELL")
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        candidates.push(shell);
    }

    #[cfg(unix)]
    {
        if !candidates.iter().any(|value| value == "/bin/zsh") {
            candidates.push("/bin/zsh".to_string());
        }
        if !candidates.iter().any(|value| value == "/bin/bash") {
            candidates.push("/bin/bash".to_string());
        }
        if !candidates.iter().any(|value| value == "/bin/sh") {
            candidates.push("/bin/sh".to_string());
        }
    }

    #[cfg(windows)]
    {
        if !candidates
            .iter()
            .any(|value| value.eq_ignore_ascii_case("pwsh.exe"))
        {
            candidates.push("pwsh.exe".to_string());
        }
        if !candidates
            .iter()
            .any(|value| value.eq_ignore_ascii_case("powershell.exe"))
        {
            candidates.push("powershell.exe".to_string());
        }
        if !candidates
            .iter()
            .any(|value| value.eq_ignore_ascii_case("cmd.exe"))
        {
            candidates.push("cmd.exe".to_string());
        }
    }

    candidates
}

fn clamp_cols(cols: u16) -> u16 {
    if cols == 0 {
        DEFAULT_COLS
    } else {
        cols.clamp(MIN_COLS, MAX_COLS)
    }
}

fn clamp_rows(rows: u16) -> u16 {
    if rows == 0 {
        DEFAULT_ROWS
    } else {
        rows.clamp(MIN_ROWS, MAX_ROWS)
    }
}

#[cfg(test)]
mod tests {
    use super::{latest_session_id_for_root, remove_session_id_from_root_index};
    use std::collections::HashMap;

    #[test]
    fn latest_session_id_uses_most_recent_live_entry() {
        let mut sessions_by_root = HashMap::<String, Vec<String>>::new();
        sessions_by_root.insert(
            "/work/demo".to_string(),
            vec![
                "term-1".to_string(),
                "term-2".to_string(),
                "term-3".to_string(),
            ],
        );
        let live = vec!["term-1".to_string(), "term-2".to_string()];

        let selected = latest_session_id_for_root(&sessions_by_root, "/work/demo", |session_id| {
            live.iter().any(|candidate| candidate == session_id)
        });

        assert_eq!(selected.as_deref(), Some("term-2"));
    }

    #[test]
    fn remove_session_id_prunes_empty_root_entries() {
        let mut sessions_by_root = HashMap::<String, Vec<String>>::new();
        sessions_by_root.insert("/work/demo".to_string(), vec!["term-9".to_string()]);

        remove_session_id_from_root_index(&mut sessions_by_root, "/work/demo", "term-9");

        assert!(!sessions_by_root.contains_key("/work/demo"));
    }
}
