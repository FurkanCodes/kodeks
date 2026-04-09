import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

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
  kind: string
  title: string
  body: string
  available_decisions: string[]
  status: string
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

export async function getSnapshot() {
  return invoke<Snapshot>('get_snapshot')
}

export async function refreshRuntime() {
  return invoke<Snapshot>('refresh_runtime')
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

export async function savePastedImage(bytes: number[], mimeType?: string | null) {
  return invoke<string>('save_pasted_image', { bytes, mimeType })
}

export function onSnapshot(callback: (snapshot: Snapshot) => void) {
  return listen<Snapshot>('kodeks://snapshot', (event) => {
    callback(event.payload)
  })
}
