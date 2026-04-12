use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::time::timeout;

const READ_TIMEOUT: Duration = Duration::from_secs(5);
const WRITE_TIMEOUT: Duration = Duration::from_secs(20);
const SNAPSHOT_MESSAGE: &str = "kodeks snapshot";
const SNAPSHOT_REF_PREFIX: &str = "refs/kodeks-snapshots";

#[derive(Debug, Clone, Serialize)]
pub struct GitProjectSnapshot {
    pub project_root: String,
    pub repo_root: String,
    pub branch: GitBranchState,
    pub branches: Vec<GitBranchSummary>,
    pub counts: GitChangeCounts,
    pub files: Vec<GitChangeEntry>,
    pub recent_commits: Vec<GitCommitSummary>,
    pub latest_snapshot: Option<GitSafetySnapshot>,
    pub origin_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitBranchState {
    pub current: Option<String>,
    pub default: Option<String>,
    pub upstream: Option<String>,
    pub head_sha: Option<String>,
    pub detached: bool,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitBranchSummary {
    pub name: String,
    pub upstream: Option<String>,
    pub head_sha: Option<String>,
    pub is_current: bool,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitChangeCounts {
    pub staged: usize,
    pub working: usize,
    pub untracked: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitChangeEntry {
    pub path: String,
    pub original_path: Option<String>,
    pub staged_status: Option<GitChangeStatus>,
    pub unstaged_status: Option<GitChangeStatus>,
    pub untracked: bool,
    pub binary: bool,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GitChangeStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    TypeChanged,
    Unmerged,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitCommitSummary {
    pub sha: String,
    pub subject: String,
    pub author: String,
    pub authored_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitSafetySnapshot {
    pub id: String,
    pub created_at: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitMutationResult {
    pub snapshot: GitProjectSnapshot,
    pub summary: String,
    pub branch_name: Option<String>,
    pub commit_sha: Option<String>,
    pub snapshot_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitCommitPromptPayload {
    pub summary: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitDiffTarget {
    Working,
    Staged,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitCommitRequest {
    pub subject: String,
    pub body: Option<String>,
    #[serde(default)]
    pub amend: bool,
}

pub async fn get_git_project(project_root: impl AsRef<Path>) -> Result<Option<GitProjectSnapshot>> {
    let project_root = normalize_path(project_root.as_ref())?;
    let Some(repo_root) = resolve_repo_root(&project_root).await? else {
        return Ok(None);
    };

    build_git_project_snapshot(project_root, repo_root).await.map(Some)
}

pub async fn read_git_file_diff(
    project_root: impl AsRef<Path>,
    path: &str,
    target: GitDiffTarget,
) -> Result<String> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let relative_path = sanitize_relative_path(path)?;
    let absolute_path = repo_root.join(&relative_path);

    match target {
        GitDiffTarget::Staged => {
            let output = run_git(
                &repo_root,
                vec![
                    OsString::from("diff"),
                    OsString::from("--cached"),
                    OsString::from("--no-ext-diff"),
                    OsString::from("--"),
                    OsString::from(relative_path.as_str()),
                ],
                READ_TIMEOUT,
                &[0],
            )
            .await?;
            Ok(output.stdout)
        }
        GitDiffTarget::Working => {
            if absolute_path.exists() && is_untracked_path(&repo_root, &relative_path).await? {
                let null_path = if cfg!(windows) { "NUL" } else { "/dev/null" };
                let output = run_git(
                    &repo_root,
                    vec![
                        OsString::from("diff"),
                        OsString::from("--no-index"),
                        OsString::from("--no-ext-diff"),
                        OsString::from("--"),
                        OsString::from(null_path),
                        absolute_path.as_os_str().to_os_string(),
                    ],
                    READ_TIMEOUT,
                    &[0, 1],
                )
                .await?;
                return Ok(output.stdout);
            }

            let output = run_git(
                &repo_root,
                vec![
                    OsString::from("diff"),
                    OsString::from("--no-ext-diff"),
                    OsString::from("--"),
                    OsString::from(relative_path.as_str()),
                ],
                READ_TIMEOUT,
                &[0],
            )
            .await?;
            Ok(output.stdout)
        }
    }
}

pub async fn stage_git_paths(
    project_root: impl AsRef<Path>,
    paths: Vec<String>,
) -> Result<GitMutationResult> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let sanitized = sanitize_relative_paths(paths)?;
    ensure_non_empty_paths(&sanitized)?;

    let mut args = vec![OsString::from("add"), OsString::from("--")];
    for path in &sanitized {
        args.push(OsString::from(path.as_str()));
    }
    run_git(&repo_root, args, WRITE_TIMEOUT, &[0]).await?;

    let snapshot = build_git_project_snapshot(project_root, repo_root).await?;
    Ok(GitMutationResult {
        snapshot,
        summary: "Staged selected files.".to_string(),
        branch_name: None,
        commit_sha: None,
        snapshot_id: None,
    })
}

pub async fn unstage_git_paths(
    project_root: impl AsRef<Path>,
    paths: Vec<String>,
) -> Result<GitMutationResult> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let sanitized = sanitize_relative_paths(paths)?;
    ensure_non_empty_paths(&sanitized)?;

    let head_exists = head_sha(&repo_root).await?.is_some();
    let mut args = if head_exists {
        vec![
            OsString::from("restore"),
            OsString::from("--staged"),
            OsString::from("--"),
        ]
    } else {
        vec![
            OsString::from("rm"),
            OsString::from("--cached"),
            OsString::from("--ignore-unmatch"),
            OsString::from("--"),
        ]
    };
    for path in &sanitized {
        args.push(OsString::from(path.as_str()));
    }
    run_git(&repo_root, args, WRITE_TIMEOUT, &[0]).await?;

    let snapshot = build_git_project_snapshot(project_root, repo_root).await?;
    Ok(GitMutationResult {
        snapshot,
        summary: "Removed selected files from index.".to_string(),
        branch_name: None,
        commit_sha: None,
        snapshot_id: None,
    })
}

pub async fn create_git_branch(
    project_root: impl AsRef<Path>,
    branch_name: &str,
    checkout: bool,
) -> Result<GitMutationResult> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let branch_name = validate_branch_name(branch_name)?;

    run_git(
        &repo_root,
        vec![
            OsString::from("check-ref-format"),
            OsString::from("--branch"),
            OsString::from(branch_name.as_str()),
        ],
        READ_TIMEOUT,
        &[0],
    )
    .await?;

    if checkout {
        refuse_dirty_checkout(&repo_root).await?;
    }

    run_git(
        &repo_root,
        vec![
            OsString::from("branch"),
            OsString::from(branch_name.as_str()),
        ],
        WRITE_TIMEOUT,
        &[0],
    )
    .await?;

    if checkout {
        run_git(
            &repo_root,
            vec![
                OsString::from("switch"),
                OsString::from(branch_name.as_str()),
            ],
            WRITE_TIMEOUT,
            &[0],
        )
        .await?;
    }

    let snapshot = build_git_project_snapshot(project_root, repo_root).await?;
    Ok(GitMutationResult {
        snapshot,
        summary: if checkout {
            format!("Created and switched to `{branch_name}`.")
        } else {
            format!("Created `{branch_name}`.")
        },
        branch_name: Some(branch_name),
        commit_sha: None,
        snapshot_id: None,
    })
}

pub async fn checkout_git_branch(
    project_root: impl AsRef<Path>,
    branch_name: &str,
) -> Result<GitMutationResult> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let branch_name = validate_branch_name(branch_name)?;

    refuse_dirty_checkout(&repo_root).await?;
    run_git(
        &repo_root,
        vec![
            OsString::from("switch"),
            OsString::from(branch_name.as_str()),
        ],
        WRITE_TIMEOUT,
        &[0],
    )
    .await?;

    let snapshot = build_git_project_snapshot(project_root, repo_root).await?;
    Ok(GitMutationResult {
        snapshot,
        summary: format!("Switched to `{branch_name}`."),
        branch_name: Some(branch_name),
        commit_sha: None,
        snapshot_id: None,
    })
}

pub async fn commit_git_index(
    project_root: impl AsRef<Path>,
    request: GitCommitRequest,
) -> Result<GitMutationResult> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let subject = request.subject.trim();
    if subject.is_empty() {
        return Err(anyhow!("commit subject is required"));
    }

    let snapshot_before = build_git_project_snapshot(project_root.clone(), repo_root.clone()).await?;
    if snapshot_before.counts.staged == 0 {
        return Err(anyhow!("stage files before committing"));
    }

    let mut args = vec![OsString::from("commit"), OsString::from("-m"), OsString::from(subject)];
    if let Some(body) = request.body.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        args.push(OsString::from("-m"));
        args.push(OsString::from(body));
    }
    if request.amend {
        args.push(OsString::from("--amend"));
    }
    run_git(&repo_root, args, WRITE_TIMEOUT, &[0]).await?;

    let commit_sha = head_sha(&repo_root).await?;
    let snapshot = build_git_project_snapshot(project_root, repo_root).await?;
    Ok(GitMutationResult {
        snapshot,
        summary: if request.amend {
            "Amended commit.".to_string()
        } else {
            "Created commit.".to_string()
        },
        branch_name: None,
        commit_sha,
        snapshot_id: None,
    })
}

pub async fn push_git_branch(project_root: impl AsRef<Path>) -> Result<GitMutationResult> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let snapshot_before = build_git_project_snapshot(project_root.clone(), repo_root.clone()).await?;

    if snapshot_before.branch.detached {
        return Err(anyhow!("cannot push detached HEAD"));
    }

    let current_branch = snapshot_before
        .branch
        .current
        .clone()
        .ok_or_else(|| anyhow!("current branch is unavailable"))?;

    let args = if snapshot_before.branch.upstream.is_some() {
        vec![OsString::from("push")]
    } else {
        vec![
            OsString::from("push"),
            OsString::from("-u"),
            OsString::from("origin"),
            OsString::from(current_branch.as_str()),
        ]
    };

    run_git(&repo_root, args, WRITE_TIMEOUT, &[0]).await?;

    let snapshot = build_git_project_snapshot(project_root, repo_root).await?;
    Ok(GitMutationResult {
        snapshot,
        summary: format!("Pushed `{current_branch}`."),
        branch_name: Some(current_branch),
        commit_sha: None,
        snapshot_id: None,
    })
}

pub async fn create_git_snapshot(project_root: impl AsRef<Path>) -> Result<GitMutationResult> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let snapshot_id = create_snapshot_commit(&repo_root).await?;
    let snapshot = build_git_project_snapshot(project_root, repo_root).await?;
    Ok(GitMutationResult {
        snapshot,
        summary: "Captured safety snapshot.".to_string(),
        branch_name: None,
        commit_sha: None,
        snapshot_id: Some(snapshot_id),
    })
}

pub async fn restore_git_snapshot(
    project_root: impl AsRef<Path>,
    snapshot_id: &str,
) -> Result<GitMutationResult> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let snapshot_id = snapshot_id.trim();
    if snapshot_id.is_empty() {
        return Err(anyhow!("snapshot id is required"));
    }

    run_git(
        &repo_root,
        vec![
            OsString::from("restore"),
            OsString::from("--source"),
            OsString::from(snapshot_id),
            OsString::from("--worktree"),
            OsString::from("--"),
            OsString::from("."),
        ],
        WRITE_TIMEOUT,
        &[0],
    )
    .await?;

    let snapshot = build_git_project_snapshot(project_root, repo_root).await?;
    Ok(GitMutationResult {
        snapshot,
        summary: format!("Restored worktree from snapshot `{snapshot_id}`."),
        branch_name: None,
        commit_sha: None,
        snapshot_id: Some(snapshot_id.to_string()),
    })
}

pub async fn build_git_commit_prompt(
    project_root: impl AsRef<Path>,
) -> Result<GitCommitPromptPayload> {
    let project_root = normalize_path(project_root.as_ref())?;
    let repo_root = expect_repo_root(&project_root).await?;
    let snapshot = build_git_project_snapshot(project_root, repo_root.clone()).await?;
    if snapshot.counts.staged == 0 {
        return Err(anyhow!("stage files before asking Kodeks for commit help"));
    }

    let staged_stat = run_git(
        &repo_root,
        vec![
            OsString::from("diff"),
            OsString::from("--cached"),
            OsString::from("--stat"),
            OsString::from("--summary"),
        ],
        READ_TIMEOUT,
        &[0],
    )
    .await?
    .stdout;
    let staged_diff = run_git(
        &repo_root,
        vec![
            OsString::from("diff"),
            OsString::from("--cached"),
            OsString::from("--no-ext-diff"),
        ],
        READ_TIMEOUT,
        &[0],
    )
    .await?
    .stdout;
    let summary = staged_stat.trim().to_string();
    let truncated_diff = truncate_text(staged_diff.trim(), 12_000);
    let prompt = format!(
        "Write 3 commit subject options and 1 optional body for these staged changes.\n\
Use imperative mood. Keep subjects under 72 characters. Mention user-facing impact first.\n\n\
Staged summary:\n{}\n\n\
Staged diff:\n```diff\n{}\n```",
        if summary.is_empty() { "(no staged summary available)" } else { &summary },
        truncated_diff,
    );

    Ok(GitCommitPromptPayload { summary, prompt })
}

async fn build_git_project_snapshot(
    project_root: PathBuf,
    repo_root: PathBuf,
) -> Result<GitProjectSnapshot> {
    let head_sha = head_sha(&repo_root).await?;
    let current_branch = current_branch_name(&repo_root).await?;
    let detached = current_branch.is_none() && head_sha.is_some();
    let upstream = upstream_branch(&repo_root).await?;
    let (ahead, behind) = ahead_behind(&repo_root, upstream.as_deref()).await?;
    let branch_summaries = branch_summaries(&repo_root, current_branch.as_deref()).await?;
    let default_branch = detect_default_branch(&repo_root, &branch_summaries).await?;
    let origin_url = optional_git_value(
        &repo_root,
        vec![
            OsString::from("remote"),
            OsString::from("get-url"),
            OsString::from("origin"),
        ],
        READ_TIMEOUT,
    )
    .await?;

    let mut file_map = BTreeMap::<String, MutableChangeEntry>::new();
    apply_name_status_entries(
        &mut file_map,
        &read_name_status(&repo_root, true).await?,
        true,
    );
    apply_name_status_entries(
        &mut file_map,
        &read_name_status(&repo_root, false).await?,
        false,
    );
    for path in read_untracked(&repo_root).await? {
        file_map
            .entry(path.clone())
            .or_insert_with(|| MutableChangeEntry::new(path))
            .untracked = true;
    }

    let mut staged_stats = read_numstat(&repo_root, true).await?;
    let unstaged_stats = read_numstat(&repo_root, false).await?;
    for (path, stat) in unstaged_stats {
        staged_stats
            .entry(path)
            .and_modify(|current| current.merge(&stat))
            .or_insert(stat);
    }

    let mut files = Vec::with_capacity(file_map.len());
    let mut staged_count = 0usize;
    let mut working_count = 0usize;
    let mut untracked_count = 0usize;

    for (_, mut entry) in file_map {
        if let Some(stat) = staged_stats.get(entry.path.as_str()) {
            entry.additions = stat.additions;
            entry.deletions = stat.deletions;
            entry.binary = stat.binary;
        }
        if entry.staged_status.is_some() {
            staged_count += 1;
        }
        if entry.unstaged_status.is_some() {
            working_count += 1;
        }
        if entry.untracked {
            untracked_count += 1;
            if entry.unstaged_status.is_none() {
                working_count += 1;
            }
        }
        files.push(entry.freeze());
    }

    files.sort_by(|left, right| {
        let left_rank = change_sort_rank(left);
        let right_rank = change_sort_rank(right);
        left_rank
            .cmp(&right_rank)
            .then_with(|| left.path.cmp(&right.path))
    });

    Ok(GitProjectSnapshot {
        project_root: project_root.to_string_lossy().to_string(),
        repo_root: repo_root.to_string_lossy().to_string(),
        branch: GitBranchState {
            current: current_branch.clone(),
            default: default_branch.clone(),
            upstream,
            head_sha,
            detached,
            ahead,
            behind,
        },
        branches: branch_summaries
            .into_iter()
            .map(|branch| GitBranchSummary {
                is_default: default_branch.as_deref() == Some(branch.name.as_str()),
                is_current: current_branch.as_deref() == Some(branch.name.as_str()),
                name: branch.name,
                upstream: branch.upstream,
                head_sha: branch.head_sha,
            })
            .collect(),
        counts: GitChangeCounts {
            staged: staged_count,
            working: working_count,
            untracked: untracked_count,
            total: files.len(),
        },
        files,
        recent_commits: recent_commits(&repo_root).await?,
        latest_snapshot: latest_snapshot(&repo_root).await?,
        origin_url,
    })
}

fn normalize_path(path: &Path) -> Result<PathBuf> {
    path.canonicalize()
        .or_else(|_| Ok(path.to_path_buf()))
        .map(|value| value)
}

async fn expect_repo_root(project_root: &Path) -> Result<PathBuf> {
    resolve_repo_root(project_root)
        .await?
        .context("selected project is not inside a Git repository")
}

async fn resolve_repo_root(project_root: &Path) -> Result<Option<PathBuf>> {
    let output = run_git(
        project_root,
        vec![
            OsString::from("rev-parse"),
            OsString::from("--show-toplevel"),
        ],
        READ_TIMEOUT,
        &[0, 128],
    )
    .await?;
    if output.code == 128 && output.stderr.contains("not a git repository") {
        return Ok(None);
    }
    if output.code != 0 {
        return Err(anyhow!(format_git_error("git rev-parse --show-toplevel", &output)));
    }

    Ok(Some(PathBuf::from(output.stdout.trim())))
}

async fn head_sha(repo_root: &Path) -> Result<Option<String>> {
    optional_git_value(
        repo_root,
        vec![
            OsString::from("rev-parse"),
            OsString::from("HEAD"),
        ],
        READ_TIMEOUT,
    )
    .await
}

async fn current_branch_name(repo_root: &Path) -> Result<Option<String>> {
    optional_git_value(
        repo_root,
        vec![
            OsString::from("branch"),
            OsString::from("--show-current"),
        ],
        READ_TIMEOUT,
    )
    .await
}

async fn upstream_branch(repo_root: &Path) -> Result<Option<String>> {
    optional_git_value(
        repo_root,
        vec![
            OsString::from("rev-parse"),
            OsString::from("--abbrev-ref"),
            OsString::from("--symbolic-full-name"),
            OsString::from("@{upstream}"),
        ],
        READ_TIMEOUT,
    )
    .await
}

async fn ahead_behind(repo_root: &Path, upstream: Option<&str>) -> Result<(usize, usize)> {
    let Some(upstream) = upstream else {
        return Ok((0, 0));
    };

    let output = run_git(
        repo_root,
        vec![
            OsString::from("rev-list"),
            OsString::from("--left-right"),
            OsString::from("--count"),
            OsString::from(format!("HEAD...{upstream}")),
        ],
        READ_TIMEOUT,
        &[0, 128],
    )
    .await?;
    if output.code != 0 {
        return Ok((0, 0));
    }

    let mut parts = output.stdout.split_whitespace();
    let ahead = parts.next().and_then(|value| value.parse::<usize>().ok()).unwrap_or(0);
    let behind = parts.next().and_then(|value| value.parse::<usize>().ok()).unwrap_or(0);
    Ok((ahead, behind))
}

async fn detect_default_branch(
    repo_root: &Path,
    branches: &[MutableBranchSummary],
) -> Result<Option<String>> {
    let remote_head = optional_git_value(
        repo_root,
        vec![
            OsString::from("symbolic-ref"),
            OsString::from("--quiet"),
            OsString::from("--short"),
            OsString::from("refs/remotes/origin/HEAD"),
        ],
        READ_TIMEOUT,
    )
    .await?;
    if let Some(value) = remote_head.as_deref().and_then(|value| value.split('/').next_back()) {
        return Ok(Some(value.to_string()));
    }

    for candidate in ["main", "master"] {
        if branches.iter().any(|branch| branch.name == candidate) {
            return Ok(Some(candidate.to_string()));
        }
    }

    Ok(branches.first().map(|branch| branch.name.clone()))
}

async fn branch_summaries(
    repo_root: &Path,
    current_branch: Option<&str>,
) -> Result<Vec<MutableBranchSummary>> {
    let output = run_git(
        repo_root,
        vec![
            OsString::from("for-each-ref"),
            OsString::from("--format=%(refname:short)\t%(upstream:short)\t%(objectname)"),
            OsString::from("refs/heads"),
        ],
        READ_TIMEOUT,
        &[0],
    )
    .await?;

    let mut branches: Vec<_> = output
        .stdout
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\t');
            let name = fields.next()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            let upstream = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let head_sha = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            Some(MutableBranchSummary {
                name,
                upstream,
                head_sha,
            })
        })
        .collect();

    branches.sort_by(|left, right| {
        let left_current = current_branch == Some(left.name.as_str());
        let right_current = current_branch == Some(right.name.as_str());
        right_current
            .cmp(&left_current)
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(branches)
}

async fn recent_commits(repo_root: &Path) -> Result<Vec<GitCommitSummary>> {
    let output = run_git(
        repo_root,
        vec![
            OsString::from("log"),
            OsString::from("--format=%H%x1f%s%x1f%an%x1f%aI"),
            OsString::from("-n"),
            OsString::from("8"),
        ],
        READ_TIMEOUT,
        &[0, 128],
    )
    .await?;
    if output.code != 0 {
        return Ok(Vec::new());
    }

    Ok(output
        .stdout
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\u{1f}');
            Some(GitCommitSummary {
                sha: fields.next()?.to_string(),
                subject: fields.next()?.to_string(),
                author: fields.next()?.to_string(),
                authored_at: fields.next()?.to_string(),
            })
        })
        .collect())
}

async fn latest_snapshot(repo_root: &Path) -> Result<Option<GitSafetySnapshot>> {
    let output = run_git(
        repo_root,
        vec![
            OsString::from("for-each-ref"),
            OsString::from("--sort=-creatordate"),
            OsString::from("--count=1"),
            OsString::from("--format=%(objectname)\t%(creatordate:iso-strict)"),
            OsString::from(SNAPSHOT_REF_PREFIX),
        ],
        READ_TIMEOUT,
        &[0],
    )
    .await?;

    let Some(line) = output.stdout.lines().next() else {
        return Ok(None);
    };
    let mut fields = line.split('\t');
    let Some(id) = fields.next().map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let created_at = fields.next().unwrap_or_default().trim().to_string();
    Ok(Some(GitSafetySnapshot {
        id: id.to_string(),
        created_at,
        label: SNAPSHOT_MESSAGE.to_string(),
    }))
}

async fn read_name_status(repo_root: &Path, staged: bool) -> Result<Vec<NameStatusEntry>> {
    let mut args = vec![OsString::from("diff")];
    if staged {
        args.push(OsString::from("--cached"));
    }
    args.extend([
        OsString::from("--name-status"),
        OsString::from("-z"),
        OsString::from("--find-renames=0"),
        OsString::from("--no-ext-diff"),
    ]);
    let output = run_git(repo_root, args, READ_TIMEOUT, &[0]).await?;
    parse_name_status_z(&output.stdout)
}

async fn read_untracked(repo_root: &Path) -> Result<Vec<String>> {
    let output = run_git(
        repo_root,
        vec![
            OsString::from("ls-files"),
            OsString::from("--others"),
            OsString::from("--exclude-standard"),
            OsString::from("-z"),
        ],
        READ_TIMEOUT,
        &[0],
    )
    .await?;
    Ok(output
        .stdout
        .split('\0')
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect())
}

async fn read_numstat(repo_root: &Path, staged: bool) -> Result<BTreeMap<String, DiffStat>> {
    let mut args = vec![OsString::from("diff")];
    if staged {
        args.push(OsString::from("--cached"));
    }
    args.extend([
        OsString::from("--numstat"),
        OsString::from("--find-renames=0"),
        OsString::from("--no-ext-diff"),
    ]);
    let output = run_git(repo_root, args, READ_TIMEOUT, &[0]).await?;
    Ok(parse_numstat(&output.stdout))
}

async fn is_untracked_path(repo_root: &Path, relative_path: &str) -> Result<bool> {
    let output = run_git(
        repo_root,
        vec![
            OsString::from("ls-files"),
            OsString::from("--others"),
            OsString::from("--exclude-standard"),
            OsString::from("--"),
            OsString::from(relative_path),
        ],
        READ_TIMEOUT,
        &[0],
    )
    .await?;
    Ok(output.stdout.lines().any(|line| line.trim() == relative_path))
}

async fn optional_git_value(
    repo_root: &Path,
    args: Vec<OsString>,
    timeout_limit: Duration,
) -> Result<Option<String>> {
    let output = run_git(repo_root, args, timeout_limit, &[0, 1, 2, 128]).await?;
    if output.code != 0 {
        return Ok(None);
    }
    let trimmed = output.stdout.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    Ok(Some(trimmed.to_string()))
}

async fn refuse_dirty_checkout(repo_root: &Path) -> Result<()> {
    let snapshot = build_git_project_snapshot(repo_root.to_path_buf(), repo_root.to_path_buf()).await?;
    if snapshot.counts.total > 0 {
        return Err(anyhow!(
            "branch switching is blocked while the worktree has changes; commit, stash, or restore first"
        ));
    }
    Ok(())
}

async fn create_snapshot_commit(repo_root: &Path) -> Result<String> {
    let head_sha = head_sha(repo_root).await?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let process_id = std::process::id();
    let temp_index = std::env::temp_dir().join(format!("kodeks-git-index-{process_id}-{timestamp}"));

    if let Some(head_sha) = head_sha.as_deref() {
        run_git_with_env(
            repo_root,
            vec![
                OsString::from("read-tree"),
                OsString::from(head_sha),
            ],
            WRITE_TIMEOUT,
            &[0],
            &[("GIT_INDEX_FILE", temp_index.as_os_str().to_os_string())],
        )
        .await?;
    }

    run_git_with_env(
        repo_root,
        vec![
            OsString::from("add"),
            OsString::from("-A"),
            OsString::from("--"),
            OsString::from("."),
        ],
        WRITE_TIMEOUT,
        &[0],
        &[("GIT_INDEX_FILE", temp_index.as_os_str().to_os_string())],
    )
    .await?;

    let tree = run_git_with_env(
        repo_root,
        vec![OsString::from("write-tree")],
        WRITE_TIMEOUT,
        &[0],
        &[("GIT_INDEX_FILE", temp_index.as_os_str().to_os_string())],
    )
    .await?
    .stdout
    .trim()
    .to_string();

    let mut commit_tree_args = vec![
        OsString::from("commit-tree"),
        OsString::from(tree.as_str()),
    ];
    if let Some(parent) = head_sha.as_deref() {
        commit_tree_args.push(OsString::from("-p"));
        commit_tree_args.push(OsString::from(parent));
    }
    commit_tree_args.push(OsString::from("-m"));
    commit_tree_args.push(OsString::from(SNAPSHOT_MESSAGE));

    let commit = run_git_with_env(
        repo_root,
        commit_tree_args,
        WRITE_TIMEOUT,
        &[0],
        &[
            ("GIT_INDEX_FILE", temp_index.as_os_str().to_os_string()),
            ("GIT_AUTHOR_NAME", OsString::from("Kodeks Snapshot")),
            ("GIT_AUTHOR_EMAIL", OsString::from("snapshot@kodeks.local")),
            ("GIT_COMMITTER_NAME", OsString::from("Kodeks Snapshot")),
            ("GIT_COMMITTER_EMAIL", OsString::from("snapshot@kodeks.local")),
        ],
    )
    .await?
    .stdout
    .trim()
    .to_string();

    run_git(
        repo_root,
        vec![
            OsString::from("update-ref"),
            OsString::from(format!("{SNAPSHOT_REF_PREFIX}/{timestamp}")),
            OsString::from(commit.as_str()),
        ],
        WRITE_TIMEOUT,
        &[0],
    )
    .await?;

    let _ = tokio::fs::remove_file(&temp_index).await;
    let _ = tokio::fs::remove_file(temp_index.with_extension("lock")).await;
    Ok(commit)
}

fn sanitize_relative_paths(paths: Vec<String>) -> Result<Vec<String>> {
    paths.into_iter()
        .map(|path| sanitize_relative_path(&path))
        .collect()
}

fn sanitize_relative_path(path: &str) -> Result<String> {
    let trimmed = path.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Err(anyhow!("path is required"));
    }
    if trimmed.starts_with('/') || trimmed.split('/').any(|part| part == "..") {
        return Err(anyhow!("path must stay inside repository"));
    }
    Ok(trimmed)
}

fn ensure_non_empty_paths(paths: &[String]) -> Result<()> {
    if paths.is_empty() {
        return Err(anyhow!("at least one path is required"));
    }
    Ok(())
}

fn validate_branch_name(value: &str) -> Result<String> {
    let branch_name = value.trim();
    if branch_name.is_empty() {
        return Err(anyhow!("branch name is required"));
    }
    Ok(branch_name.to_string())
}

fn apply_name_status_entries(
    file_map: &mut BTreeMap<String, MutableChangeEntry>,
    entries: &[NameStatusEntry],
    staged: bool,
) {
    for entry in entries {
        let current = file_map
            .entry(entry.path.clone())
            .or_insert_with(|| MutableChangeEntry::new(entry.path.clone()));
        if staged {
            current.staged_status = Some(entry.status.clone());
        } else {
            current.unstaged_status = Some(entry.status.clone());
        }
        if current.original_path.is_none() {
            current.original_path = entry.original_path.clone();
        }
    }
}

fn parse_name_status_z(raw: &str) -> Result<Vec<NameStatusEntry>> {
    let mut entries = Vec::new();
    let mut parts = raw.split('\0').filter(|value| !value.is_empty()).peekable();
    while let Some(status_or_record) = parts.next() {
        let (status_field, inline_path) = match status_or_record.split_once('\t') {
            Some((status, path)) => (status, Some(path)),
            None => (status_or_record, None),
        };
        let status = parse_change_status(status_field.chars().next().unwrap_or('M'));

        let (path, original_path) = if matches!(status, GitChangeStatus::Renamed) {
            if let Some(path) = inline_path {
                let next_path = parts
                    .next()
                    .ok_or_else(|| anyhow!("missing rename target in git name-status entry"))?;
                (next_path.to_string(), Some(path.to_string()))
            } else {
                let previous_path = parts
                    .next()
                    .ok_or_else(|| anyhow!("missing rename source in git name-status entry"))?;
                let next_path = parts
                    .next()
                    .ok_or_else(|| anyhow!("missing rename target in git name-status entry"))?;
                (next_path.to_string(), Some(previous_path.to_string()))
            }
        } else {
            let path = inline_path
                .map(str::to_string)
                .or_else(|| parts.next().map(str::to_string))
                .ok_or_else(|| anyhow!("missing path in git name-status entry"))?;
            (path, None)
        };
        entries.push(NameStatusEntry {
            path,
            original_path,
            status,
        });
    }
    Ok(entries)
}

fn parse_change_status(value: char) -> GitChangeStatus {
    match value {
        'A' => GitChangeStatus::Added,
        'D' => GitChangeStatus::Deleted,
        'R' => GitChangeStatus::Renamed,
        'T' => GitChangeStatus::TypeChanged,
        'U' => GitChangeStatus::Unmerged,
        _ => GitChangeStatus::Modified,
    }
}

fn parse_numstat(raw: &str) -> BTreeMap<String, DiffStat> {
    let mut stats = BTreeMap::new();
    for line in raw.lines() {
        let mut fields = line.splitn(3, '\t');
        let additions_raw = fields.next().unwrap_or_default();
        let deletions_raw = fields.next().unwrap_or_default();
        let Some(path) = fields.next().map(str::trim).filter(|value| !value.is_empty()) else {
            continue;
        };

        let binary = additions_raw == "-" || deletions_raw == "-";
        let additions = additions_raw.parse::<usize>().unwrap_or(0);
        let deletions = deletions_raw.parse::<usize>().unwrap_or(0);
        stats.insert(
            path.to_string(),
            DiffStat {
                additions,
                deletions,
                binary,
            },
        );
    }
    stats
}

fn truncate_text(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }
    let mut truncated = value[..limit].to_string();
    truncated.push_str("\n...\n[truncated]");
    truncated
}

fn change_sort_rank(entry: &GitChangeEntry) -> (usize, usize, usize) {
    (
        usize::from(entry.staged_status.is_none()),
        usize::from(entry.unstaged_status.is_none() && !entry.untracked),
        usize::from(!entry.untracked),
    )
}

fn format_git_error(command: &str, output: &GitOutput) -> String {
    let stderr = output.stderr.trim();
    if stderr.is_empty() {
        format!("{command} failed with exit code {}", output.code)
    } else {
        format!("{command} failed: {stderr}")
    }
}

async fn run_git(
    cwd: &Path,
    args: Vec<OsString>,
    timeout_limit: Duration,
    allowed_codes: &[i32],
) -> Result<GitOutput> {
    run_git_with_env(cwd, args, timeout_limit, allowed_codes, &[]).await
}

async fn run_git_with_env(
    cwd: &Path,
    args: Vec<OsString>,
    timeout_limit: Duration,
    allowed_codes: &[i32],
    extra_env: &[(&str, OsString)],
) -> Result<GitOutput> {
    let printable_args = args
        .iter()
        .map(|value| value.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(" ");

    let mut command = Command::new("git");
    command
        .current_dir(cwd)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("GIT_OPTIONAL_LOCKS", "0");
    for (key, value) in extra_env {
        command.env(key, value);
    }

    let output = timeout(timeout_limit, command.output())
        .await
        .with_context(|| format!("git command timed out: git {printable_args}"))?
        .with_context(|| format!("failed to run git {printable_args}"))?;
    let code = output.status.code().unwrap_or(-1);
    let git_output = GitOutput {
        code,
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    };
    if !allowed_codes.contains(&code) {
        return Err(anyhow!(format_git_error(
            &format!("git {printable_args}"),
            &git_output,
        )));
    }

    Ok(git_output)
}

#[derive(Debug, Clone)]
struct GitOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

#[derive(Debug, Clone)]
struct NameStatusEntry {
    path: String,
    original_path: Option<String>,
    status: GitChangeStatus,
}

#[derive(Debug, Clone)]
struct MutableBranchSummary {
    name: String,
    upstream: Option<String>,
    head_sha: Option<String>,
}

#[derive(Debug, Clone)]
struct MutableChangeEntry {
    path: String,
    original_path: Option<String>,
    staged_status: Option<GitChangeStatus>,
    unstaged_status: Option<GitChangeStatus>,
    untracked: bool,
    binary: bool,
    additions: usize,
    deletions: usize,
}

impl MutableChangeEntry {
    fn new(path: String) -> Self {
        Self {
            path,
            original_path: None,
            staged_status: None,
            unstaged_status: None,
            untracked: false,
            binary: false,
            additions: 0,
            deletions: 0,
        }
    }

    fn freeze(self) -> GitChangeEntry {
        GitChangeEntry {
            path: self.path,
            original_path: self.original_path,
            staged_status: self.staged_status,
            unstaged_status: self.unstaged_status,
            untracked: self.untracked,
            binary: self.binary,
            additions: self.additions,
            deletions: self.deletions,
        }
    }
}

#[derive(Debug, Clone, Default)]
struct DiffStat {
    additions: usize,
    deletions: usize,
    binary: bool,
}

impl DiffStat {
    fn merge(&mut self, other: &DiffStat) {
        self.additions += other.additions;
        self.deletions += other.deletions;
        self.binary = self.binary || other.binary;
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{GitChangeStatus, create_git_branch, parse_name_status_z, parse_numstat};

    #[test]
    fn parse_name_status_z_reads_basic_entries() {
        let parsed = parse_name_status_z("M\tsrc/App.tsx\0A\tsrc/new.ts\0").expect("name-status should parse");

        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].path, "src/App.tsx");
        assert!(matches!(parsed[0].status, GitChangeStatus::Modified));
        assert!(matches!(parsed[1].status, GitChangeStatus::Added));
    }

    #[test]
    fn parse_name_status_z_reads_split_z_entries() {
        let parsed = parse_name_status_z("M\0src/App.tsx\0A\0src/new.ts\0").expect("split z entries should parse");

        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].path, "src/App.tsx");
        assert!(matches!(parsed[0].status, GitChangeStatus::Modified));
        assert_eq!(parsed[1].path, "src/new.ts");
        assert!(matches!(parsed[1].status, GitChangeStatus::Added));
    }

    #[test]
    fn parse_name_status_z_reads_split_rename_entries() {
        let parsed =
            parse_name_status_z("R100\0src/old.rs\0src/new.rs\0").expect("rename entries should parse");

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].path, "src/new.rs");
        assert_eq!(parsed[0].original_path.as_deref(), Some("src/old.rs"));
        assert!(matches!(parsed[0].status, GitChangeStatus::Renamed));
    }

    #[test]
    fn parse_numstat_marks_binary_rows() {
        let parsed = parse_numstat("12\t3\tsrc/App.tsx\n-\t-\tassets/logo.png\n");

        assert_eq!(parsed["src/App.tsx"].additions, 12);
        assert!(!parsed["src/App.tsx"].binary);
        assert!(parsed["assets/logo.png"].binary);
    }

    #[tokio::test]
    async fn create_git_branch_with_checkout_refuses_dirty_worktree_before_creating_branch() {
        let repo_root = create_temp_repo_path("dirty-checkout-guard");
        fs::create_dir_all(&repo_root).expect("temp repo directory should be created");

        run_test_git(&repo_root, &["init"]);
        run_test_git(&repo_root, &["config", "user.name", "Kodeks Test"]);
        run_test_git(&repo_root, &["config", "user.email", "test@kodeks.local"]);

        fs::write(repo_root.join("notes.txt"), "base\n").expect("seed file should be written");
        run_test_git(&repo_root, &["add", "notes.txt"]);
        run_test_git(&repo_root, &["commit", "-m", "init"]);

        fs::write(repo_root.join("notes.txt"), "base\nlocal change\n")
            .expect("dirty worktree change should be written");

        let error = create_git_branch(&repo_root, "feature/modal", true)
            .await
            .expect_err("dirty worktree should block create-and-checkout");
        assert!(
            error
                .to_string()
                .contains("branch switching is blocked while the worktree has changes"),
            "unexpected error: {error:#}"
        );

        let branch_list = run_test_git_output(&repo_root, &["branch", "--list", "feature/modal"]);
        assert!(
            branch_list.trim().is_empty(),
            "feature branch should not be created when checkout is refused"
        );

        fs::remove_dir_all(&repo_root).expect("temp repo directory should be removed");
    }

    fn create_temp_repo_path(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("kodeks-{label}-{}-{nanos}", std::process::id()))
    }

    fn run_test_git(repo_root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(repo_root)
            .args(args)
            .output()
            .expect("git command should launch");
        assert!(
            output.status.success(),
            "git {:?} failed\nstdout: {}\nstderr: {}",
            args,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn run_test_git_output(repo_root: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .current_dir(repo_root)
            .args(args)
            .output()
            .expect("git command should launch");
        assert!(
            output.status.success(),
            "git {:?} failed\nstdout: {}\nstderr: {}",
            args,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).to_string()
    }
}
