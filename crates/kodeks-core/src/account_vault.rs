use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};

use crate::model::SavedAccountView;

const KEYCHAIN_SERVICE: &str = "com.kodeks.chatgpt.saved-account";

#[derive(Debug, Clone)]
pub struct StoredAccount {
    pub id: String,
    pub mode: String,
    pub label: String,
    pub plan: Option<String>,
    pub state: String,
    pub is_active: bool,
    pub last_used_at: Option<i64>,
    pub chatgpt_account_id: String,
}

#[derive(Debug, Clone)]
pub struct StoredAccountCredential {
    pub account: StoredAccount,
    pub access_token: String,
}

#[derive(Debug, Clone)]
pub struct LocalAccountVault {
    db_path: PathBuf,
}

impl LocalAccountVault {
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            db_path: base_dir.join("saved-accounts.sqlite3"),
        }
    }

    pub fn list_accounts(&self) -> Result<Vec<StoredAccount>> {
        self.ensure_schema()?;
        let output = self.sqlite_query(
            "SELECT id, mode, label, COALESCE(plan, ''), state, is_active, COALESCE(last_used_at, ''), COALESCE(chatgpt_account_id, '') FROM saved_accounts ORDER BY COALESCE(last_used_at, 0) DESC, label ASC;",
        )?;

        let mut accounts = Vec::new();
        for line in output.lines().filter(|line| !line.trim().is_empty()) {
            let mut columns = line.split('\t');
            let id = columns.next().unwrap_or_default().to_string();
            let mode = columns.next().unwrap_or("chatgpt").to_string();
            let label = columns.next().unwrap_or_default().to_string();
            let plan = normalize_optional(columns.next());
            let state = columns.next().unwrap_or("connected").to_string();
            let is_active = columns.next().unwrap_or("0") == "1";
            let last_used_at = normalize_optional(columns.next()).and_then(|value| value.parse::<i64>().ok());
            let chatgpt_account_id = columns.next().unwrap_or_default().to_string();
            if id.is_empty() || label.is_empty() || chatgpt_account_id.is_empty() {
                continue;
            }
            accounts.push(StoredAccount {
                id,
                mode,
                label,
                plan,
                state,
                is_active,
                last_used_at,
                chatgpt_account_id,
            });
        }
        Ok(accounts)
    }

    pub fn list_account_views(&self) -> Result<Vec<SavedAccountView>> {
        Ok(self
            .list_accounts()?
            .into_iter()
            .map(|account| SavedAccountView {
                id: account.id,
                mode: account.mode,
                label: account.label,
                plan: account.plan,
                state: account.state,
                is_active: account.is_active,
                last_used_at: account.last_used_at,
            })
            .collect())
    }

    pub fn get_active_account_id(&self) -> Result<Option<String>> {
        self.ensure_schema()?;
        let output =
            self.sqlite_query("SELECT id FROM saved_accounts WHERE is_active = 1 ORDER BY COALESCE(last_used_at, 0) DESC LIMIT 1;")?;
        Ok(output
            .lines()
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string))
    }

    pub fn get_credential(&self, account_id: &str) -> Result<Option<StoredAccountCredential>> {
        let account = self
            .list_accounts()?
            .into_iter()
            .find(|account| account.id == account_id);
        let Some(account) = account else {
            return Ok(None);
        };
        let access_token = if let Some(access_token) = self.read_access_token(account_id)? {
            access_token
        } else if let Some(access_token) = self.read_secret(account_id)? {
            self.write_access_token(account_id, &access_token)?;
            access_token
        } else {
            return Ok(None);
        };
        Ok(Some(StoredAccountCredential {
            account,
            access_token,
        }))
    }

    pub fn resolve_account_id(&self, account_hint: &str) -> Result<Option<String>> {
        let account_hint = account_hint.trim();
        if account_hint.is_empty() {
            return Ok(None);
        }

        Ok(self
            .list_accounts()?
            .into_iter()
            .find(|account| {
                account.id == account_hint
                    || account.chatgpt_account_id == account_hint
                    || account.label == account_hint
            })
            .map(|account| account.id))
    }

    pub fn get_credential_by_hint(
        &self,
        account_hint: &str,
    ) -> Result<Option<StoredAccountCredential>> {
        let Some(account_id) = self.resolve_account_id(account_hint)? else {
            return Ok(None);
        };

        self.get_credential(&account_id)
    }

    pub fn has_account(&self, account_id: &str) -> Result<bool> {
        Ok(self
            .list_accounts()?
            .into_iter()
            .any(|account| account.id == account_id))
    }

    pub fn upsert_chatgpt_account(
        &self,
        id: &str,
        label: &str,
        plan: Option<&str>,
        chatgpt_account_id: &str,
        access_token: &str,
    ) -> Result<()> {
        self.ensure_schema()?;
        let now = now_timestamp();
        let sql = format!(
            "INSERT INTO saved_accounts (id, mode, label, plan, state, chatgpt_account_id, access_token, last_used_at, created_at, updated_at, is_active) \
             VALUES ({id}, 'chatgpt', {label}, {plan}, 'connected', {chatgpt_account_id}, {access_token}, {now}, {now}, {now}, \
                COALESCE((SELECT is_active FROM saved_accounts WHERE id = {id}), 0)) \
             ON CONFLICT(id) DO UPDATE SET \
                mode = 'chatgpt', \
                label = excluded.label, \
                plan = excluded.plan, \
                state = 'connected', \
                chatgpt_account_id = excluded.chatgpt_account_id, \
                access_token = excluded.access_token, \
                last_used_at = excluded.last_used_at, \
                updated_at = excluded.updated_at;",
            id = sql_string(id),
            label = sql_string(label),
            plan = sql_nullable(plan),
            chatgpt_account_id = sql_string(chatgpt_account_id),
            access_token = sql_string(access_token),
            now = now,
        );
        self.sqlite_execute(&sql)?;
        let _ = self.write_secret(id, access_token);
        Ok(())
    }

    pub fn set_active_account(&self, account_id: &str) -> Result<()> {
        self.ensure_schema()?;
        let now = now_timestamp();
        let sql = format!(
            "UPDATE saved_accounts SET is_active = CASE WHEN id = {id} THEN 1 ELSE 0 END, \
             last_used_at = CASE WHEN id = {id} THEN {now} ELSE last_used_at END, \
             updated_at = CASE WHEN id = {id} THEN {now} ELSE updated_at END;",
            id = sql_string(account_id),
            now = now,
        );
        self.sqlite_execute(&sql)
    }

    pub fn mark_state(&self, account_id: &str, state: &str) -> Result<()> {
        self.ensure_schema()?;
        let now = now_timestamp();
        let sql = format!(
            "UPDATE saved_accounts SET state = {state}, updated_at = {now} WHERE id = {id};",
            id = sql_string(account_id),
            state = sql_string(state),
            now = now,
        );
        self.sqlite_execute(&sql)
    }

    pub fn remove_account(&self, account_id: &str) -> Result<()> {
        self.ensure_schema()?;
        let sql = format!(
            "DELETE FROM saved_accounts WHERE id = {id};",
            id = sql_string(account_id),
        );
        self.sqlite_execute(&sql)?;
        let _ = self.delete_secret(account_id);
        Ok(())
    }

    fn ensure_schema(&self) -> Result<()> {
        if let Some(parent) = self.db_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        self.sqlite_execute(
            "CREATE TABLE IF NOT EXISTS saved_accounts (\
                id TEXT PRIMARY KEY NOT NULL,\
                mode TEXT NOT NULL,\
                label TEXT NOT NULL,\
                plan TEXT NULL,\
                state TEXT NOT NULL,\
                chatgpt_account_id TEXT NOT NULL,\
                access_token TEXT NULL,\
                last_used_at INTEGER NULL,\
                created_at INTEGER NOT NULL,\
                updated_at INTEGER NOT NULL,\
                is_active INTEGER NOT NULL DEFAULT 0\
            );",
        )?;

        if !self.table_has_column("saved_accounts", "access_token")? {
            self.sqlite_execute("ALTER TABLE saved_accounts ADD COLUMN access_token TEXT NULL;")?;
        }

        Ok(())
    }

    fn sqlite_execute(&self, sql: &str) -> Result<()> {
        self.run_sqlite(sql).map(|_| ())
    }

    fn sqlite_query(&self, sql: &str) -> Result<String> {
        self.run_sqlite(sql)
    }

    fn table_has_column(&self, table: &str, column: &str) -> Result<bool> {
        let query = format!("PRAGMA table_info({table});");
        let output = self.sqlite_query(&query)?;
        Ok(output.lines().any(|line| {
            let mut fields = line.split('\t');
            let _cid = fields.next();
            matches!(fields.next(), Some(name) if name == column)
        }))
    }

    fn run_sqlite(&self, sql: &str) -> Result<String> {
        let output = Command::new("sqlite3")
            .arg("-noheader")
            .arg("-separator")
            .arg("\t")
            .arg(&self.db_path)
            .arg(sql)
            .output()
            .with_context(|| format!("failed to run sqlite3 for {}", self.db_path.display()))?;
        if !output.status.success() {
            return Err(anyhow!(
                "sqlite3 failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    fn read_access_token(&self, account_id: &str) -> Result<Option<String>> {
        self.ensure_schema()?;
        let sql = format!(
            "SELECT COALESCE(access_token, '') FROM saved_accounts WHERE id = {id} LIMIT 1;",
            id = sql_string(account_id),
        );
        let output = self.sqlite_query(&sql)?;
        Ok(output
            .lines()
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string))
    }

    fn write_access_token(&self, account_id: &str, access_token: &str) -> Result<()> {
        self.ensure_schema()?;
        let now = now_timestamp();
        let sql = format!(
            "UPDATE saved_accounts SET access_token = {access_token}, updated_at = {now} WHERE id = {id};",
            id = sql_string(account_id),
            access_token = sql_string(access_token),
            now = now,
        );
        self.sqlite_execute(&sql)
    }

    fn write_secret(&self, account_id: &str, access_token: &str) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("security")
                .args([
                    "add-generic-password",
                    "-a",
                    account_id,
                    "-s",
                    KEYCHAIN_SERVICE,
                    "-w",
                    access_token,
                    "-U",
                ])
                .output()
                .context("failed to write account token to macOS Keychain")?;
            if !output.status.success() {
                return Err(anyhow!(
                    "failed to store account token: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
            return Ok(());
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = (account_id, access_token);
            Err(anyhow!(
                "saved ChatGPT accounts are only supported on macOS right now"
            ))
        }
    }

    fn read_secret(&self, account_id: &str) -> Result<Option<String>> {
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("security")
                .args([
                    "find-generic-password",
                    "-a",
                    account_id,
                    "-s",
                    KEYCHAIN_SERVICE,
                    "-w",
                ])
                .output()
                .context("failed to read account token from macOS Keychain")?;
            if output.status.success() {
                return Ok(Some(
                    String::from_utf8_lossy(&output.stdout).trim().to_string(),
                ));
            }
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("could not be found") {
                return Ok(None);
            }
            return Err(anyhow!(
                "failed to read account token: {}",
                stderr.trim()
            ));
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = account_id;
            Ok(None)
        }
    }

    fn delete_secret(&self, account_id: &str) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("security")
                .args([
                    "delete-generic-password",
                    "-a",
                    account_id,
                    "-s",
                    KEYCHAIN_SERVICE,
                ])
                .output()
                .context("failed to delete account token from macOS Keychain")?;
            if output.status.success() {
                return Ok(());
            }
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("could not be found") {
                return Ok(());
            }
            return Err(anyhow!(
                "failed to delete account token: {}",
                stderr.trim()
            ));
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = account_id;
            Ok(())
        }
    }
}

fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn sql_nullable(value: Option<&str>) -> String {
    value.map(sql_string).unwrap_or_else(|| "NULL".to_string())
}

fn normalize_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(str::to_string)
}

fn now_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}
