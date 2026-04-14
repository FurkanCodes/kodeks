import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  CreatePluginScaffoldRequest,
  CreatePluginScaffoldResult,
  CreateSkillScaffoldRequest,
  CreateSkillScaffoldResult,
  InstalledPluginState,
  PluginCatalogPayload,
  PluginDetails,
  SkillCatalogPayload,
  SkillDetails,
  SkillRecord,
} from '../features/catalog/models'
import type { WorkspaceStore } from './workspaceStore'

export type Snapshot = {
  app_name: string
  connection: {
    state: string
    detail: string
    codex_binary?: string | null
    codex_home?: string | null
    pid?: number | null
    platform_os?: string | null
    platform_family?: string | null
    last_error?: string | null
  }
  account: {
    status: string
    mode: string
    identity?: string | null
    plan?: string | null
    rate_limit_summary?: string | null
    rate_limits?: RateLimitsView | null
    active_account_id?: string | null
    accounts: SavedAccountView[]
    requires_openai_auth: boolean
    login_in_progress: boolean
    login_id?: string | null
    last_login_error?: string | null
    auth_notice?: string | null
    auth_url?: string | null
    auth_code?: string | null
  }
  session: {
    model?: string | null
    model_provider?: string | null
    reasoning_effort?: string | null
    sandbox_mode?: string | null
    approval_policy?: string | null
    network_state: string
    cwd?: string | null
    repo?: string | null
    branch?: string | null
    thread_state?: string | null
    active_turn_id?: string | null
    subscribed_thread_id?: string | null
    loaded_thread_count: number
  }
  threads: ThreadSummary[]
  archived_threads: ThreadSummary[]
  active_thread_id?: string | null
  timeline: TimelineEntry[]
  approvals: ApprovalEntry[]
  diagnostics: {
    warnings: DiagnosticWarning[]
    traces: DiagnosticTrace[]
  }
  active_diff?: {
    thread_id: string
    turn_id: string
    diff: string
  } | null
}

export type RateLimitsView = {
  plan?: string | null
  credits?: CreditsView | null
  buckets: RateLimitBucketView[]
}

export type CreditsView = {
  has_credits: boolean
  unlimited: boolean
  balance?: string | null
}

export type SavedAccountView = {
  id: string
  mode: string
  label: string
  plan?: string | null
  state: string
  is_active: boolean
  last_used_at?: number | null
}

export type RateLimitBucketView = {
  key: string
  label: string
  remaining?: number | null
  limit?: number | null
  used?: number | null
  used_percent?: number | null
  reset_at?: string | null
  window_minutes?: number | null
}

export type ThreadSummary = {
  id: string
  preview: string
  name?: string | null
  cwd: string
  status: string
  model_provider: string
  updated_at: number
  repo?: string | null
  branch?: string | null
  presence: string
  turn_count: number
  last_account_id?: string | null
  last_account_label?: string | null
  last_account_plan?: string | null
}

export type TimelineEntry = {
  id: string
  thread_id: string
  turn_id?: string | null
  kind: string
  title: string
  body: string
  status: string
  detail?: string | null
  metadata: { label: string; value: string }[]
  file_changes?: {
    path: string
    status: string
    additions: number
    deletions: number
  }[]
  attachments?: {
    kind: string
    path?: string | null
  }[]
  turn_elapsed_ms?: number | null
}

export type ApprovalEntry = {
  request_id: string
  thread_id: string
  turn_id?: string | null
  item_id?: string | null
  kind: string
  title: string
  body: string
  available_decisions: ApprovalDecisionOption[]
  status: string
  reason?: string | null
  command?: string | null
  cwd?: string | null
  command_actions: unknown[]
  network_approval_context?: unknown | null
  additional_permissions?: unknown | null
  proposed_execpolicy_amendment?: string[] | null
  proposed_network_policy_amendments: unknown[]
  grant_root?: string | null
  permissions?: unknown | null
  file_changes: ApprovalFileChange[]
}

export type ApprovalDecisionOption = {
  id: string
  label: string
}

export type ApprovalFileChange = {
  path: string
  previous_path?: string | null
  status: string
  additions: number
  deletions: number
  diff: string
}

export type DiagnosticWarning = {
  summary: string
  details?: string | null
}

export type DiagnosticTrace = {
  direction: string
  message: string
}

export type ThreadConfigOverride = {
  cwd?: string | null
  model?: string | null
  reasoning_effort?: string | null
  approval_policy?: string | null
  sandbox_mode?: string | null
}

export type ReasoningEffortOption = {
  reasoning_effort: string
  description: string
}

export type ModelOption = {
  id: string
  model: string
  display_name: string
  description: string
  hidden: boolean
  is_default: boolean
  supported_reasoning_efforts: ReasoningEffortOption[]
  default_reasoning_effort?: string | null
}

export type UserInputItem =
  | {
      type: 'text'
      text: string
      text_elements: unknown[]
    }
  | {
      type: 'localImage'
      path: string
    }

export type GitChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'type_changed'
  | 'unmerged'

export type GitProjectSnapshot = {
  project_root: string
  repo_root: string
  branch: {
    current?: string | null
    default?: string | null
    upstream?: string | null
    head_sha?: string | null
    detached: boolean
    ahead: number
    behind: number
  }
  branches: {
    name: string
    upstream?: string | null
    head_sha?: string | null
    is_current: boolean
    is_default: boolean
  }[]
  counts: {
    staged: number
    working: number
    untracked: number
    total: number
  }
  files: {
    path: string
    original_path?: string | null
    staged_status?: GitChangeStatus | null
    unstaged_status?: GitChangeStatus | null
    untracked: boolean
    binary: boolean
    additions: number
    deletions: number
  }[]
  recent_commits: {
    sha: string
    subject: string
    author: string
    authored_at: string
  }[]
  latest_snapshot?: {
    id: string
    created_at: string
    label: string
  } | null
  origin_url?: string | null
}

export type GitMutationResult = {
  snapshot: GitProjectSnapshot
  summary: string
  branch_name?: string | null
  commit_sha?: string | null
  snapshot_id?: string | null
}

export type GitCommitPromptPayload = {
  summary: string
  prompt: string
}

export type ProjectTerminalSession = {
  session_id: string
  project_root: string
  shell: string
  pid?: number | null
}

export type ProjectTerminalOutputEvent = {
  session_id: string
  chunk: string
}

export type ProjectTerminalExitEvent = {
  session_id: string
  code?: number | null
  signal?: string | null
  reason?: string | null
}

export type OpenWithTarget = {
  id: string
  label: string
}

export type GitCommitRequest = {
  subject: string
  body?: string | null
  amend?: boolean
}

export type GitDiffTarget = 'working' | 'staged'

export async function getSnapshot() {
  return invoke<Snapshot>('get_snapshot')
}

export async function refreshRuntime() {
  return invoke<Snapshot>('refresh_runtime')
}

export async function refreshRateLimits() {
  return invoke<Snapshot>('refresh_rate_limits')
}

export async function listPlugins(projectRoot?: string | null, forceRemoteSync?: boolean) {
  return invoke<PluginCatalogPayload>('list_plugins', { projectRoot, forceRemoteSync })
}

export async function getPluginDetails(pluginId: string, projectRoot?: string | null) {
  return invoke<PluginDetails>('get_plugin_details', { pluginId, projectRoot })
}

export async function installPlugin(pluginId: string, projectRoot?: string | null) {
  return invoke<InstalledPluginState>('install_plugin', { pluginId, projectRoot })
}

export async function uninstallPlugin(pluginId: string, projectRoot?: string | null) {
  return invoke<InstalledPluginState>('uninstall_plugin', { pluginId, projectRoot })
}

export async function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
  projectRoot?: string | null,
) {
  return invoke<InstalledPluginState>('set_plugin_enabled', { pluginId, enabled, projectRoot })
}

export async function completePluginAuth(pluginId: string, projectRoot?: string | null) {
  return invoke<InstalledPluginState>('complete_plugin_auth', { pluginId, projectRoot })
}

export async function listSkills(projectRoot?: string | null) {
  return invoke<SkillCatalogPayload>('list_skills', { projectRoot })
}

export async function getSkillDetails(skillId: string, projectRoot?: string | null) {
  return invoke<SkillDetails>('get_skill_details', { skillId, projectRoot })
}

export async function installSkill(skillId: string, projectRoot?: string | null) {
  return invoke<SkillRecord>('install_skill', { skillId, projectRoot })
}

export async function setSkillEnabled(
  skillId: string,
  enabled: boolean,
  projectRoot?: string | null,
) {
  return invoke<SkillRecord>('set_skill_enabled', { skillId, enabled, projectRoot })
}

export async function createSkillScaffold(request: CreateSkillScaffoldRequest) {
  return invoke<CreateSkillScaffoldResult>('create_skill_scaffold', { request })
}

export async function createPluginScaffold(request: CreatePluginScaffoldRequest) {
  return invoke<CreatePluginScaffoldResult>('create_plugin_scaffold', { request })
}

export async function loadWorkspaceStore() {
  return invoke<WorkspaceStore>('load_workspace_store')
}

export async function saveWorkspaceStore(store: WorkspaceStore) {
  return invoke<void>('save_workspace_store', { store })
}

export async function restartRuntime() {
  return invoke<Snapshot>('restart_runtime')
}

export async function selectThread(threadId: string, config?: ThreadConfigOverride) {
  return invoke<Snapshot>('select_thread', { threadId, config })
}

export async function startThread(
  cwd: string,
  prompt: string,
  attachments?: UserInputItem[],
  config?: ThreadConfigOverride,
) {
  return invoke<Snapshot>('start_thread', { cwd, prompt, attachments, config })
}

export async function sendPrompt(
  threadId: string,
  prompt: string,
  attachments?: UserInputItem[],
  config?: ThreadConfigOverride,
) {
  return invoke<Snapshot>('send_prompt', { threadId, prompt, attachments, config })
}

export async function steerTurn(
  threadId: string,
  turnId: string,
  prompt: string,
  attachments?: UserInputItem[],
  config?: ThreadConfigOverride,
) {
  return invoke<Snapshot>('steer_turn', { threadId, turnId, prompt, attachments, config })
}

export async function interruptTurn(threadId: string, turnId: string) {
  return invoke<Snapshot>('interrupt_turn', { threadId, turnId })
}

export async function loginChatgpt() {
  return invoke<Snapshot>('login_chatgpt')
}

export async function loginApiKey(apiKey: string) {
  return invoke<Snapshot>('login_api_key', { apiKey })
}

export async function cancelLogin() {
  return invoke<Snapshot>('cancel_login')
}

export async function logout() {
  return invoke<Snapshot>('logout')
}

export async function selectAccount(accountId: string) {
  return invoke<Snapshot>('select_account', { accountId })
}

export async function disconnectAccount(accountId: string) {
  return invoke<Snapshot>('disconnect_account', { accountId })
}

export async function resolveApproval(requestId: string, decision: string) {
  return invoke<Snapshot>('resolve_approval', { requestId, decision })
}

export async function archiveThread(threadId: string) {
  return invoke<Snapshot>('archive_thread', { threadId })
}

export async function unarchiveThread(threadId: string) {
  return invoke<Snapshot>('unarchive_thread', { threadId })
}

export async function listModels() {
  return invoke<ModelOption[]>('list_models')
}

export async function pickWorkspaceFolder() {
  return invoke<string | null>('pick_workspace_folder')
}

export async function listWorkspaceFiles(baseDir: string, limit = 600) {
  return invoke<string[]>('list_workspace_files', { baseDir, options: { limit } })
}

export async function readWorkspaceFile(baseDir: string, relativePath: string) {
  return invoke<string>('read_workspace_file', { baseDir, relativePath })
}

export async function openWorkspaceFile(baseDir: string, relativePath: string) {
  return invoke<void>('open_workspace_file', { baseDir, relativePath })
}

export async function listOpenWithTargets(baseDir: string, relativePath: string) {
  return invoke<OpenWithTarget[]>('list_open_with_targets', { baseDir, relativePath })
}

export async function openWorkspaceFileWith(baseDir: string, relativePath: string, targetId: string) {
  return invoke<void>('open_workspace_file_with', { baseDir, relativePath, targetId })
}

export async function openExternalUrl(url: string) {
  return invoke<void>('open_external_url', { url })
}

export async function savePastedImage(bytes: number[], mimeType?: string | null) {
  return invoke<string>('save_pasted_image', { bytes, mimeType })
}

export async function getGitProject(projectRoot: string) {
  return invoke<GitProjectSnapshot | null>('get_git_project', { projectRoot })
}

export async function readGitFileDiff(projectRoot: string, path: string, target: GitDiffTarget) {
  return invoke<string>('read_git_file_diff', { projectRoot, path, target })
}

export async function stageGitPaths(projectRoot: string, paths: string[]) {
  return invoke<GitMutationResult>('stage_git_paths', { projectRoot, paths })
}

export async function unstageGitPaths(projectRoot: string, paths: string[]) {
  return invoke<GitMutationResult>('unstage_git_paths', { projectRoot, paths })
}

export async function createGitBranch(projectRoot: string, branchName: string, checkout = true) {
  return invoke<GitMutationResult>('create_git_branch', { projectRoot, branchName, checkout })
}

export async function checkoutGitBranch(projectRoot: string, branchName: string) {
  return invoke<GitMutationResult>('checkout_git_branch', { projectRoot, branchName })
}

export async function commitGitIndex(projectRoot: string, request: GitCommitRequest) {
  return invoke<GitMutationResult>('commit_git_index', { projectRoot, request })
}

export async function pushGitBranch(projectRoot: string) {
  return invoke<GitMutationResult>('push_git_branch', { projectRoot })
}

export async function createGitSnapshot(projectRoot: string) {
  return invoke<GitMutationResult>('create_git_snapshot', { projectRoot })
}

export async function restoreGitSnapshot(projectRoot: string, snapshotId: string) {
  return invoke<GitMutationResult>('restore_git_snapshot', { projectRoot, snapshotId })
}

export async function buildGitCommitPrompt(projectRoot: string) {
  return invoke<GitCommitPromptPayload>('build_git_commit_prompt', { projectRoot })
}

export async function ensureProjectTerminal(projectRoot: string, cols: number, rows: number) {
  return invoke<ProjectTerminalSession>('ensure_project_terminal', {
    projectRoot,
    cols,
    rows,
  })
}

export async function createProjectTerminal(projectRoot: string, cols: number, rows: number) {
  return invoke<ProjectTerminalSession>('create_project_terminal', {
    projectRoot,
    cols,
    rows,
  })
}

export async function writeProjectTerminal(sessionId: string, data: string) {
  return invoke<void>('write_project_terminal', { sessionId, data })
}

export async function resizeProjectTerminal(sessionId: string, cols: number, rows: number) {
  return invoke<void>('resize_project_terminal', { sessionId, cols, rows })
}

export async function killProjectTerminal(sessionId: string) {
  return invoke<void>('kill_project_terminal', { sessionId })
}

export function onSnapshot(callback: (snapshot: Snapshot) => void) {
  return listen<Snapshot>('kodeks://snapshot', (event) => {
    callback(event.payload)
  })
}

export function onProjectTerminalOutput(callback: (payload: ProjectTerminalOutputEvent) => void) {
  return listen<ProjectTerminalOutputEvent>('kodeks://terminal-output', (event) => {
    callback(event.payload)
  })
}

export function onProjectTerminalExit(callback: (payload: ProjectTerminalExitEvent) => void) {
  return listen<ProjectTerminalExitEvent>('kodeks://terminal-exit', (event) => {
    callback(event.payload)
  })
}
