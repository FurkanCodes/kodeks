use std::fmt;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(test)]
use std::collections::{HashMap, HashSet};
#[cfg(test)]
use std::sync::Mutex;

use anyhow::{Context, Result, anyhow};

use crate::model::SavedAccountView;

const KEYCHAIN_SERVICE: &str = "com.kodeks.chatgpt.saved-account";
const REAUTH_REQUIRED_STATE: &str = "reauth required";

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacyTokenMigrationOutcome {
    pub account_id: String,
    pub migrated: bool,
    pub requires_reauth: bool,
    pub error: Option<String>,
}

pub(crate) trait SecretStore: Send + Sync {
    fn write_secret(&self, account_id: &str, access_token: &str) -> Result<()>;
    fn read_secret(&self, account_id: &str) -> Result<Option<String>>;
    fn delete_secret(&self, account_id: &str) -> Result<()>;
}

#[derive(Debug, Clone, Default)]
struct SystemSecretStore;

impl SecretStore for SystemSecretStore {
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
            Ok(())
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
            Err(anyhow!("failed to read account token: {}", stderr.trim()))
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
            Err(anyhow!(
                "failed to delete account token: {}",
                stderr.trim()
            ))
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = account_id;
            Ok(())
        }
    }
}

#[cfg(test)]
#[derive(Debug, Clone, Default)]
pub(crate) struct InMemorySecretStore {
    secrets: Arc<Mutex<HashMap<String, String>>>,
    write_failures: Arc<Mutex<HashSet<String>>>,
}

#[cfg(test)]
impl InMemorySecretStore {
    pub(crate) fn secret(&self, account_id: &str) -> Option<String> {
        self.secrets
            .lock()
            .expect("in-memory secret store lock")
            .get(account_id)
            .cloned()
    }

    pub(crate) fn fail_writes_for(&self, account_id: &str) {
        self.write_failures
            .lock()
            .expect("in-memory secret store lock")
            .insert(account_id.to_string());
    }
}

#[cfg(test)]
impl SecretStore for InMemorySecretStore {
    fn write_secret(&self, account_id: &str, access_token: &str) -> Result<()> {
        if self
            .write_failures
            .lock()
            .expect("in-memory secret store lock")
            .contains(account_id)
        {
            return Err(anyhow!(
                "configured in-memory secret-store failure for {account_id}"
            ));
        }
        self.secrets
            .lock()
            .expect("in-memory secret store lock")
            .insert(account_id.to_string(), access_token.to_string());
        Ok(())
    }

    fn read_secret(&self, account_id: &str) -> Result<Option<String>> {
        Ok(self.secret(account_id))
    }

    fn delete_secret(&self, account_id: &str) -> Result<()> {
        self.secrets
            .lock()
            .expect("in-memory secret store lock")
            .remove(account_id);
        Ok(())
    }
}

#[derive(Clone)]
pub struct LocalAccountVault {
    db_path: PathBuf,
    secret_store: Arc<dyn SecretStore>,
}

impl fmt::Debug for LocalAccountVault {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LocalAccountVault")
            .field("db_path", &self.db_path)
            .finish()
    }
}

impl LocalAccountVault {
    pub fn new(base_dir: PathBuf) -> Self {
        Self::with_secret_store(base_dir, Arc::new(SystemSecretStore))
    }

    pub(crate) fn with_secret_store(
        base_dir: PathBuf,
        secret_store: Arc<dyn SecretStore>,
    ) -> Self {
        Self {
            db_path: base_dir.join("saved-accounts.sqlite3"),
            secret_store,
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
            let last_used_at =
                normalize_optional(columns.next()).and_then(|value| value.parse::<i64>().ok());
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
        let Some(access_token) = self.secret_store.read_secret(account_id)? else {
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
        self.secret_store.write_secret(id, access_token)?;
        let now = now_timestamp();
        let sql = format!(
            "INSERT INTO saved_accounts (id, mode, label, plan, state, chatgpt_account_id, access_token, last_used_at, created_at, updated_at, is_active) \
             VALUES ({id}, 'chatgpt', {label}, {plan}, 'connected', {chatgpt_account_id}, NULL, {now}, {now}, {now}, \
                COALESCE((SELECT is_active FROM saved_accounts WHERE id = {id}), 0)) \
             ON CONFLICT(id) DO UPDATE SET \
                mode = 'chatgpt', \
                label = excluded.label, \
                plan = excluded.plan, \
                state = 'connected', \
                chatgpt_account_id = excluded.chatgpt_account_id, \
                access_token = NULL, \
                last_used_at = excluded.last_used_at, \
                updated_at = excluded.updated_at;",
            id = sql_string(id),
            label = sql_string(label),
            plan = sql_nullable(plan),
            chatgpt_account_id = sql_string(chatgpt_account_id),
            now = now,
        );
        self.sqlite_execute(&sql)
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
        self.secret_store.delete_secret(account_id)?;
        let sql = format!(
            "DELETE FROM saved_accounts WHERE id = {id};",
            id = sql_string(account_id),
        );
        self.sqlite_execute(&sql)
    }

    pub fn migrate_legacy_plaintext_tokens(&self) -> Result<Vec<LegacyTokenMigrationOutcome>> {
        self.ensure_schema()?;
        let mut outcomes = Vec::new();

        for (account_id, access_token) in self.list_legacy_tokens()? {
            let migration_result = self.secret_store.write_secret(&account_id, &access_token);
            let mut error_messages = Vec::new();
            let migrated = migration_result.is_ok();

            if let Err(error) = &migration_result {
                self.mark_state(&account_id, REAUTH_REQUIRED_STATE)?;
                error_messages.push(error.to_string());
            } else {
                self.mark_state(&account_id, "connected")?;
            }

            self.clear_access_token(&account_id)?;

            outcomes.push(LegacyTokenMigrationOutcome {
                account_id,
                migrated,
                requires_reauth: !migrated,
                error: (!error_messages.is_empty()).then(|| error_messages.join("; ")),
            });
        }

        Ok(outcomes)
    }

    #[cfg(test)]
    pub(crate) fn seed_legacy_plaintext_account(
        &self,
        id: &str,
        label: &str,
        plan: Option<&str>,
        state: &str,
        chatgpt_account_id: &str,
        access_token: &str,
    ) -> Result<()> {
        self.ensure_schema()?;
        let now = now_timestamp();
        let sql = format!(
            "INSERT INTO saved_accounts (id, mode, label, plan, state, chatgpt_account_id, access_token, last_used_at, created_at, updated_at, is_active) \
             VALUES ({id}, 'chatgpt', {label}, {plan}, {state}, {chatgpt_account_id}, {access_token}, {now}, {now}, {now}, 1) \
             ON CONFLICT(id) DO UPDATE SET \
                label = excluded.label, \
                plan = excluded.plan, \
                state = excluded.state, \
                chatgpt_account_id = excluded.chatgpt_account_id, \
                access_token = excluded.access_token, \
                last_used_at = excluded.last_used_at, \
                updated_at = excluded.updated_at;",
            id = sql_string(id),
            label = sql_string(label),
            plan = sql_nullable(plan),
            state = sql_string(state),
            chatgpt_account_id = sql_string(chatgpt_account_id),
            access_token = sql_string(access_token),
            now = now,
        );
        self.sqlite_execute(&sql)
    }

    #[cfg(test)]
    pub(crate) fn plaintext_access_token_for_test(&self, account_id: &str) -> Result<Option<String>> {
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

    #[cfg(test)]
    pub(crate) fn account_state_for_test(&self, account_id: &str) -> Result<Option<String>> {
        self.ensure_schema()?;
        let sql = format!(
            "SELECT COALESCE(state, '') FROM saved_accounts WHERE id = {id} LIMIT 1;",
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

    fn list_legacy_tokens(&self) -> Result<Vec<(String, String)>> {
        let output = self.sqlite_query(
            "SELECT id, COALESCE(access_token, '') FROM saved_accounts WHERE COALESCE(access_token, '') != '';",
        )?;
        let mut tokens = Vec::new();
        for line in output.lines().filter(|line| !line.trim().is_empty()) {
            let mut columns = line.split('\t');
            let account_id = columns.next().unwrap_or_default().trim().to_string();
            let access_token = columns.next().unwrap_or_default().trim().to_string();
            if account_id.is_empty() || access_token.is_empty() {
                continue;
            }
            tokens.push((account_id, access_token));
        }
        Ok(tokens)
    }

    fn clear_access_token(&self, account_id: &str) -> Result<()> {
        self.ensure_schema()?;
        let now = now_timestamp();
        let sql = format!(
            "UPDATE saved_accounts SET access_token = NULL, updated_at = {now} WHERE id = {id};",
            id = sql_string(account_id),
            now = now,
        );
        self.sqlite_execute(&sql)
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

#[cfg(test)]
mod tests {
    use super::{InMemorySecretStore, LocalAccountVault};
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_base_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        std::env::temp_dir().join(format!("kodeks-account-vault-{name}-{unique}"))
    }

    fn test_vault(name: &str) -> (LocalAccountVault, InMemorySecretStore) {
        let store = InMemorySecretStore::default();
        let vault = LocalAccountVault::with_secret_store(test_base_dir(name), Arc::new(store.clone()));
        (vault, store)
    }

    #[test]
    fn secure_only_writes_never_persist_sqlite_access_tokens() {
        let (vault, store) = test_vault("secure-only");

        vault
            .upsert_chatgpt_account(
                "acct-a",
                "first@example.com",
                Some("plus"),
                "acct-a",
                "token-a",
            )
            .expect("upsert should succeed");

        let rows = vault
            .sqlite_query(
                "SELECT COALESCE(access_token, '') FROM saved_accounts WHERE id = 'acct-a';",
            )
            .expect("query should succeed");

        assert_eq!(rows.trim(), "");
        assert_eq!(store.secret("acct-a").as_deref(), Some("token-a"));
    }

    #[test]
    fn legacy_plaintext_tokens_are_migrated_into_secure_store() {
        let (vault, store) = test_vault("migrate-success");

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

        let outcomes = vault
            .migrate_legacy_plaintext_tokens()
            .expect("migration should succeed");

        assert_eq!(outcomes.len(), 1);
        assert!(outcomes[0].migrated);
        assert_eq!(store.secret("acct-a").as_deref(), Some("legacy-token"));
        assert_eq!(
            vault.get_credential("acct-a")
                .expect("credential lookup should succeed")
                .map(|credential| credential.access_token),
            Some("legacy-token".to_string())
        );
    }

    #[test]
    fn migration_scrubs_plaintext_tokens_from_sqlite() {
        let (vault, _store) = test_vault("scrub");

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

        vault
            .migrate_legacy_plaintext_tokens()
            .expect("migration should succeed");

        let rows = vault
            .sqlite_query(
                "SELECT COALESCE(access_token, '') FROM saved_accounts WHERE id = 'acct-a';",
            )
            .expect("query should succeed");

        assert_eq!(rows.trim(), "");
    }

    #[test]
    fn failed_legacy_migration_marks_account_for_reauth() {
        let (vault, store) = test_vault("reauth");
        store.fail_writes_for("acct-a");

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

        let outcomes = vault
            .migrate_legacy_plaintext_tokens()
            .expect("migration should succeed");

        assert_eq!(outcomes.len(), 1);
        assert!(outcomes[0].requires_reauth);
        assert_eq!(store.secret("acct-a"), None);

        let state = vault
            .sqlite_query("SELECT state FROM saved_accounts WHERE id = 'acct-a';")
            .expect("query should succeed");
        assert_eq!(state.trim(), "reauth required");
    }

    #[test]
    fn removing_account_deletes_metadata_and_secret() {
        let (vault, store) = test_vault("remove");

        vault
            .upsert_chatgpt_account(
                "acct-a",
                "first@example.com",
                Some("plus"),
                "acct-a",
                "token-a",
            )
            .expect("upsert should succeed");

        vault
            .remove_account("acct-a")
            .expect("remove should succeed");

        assert_eq!(store.secret("acct-a"), None);
        let rows = vault
            .sqlite_query("SELECT COUNT(*) FROM saved_accounts WHERE id = 'acct-a';")
            .expect("query should succeed");
        assert_eq!(rows.trim(), "0");
    }
}
