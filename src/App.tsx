import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ComposerDock, type ComposerChoice } from './components/shell/ComposerDock'
import {
  InspectorPanel,
  type DiffFileView,
  type DiffLineView,
  type DrawerMode,
} from './components/shell/InspectorPanel'
import {
  MessageTimeline,
  type ChatActivityTrace,
  type ChatMessage,
  type QuickStartSuggestion,
} from './components/shell/MessageTimeline'
import {
  SettingsModal,
  type SettingsSection,
  type SettingsSectionKey,
} from './components/shell/SettingsModal'
import { Sidebar } from './components/shell/Sidebar'
import { TopBar, type TopBarRunState } from './components/shell/TopBar'
import {
  archiveThread,
  cancelLogin,
  type ApprovalEntry,
  getSnapshot,
  interruptTurn,
  listModels,
  listWorkspaceFiles,
  loginApiKey,
  loginChatgpt,
  logout,
  onSnapshot,
  openWorkspaceFile,
  pickWorkspaceFolder,
  type Snapshot,
  readWorkspaceFile,
  refreshRuntime,
  resolveApproval,
  savePastedImage,
  restartRuntime,
  type ReasoningEffortOption,
  selectThread,
  sendPrompt,
  type ModelOption,
  startThread,
  steerTurn,
  type ThreadConfigOverride,
  type UserInputItem,
  unarchiveThread,
} from './lib/kodeks'
import {
  defaultProjectLabel,
  loadWorkspaceStore,
  removeProjectGrouping,
  renameProject,
  saveWorkspaceStore,
  setThreadPreference,
  upsertProject,
  type WorkspaceStore,
} from './lib/workspaceStore'
import {
  buildSidebarGroups,
  mostRecentProjectRoot,
  projectRootForThread,
  resolveWorkspaceReference,
  type SidebarThread,
} from './lib/shellState'

const EMPTY_SNAPSHOT: Snapshot = {
  app_name: 'Kodeks',
  connection: {
    state: 'starting',
    detail: 'Bootstrapping local Codex runtime',
    codex_binary: null,
    codex_home: null,
    pid: null,
    platform_os: null,
    platform_family: null,
    last_error: null,
  },
  account: {
    status: 'checking',
    mode: 'unknown',
    identity: null,
    plan: null,
    rate_limit_summary: null,
    requires_openai_auth: false,
    login_in_progress: false,
    login_id: null,
    last_login_error: null,
    auth_notice: null,
    auth_url: null,
    auth_code: null,
  },
  session: {
    model: null,
    model_provider: null,
    reasoning_effort: null,
    sandbox_mode: null,
    approval_policy: null,
    network_state: 'local',
    cwd: null,
    repo: null,
    branch: null,
    thread_state: null,
    active_turn_id: null,
    subscribed_thread_id: null,
    loaded_thread_count: 0,
  },
  threads: [],
  archived_threads: [],
  active_thread_id: null,
  timeline: [],
  approvals: [],
  diagnostics: {
    warnings: [],
    traces: [],
  },
  active_diff: null,
}

const PROMPT_SUGGESTIONS: QuickStartSuggestion[] = [
  {
    kind: 'review',
    title: 'Review current diff',
    detail: 'Call out risky changes before you merge or keep coding.',
    prompt: 'Review the current diff and call out risky changes',
  },
  {
    kind: 'plan',
    title: 'Plan next edit',
    detail: 'Break the next change into an efficient, reviewable move.',
    prompt: 'Plan the next edit in this project',
  },
  {
    kind: 'explore',
    title: 'Find feature entrypoint',
    detail: 'Trace the best file or component to start from in this repo.',
    prompt: 'Find the best entrypoint for a new feature',
  },
  {
    kind: 'diagnose',
    title: 'Inspect warnings',
    detail: 'Surface the runtime issues that matter and what to do next.',
    prompt: 'Inspect runtime warnings and tell me what matters',
  },
]

type ParsedDiffLine = {
  type: 'context' | 'added' | 'removed'
  content: string
}

type ParsedDiffHunk = {
  header: string
  lines: ParsedDiffLine[]
}

type ParsedDiffFile = {
  path: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
  hunks: ParsedDiffHunk[]
}

type PreparedDiffFile = ParsedDiffFile & {
  category: 'source' | 'config' | 'generated' | 'lockfile'
  hiddenByDefault: boolean
  rank: number
}

type PanelMode = DrawerMode | null
type LiveStatusView = {
  label: string
  detailLines?: string[]
}

type ComposerImageAttachment = {
  id: string
  path: string
  previewUrl: string
  name: string
}

type PermissionPreset = 'default' | 'full-access'

function App() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const composerAttachmentsRef = useRef<ComposerImageAttachment[]>([])

  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [workspaceStore, setWorkspaceStore] = useState<WorkspaceStore>(() => loadWorkspaceStore())
  const [models, setModels] = useState<ModelOption[]>([])
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeProjectViewRoot, setActiveProjectViewRoot] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedReasoning, setSelectedReasoning] = useState('medium')
  const [selectedPermissionPreset, setSelectedPermissionPreset] = useState<PermissionPreset>('default')
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([])
  const [composerAttachments, setComposerAttachments] = useState<ComposerImageAttachment[]>([])
  const [composerEngaged, setComposerEngaged] = useState(false)
  const [composerResetToken, setComposerResetToken] = useState(0)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSearch, setSettingsSearch] = useState('')
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionKey>('account')
  const [panelMode, setPanelMode] = useState<PanelMode>(null)
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null)
  const [selectedCodePath, setSelectedCodePath] = useState<string | null>(null)
  const [selectedCodeContent, setSelectedCodeContent] = useState('')
  const [showHiddenDiffFiles, setShowHiddenDiffFiles] = useState(false)
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const [dismissedApprovals, setDismissedApprovals] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [undoArchive, setUndoArchive] = useState<SidebarThread | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )
  const [coarsePointer, setCoarsePointer] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(pointer: coarse)').matches,
  )

  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments
  }, [composerAttachments])

  useEffect(() => {
    return () => {
      for (const attachment of composerAttachmentsRef.current) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
    }
  }, [])
  const availableModels = useMemo(
    () => (models.length > 0 ? models : fallbackModels(snapshot)),
    [models, snapshot.session.model],
  )

  const selectedThread = useMemo(
    () => snapshot.threads.find((thread) => thread.id === snapshot.active_thread_id),
    [snapshot.active_thread_id, snapshot.threads],
  )

  const activeThread = activeProjectViewRoot ? null : selectedThread
  const activeTurnId = activeProjectViewRoot ? null : snapshot.session.active_turn_id || null

  const currentProjectRoot =
    activeProjectViewRoot ||
    activeThread?.repo ||
    activeThread?.cwd ||
    snapshot.session.repo ||
    snapshot.session.cwd ||
    mostRecentProjectRoot(workspaceStore) ||
    '.'

  const activeProjectLabel = useMemo(() => {
    const saved = workspaceStore.projects.find(
      (project) => project.rootPath === currentProjectRoot && !project.removed,
    )
    return saved?.label || defaultProjectLabel(currentProjectRoot)
  }, [currentProjectRoot, workspaceStore.projects])

  const activeProjectEmptyState = useMemo(
    () =>
      activeProjectViewRoot
        ? {
            eyebrow: 'Project',
            title: 'Start a new thread',
            projectLabel: activeProjectLabel,
            description: 'Ask Kodeks to inspect, plan, or change this repo. Your first message creates the thread automatically.',
            projectPath: currentProjectRoot,
          }
        : undefined,
    [activeProjectLabel, activeProjectViewRoot, currentProjectRoot],
  )

  const pendingApprovals = useMemo(
    () => (activeProjectViewRoot ? [] : snapshot.approvals.filter((approval) => approval.status === 'pending')),
    [activeProjectViewRoot, snapshot.approvals],
  )

  const parsedDiffFiles = useMemo(
    () => prepareDiffFiles(parseUnifiedDiff(activeProjectViewRoot ? undefined : snapshot.active_diff?.diff)),
    [activeProjectViewRoot, snapshot.active_diff?.diff],
  )

  const visibleDiffFiles = useMemo(
    () => parsedDiffFiles.filter((file) => showHiddenDiffFiles || !file.hiddenByDefault),
    [parsedDiffFiles, showHiddenDiffFiles],
  )

  const hiddenDiffFilesCount = useMemo(
    () => parsedDiffFiles.filter((file) => file.hiddenByDefault).length,
    [parsedDiffFiles],
  )

  const selectedDiffFile = useMemo(
    () => visibleDiffFiles.find((file) => file.path === selectedDiffPath) ?? null,
    [selectedDiffPath, visibleDiffFiles],
  )

  const selectedDiffLines = useMemo<DiffLineView[]>(() => buildDiffLines(selectedDiffFile), [selectedDiffFile])
  const selectedBreadcrumbs = useMemo(
    () => (selectedDiffFile ? selectedDiffFile.path.split('/').filter(Boolean) : []),
    [selectedDiffFile],
  )
  const codeBreadcrumbs = useMemo(
    () => (selectedCodePath ? selectedCodePath.split('/').filter(Boolean) : []),
    [selectedCodePath],
  )

  const messageIdForActiveDiffTurn = useMemo(() => {
    const turnId = activeProjectViewRoot ? null : snapshot.active_diff?.turn_id
    if (!turnId) {
      return null
    }

    return (
      shellMessages(snapshot, error, activeThread?.updated_at).find(
        (message) => message.turnId === turnId && message.tone !== 'system',
      )?.id ?? null
    )
  }, [activeProjectViewRoot, activeThread?.updated_at, error, snapshot])

  const composerModel = selectedModel || snapshot.session.model || availableModels[0]?.model || 'Codex'
  const composerReasoning = selectedReasoning || snapshot.session.reasoning_effort || 'medium'

  const reasoningOptions = useMemo<ComposerChoice[]>(() => {
    const selected = availableModels.find((item) => item.model === composerModel)
    const supported =
      selected?.supported_reasoning_efforts.length && selected.supported_reasoning_efforts.length > 0
        ? selected.supported_reasoning_efforts
        : FALLBACK_REASONING_EFFORTS

    return supported.map((option) => ({
      value: option.reasoning_effort,
      label: formatReasoningEffortLabel(option.reasoning_effort),
      description: option.description || defaultReasoningEffortDescription(option.reasoning_effort),
    }))
  }, [availableModels, composerModel])

  const permissionOptions = useMemo<ComposerChoice[]>(
    () => [
      {
        value: 'default',
        label: 'Default permissions',
        description: 'Workspace write with approvals on request.',
      },
      {
        value: 'full-access',
        label: 'Full access',
        description: 'Danger-full-access with approvals disabled.',
      },
    ],
    [],
  )

  const liveStatus = useMemo(
    () => (activeProjectViewRoot ? null : buildLiveStatus(snapshot)),
    [activeProjectViewRoot, snapshot],
  )

  const shellMessagesValue = useMemo(
    () => (activeProjectViewRoot ? [] : shellMessages(snapshot, error, activeThread?.updated_at)),
    [activeProjectViewRoot, activeThread?.updated_at, error, snapshot],
  )

  const sidebarGroups = useMemo(
    () =>
      buildSidebarGroups(
        snapshot.threads,
        workspaceStore,
        activeProjectViewRoot,
        activeProjectViewRoot ? null : snapshot.active_thread_id ?? null,
        expandedGroups,
        activeTurnId,
      ),
    [activeProjectViewRoot, activeTurnId, expandedGroups, snapshot.active_thread_id, snapshot.threads, workspaceStore],
  )

  const archivedThreads = useMemo<SidebarThread[]>(
    () =>
      snapshot.archived_threads.map((thread) => ({
        id: thread.id,
        label: thread.name || thread.preview || 'Untitled thread',
        active: false,
        live: false,
      })),
    [snapshot.archived_threads],
  )

  const effectivePanelMode = panelMode ?? (pendingApprovals.length > 0 && !dismissedApprovals ? 'approvals' : null)
  const inspectorAsOverlay = viewportWidth < 1320
  const compactModelMenu = viewportWidth < 1120
  const touchModelPreview = coarsePointer

  const runState: TopBarRunState = activeTurnId
    ? 'running'
    : shellMessagesValue.length > 0 || Boolean(!activeProjectViewRoot && snapshot.active_diff?.diff)
      ? 'done'
      : 'idle'

  const changesCount = parsedDiffFiles.length
  const diagnosticsWarnings = activeProjectViewRoot ? [] : snapshot.diagnostics.warnings
  const diagnosticsTraces = activeProjectViewRoot ? [] : snapshot.diagnostics.traces
  const diagnosticsCount = diagnosticsWarnings.length + diagnosticsTraces.length
  const codeReady = Boolean(selectedCodePath || selectedDiffFile)

  const settingsSections = useMemo(
    () =>
      buildSettingsSections(snapshot, apiKey, (value) => setApiKey(value), () => {
        void handleLogout()
      }),
    [apiKey, snapshot],
  )

  const noticeContent = useMemo<ReactNode | undefined>(() => {
    if (snapshot.connection.state === 'degraded') {
      return (
        <NoticeCard eyebrow="Runtime" title="The local Codex runtime needs attention">
          <p>{snapshot.connection.detail}</p>
          <div className="mt-4 flex gap-2">
            <NoticeButton onClick={() => void handleRestart()} disabled={busy} bright>
              Restart runtime
            </NoticeButton>
            <NoticeButton onClick={() => void handleRefresh()} disabled={busy}>
              Refresh snapshot
            </NoticeButton>
          </div>
        </NoticeCard>
      )
    }

    if (snapshot.account.status !== 'authenticated' || snapshot.account.login_in_progress) {
      return (
        <NoticeCard
          eyebrow="Account"
          title={
            snapshot.account.login_in_progress
              ? 'Finish signing in to keep working'
              : 'Sign in before you start a Codex session'
          }
        >
          <p>
            {snapshot.account.login_in_progress
              ? 'Use the browser handoff or verification code below. Kodeks will keep the workspace ready while Codex finishes account setup.'
              : 'Choose ChatGPT or an API key. Credentials stay managed by Codex, not by Kodeks.'}
          </p>

          {snapshot.account.auth_notice ? (
            <div className="mt-4 rounded-[14px] bg-white/[0.03] px-4 py-3 text-[13px] leading-[1.65] tracking-[-0.01em] text-neutral-400">
              {snapshot.account.auth_notice}
            </div>
          ) : null}

          {snapshot.account.auth_code ? (
            <div className="mt-3 rounded-[14px] bg-white/[0.03] px-4 py-3 text-[13px] tracking-[-0.01em] text-neutral-400">
              Verification code
              <span className="ml-2 shell-menlo text-neutral-200">{snapshot.account.auth_code}</span>
            </div>
          ) : null}

          {snapshot.account.last_login_error ? (
            <div className="mt-3 rounded-[14px] bg-red-500/5 px-4 py-3 text-[13px] leading-[1.65] tracking-[-0.01em] text-red-200/80">
              {snapshot.account.last_login_error}
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex flex-wrap gap-2">
              <NoticeButton
                onClick={() => void handleLoginChatgpt()}
                disabled={busy || snapshot.account.login_in_progress}
                bright
              >
                Continue with ChatGPT
              </NoticeButton>
              {snapshot.account.auth_url ? (
                <a
                  className="inline-flex h-[31.25px] items-center rounded-[4px] border border-white/10 px-3 text-[11.5px] font-medium tracking-[0.01em] text-neutral-400 transition hover:border-white/20 hover:text-neutral-200"
                  href={snapshot.account.auth_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open sign-in link
                </a>
              ) : null}
              {snapshot.account.login_in_progress && snapshot.account.login_id ? (
                <NoticeButton onClick={() => void handleCancelLogin()} disabled={busy}>
                  Cancel sign-in
                </NoticeButton>
              ) : null}
            </div>

            <div className="rounded-[14px] bg-white/[0.03] px-4 py-4">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
                API key
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="password"
                  className="h-[33.5px] min-w-[220px] flex-1 rounded-[8px] border border-white/10 bg-white/5 px-3 text-[13px] tracking-[-0.01em] text-neutral-200 outline-none placeholder:text-neutral-500"
                  placeholder="Paste OpenAI or Codex API key"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.currentTarget.value)}
                />
                <NoticeButton
                  onClick={() => void handleLoginApiKey()}
                  disabled={busy || snapshot.account.login_in_progress}
                >
                  Use API key
                </NoticeButton>
              </div>
            </div>
          </div>
        </NoticeCard>
      )
    }

    if (snapshot.connection.last_error && !error) {
      return (
        <NoticeCard eyebrow="Runtime" title="Latest runtime warning">
          <p>{snapshot.connection.last_error}</p>
        </NoticeCard>
      )
    }

    return undefined
  }, [apiKey, busy, error, snapshot])

  useEffect(() => {
    saveWorkspaceStore(workspaceStore)
  }, [workspaceStore])

  useEffect(() => {
    if (pendingApprovals.length === 0) {
      setDismissedApprovals(false)
    }
  }, [pendingApprovals.length])

  useEffect(() => {
    if (!activeProjectViewRoot || panelMode === null) {
      return
    }
    setPanelMode(null)
  }, [activeProjectViewRoot, panelMode])

  useEffect(() => {
    if (changesCount === 0 && panelMode === 'changes') {
      setPanelMode(null)
    }
  }, [changesCount, panelMode])

  useEffect(() => {
    if (selectedDiffPath && visibleDiffFiles.some((file) => file.path === selectedDiffPath)) {
      return
    }
    setSelectedDiffPath(visibleDiffFiles[0]?.path ?? null)
  }, [selectedDiffPath, visibleDiffFiles])

  useEffect(() => {
    if (activeTurnId) {
      setFocusedMessageId(null)
    }
  }, [activeTurnId])

  useEffect(() => {
    if (!activeThread) {
      return
    }

    const root = projectRootForThread(activeThread)
    if (root) {
      setWorkspaceStore((current) => upsertProject(current, root))
    }
  }, [activeThread])

  useEffect(() => {
    if (activeProjectViewRoot || activeThread) {
      return
    }

    const root = mostRecentProjectRoot(workspaceStore)
    if (root) {
      setActiveProjectViewRoot(root)
    }
  }, [activeProjectViewRoot, activeThread, workspaceStore])

  useEffect(() => {
    const preference =
      (activeThread && workspaceStore.threadPreferences[activeThread.id]) || null
    setSelectedModel(
      preference?.model ||
        snapshot.session.model ||
        availableModels.find((item) => item.is_default)?.model ||
        availableModels[0]?.model ||
        '',
    )
    setSelectedReasoning(preference?.reasoningEffort || snapshot.session.reasoning_effort || 'medium')
  }, [
    activeThread,
    availableModels,
    snapshot.session.model,
    snapshot.session.reasoning_effort,
    workspaceStore.threadPreferences,
  ])

  useEffect(() => {
    if (activeProjectViewRoot) {
      return
    }

    setSelectedPermissionPreset(
      permissionPresetFromSession(snapshot.session.sandbox_mode, snapshot.session.approval_policy),
    )
  }, [activeProjectViewRoot, snapshot.session.approval_policy, snapshot.session.sandbox_mode])

  useEffect(() => {
    if (reasoningOptions.find((option) => option.value === selectedReasoning && !option.disabled)) {
      return
    }

    const fallback = reasoningOptions.find((option) => !option.disabled)?.value || 'medium'
    setSelectedReasoning(fallback)
  }, [reasoningOptions, selectedReasoning])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const pointerQuery = window.matchMedia('(pointer: coarse)')

    const syncViewport = () => {
      setViewportWidth(window.innerWidth)
      setCoarsePointer(pointerQuery.matches)
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)
    pointerQuery.addEventListener('change', syncViewport)

    return () => {
      window.removeEventListener('resize', syncViewport)
      pointerQuery.removeEventListener('change', syncViewport)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let pendingSnapshot: Snapshot | null = null
    let snapshotFrame: number | null = null
    let disposeSnapshot: undefined | (() => void)

    const subscribe = async () => {
      const unsubscribe = await onSnapshot((next) => {
        pendingSnapshot = next
        if (snapshotFrame !== null) {
          return
        }

        snapshotFrame = requestAnimationFrame(() => {
          snapshotFrame = null
          const latest = pendingSnapshot
          pendingSnapshot = null
          if (!latest || disposed) {
            return
          }
          setSnapshot(latest)
        })
      })

      if (disposed) {
        unsubscribe()
        return
      }

      disposeSnapshot = unsubscribe
    }

    void subscribe()
    void hydrate()

    return () => {
      disposed = true
      pendingSnapshot = null
      if (snapshotFrame !== null) {
        cancelAnimationFrame(snapshotFrame)
      }
      disposeSnapshot?.()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function hydrateModels() {
      try {
        const nextModels = await listModels()
        if (!cancelled) {
          setModels(nextModels)
        }
      } catch {
        if (!cancelled) {
          setModels([])
        }
      }
    }

    void hydrateModels()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!currentProjectRoot || snapshot.account.status !== 'authenticated') {
      setWorkspaceFiles([])
      return
    }

    let cancelled = false

    async function loadFiles() {
      try {
        const files = await listWorkspaceFiles(currentProjectRoot)
        if (!cancelled) {
          setWorkspaceFiles(files)
        }
      } catch {
        if (!cancelled) {
          setWorkspaceFiles([])
        }
      }
    }

    void loadFiles()
    return () => {
      cancelled = true
    }
  }, [currentProjectRoot, snapshot.account.status])

  useEffect(() => {
    if (!selectedCodePath || !currentProjectRoot) {
      setSelectedCodeContent('')
      return
    }

    let cancelled = false
    const codePath = selectedCodePath
    const projectRoot = currentProjectRoot

    async function loadCode() {
      try {
        const content = await readWorkspaceFile(projectRoot, codePath)
        if (!cancelled) {
          setSelectedCodeContent(content)
        }
      } catch (nextError) {
        if (!cancelled) {
          setSelectedCodeContent('')
          setError(stringifyError(nextError))
        }
      }
    }

    void loadCode()
    return () => {
      cancelled = true
    }
  }, [currentProjectRoot, selectedCodePath])

  useEffect(() => {
    if (!undoArchive) {
      return
    }

    const handle = window.setTimeout(() => {
      setUndoArchive(null)
    }, 5000)

    return () => window.clearTimeout(handle)
  }, [undoArchive])

  async function hydrate() {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await getSnapshot())
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  function updateThreadPreference(threadId: string | null | undefined, partial: { model?: string; reasoningEffort?: string }) {
    if (!threadId) {
      return
    }
    setWorkspaceStore((current) => setThreadPreference(current, threadId, partial))
  }

  function buildThreadConfig(
    cwdOverride?: string | null,
    permissionPresetOverride?: PermissionPreset,
  ): ThreadConfigOverride {
    const permissionPreset = permissionPresetOverride || selectedPermissionPreset
    const permissions = threadConfigPermissionsForPreset(permissionPreset)

    return {
      cwd: cwdOverride || undefined,
      model: composerModel || undefined,
      reasoning_effort: composerReasoning || undefined,
      approval_policy: permissions.approval_policy,
      sandbox_mode: permissions.sandbox_mode,
    }
  }

  function openProjectView(rootPath: string) {
    setPanelMode(null)
    setFocusedMessageId(null)
    setError(null)
    setComposerResetToken((current) => current + 1)
    setSelectedCodePath(null)
    setSelectedDiffPath(null)
    setActiveProjectViewRoot(rootPath)
    setWorkspaceStore((current) => upsertProject(current, rootPath))
  }

  async function handleAddProject() {
    setError(null)
    try {
      const picked = await pickWorkspaceFolder()
      if (!picked) {
        return
      }
      openProjectView(picked)
    } catch (nextError) {
      setError(stringifyError(nextError))
    }
  }

  function handleNewThread(rootPath?: string | null) {
    const targetRoot = rootPath || currentProjectRoot || snapshot.session.cwd || mostRecentProjectRoot(workspaceStore) || '.'
    openProjectView(targetRoot)
  }

  function handleProjectSelect(rootPath: string) {
    openProjectView(rootPath)
  }

  async function handleThreadSelect(threadId: string) {
    setBusy(true)
    setError(null)
    setFocusedMessageId(null)
    try {
      setSnapshot(await selectThread(threadId))
      setActiveProjectViewRoot(null)
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleSend(content: string) {
    const trimmedPrompt = content.trim()
    if (!trimmedPrompt && composerAttachments.length === 0) {
      return
    }

    const attachments: UserInputItem[] = composerAttachments.map((attachment) => ({
      type: 'localImage',
      path: attachment.path,
    }))

    const root = activeProjectViewRoot || currentProjectRoot || snapshot.session.cwd || '.'
    const config = buildThreadConfig(activeProjectViewRoot ? root : undefined)

    setBusy(true)
    setError(null)
    setFocusedMessageId(null)
    try {
      let nextSnapshot: Snapshot
      let preferenceThreadId: string | null = null

      if (!activeProjectViewRoot && snapshot.active_thread_id && activeTurnId) {
        nextSnapshot = await steerTurn(
          snapshot.active_thread_id,
          activeTurnId,
          trimmedPrompt,
          attachments,
          config,
        )
        preferenceThreadId = snapshot.active_thread_id
      } else if (!activeProjectViewRoot && snapshot.active_thread_id) {
        nextSnapshot = await sendPrompt(snapshot.active_thread_id, trimmedPrompt, attachments, config)
        preferenceThreadId = snapshot.active_thread_id
      } else {
        nextSnapshot = await startThread(root, trimmedPrompt, attachments, config)
        preferenceThreadId = nextSnapshot.active_thread_id || null
        setActiveProjectViewRoot(null)
        setWorkspaceStore((current) => upsertProject(current, root))
      }

      setSnapshot(nextSnapshot)

      if (preferenceThreadId) {
        updateThreadPreference(preferenceThreadId, {
          model: composerModel,
          reasoningEffort: composerReasoning,
        })
      }
      setComposerResetToken((current) => current + 1)
      clearComposerAttachments()
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handlePasteComposerImages(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      return
    }

    const nextAttachments: ComposerImageAttachment[] = []

    try {
      for (const file of imageFiles) {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
        const path = await savePastedImage(bytes, file.type || 'image/png')
        nextAttachments.push({
          id: globalThis.crypto.randomUUID(),
          path,
          previewUrl: URL.createObjectURL(file),
          name: file.name || 'Screenshot',
        })
      }

      setComposerAttachments((current) => [...current, ...nextAttachments])
    } catch (nextError) {
      nextAttachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl))
      setError(stringifyError(nextError))
    }
  }

  function handleRemoveComposerAttachment(id: string) {
    setComposerAttachments((current) => {
      const attachment = current.find((item) => item.id === id)
      if (attachment) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
      return current.filter((item) => item.id !== id)
    })
  }

  function clearComposerAttachments() {
    setComposerAttachments((current) => {
      current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl))
      return []
    })
  }

  async function handleInterruptTurn() {
    const threadId = snapshot.active_thread_id
    if (!threadId || !activeTurnId) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      setSnapshot(await interruptTurn(threadId, activeTurnId))
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleArchiveThread(threadId: string) {
    setBusy(true)
    setError(null)
    try {
      const thread = snapshot.threads.find((item) => item.id === threadId)
      setSnapshot(await archiveThread(threadId))
      if (thread) {
        setUndoArchive({
          id: thread.id,
          label: thread.name || thread.preview || 'Untitled thread',
          active: false,
          live: false,
        })
      }
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleUnarchiveThread(threadId: string) {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await unarchiveThread(threadId))
      if (undoArchive?.id === threadId) {
        setUndoArchive(null)
      }
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleLoginChatgpt() {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await loginChatgpt())
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleLoginApiKey() {
    const trimmedApiKey = apiKey.trim()
    if (!trimmedApiKey) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      setSnapshot(await loginApiKey(trimmedApiKey))
      setApiKey('')
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancelLogin() {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await cancelLogin())
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await logout())
      setSettingsOpen(false)
      setAccountMenuOpen(false)
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestart() {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await restartRuntime())
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleRefresh() {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await refreshRuntime())
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleApproval(approval: ApprovalEntry, decision: string) {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await resolveApproval(approval.request_id, decision))
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenExternalFile(path?: string | null) {
    const target = path || selectedCodePath || selectedDiffFile?.path
    if (!target) {
      return
    }

    setError(null)
    try {
      await openWorkspaceFile(currentProjectRoot, target)
    } catch (nextError) {
      setError(stringifyError(nextError))
    }
  }

  function handleOpenCodePath(path: string) {
    setSelectedCodePath(path)
    setPanelMode('code')
  }

  function handleOpenDiffPath(path: string) {
    setSelectedDiffPath(path)
    setPanelMode('changes')
  }

  function handleToggleChanges() {
    if (changesCount === 0) {
      return
    }
    setPanelMode((current) => (current === 'changes' ? null : 'changes'))
  }

  function handleToggleCode() {
    if (!selectedCodePath && selectedDiffFile) {
      setSelectedCodePath(selectedDiffFile.path)
    }
    if (!selectedCodePath && !selectedDiffFile) {
      return
    }
    setPanelMode((current) => (current === 'code' ? null : 'code'))
  }

  function handleToggleDiagnostics() {
    setPanelMode((current) => (current === 'diagnostics' ? null : 'diagnostics'))
  }

  function handleClosePanel() {
    if (effectivePanelMode === 'approvals' && !panelMode) {
      setDismissedApprovals(true)
    }
    setPanelMode(null)
  }

  function handleJumpToContext() {
    if (!messageIdForActiveDiffTurn) {
      return
    }
    setFocusedMessageId(messageIdForActiveDiffTurn)
    setPanelMode(null)
  }

  function handleToggleGroup(groupKey: string) {
    setExpandedGroups((current) => ({
      ...current,
      [groupKey]: !(current[groupKey] ?? true),
    }))
  }

  function handleRenameProject(rootPath: string, label: string) {
    setWorkspaceStore((current) => renameProject(current, rootPath, label))
  }

  function handleRemoveProject(rootPath: string) {
    if (activeProjectViewRoot === rootPath) {
      setActiveProjectViewRoot(null)
    }
    setWorkspaceStore((current) => removeProjectGrouping(current, rootPath))
  }

  function handleModelChange(model: string) {
    setSelectedModel(model)
    updateThreadPreference(activeThread?.id, { model })
  }

  function handleReasoningChange(reasoning: string) {
    setSelectedReasoning(reasoning)
    updateThreadPreference(activeThread?.id, { reasoningEffort: reasoning })
  }

  async function handlePermissionPresetChange(value: string) {
    if (value !== 'default' && value !== 'full-access') {
      return
    }

    const nextPreset = value as PermissionPreset
    setSelectedPermissionPreset(nextPreset)

    if (activeProjectViewRoot || !activeThread || activeTurnId) {
      return
    }

    setBusy(true)
    setError(null)
    try {
      setSnapshot(await selectThread(activeThread.id, buildThreadConfig(undefined, nextPreset)))
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  function handleOpenRateLimits() {
    setActiveSettingsSection('account')
    setSettingsOpen(true)
  }

  const title = activeProjectViewRoot
    ? activeProjectLabel
    : activeThread?.name || activeThread?.preview || activeProjectLabel || 'Untitled thread'

  return (
    <div className="flex h-[100svh] w-full overflow-hidden bg-[#09090b] font-sans text-neutral-200">
      <Sidebar
        groups={sidebarGroups}
        archivedThreads={archivedThreads}
        accountMenuOpen={accountMenuOpen}
        accountLabel={snapshot.account.identity || 'workspace@agent.app'}
        planLabel={humanizePlan(snapshot.account.plan)}
        onAddProject={() => void handleAddProject()}
        onNewThread={(rootPath) => void handleNewThread(rootPath)}
        onSelectProject={handleProjectSelect}
        onSelectThread={(threadId) => void handleThreadSelect(threadId)}
        onArchiveThread={(threadId) => void handleArchiveThread(threadId)}
        onUnarchiveThread={(threadId) => void handleUnarchiveThread(threadId)}
        onRenameProject={handleRenameProject}
        onRemoveProject={handleRemoveProject}
        onToggleGroup={handleToggleGroup}
        onToggleAccountMenu={() => setAccountMenuOpen((value) => !value)}
        onOpenSettings={() => {
          setAccountMenuOpen(false)
          setSettingsOpen(true)
        }}
        onSignOut={() => void handleLogout()}
        signOutDisabled={busy}
      />

      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col bg-[#09090b]">
          <TopBar
            title={title}
            runState={runState}
            changesCount={changesCount}
            changesDisabled={changesCount === 0}
            changesOpen={effectivePanelMode === 'changes'}
            codeReady={codeReady}
            codeOpen={effectivePanelMode === 'code'}
            diagnosticsCount={diagnosticsCount}
            diagnosticsOpen={effectivePanelMode === 'diagnostics'}
            onToggleChanges={handleToggleChanges}
            onToggleCode={handleToggleCode}
            onToggleDiagnostics={handleToggleDiagnostics}
          />

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto shell-scroll-none">
            <div className="mx-auto flex w-full max-w-[74rem] flex-col px-4">
              {pendingApprovals.length > 0 && effectivePanelMode !== 'approvals' ? (
                <section className="mt-3.5 flex items-center justify-between rounded-[14px] border border-amber-400/10 bg-amber-500/5 px-4 py-3.5">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/70">
                      Approvals
                    </div>
                    <div className="mt-1 text-[13px] tracking-[-0.012em] text-neutral-200">
                      {pendingApprovals.length} pending {pendingApprovals.length === 1 ? 'approval' : 'approvals'} need review.
                    </div>
                  </div>
                  <NoticeButton
                    onClick={() => {
                      setDismissedApprovals(false)
                      setPanelMode('approvals')
                    }}
                  >
                    Review approvals
                  </NoticeButton>
                </section>
              ) : null}

              {undoArchive ? (
                <section className="mt-3.5 flex items-center justify-between rounded-[14px] border border-white/5 bg-white/[0.03] px-4 py-3.5">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Archived</div>
                    <div className="mt-1 text-[13px] tracking-[-0.012em] text-neutral-200">{undoArchive.label} moved out of the main sidebar.</div>
                  </div>
                  <NoticeButton onClick={() => void handleUnarchiveThread(undoArchive.id)}>Undo archive</NoticeButton>
                </section>
              ) : null}

              {noticeContent}
            </div>

            <MessageTimeline
              messages={shellMessagesValue}
              suggestions={PROMPT_SUGGESTIONS}
              emptyState={activeProjectEmptyState}
              composerEngaged={composerEngaged}
              liveStatus={liveStatus}
              focusedMessageId={focusedMessageId}
              scrollContainerRef={scrollContainerRef}
              onSuggestionSelect={(value) => void handleSend(value)}
              onOpenFileReference={handleOpenCodePath}
              onOpenChangeReference={handleOpenDiffPath}
              onOpenExternalFile={(path) => void handleOpenExternalFile(path)}
              resolveFileReference={(token) => resolveWorkspaceReference(token, workspaceFiles)}
            />
          </div>

          <ComposerDock
            attachments={composerAttachments}
            clearToken={composerResetToken}
            projectLabel={activeProjectLabel}
            projectPath={currentProjectRoot}
            models={availableModels}
            selectedModel={composerModel}
            selectedReasoning={composerReasoning}
            reasoningOptions={reasoningOptions}
            selectedPermissionPreset={selectedPermissionPreset}
            permissionOptions={permissionOptions}
            workspaceFiles={workspaceFiles}
            liveTurn={Boolean(activeTurnId)}
            authenticated={snapshot.account.status === 'authenticated'}
            busy={busy}
            compactModelMenu={compactModelMenu}
            touchModelPreview={touchModelPreview}
            onOpenProjectPicker={() => void handleAddProject()}
            onPasteImages={(files) => void handlePasteComposerImages(files)}
            onRemoveAttachment={handleRemoveComposerAttachment}
            onComposingChange={setComposerEngaged}
            onSubmit={(content) => void handleSend(content)}
            onInterrupt={() => void handleInterruptTurn()}
            onSelectModel={handleModelChange}
            onSelectReasoning={handleReasoningChange}
            onSelectPermissionPreset={(value) => void handlePermissionPresetChange(value)}
            onOpenRateLimits={handleOpenRateLimits}
          />
        </div>

        <InspectorPanel
          open={effectivePanelMode !== null}
          mode={effectivePanelMode ?? 'diagnostics'}
          overlay={inspectorAsOverlay}
          badgeLabel={buildBadgeLabel(
            effectivePanelMode,
            changesCount,
            pendingApprovals.length,
            diagnosticsCount,
            selectedCodePath,
          )}
          diffFiles={visibleDiffFiles.map<DiffFileView>((file) => ({
            path: file.path,
            additions: file.additions,
            deletions: file.deletions,
            status: diffStatusToBadge(file.status),
          }))}
          hiddenDiffFilesCount={hiddenDiffFilesCount}
          hiddenFilesVisible={showHiddenDiffFiles}
          selectedPath={selectedDiffFile?.path ?? null}
          selectedBreadcrumbs={selectedBreadcrumbs}
          diffHeader={buildDiffHeader(selectedDiffFile)}
          diffLines={selectedDiffLines}
          codePath={selectedCodePath}
          codeBreadcrumbs={codeBreadcrumbs}
          codeContent={selectedCodeContent}
          codeLanguage={languageForPath(selectedCodePath)}
          approvals={pendingApprovals}
          warnings={diagnosticsWarnings}
          traces={diagnosticsTraces}
          onClose={handleClosePanel}
          onSelectFile={setSelectedDiffPath}
          onToggleHiddenFiles={() => setShowHiddenDiffFiles((value) => !value)}
          onJumpToContext={handleJumpToContext}
          onViewCode={() => selectedDiffFile && handleOpenCodePath(selectedDiffFile.path)}
          onShowChanges={() => {
            if (selectedCodePath) {
              setSelectedDiffPath(selectedCodePath)
            }
            setPanelMode('changes')
          }}
          onOpenFile={() => void handleOpenExternalFile()}
          onApprove={(approval, decision) => void handleApproval(approval, decision)}
          onExportDiagnostics={handleExportDiagnostics}
        />
      </div>

      <SettingsModal
        open={settingsOpen}
        search={settingsSearch}
        activeSection={activeSettingsSection}
        sections={settingsSections}
        onClose={() => setSettingsOpen(false)}
        onSearchChange={setSettingsSearch}
        onSectionChange={setActiveSettingsSection}
      />
    </div>
  )

  function handleExportDiagnostics() {
    setError(null)
    try {
      const exportedAt = new Date().toISOString()
      const report = {
        exported_at: exportedAt,
        app_name: snapshot.app_name,
        connection: snapshot.connection,
        account: snapshot.account,
        session: snapshot.session,
        diagnostics: snapshot.diagnostics,
      }
      const fileName = `kodeks-diagnostics-${exportedAt.replace(/[:.]/g, '-')}.json`
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (nextError) {
      setError(stringifyError(nextError))
    }
  }
}

function NoticeCard(props: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-[14px] border border-white/5 bg-white/[0.03] px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{props.eyebrow}</div>
      <h2 className="mt-1.5 text-[1rem] font-semibold leading-[1.24] tracking-[-0.022em] text-neutral-200">{props.title}</h2>
      <div className="mt-1.5 text-[0.9375rem] leading-[1.65] tracking-[-0.01em] text-neutral-400">{props.children}</div>
    </section>
  )
}

function NoticeButton(props: {
  onClick: () => void
  disabled?: boolean
  bright?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-[29px] items-center rounded-[6px] border px-2.5 text-[11px] font-medium tracking-[0.01em] transition ${
        props.bright
          ? 'border-transparent bg-white text-black hover:opacity-90'
          : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-neutral-200'
      } ${props.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  )
}

function shellMessages(
  snapshot: Snapshot,
  currentError: string | null,
  updatedAt?: number | null,
): ChatMessage[] {
  const messages: ChatMessage[] = []
  const fallbackTimestamp = formatClockTime(updatedAt)
  const activeTurnId = snapshot.session.active_turn_id || null
  const turnOrder: string[] = []
  const turnBuckets = new Map<
    string,
    {
      entries: Snapshot['timeline']
      user?: Snapshot['timeline'][number]
    }
  >()
  const standaloneEntries: Snapshot['timeline'] = []

  for (const entry of snapshot.timeline) {
    if (entry.kind === 'reasoning') {
      continue
    }

    if (!entry.turn_id) {
      standaloneEntries.push(entry)
      continue
    }

    if (!turnBuckets.has(entry.turn_id)) {
      turnBuckets.set(entry.turn_id, { entries: [] })
      turnOrder.push(entry.turn_id)
    }

    const bucket = turnBuckets.get(entry.turn_id)!
    bucket.entries.push(entry)
    if (entry.kind === 'user') {
      bucket.user = entry
    }
  }

  for (const turnId of turnOrder) {
    const bucket = turnBuckets.get(turnId)
    if (!bucket) {
      continue
    }

    if (bucket.user) {
      messages.push(formatTimelineMessage(bucket.user, fallbackTimestamp))
    }

    messages.push(...buildTurnMessages(bucket.entries, fallbackTimestamp, turnId === activeTurnId))
  }

  for (const entry of standaloneEntries) {
    messages.push(formatTimelineMessage(entry, fallbackTimestamp))
  }

  if (currentError) {
    messages.push({
      id: 'local-error',
      author: 'System',
      timestamp: formatClockTime(Date.now()),
      tone: 'system',
      text: currentError,
      blockTone: 'error',
      blockLines: currentError.split('\n').filter(Boolean).slice(0, 8),
    })
  }

  return messages
}

function buildTurnMessages(
  entries: Snapshot['timeline'],
  fallbackTimestamp: string,
  isActiveTurn: boolean,
): ChatMessage[] {
  const turnMeta = buildTurnMeta(entries)
  const canonicalAssistant = [...entries]
    .reverse()
    .find((entry) => entry.kind === 'assistant' && buildMessageText(entry).trim())
  const pendingResearch = createResearchAccumulator()
  const editTraces: ChatActivityTrace[] = []

  for (const entry of entries) {
    if (entry.kind === 'command') {
      collectResearchActivity(entry.body, pendingResearch)
      continue
    }

    if (entry.kind === 'diff') {
      editTraces.push(...buildEditTraces(entry.file_changes))
    }
  }

  const traces: ChatActivityTrace[] = []
  const researchTrace = buildResearchTrace(pendingResearch)
  if (researchTrace) {
    traces.push(researchTrace)
  }
  traces.push(...editTraces)

  if (canonicalAssistant) {
    const turnId = canonicalAssistant.turn_id ?? null
    const summaryMessage = formatTimelineMessage(canonicalAssistant, fallbackTimestamp, {
      presentation: 'summary',
      workLabel: !isActiveTurn ? turnMeta.workLabel : null,
    })

    const traceMessages = traces.map((trace, index) =>
      createTraceMessage(turnId, fallbackTimestamp, trace, `${canonicalAssistant.id}-trace-${index}`),
    )

    return [summaryMessage, ...traceMessages]
  }

  if (traces.length > 0) {
    return traces.map((trace, index) =>
      createTraceMessage(entries[0]?.turn_id || null, fallbackTimestamp, trace, `${entries[0]?.id || 'turn'}-trace-${index}`),
    )
  }

  const failedCommand = [...entries]
    .reverse()
    .find((entry) => entry.kind === 'command' && commandFailed(entry.metadata))
  if (failedCommand) {
    return [
      formatTimelineMessage(failedCommand, fallbackTimestamp, {
        workLabel: !isActiveTurn ? turnMeta.workLabel : null,
      }),
    ]
  }

  const fallbackEntry = [...entries]
    .reverse()
    .find((entry) => entry.kind !== 'user' && entry.kind !== 'reasoning' && entry.kind !== 'diff')
  if (fallbackEntry) {
    return [
      formatTimelineMessage(fallbackEntry, fallbackTimestamp, {
        workLabel: !isActiveTurn ? turnMeta.workLabel : null,
      }),
    ]
  }

  return []
}

function buildLiveStatus(snapshot: Snapshot): LiveStatusView | null {
  if (!snapshot.session.active_turn_id) {
    return null
  }

  const threadState = snapshot.session.thread_state || ''
  if (threadState && !['inProgress', 'interrupting', 'queued'].includes(threadState)) {
    return null
  }

  const turnId = snapshot.session.active_turn_id
  const relevant = snapshot.timeline.filter((entry) => entry.turn_id === turnId)
  const reversed = [...relevant].reverse()
  const detailLines = relevant
    .map(activityLineForEntry)
    .filter((line): line is string => Boolean(line))
    .filter((line, index, items) => items.indexOf(line) === index)
    .slice(-4)

  const runningCommand = reversed.find((entry) => entry.kind === 'command' && entry.status === 'inProgress')
  if (runningCommand) {
    return finalizeLiveStatus(summarizeCommandActivity(runningCommand.body, 'active'), detailLines)
  }

  const latestAssistant = reversed.find((entry) => entry.kind === 'assistant' && entry.body.trim())
  if (latestAssistant) {
    return finalizeLiveStatus(
      normalizeNarrationLine(firstMeaningfulLine(latestAssistant.body)) || 'Answering…',
      detailLines,
    )
  }

  const reasoning = relevant.find((entry) => entry.kind === 'reasoning')
  if (reasoning) {
    return finalizeLiveStatus(
      normalizeNarrationLine(firstMeaningfulLine(reasoning.body) || firstMeaningfulLine(reasoning.detail || '')) ||
        'Thinking…',
      detailLines,
    )
  }

  const assistant = reversed.find((entry) => entry.kind === 'assistant' && entry.status === 'streaming')
  if (assistant) {
    return finalizeLiveStatus('Answering…', detailLines)
  }

  return finalizeLiveStatus('Thinking…', detailLines)
}

function finalizeLiveStatus(label: string, detailLines: string[]): LiveStatusView {
  const filteredDetails = detailLines.filter((line) => line !== label).slice(-3)
  return filteredDetails.length > 0 ? { label, detailLines: filteredDetails } : { label }
}

function buildMessageText(entry: Snapshot['timeline'][number]) {
  switch (entry.kind) {
    case 'user':
    case 'assistant':
      return entry.body || entry.title || ''
    case 'command':
      return entry.status === 'inProgress' ? 'Running command' : 'Command execution'
    case 'plan':
      return entry.body || 'Updated plan'
    default:
      return entry.body || entry.title || 'System event'
  }
}

type TimelineMessageOptions = Pick<ChatMessage, 'workLabel' | 'changeReceipt' | 'presentation' | 'trace'>

function formatTimelineMessage(
  entry: Snapshot['timeline'][number],
  fallbackTimestamp: string,
  options?: TimelineMessageOptions,
): ChatMessage {
  const detail = (entry.detail || '').trim()
  const metadataLines = entry.metadata.map((item) => `${item.label}: ${item.value}`)
  const blockLines =
    entry.kind === 'command'
      ? [entry.body, ...(detail ? detail.split('\n').filter(Boolean).slice(0, 12) : []), ...metadataLines]
      : detail && detail !== (entry.body || '').trim()
        ? detail.split('\n').slice(0, 12)
        : undefined

  return {
    id: entry.id,
    author: entry.kind === 'user' ? 'You' : entry.kind === 'system' ? 'System' : 'Agent',
    timestamp: fallbackTimestamp,
    tone: entry.kind === 'user' ? 'user' : entry.kind === 'system' ? 'system' : 'agent',
    turnId: entry.turn_id ?? null,
    text: buildMessageText(entry),
    blockTone: detail && (looksLikeError(detail) || commandFailed(entry.metadata)) ? 'error' : 'muted',
    blockLines,
    workLabel: options?.workLabel ?? null,
    changeReceipt: options?.changeReceipt ?? null,
    presentation: options?.presentation ?? 'chat',
    trace: options?.trace ?? null,
    attachments: entry.attachments ?? [],
  }
}

function createTraceMessage(
  turnId: string | null,
  fallbackTimestamp: string,
  trace: ChatActivityTrace,
  id = `${turnId || 'standalone'}-${trace.kind}-${trace.kind === 'edit' ? trace.path : trace.label}`,
): ChatMessage {
  return {
    id,
    author: 'Agent',
    timestamp: fallbackTimestamp,
    tone: 'agent',
    text: '',
    turnId,
    presentation: 'trace',
    trace,
  }
}

function buildTurnMeta(entries: Snapshot['timeline']): Pick<ChatMessage, 'workLabel' | 'changeReceipt'> {
  return {
    workLabel: buildWorkedLabel(entries),
    changeReceipt: buildChangeReceipt(entries),
  }
}

function buildWorkedLabel(entries: Snapshot['timeline']) {
  const turnElapsedMs = entries.reduce((max, entry) => Math.max(max, entry.turn_elapsed_ms ?? 0), 0)
  const commandDurationMs = entries.reduce((sum, entry) => sum + durationForEntry(entry), 0)
  const totalDurationMs = Math.max(turnElapsedMs, commandDurationMs)
  return totalDurationMs > 0 ? `Worked for ${formatDurationMs(totalDurationMs)}` : null
}

function durationForEntry(entry: Snapshot['timeline'][number]) {
  const duration = entry.metadata.find((item) => item.label === 'duration')?.value
  return duration ? parseDurationLabel(duration) : 0
}

function parseDurationLabel(value: string) {
  let total = 0
  const matcher = /(\d+(?:\.\d+)?)\s*(ms|s|m)/g
  for (const match of value.matchAll(matcher)) {
    const amount = Number(match[1] || 0)
    const unit = match[2]
    if (unit === 'm') {
      total += amount * 60_000
    } else if (unit === 's') {
      total += amount * 1_000
    } else {
      total += amount
    }
  }
  return total
}

function formatDurationMs(milliseconds: number) {
  if (milliseconds < 1_000) {
    return `${Math.round(milliseconds)}ms`
  }

  if (milliseconds < 60_000) {
    const seconds = milliseconds / 1_000
    return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`
  }

  const wholeSeconds = Math.round(milliseconds / 1_000)
  const minutes = Math.floor(wholeSeconds / 60)
  const seconds = wholeSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function buildChangeReceipt(entries: Snapshot['timeline']): ChatMessage['changeReceipt'] {
  const fileMap = new Map<string, NonNullable<ChatMessage['changeReceipt']>['files'][number]>()

  for (const entry of entries) {
    if (entry.kind !== 'diff' || !entry.file_changes || entry.file_changes.length === 0) {
      continue
    }

    for (const change of entry.file_changes) {
      fileMap.set(change.path, {
        path: change.path,
        status: change.status === 'A' || change.status === 'D' ? change.status : 'M',
        additions: change.additions,
        deletions: change.deletions,
      })
    }
  }

  const files = [...fileMap.values()].sort((left, right) => left.path.localeCompare(right.path))
  if (files.length === 0) {
    return null
  }

  return {
    files,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
  }
}

type ResearchAccumulator = {
  files: Set<string>
  searches: number
}

function createResearchAccumulator(): ResearchAccumulator {
  return {
    files: new Set<string>(),
    searches: 0,
  }
}

function collectResearchActivity(command: string, accumulator: ResearchAccumulator) {
  const raw = stripShellWrappers(command)
  if (!raw) {
    return
  }

  if (isSearchCommand(raw)) {
    accumulator.searches += 1
  }

  const filePath = extractReadPath(raw)
  if (filePath) {
    accumulator.files.add(filePath)
  }
}

function buildResearchTrace(accumulator: ResearchAccumulator): ChatActivityTrace | null {
  const fileCount = accumulator.files.size
  const searchCount = accumulator.searches
  if (fileCount === 0 && searchCount === 0) {
    return null
  }

  const labelParts: string[] = []
  if (fileCount > 0) {
    labelParts.push(`${fileCount} ${fileCount === 1 ? 'file' : 'files'}`)
  }
  if (searchCount > 0) {
    labelParts.push(`${searchCount} ${searchCount === 1 ? 'search' : 'searches'}`)
  }

  accumulator.files.clear()
  accumulator.searches = 0

  return {
    kind: 'research',
    label: `Explored ${labelParts.join(', ')}`,
  }
}

function buildEditTraces(fileChanges?: Snapshot['timeline'][number]['file_changes']): ChatActivityTrace[] {
  if (!fileChanges || fileChanges.length === 0) {
    return []
  }

  return [...fileChanges]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((change) => ({
      kind: 'edit' as const,
      label: `Edited ${tailPath(change.path)}`,
      path: change.path,
      additions: change.additions,
      deletions: change.deletions,
    }))
}

function activityLineForEntry(entry: Snapshot['timeline'][number]) {
  switch (entry.kind) {
    case 'assistant':
    case 'plan':
      return normalizeNarrationLine(firstMeaningfulLine(entry.body))
    case 'command':
      return summarizeCommandActivity(entry.body, entry.status === 'inProgress' ? 'active' : 'done')
    case 'reasoning':
      return normalizeNarrationLine(firstMeaningfulLine(entry.body) || firstMeaningfulLine(entry.detail || ''))
    default:
      return null
  }
}

function normalizeNarrationLine(value?: string | null) {
  const cleaned = (value || '')
    .replace(/^I['’]ve got enough context\.\s*/i, '')
    .replace(/^I['’]m going to\s+/i, '')
    .replace(/^I['’]m\s+/i, '')
    .replace(/^I'm going to\s+/i, '')
    .replace(/^I'm\s+/i, '')
    .trim()
    .replace(/\s+/g, ' ')

  if (!cleaned) {
    return null
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function summarizeCommandActivity(command?: string | null, phase: 'active' | 'done' = 'done') {
  const raw = stripShellWrappers(command || '')
  if (!raw) {
    return phase === 'active' ? 'Working in the workspace' : 'Finished workspace step'
  }

  const readMatch = raw.match(/^read\s+(.+)$/)
  if (readMatch) {
    return `${phase === 'active' ? 'Checking' : 'Checked'} ${cleanPathToken(readMatch[1])}`
  }

  const lsMatch = raw.match(/^ls(?:\s+(.+))?$/)
  if (lsMatch) {
    const target = cleanPathToken(lsMatch[1] || '')
    return phase === 'active'
      ? target
        ? `Listing ${target}`
        : 'Listing the workspace'
      : target
        ? `Listed ${target}`
        : 'Listed the workspace'
  }

  const findMatch = raw.match(/^find\s+(.+)$/)
  if (findMatch) {
    const target = cleanPathToken(findMatch[1])
    if (target.includes('.py')) {
      return phase === 'active' ? 'Looking for Python files' : 'Looked for Python files'
    }
    return `${phase === 'active' ? 'Searching for' : 'Searched for'} ${target}`
  }

  const grepMatch = raw.match(/^grep\s+(.+)$/)
  if (grepMatch) {
    return phase === 'active' ? 'Searching the workspace' : 'Searched the workspace'
  }

  const compileMatch = raw.match(/^python3\s+-m\s+py_compile\s+(.+)$/)
  if (compileMatch) {
    return `${phase === 'active' ? 'Checking' : 'Checked'} ${cleanPathToken(compileMatch[1])} for syntax`
  }

  const npmRunMatch = raw.match(/^npm\s+run\s+([^\s]+)$/)
  if (npmRunMatch) {
    return `${phase === 'active' ? 'Running' : 'Finished'} ${npmRunMatch[1]}`
  }

  return `${phase === 'active' ? 'Running' : 'Finished'} ${raw}`
}

function stripShellWrappers(value: string) {
  return value
    .trim()
    .replace(/^\/bin\/zsh\s+-lc\s+/, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/^rtk\s+/, '')
    .trim()
}

function cleanPathToken(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function isSearchCommand(value: string) {
  return /^(rg|grep|find|fd)(?:\s|$)/.test(value)
}

function extractReadPath(value: string) {
  const readLikeCommand =
    value.startsWith('read ') ||
    value.startsWith('sed ') ||
    value.startsWith('cat ') ||
    value.startsWith('head ') ||
    value.startsWith('tail ') ||
    value.startsWith('nl ') ||
    value.startsWith('git diff -- ')

  if (!readLikeCommand) {
    return null
  }

  const matches = value.match(
    /(\/Users\/[^\s'"]+|(?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|py|rs|json|md|css|html|toml|ya?ml))/g,
  )

  return matches?.at(-1) || null
}

function parseUnifiedDiff(diff?: string | null): ParsedDiffFile[] {
  if (!diff) {
    return []
  }

  const lines = diff.split('\n')
  const files: ParsedDiffFile[] = []
  let current: {
    path: string
    additions: number
    deletions: number
    status: ParsedDiffFile['status']
    hunks: ParsedDiffHunk[]
    activeHunk: ParsedDiffHunk | null
  } | null = null

  const finalizeHunk = () => {
    if (!current?.activeHunk) {
      return
    }
    current.hunks.push(current.activeHunk)
    current.activeHunk = null
  }

  const finalizeFile = () => {
    if (!current) {
      return
    }
    finalizeHunk()
    files.push({
      path: current.path,
      status: current.status,
      additions: current.additions,
      deletions: current.deletions,
      hunks: current.hunks,
    })
    current = null
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      finalizeFile()
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
      current = {
        path: match?.[2] || match?.[1] || 'unknown',
        additions: 0,
        deletions: 0,
        status: 'modified',
        hunks: [],
        activeHunk: null,
      }
      continue
    }

    if (!current) {
      continue
    }

    if (line.startsWith('new file mode')) {
      current.status = 'added'
      continue
    }

    if (line.startsWith('deleted file mode')) {
      current.status = 'deleted'
      continue
    }

    if (line.startsWith('@@ ')) {
      finalizeHunk()
      current.activeHunk = {
        header: line,
        lines: [],
      }
      continue
    }

    if (!current.activeHunk) {
      continue
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions += 1
      current.activeHunk.lines.push({ type: 'added', content: line.slice(1) })
      continue
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions += 1
      current.activeHunk.lines.push({ type: 'removed', content: line.slice(1) })
      continue
    }

    current.activeHunk.lines.push({
      type: 'context',
      content: line.startsWith(' ') ? line.slice(1) : line,
    })
  }

  finalizeFile()
  return files
}

function prepareDiffFiles(files: ParsedDiffFile[]): PreparedDiffFile[] {
  return [...files]
    .map((file) => {
      const category = classifyDiffFile(file.path)
      const hiddenByDefault = category === 'generated' || category === 'lockfile'
      return {
        ...file,
        category,
        hiddenByDefault,
        rank: rankDiffFile(category, file.status),
      }
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank
      }
      if (left.path !== right.path) {
        return left.path.localeCompare(right.path)
      }
      return right.additions + right.deletions - (left.additions + left.deletions)
    })
}

function classifyDiffFile(path: string): PreparedDiffFile['category'] {
  const normalized = path.toLowerCase()
  const name = tailPath(normalized)

  if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 'bun.lockb'].includes(name)) {
    return 'lockfile'
  }

  if (
    normalized.includes('/dist/') ||
    normalized.includes('/build/') ||
    normalized.includes('/coverage/') ||
    normalized.includes('/target/') ||
    normalized.includes('/.next/') ||
    normalized.includes('/out/') ||
    normalized.includes('/generated/') ||
    normalized.endsWith('.min.js') ||
    normalized.endsWith('.min.css')
  ) {
    return 'generated'
  }

  if (
    ['package.json', 'tsconfig.json', 'vite.config.ts', 'tauri.conf.json'].includes(name) ||
    normalized.endsWith('.toml') ||
    normalized.endsWith('.yaml') ||
    normalized.endsWith('.yml')
  ) {
    return 'config'
  }

  return 'source'
}

function rankDiffFile(category: PreparedDiffFile['category'], status: ParsedDiffFile['status']) {
  if (category === 'source' && status === 'modified') {
    return 0
  }
  if (category === 'source') {
    return 1
  }
  if (category === 'config') {
    return 2
  }
  if (category === 'generated') {
    return 3
  }
  return 4
}

function buildDiffLines(file: PreparedDiffFile | null): DiffLineView[] {
  if (!file) {
    return []
  }

  const views: DiffLineView[] = []

  for (const [hunkIndex, hunk] of file.hunks.entries()) {
    const { oldLineStart, newLineStart } = parseHunkHeader(hunk.header)
    let currentOldLine = oldLineStart
    let currentNewLine = newLineStart

    views.push({
      id: `${file.path}-hunk-${hunkIndex}`,
      number: 0,
      text: hunk.header,
      tone: 'header',
    })

    for (const [lineIndex, line] of hunk.lines.entries()) {
      let number = currentNewLine
      let tone: DiffLineView['tone'] = 'context'

      if (line.type === 'added') {
        tone = 'add'
        currentNewLine += 1
      } else if (line.type === 'removed') {
        tone = 'remove'
        number = currentOldLine
        currentOldLine += 1
      } else {
        currentOldLine += 1
        currentNewLine += 1
      }

      views.push({
        id: `${file.path}-${hunkIndex}-${lineIndex}`,
        number,
        text: line.content,
        tone,
      })
    }
  }

  return views
}

function parseHunkHeader(header: string) {
  const match = header.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  return {
    oldLineStart: Number(match?.[1] || 1),
    newLineStart: Number(match?.[2] || 1),
  }
}

function buildDiffHeader(file: PreparedDiffFile | null) {
  if (!file) {
    return 'No diff selected'
  }
  const statusLabel = file.status === 'added' ? 'Added' : file.status === 'deleted' ? 'Deleted' : 'Modified'
  return `${statusLabel}  +${file.additions}  -${file.deletions}`
}

function diffStatusToBadge(status: ParsedDiffFile['status']): DiffFileView['status'] {
  if (status === 'added') {
    return 'A'
  }
  if (status === 'deleted') {
    return 'D'
  }
  return 'M'
}

function buildBadgeLabel(
  mode: PanelMode,
  changesCount: number,
  approvalsCount: number,
  diagnosticsCount: number,
  codePath?: string | null,
) {
  switch (mode) {
    case 'changes':
      return `${changesCount} ${changesCount === 1 ? 'file' : 'files'}`
    case 'code':
      return codePath ? tailPath(codePath) : 'No file'
    case 'approvals':
      return `${approvalsCount} pending`
    case 'diagnostics':
      return `${diagnosticsCount} ${diagnosticsCount === 1 ? 'item' : 'items'}`
    default:
      return '0'
  }
}

function buildSettingsSections(
  snapshot: Snapshot,
  apiKey: string,
  onApiKeyInput: (value: string) => void,
  onSignOut: () => void,
): SettingsSection[] {
  return [
    {
      key: 'account',
      label: 'Account',
      groups: [
        {
          title: 'Session',
          rows: [
            {
              kind: 'text',
              label: 'Signed in as',
              description: 'Identity currently active in the local Codex runtime.',
              value: snapshot.account.identity || 'Not signed in',
              disabled: true,
            },
            {
              kind: 'text',
              label: 'Plan',
              description: 'Current account plan reported by Codex.',
              value: humanizePlan(snapshot.account.plan),
              disabled: true,
            },
            {
              kind: 'text',
              label: 'API key draft',
              description: 'Staged locally until you submit sign-in from the main surface.',
              value: apiKey,
              placeholder: 'Paste API key',
              inputType: 'password',
              onInput: onApiKeyInput,
            },
          ],
        },
      ],
      actionLabel: 'Sign out',
      actionTone: 'danger',
      onAction: onSignOut,
    },
    {
      key: 'models',
      label: 'Models',
      groups: [
        {
          title: 'Runtime defaults',
          rows: [
            {
              kind: 'text',
              label: 'Model',
              description: 'Model currently advertised by the runtime.',
              value: snapshot.session.model || 'Codex default',
              disabled: true,
            },
            {
              kind: 'text',
              label: 'Reasoning effort',
              description: 'Current reasoning effort remembered by Kodeks.',
              value: formatReasoningEffortLabel(snapshot.session.reasoning_effort || 'medium'),
              disabled: true,
            },
          ],
        },
      ],
    },
  ]
}

function fallbackModels(snapshot: Snapshot): ModelOption[] {
  if (!snapshot.session.model) {
    return []
  }

  return [
    {
      id: snapshot.session.model,
      model: snapshot.session.model,
      display_name: snapshot.session.model,
      description: '',
      hidden: false,
      is_default: true,
      supported_reasoning_efforts: FALLBACK_REASONING_EFFORTS,
      default_reasoning_effort: 'medium',
    },
  ]
}

const FALLBACK_REASONING_EFFORTS: ReasoningEffortOption[] = [
  { reasoning_effort: 'low', description: '' },
  { reasoning_effort: 'medium', description: '' },
  { reasoning_effort: 'high', description: '' },
  { reasoning_effort: 'xhigh', description: '' },
]

function permissionPresetFromSession(
  sandboxMode?: string | null,
  approvalPolicy?: string | null,
): PermissionPreset {
  if (sandboxMode === 'danger-full-access' || approvalPolicy === 'never') {
    return 'full-access'
  }

  return 'default'
}

function threadConfigPermissionsForPreset(preset: PermissionPreset) {
  if (preset === 'full-access') {
    return {
      approval_policy: 'never',
      sandbox_mode: 'danger-full-access',
    }
  }

  return {
    approval_policy: 'on-request',
    sandbox_mode: 'workspace-write',
  }
}

function formatReasoningEffortLabel(value: string) {
  switch (value.toLowerCase()) {
    case 'none':
      return 'None'
    case 'minimal':
      return 'Minimal'
    case 'low':
      return 'Low'
    case 'medium':
      return 'Medium'
    case 'high':
      return 'High'
    case 'xhigh':
      return 'Extra High'
    default:
      return titleCase(value)
  }
}

function defaultReasoningEffortDescription(value: string) {
  switch (value.toLowerCase()) {
    case 'low':
      return 'Fast responses with lighter reasoning.'
    case 'medium':
      return 'Balanced speed and reasoning depth.'
    case 'high':
      return 'Greater reasoning depth for harder tasks.'
    case 'xhigh':
      return 'Maximum reasoning depth for the most complex work.'
    case 'minimal':
      return 'Very light reasoning for quick answers.'
    case 'none':
      return 'No deliberate reasoning.'
    default:
      return ''
  }
}

function commandFailed(metadata: { label: string; value: string }[]) {
  const exitRow = metadata.find((item) => item.label.toLowerCase() === 'exit')
  return exitRow ? exitRow.value !== '0' : false
}

function firstMeaningfulLine(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
}

function formatClockTime(value?: number | null) {
  if (!value) {
    return '12:20 PM'
  }

  const millis = value > 10_000_000_000 ? value : value * 1000
  const date = new Date(millis)
  if (Number.isNaN(date.getTime())) {
    return '12:20 PM'
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function looksLikeError(value: string) {
  const lowered = value.toLowerCase()
  return (
    lowered.includes('err_') ||
    lowered.includes('refused to connect') ||
    lowered.includes("can't be reached") ||
    lowered.includes('traceback') ||
    lowered.includes('exception') ||
    lowered.includes('library load denied')
  )
}

function tailPath(value: string | null | undefined) {
  const parts = (value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
  return parts[parts.length - 1] || ''
}

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function humanizePlan(plan?: string | null) {
  if (!plan) {
    return 'Free Plan'
  }
  const normalized = plan.toLowerCase()
  if (normalized.includes('plan')) {
    return titleCase(plan)
  }
  return `${titleCase(plan)} Plan`
}


function languageForPath(path?: string | null) {
  if (!path) {
    return undefined
  }

  const extension = path.split('.').pop()?.toLowerCase()
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx' || extension === 'mkd' || extension === 'mkdn' || extension === 'mdown') {
    return 'markdown'
  }
  if (extension === 'tsx' || extension === 'ts' || extension === 'jsx' || extension === 'js') {
    return 'typescript'
  }
  if (extension === 'rs') {
    return 'rust'
  }
  if (extension === 'css') {
    return 'css'
  }
  if (extension === 'json') {
    return 'json'
  }
  return extension
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export default App
