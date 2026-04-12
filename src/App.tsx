import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react'
import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  type SettingsRow,
  type SettingsSection,
  type SettingsSectionKey,
} from './components/shell/SettingsModal'
import { LoadingSpinner } from './components/shell/LoadingSpinner'
import { Sidebar, type SidebarAccount } from './components/shell/Sidebar'
import { TopBar, type TopBarRunState } from './components/shell/TopBar'
import {
  archiveThread,
  cancelLogin,
  type ApprovalEntry,
  disconnectAccount,
  getSnapshot,
  interruptTurn,
  listModels,
  loadWorkspaceStore as loadNativeWorkspaceStore,
  listWorkspaceFiles,
  loginChatgpt,
  logout,
  onSnapshot,
  openExternalUrl,
  openWorkspaceFile,
  pickWorkspaceFolder,
  type RateLimitBucketView,
  type RateLimitsView,
  type SavedAccountView,
  type Snapshot,
  readWorkspaceFile,
  refreshRateLimits,
  refreshRuntime,
  resolveApproval,
  savePastedImage,
  saveWorkspaceStore as saveNativeWorkspaceStore,
  restartRuntime,
  type ReasoningEffortOption,
  selectAccount,
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
  EMPTY_WORKSPACE_STORE,
  clearLegacyWorkspaceStore,
  defaultProjectLabel,
  loadLegacyWorkspaceStore,
  normalizeWorkspaceStore,
  resolvePersistedWorkspaceStore,
  removeProjectGrouping,
  renameProject,
  setComposerRateLimitsVisible,
  setSidebarCollapsed,
  setThreadPreference,
  normalizeProjectRoot,
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
    rate_limits: null,
    active_account_id: null,
    accounts: [],
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
type ComposerRateLimitDisplay = {
  label: string
  value: string
  reset?: string | null
  tone: 'calm' | 'warning' | 'muted'
}

type RateLimitSummaryItem = {
  key: string
  kind: 'credits' | 'bucket'
  label: string
  primary: string
  secondary: string
  reset?: string | null
  tone: 'calm' | 'warning' | 'muted'
}

type ShellNavigationEntry =
  | { kind: 'project'; rootPath: string }
  | { kind: 'thread'; threadId: string }

type ShellHistoryState = {
  entries: ShellNavigationEntry[]
  index: number
}

const THREAD_VIEW_FADE_IN_EASE = [0.16, 1, 0.3, 1] as const
const THREAD_VIEW_FADE_OUT_EASE = [0.7, 0, 0.84, 0] as const

const THREAD_VIEW_VARIANTS = {
  hidden: {
    opacity: 0,
    transition: {
      duration: 0.28,
      ease: THREAD_VIEW_FADE_OUT_EASE,
    },
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.28,
      ease: THREAD_VIEW_FADE_IN_EASE,
    },
  },
} as const

const THREAD_VIEW_REDUCED_VARIANTS = {
  hidden: {
    opacity: 0,
    transition: {
      duration: 0.01,
    },
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.01,
    },
  },
} as const

function ThreadViewTransition(props: {
  viewKey: string
  children: ReactNode
}) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false} mode="wait">
        <m.div
          key={props.viewKey}
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={prefersReducedMotion ? THREAD_VIEW_REDUCED_VARIANTS : THREAD_VIEW_VARIANTS}
          className="flex min-h-0 flex-1 flex-col"
          style={prefersReducedMotion ? undefined : { willChange: 'opacity' }}
        >
          {props.children}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  )
}

function App() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const composerAttachmentsRef = useRef<ComposerImageAttachment[]>([])
  const accountTraceConsoleHeadRef = useRef<string | null>(null)

  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [workspaceStore, setWorkspaceStore] = useState<WorkspaceStore>(EMPTY_WORKSPACE_STORE)
  const [workspaceStoreHydrated, setWorkspaceStoreHydrated] = useState(false)
  const [shellHistory, setShellHistory] = useState<ShellHistoryState>({
    entries: [],
    index: -1,
  })
  const [models, setModels] = useState<ModelOption[]>([])
  const [busy, setBusy] = useState(false)
  const [accountSwitchingId, setAccountSwitchingId] = useState<string | null>(null)
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
    normalizeProjectRoot(
      activeProjectViewRoot ||
        activeThread?.repo ||
        activeThread?.cwd ||
        snapshot.session.repo ||
        snapshot.session.cwd ||
        mostRecentProjectRoot(workspaceStore) ||
        '.',
    )

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

  const threadViewKey = useMemo(() => {
    if (activeProjectViewRoot) {
      return `project:${activeProjectViewRoot}`
    }

    return `thread:${activeThread?.id || snapshot.active_thread_id || 'empty'}`
  }, [activeProjectViewRoot, activeThread?.id, snapshot.active_thread_id])

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

  const sidebarAccounts = useMemo<SidebarAccount[]>(
    () =>
      buildSidebarAccounts(
        snapshot.account.accounts,
        snapshot.account.active_account_id || null,
        snapshot.account.identity || (snapshot.account.status === 'authenticated' ? 'Current account' : null),
        snapshot.account.plan || null,
        accountSwitchingId,
      ),
    [
      accountSwitchingId,
      snapshot.account.accounts,
      snapshot.account.active_account_id,
      snapshot.account.identity,
      snapshot.account.status,
      snapshot.account.plan,
    ],
  )

  const hasUsableAccounts = sidebarAccounts.length > 0
  const accountSwitchInProgress = Boolean(accountSwitchingId)
  const switchingAccount = useMemo(
    () =>
      accountSwitchingId
        ? normalizeSavedAccounts(snapshot.account).find((account) => account.id === accountSwitchingId) || null
        : null,
    [accountSwitchingId, snapshot.account],
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
        snapshot.account.active_account_id || null,
        sidebarAccounts.length,
      ),
    [
      activeProjectViewRoot,
      activeTurnId,
      expandedGroups,
      snapshot.account.active_account_id,
      snapshot.active_thread_id,
      snapshot.threads,
      sidebarAccounts.length,
      workspaceStore,
    ],
  )

  const archivedThreads = useMemo<SidebarThread[]>(
    () =>
      snapshot.archived_threads.map((thread) => ({
        id: thread.id,
        label: thread.name || thread.preview || 'Untitled thread',
        active: false,
        live: false,
        updatedAt: thread.updated_at,
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
      buildSettingsSections(
        snapshot,
        accountSwitchingId,
        workspaceStore.ui.showComposerRateLimits,
        () => {
          setWorkspaceStore((current) => setComposerRateLimitsVisible(current, !current.ui.showComposerRateLimits))
        },
        () => {
          void handleLoginChatgpt()
        },
        (url) => {
          void handleOpenSignInLink(url)
        },
        (accountId) => {
          void handleSelectAccount(accountId)
        },
        (accountId) => {
          void handleDisconnectAccount(accountId)
        },
        () => {
          void handleLogout()
        },
      ),
    [accountSwitchingId, snapshot, workspaceStore.ui.showComposerRateLimits],
  )

  const composerRateLimitDisplays = useMemo(
    () => buildComposerRateLimitDisplays(snapshot.account.rate_limits),
    [snapshot.account.rate_limits],
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

    if (accountSwitchInProgress) {
      return (
        <NoticeCard eyebrow="Accounts" title={`Switching to ${switchingAccount?.label || 'selected account'}`}>
          <div className="flex items-start gap-3">
            <LoadingSpinner className="mt-1" size={15} />
            <div>
              <p>Keeping your current account live until the new session is ready.</p>
              <p className="mt-2">Refreshing identity, rate limits, and saved-account state can take a moment.</p>
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
  }, [accountSwitchInProgress, error, snapshot, switchingAccount?.label])

  useEffect(() => {
    let cancelled = false

    async function hydrateWorkspaceStore() {
      const legacyStore = loadLegacyWorkspaceStore()

      try {
        const nativeStore = normalizeWorkspaceStore(await loadNativeWorkspaceStore())
        const resolved = resolvePersistedWorkspaceStore(nativeStore, legacyStore)

        if (resolved.migratedLegacy) {
          await saveNativeWorkspaceStore(resolved.store)
        }

        clearLegacyWorkspaceStore()
        if (cancelled) {
          return
        }

        startTransition(() => {
          setWorkspaceStore(resolved.store)
          setWorkspaceStoreHydrated(true)
        })
      } catch (nextError) {
        console.error('[kodeks-workspace-store] failed to hydrate native workspace store', nextError)
        if (cancelled) {
          return
        }

        startTransition(() => {
          setWorkspaceStore(legacyStore)
          setWorkspaceStoreHydrated(true)
        })
      }
    }

    void hydrateWorkspaceStore()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!workspaceStoreHydrated) {
      return
    }

    let cancelled = false

    void saveNativeWorkspaceStore(workspaceStore).catch((nextError) => {
      if (!cancelled) {
        console.error('[kodeks-workspace-store] failed to save native workspace store', nextError)
      }
    })

    return () => {
      cancelled = true
    }
  }, [workspaceStore, workspaceStoreHydrated])

  useEffect(() => {
    const accountTraces = snapshot.diagnostics.traces.filter((trace) => trace.direction === 'acct')
    if (accountTraces.length === 0) {
      return
    }

    const latestMessage = accountTraces[0]?.message ?? null
    const lastLoggedMessage = accountTraceConsoleHeadRef.current
    const tracesToLog =
      lastLoggedMessage === null ? [...accountTraces].reverse() : []

    if (lastLoggedMessage !== null) {
      for (const trace of accountTraces) {
        if (trace.message === lastLoggedMessage) {
          break
        }
        tracesToLog.push(trace)
      }
      tracesToLog.reverse()
    }

    if (tracesToLog.length === 0) {
      accountTraceConsoleHeadRef.current = latestMessage
      return
    }

    for (const trace of tracesToLog) {
      console.info('[kodeks-account]', trace.message)
    }

    accountTraceConsoleHeadRef.current = latestMessage
  }, [snapshot.diagnostics.traces])

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
    if (!workspaceStoreHydrated || !activeThread) {
      return
    }

    const root = projectRootForThread(activeThread)
    if (root) {
      setWorkspaceStore((current) => upsertProject(current, root))
    }
  }, [activeThread, workspaceStoreHydrated])

  useEffect(() => {
    if (!workspaceStoreHydrated || activeProjectViewRoot || activeThread) {
      return
    }

    const root = mostRecentProjectRoot(workspaceStore)
    if (root) {
      setActiveProjectViewRoot(root)
    }
  }, [activeProjectViewRoot, activeThread, workspaceStore, workspaceStoreHydrated])

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
    if (!currentProjectRoot || !hasUsableAccounts) {
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
  }, [currentProjectRoot, hasUsableAccounts])

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

  function recordShellNavigation(entry: ShellNavigationEntry) {
    setShellHistory((current) => {
      const visibleEntries = current.entries.slice(0, current.index + 1)
      const previous = visibleEntries[visibleEntries.length - 1]
      if (previous && shellNavigationEquals(previous, entry)) {
        return {
          entries: visibleEntries,
          index: visibleEntries.length - 1,
        }
      }

      return {
        entries: [...visibleEntries, entry],
        index: visibleEntries.length,
      }
    })
  }

  function openProjectView(
    rootPath: string,
    options?: {
      pushHistory?: boolean
      historyIndex?: number
    },
  ) {
    const normalizedRootPath = normalizeProjectRoot(rootPath)
    setPanelMode(null)
    setFocusedMessageId(null)
    setError(null)
    setComposerResetToken((current) => current + 1)
    setSelectedCodePath(null)
    setSelectedDiffPath(null)
    setActiveProjectViewRoot(normalizedRootPath)
    setExpandedGroups((current) => ({
      ...current,
      [normalizedRootPath]: true,
    }))
    setWorkspaceStore((current) => upsertProject(current, normalizedRootPath))

    if (options?.pushHistory !== false) {
      recordShellNavigation({ kind: 'project', rootPath: normalizedRootPath })
    } else if (typeof options?.historyIndex === 'number') {
      setShellHistory((current) => ({ ...current, index: options.historyIndex! }))
    }
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
    const targetRoot = normalizeProjectRoot(
      rootPath || currentProjectRoot || snapshot.session.cwd || mostRecentProjectRoot(workspaceStore) || '.',
    )
    openProjectView(targetRoot)
  }

  function handleProjectSelect(rootPath: string) {
    openProjectView(rootPath)
  }

  async function openThreadView(
    threadId: string,
    options?: {
      config?: ThreadConfigOverride
      pushHistory?: boolean
      historyIndex?: number
    },
  ) {
    setBusy(true)
    setError(null)
    setFocusedMessageId(null)
    const selectedThread = snapshot.threads.find((thread) => thread.id === threadId)
    const selectedThreadRoot = selectedThread ? projectRootForThread(selectedThread) || 'other' : 'other'
    try {
      setSnapshot(await selectThread(threadId, options?.config))
      setActiveProjectViewRoot(null)
      setExpandedGroups((current) => ({
        ...current,
        [selectedThreadRoot]: true,
      }))

      if (options?.pushHistory !== false) {
        recordShellNavigation({ kind: 'thread', threadId })
      } else if (typeof options?.historyIndex === 'number') {
        setShellHistory((current) => ({ ...current, index: options.historyIndex! }))
      }
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function handleThreadSelect(threadId: string) {
    await openThreadView(threadId)
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
    const normalizedRoot = normalizeProjectRoot(root)
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
        nextSnapshot = await startThread(normalizedRoot, trimmedPrompt, attachments, config)
        preferenceThreadId = nextSnapshot.active_thread_id || null
        setActiveProjectViewRoot(null)
        setWorkspaceStore((current) => upsertProject(current, normalizedRoot))
      }

      setSnapshot(nextSnapshot)

      if (preferenceThreadId) {
        recordShellNavigation({ kind: 'thread', threadId: preferenceThreadId })
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
          updatedAt: thread.updated_at,
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

  async function handleSelectAccount(accountId: string) {
    const selectionContext = {
      requestedAccountId: accountId,
      activeAccountId: snapshot.account.active_account_id || null,
      activeIdentity: snapshot.account.identity || null,
      accountSwitchInProgress,
      busy,
      savedAccounts: snapshot.account.accounts.map((account) => ({
        id: account.id,
        label: account.label,
        isActive: account.is_active,
        state: account.state,
      })),
    }
    console.info('[kodeks-account-ui] select requested', selectionContext)

    if (!accountId || snapshot.account.active_account_id === accountId || accountSwitchInProgress) {
      console.info('[kodeks-account-ui] select ignored', {
        ...selectionContext,
        reason: !accountId
          ? 'missing-account-id'
          : snapshot.account.active_account_id === accountId
            ? 'already-active'
            : 'switch-in-progress',
      })
      setAccountMenuOpen(false)
      return
    }

    setAccountMenuOpen(false)
    setAccountSwitchingId(accountId)
    setError(null)
    try {
      console.info('[kodeks-account-ui] invoking select_account', selectionContext)
      const nextSnapshot = await selectAccount(accountId)
      console.info('[kodeks-account-ui] select_account resolved', {
        requestedAccountId: accountId,
        activeAccountId: nextSnapshot.account.active_account_id || null,
        activeIdentity: nextSnapshot.account.identity || null,
        savedAccounts: nextSnapshot.account.accounts.map((account) => ({
          id: account.id,
          label: account.label,
          isActive: account.is_active,
          state: account.state,
        })),
      })
      setSnapshot(nextSnapshot)
    } catch (nextError) {
      console.info('[kodeks-account-ui] select_account failed', {
        requestedAccountId: accountId,
        error: stringifyError(nextError),
      })
      setError(stringifyError(nextError))
      void hydrate()
    } finally {
      setAccountSwitchingId(null)
    }
  }

  async function handleDisconnectAccount(accountId: string) {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await disconnectAccount(accountId))
      setAccountMenuOpen(false)
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
    }
  }

  function handleAddAccount() {
    setAccountMenuOpen(false)
    setActiveSettingsSection('account')
    setSettingsSearch('')
    setSettingsOpen(true)
    if (busy || snapshot.account.login_in_progress) {
      return
    }
    void handleLoginChatgpt()
  }

  function openSettingsView(section: SettingsSectionKey, search = '') {
    setAccountMenuOpen(false)
    setSettingsSearch(search)
    setActiveSettingsSection(section)
    setSettingsOpen(true)
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

  async function handleOpenRateLimits() {
    setBusy(true)
    setError(null)
    try {
      setSnapshot(await refreshRateLimits())
    } catch (nextError) {
      setError(stringifyError(nextError))
    } finally {
      setBusy(false)
      setActiveSettingsSection('account')
      setSettingsOpen(true)
    }
  }

  async function handleOpenSignInLink(url?: string | null) {
    if (!url) {
      return
    }

    setError(null)
    try {
      await openExternalUrl(url)
    } catch (nextError) {
      setError(stringifyError(nextError))
    }
  }

  function findShellHistoryIndex(direction: -1 | 1) {
    let cursor = shellHistory.index + direction

    while (cursor >= 0 && cursor < shellHistory.entries.length) {
      const candidate = shellHistory.entries[cursor]
      if (candidate.kind === 'project' || snapshot.threads.some((thread) => thread.id === candidate.threadId)) {
        return cursor
      }
      cursor += direction
    }

    return -1
  }

  const backHistoryIndex = findShellHistoryIndex(-1)
  const forwardHistoryIndex = findShellHistoryIndex(1)
  const canGoBack = backHistoryIndex !== -1
  const canGoForward = forwardHistoryIndex !== -1
  const sidebarCollapsed = workspaceStore.ui.sidebarCollapsed
  const activeSidebarAccount = sidebarAccounts.find((account) => account.isActive)
  const isMacOs =
    snapshot.connection.platform_os === 'macos' ||
    (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform))

  function handleToggleSidebar() {
    setAccountMenuOpen(false)
    setWorkspaceStore((current) => setSidebarCollapsed(current, !current.ui.sidebarCollapsed))
  }

  async function handleHistoryNavigation(direction: -1 | 1) {
    const targetIndex = direction === -1 ? backHistoryIndex : forwardHistoryIndex
    if (targetIndex === -1) {
      return
    }

    const targetEntry = shellHistory.entries[targetIndex]
    if (targetEntry.kind === 'project') {
      openProjectView(targetEntry.rootPath, { pushHistory: false, historyIndex: targetIndex })
      return
    }

    await openThreadView(targetEntry.threadId, {
      pushHistory: false,
      historyIndex: targetIndex,
    })
  }

  if (!hasUsableAccounts) {
    return (
      <>
        <div className="flex h-[100svh] w-full flex-col overflow-hidden bg-[#09090b] font-sans text-neutral-200">
          <TopBar
            title={snapshot.app_name}
            isMacOs={isMacOs}
            minimal
            sidebarCollapsed={sidebarCollapsed}
            canGoBack={false}
            canGoForward={false}
            runState="idle"
            changesCount={0}
            changesDisabled
            changesOpen={false}
            codeReady={false}
            codeOpen={false}
            diagnosticsCount={0}
            diagnosticsOpen={false}
            onToggleSidebar={() => {}}
            onGoBack={() => {}}
            onGoForward={() => {}}
            onToggleChanges={() => {}}
            onToggleCode={() => {}}
            onToggleDiagnostics={() => {}}
          />

          <ConnectAccountScreen
            loginInProgress={snapshot.account.login_in_progress}
            authUrl={snapshot.account.auth_url}
            authCode={snapshot.account.auth_code}
            loginError={snapshot.account.last_login_error || error || snapshot.connection.last_error}
            busy={busy}
            onStart={() => void handleLoginChatgpt()}
            onOpenAuthUrl={(url) => void handleOpenSignInLink(url)}
            onCancel={() => void handleCancelLogin()}
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
      </>
    )
  }

  const title = activeProjectViewRoot
    ? activeProjectLabel
    : activeThread?.name || activeThread?.preview || activeProjectLabel || 'Untitled thread'

  return (
    <>
      <div className="flex h-[100svh] w-full flex-col overflow-hidden bg-[#09090b] font-sans text-neutral-200">
        <TopBar
          title={title}
          isMacOs={isMacOs}
          sidebarCollapsed={sidebarCollapsed}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          runState={runState}
          titlePinned={!activeProjectViewRoot}
          onTitleAccessoryClick={
            !activeProjectViewRoot && activeThread
              ? () => void handleArchiveThread(activeThread.id)
              : undefined
          }
          changesCount={changesCount}
          changesDisabled={changesCount === 0}
          changesOpen={effectivePanelMode === 'changes'}
          codeReady={codeReady}
          codeOpen={effectivePanelMode === 'code'}
          diagnosticsCount={diagnosticsCount}
          diagnosticsOpen={effectivePanelMode === 'diagnostics'}
          onToggleSidebar={handleToggleSidebar}
          onGoBack={() => void handleHistoryNavigation(-1)}
          onGoForward={() => void handleHistoryNavigation(1)}
          onToggleChanges={handleToggleChanges}
          onToggleCode={handleToggleCode}
          onToggleDiagnostics={handleToggleDiagnostics}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar
            collapsed={sidebarCollapsed}
            groups={sidebarGroups}
            archivedThreads={archivedThreads}
            accountMenuOpen={accountMenuOpen}
            accounts={sidebarAccounts}
            accountLabel={activeSidebarAccount?.label || snapshot.account.identity || 'workspace@agent.app'}
            planLabel={activeSidebarAccount?.planLabel || humanizePlan(snapshot.account.plan)}
            onAddProject={() => void handleAddProject()}
            onNewThread={(rootPath) => void handleNewThread(rootPath)}
            onSearch={() => openSettingsView('account')}
            onOpenPlugins={() => openSettingsView('features')}
            onOpenAutomations={() => openSettingsView('features')}
            onSelectProject={handleProjectSelect}
            onSelectThread={(threadId) => void handleThreadSelect(threadId)}
            onArchiveThread={(threadId) => void handleArchiveThread(threadId)}
            onUnarchiveThread={(threadId) => void handleUnarchiveThread(threadId)}
            onRenameProject={handleRenameProject}
            onRemoveProject={handleRemoveProject}
            onToggleGroup={handleToggleGroup}
            onToggleAccountMenu={() => setAccountMenuOpen((value) => !value)}
            onSelectAccount={(accountId) => void handleSelectAccount(accountId)}
            onAddAccount={handleAddAccount}
            onOpenSettings={() => openSettingsView('account')}
            onSignOut={() => void handleLogout()}
            signOutDisabled={busy || accountSwitchInProgress}
          />

          <div className="relative flex min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col bg-[#09090b]">
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto shell-scroll-none">
                <div className="mx-auto flex min-h-full w-full max-w-[74rem] flex-col px-4">
                  <div className="shrink-0">
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

                  <ThreadViewTransition viewKey={threadViewKey}>
                    <MessageTimeline
                      messages={shellMessagesValue}
                      suggestions={PROMPT_SUGGESTIONS}
                      emptyState={activeProjectEmptyState}
                      composerEngaged={composerEngaged}
                      fillAvailableHeight
                      liveStatus={liveStatus}
                      focusedMessageId={focusedMessageId}
                      scrollContainerRef={scrollContainerRef}
                      onSuggestionSelect={(value) => void handleSend(value)}
                      onOpenFileReference={handleOpenCodePath}
                      onOpenChangeReference={handleOpenDiffPath}
                      onOpenExternalFile={(path) => void handleOpenExternalFile(path)}
                      resolveFileReference={(token) => resolveWorkspaceReference(token, workspaceFiles)}
                    />
                  </ThreadViewTransition>
                </div>
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
                authenticated={hasUsableAccounts}
                rateLimitDisplays={composerRateLimitDisplays}
                showRateLimitsInline={workspaceStore.ui.showComposerRateLimits}
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
        </div>
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
    </>
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

function ConnectAccountScreen(props: {
  loginInProgress: boolean
  authUrl?: string | null
  authCode?: string | null
  loginError?: string | null
  busy: boolean
  onStart: () => void
  onOpenAuthUrl: (url: string) => void
  onCancel: () => void
}) {
  const primaryLabel = props.loginInProgress && props.authUrl
    ? 'Open in browser'
    : 'Connect ChatGPT account'

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-[28rem] flex-col items-center text-center">
        <h1 className="text-[clamp(1.6rem,3.6vw,2.35rem)] font-semibold tracking-[-0.045em] text-neutral-100">
          Connect ChatGPT account
        </h1>

        {props.authCode ? (
          <div className="mt-4 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-neutral-300">
            Code <span className="ml-1 shell-menlo text-neutral-100">{props.authCode}</span>
          </div>
        ) : null}

        {props.loginError ? (
          <p className="mt-4 max-w-[24rem] text-[13px] leading-[1.65] tracking-[-0.01em] text-red-200/80">
            {props.loginError}
          </p>
        ) : null}

        {props.authUrl ? (
          <button
            type="button"
            onClick={() => props.onOpenAuthUrl(props.authUrl!)}
            className="mt-5 w-full max-w-[30rem] rounded-[12px] border border-white/6 bg-white/[0.025] px-3.5 py-3 text-left transition hover:border-white/12 hover:bg-white/[0.04]"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Sign-in link
            </div>
            <div className="mt-1.5 break-all text-[12px] leading-[1.55] tracking-[-0.01em] text-neutral-300">
              {props.authUrl}
            </div>
          </button>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={props.loginInProgress && props.authUrl ? () => props.onOpenAuthUrl(props.authUrl!) : props.onStart}
            disabled={props.busy}
            className={`inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-[12px] font-medium tracking-[0.01em] transition ${
              props.busy
                ? 'cursor-not-allowed bg-white/10 text-neutral-500'
                : 'bg-white text-black hover:opacity-92'
            }`}
          >
            {primaryLabel}
          </button>

          {props.loginInProgress ? (
            <button
              type="button"
              onClick={props.onCancel}
              disabled={props.busy}
              className={`inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-[12px] font-medium tracking-[0.01em] transition ${
                props.busy
                  ? 'cursor-not-allowed text-neutral-600'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </main>
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

function normalizeSavedAccounts(account: Snapshot['account']): SavedAccountView[] {
  if (account.accounts.length > 0) {
    return account.accounts
  }

  if (account.status !== 'authenticated' && !account.identity) {
    return []
  }

  return [
    {
      id: account.active_account_id || account.identity || 'active-account',
      mode: account.mode || 'unknown',
      label: account.identity || 'Current account',
      plan: account.plan || null,
      state: account.status || 'connected',
      is_active: true,
      last_used_at: null,
    },
  ]
}

function formatAccountLastUsed(value?: number | null) {
  if (!value || !Number.isFinite(value)) {
    return null
  }

  const millis = value > 10_000_000_000 ? value : value * 1000
  const date = new Date(millis)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return `Last used ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`
}

function formatCreditsValue(rateLimits?: RateLimitsView | null) {
  const credits = rateLimits?.credits
  if (!credits) {
    return null
  }

  if (credits.unlimited) {
    return 'Unlimited'
  }

  const balance = credits.balance?.trim()
  if (balance) {
    const numericBalance = parseCreditsBalance(balance)
    if (numericBalance !== null) {
      if (numericBalance <= 0) {
        return 'No credits'
      }

      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: numericBalance % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(numericBalance)

      if (looksLikeCurrencyBalance(balance)) {
        const currencyPrefix = balance.match(/^[^\d-]+/)?.[0] || ''
        const currencySuffix = balance.match(/[^\d]+$/)?.[0]?.trim() || ''

        if (currencyPrefix) {
          return `${currencyPrefix}${formatted}`
        }
        if (currencySuffix) {
          return `${formatted} ${currencySuffix}`
        }
      }

      return `${formatted} credits`
    }

    if (balance.toLowerCase() === 'zero') {
      return 'No credits'
    }

    return balance
  }

  return credits.has_credits ? 'Credits available' : 'No credits'
}

function buildSettingsSections(
  snapshot: Snapshot,
  accountSwitchingId: string | null,
  showComposerRateLimits: boolean,
  onToggleComposerRateLimits: () => void,
  onAddChatgptAccount: () => void,
  onOpenAuthUrl: (url: string) => void,
  onSelectAccount: (accountId: string) => void,
  onDisconnectAccount: (accountId: string) => void,
  onSignOutCurrent: () => void,
): SettingsSection[] {
  const accounts = normalizeSavedAccounts(snapshot.account)
  const manageableIds = new Set(snapshot.account.accounts.map((account) => account.id))
  const switchingAccount =
    accountSwitchingId ? accounts.find((account) => account.id === accountSwitchingId) || null : null

  return [
    {
      key: 'account',
      label: 'Accounts',
      groups: [
        {
          title: 'Accounts',
          rows: [
            {
              kind: 'accounts',
              label: 'Saved accounts',
              description: switchingAccount
                ? `Switching to ${switchingAccount.label}. Keeping the current account active until the new session is ready.`
                : 'Switch accounts.',
              accounts: accounts.map((account) => ({
                id: account.id,
                label: account.label,
                planLabel: humanizePlan(account.plan),
                stateLabel:
                  accountSwitchingId === account.id ? 'Switching' : titleCase(account.state || 'connected'),
                isActive: account.is_active,
                manageable: manageableIds.has(account.id),
                lastUsedLabel: formatAccountLastUsed(account.last_used_at),
                switching: accountSwitchingId === account.id,
                actionsDisabled: Boolean(accountSwitchingId),
              })),
              emptyMessage: 'No saved accounts yet.',
              loginInProgress: snapshot.account.login_in_progress,
              switchInProgress: Boolean(accountSwitchingId),
              switchingAccountLabel: switchingAccount?.label ?? null,
              authNotice: snapshot.account.auth_notice,
              authUrl: snapshot.account.auth_url,
              authCode: snapshot.account.auth_code,
              loginError: snapshot.account.last_login_error,
              onAddChatgptAccount,
              onOpenAuthUrl,
              onSelectAccount,
              onDisconnectAccount,
            },
          ],
        },
        {
          title: 'Rate limits',
          rows: buildAccountRateLimitRows(
            snapshot,
            switchingAccount,
            showComposerRateLimits,
            onToggleComposerRateLimits,
          ),
        },
      ],
      actionLabel: 'Sign out current',
      actionTone: 'danger',
      onAction: onSignOutCurrent,
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
              description: 'Current model.',
              value: snapshot.session.model || 'Codex default',
              disabled: true,
            },
            {
              kind: 'text',
              label: 'Reasoning effort',
              description: 'Current effort.',
              value: formatReasoningEffortLabel(snapshot.session.reasoning_effort || 'medium'),
              disabled: true,
            },
          ],
        },
      ],
    },
    {
      key: 'features',
      label: 'Features',
      emptyMessage:
        'Plugin and automation surfaces are not wired into Kodeks yet. This section is reserved for that work.',
    },
  ]
}

function buildAccountRateLimitRows(
  snapshot: Snapshot,
  switchingAccount: SavedAccountView | null,
  showComposerRateLimits: boolean,
  onToggleComposerRateLimits: () => void,
): SettingsRow[] {
  const rateLimitItems = buildRateLimitSummaryItems(snapshot.account.rate_limits)
  const currentAccountLabel = snapshot.account.identity || 'current account'

  return [
    {
      kind: 'rateLimits',
      label: 'Active account rate limits',
      description:
        switchingAccount
          ? `Showing ${currentAccountLabel} limits while switching to ${switchingAccount.label}.`
          : rateLimitItems.length > 0
            ? 'Credits and reset windows for the active account.'
            : 'Waiting on runtime data.',
      planLabel: snapshot.account.rate_limits?.plan
        ? humanizePlan(snapshot.account.rate_limits.plan)
        : undefined,
      composerVisible: showComposerRateLimits,
      onToggleComposerVisible: onToggleComposerRateLimits,
      buckets: rateLimitItems.map((item) => ({
        key: item.key,
        label: item.label,
        primary: item.primary,
        secondary: item.secondary,
        tone: item.tone,
      })),
      emptyMessage: switchingAccount
        ? `Loading rate limits for ${switchingAccount.label}.`
        : 'No active account rate limits yet.',
    },
  ]
}

function buildRateLimitSummaryItems(rateLimits?: RateLimitsView | null): RateLimitSummaryItem[] {
  if (!rateLimits) {
    return []
  }

  const items: RateLimitSummaryItem[] = []
  const creditsValue = formatCreditsValue(rateLimits)
  if (rateLimits.credits && creditsValue) {
    items.push({
      key: 'credits',
      kind: 'credits',
      label: 'credits',
      primary: creditsValue,
      secondary: describeCredits(rateLimits.credits),
      reset: null,
      tone: creditsTone(rateLimits.credits),
    })
  }

  items.push(
    ...rateLimits.buckets.map((bucket) => ({
      key: bucket.key,
      kind: 'bucket' as const,
      label: formatRateLimitBucketLabel(bucket) || bucket.label || titleCase(bucket.key || 'rate limit'),
      primary: formatRateLimitPrimaryValue(bucket),
      secondary: describeRateLimitBucket(bucket),
      reset: bucket.reset_at ? formatRateLimitReset(bucket.reset_at) : null,
      tone: rateLimitTone(bucket),
    })),
  )

  return items
}

function formatRateLimitPrimaryValue(bucket: {
  remaining?: number | null
  limit?: number | null
  used?: number | null
  used_percent?: number | null
}) {
  if (typeof bucket.remaining === 'number') {
    return `${formatRateLimitNumber(bucket.remaining)} left`
  }

  if (typeof bucket.limit === 'number' && typeof bucket.used === 'number') {
    return `${formatRateLimitNumber(Math.max(bucket.limit - bucket.used, 0))} left`
  }

  if (typeof bucket.used_percent === 'number') {
    return `${formatRateLimitNumber(Math.max(100 - bucket.used_percent, 0))}% left`
  }

  if (typeof bucket.used === 'number') {
    return `${formatRateLimitNumber(bucket.used)} used`
  }

  return 'Remaining unavailable'
}

function describeRateLimitBucket(bucket: {
  remaining?: number | null
  limit?: number | null
  used?: number | null
  used_percent?: number | null
  reset_at?: string | null
  window_minutes?: number | null
}) {
  const details: string[] = []
  if (bucket.reset_at) {
    details.push(`Resets ${formatRateLimitReset(bucket.reset_at)}`)
  }
  if (typeof bucket.window_minutes === 'number') {
    details.push(`Window ${formatRateLimitWindow(bucket.window_minutes)}`)
  }
  if (typeof bucket.limit === 'number') {
    details.push(`Limit ${formatRateLimitNumber(bucket.limit)}`)
  }
  if (typeof bucket.used === 'number' && details.length === 0) {
    details.push(`Used ${formatRateLimitNumber(bucket.used)}`)
  }
  if (typeof bucket.used_percent === 'number' && details.length === 0) {
    details.push(`${formatRateLimitNumber(Math.max(100 - bucket.used_percent, 0))}% left`)
  }

  if (details.length > 0) {
    return details.join(' • ')
  }

  if (typeof bucket.remaining !== 'number') {
    return 'No remaining data yet.'
  }

  return 'Remaining available.'
}

function rateLimitTone(bucket: Pick<RateLimitBucketView, 'remaining' | 'limit' | 'used_percent'>) {
  if (typeof bucket.remaining === 'number' && typeof bucket.limit === 'number' && bucket.limit > 0) {
    const ratio = bucket.remaining / bucket.limit
    if (ratio <= 0.15) {
      return 'warning' as const
    }
    return 'calm' as const
  }

  if (typeof bucket.used_percent === 'number') {
    if (bucket.used_percent >= 85) {
      return 'warning' as const
    }
    if (bucket.used_percent <= 60) {
      return 'calm' as const
    }
  }

  return 'muted' as const
}

function creditsTone(credits: NonNullable<RateLimitsView['credits']>) {
  if (credits.unlimited) {
    return 'calm' as const
  }

  const balance = credits.balance?.trim()
  if (balance) {
    const numeric = parseCreditsBalance(balance)
    if (numeric !== null) {
      return numeric > 0 ? ('calm' as const) : ('warning' as const)
    }
    return 'calm' as const
  }

  return credits.has_credits ? ('calm' as const) : ('warning' as const)
}

function describeCredits(credits: NonNullable<RateLimitsView['credits']>) {
  if (credits.unlimited) {
    return 'Included with your plan.'
  }

  if (credits.balance?.trim()) {
    const numeric = parseCreditsBalance(credits.balance)
    if (numeric !== null && numeric <= 0) {
      return 'No credit balance.'
    }
    return 'Current credit balance.'
  }

  return credits.has_credits ? 'Credits available.' : 'No credit balance.'
}

function buildComposerRateLimitDisplays(rateLimits?: RateLimitsView | null): ComposerRateLimitDisplay[] | null {
  const items = buildRateLimitSummaryItems(rateLimits)
  if (items.length === 0) {
    return null
  }

  const prioritized = [...items].sort((left, right) => {
    if (left.kind === right.kind) {
      return 0
    }
    return left.kind === 'bucket' ? -1 : 1
  })

  return prioritized.slice(0, 2).map((item) => ({
    label: item.label,
    value: item.primary,
    reset: item.reset || null,
    tone: item.tone,
  }))
}

function looksLikeCurrencyBalance(value: string) {
  return /^[^\d-]+/.test(value.trim()) || /[A-Za-z]{3}$/.test(value.trim())
}

function parseCreditsBalance(value: string) {
  const normalized = value.trim().replace(/,/g, '')
  if (!normalized) {
    return null
  }

  const numeric = Number(normalized.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function buildSidebarAccounts(
  accounts: SavedAccountView[],
  activeAccountId: string | null,
  fallbackIdentity: string | null,
  fallbackPlan: string | null,
  switchingAccountId: string | null,
): SidebarAccount[] {
  const normalized =
    accounts.length > 0
      ? accounts
      : fallbackIdentity
        ? [
            {
              id: activeAccountId || fallbackIdentity,
              mode: 'unknown',
              label: fallbackIdentity,
              plan: fallbackPlan,
              state: 'authenticated',
              is_active: true,
              last_used_at: null,
            } as SavedAccountView,
          ]
        : []

  if (normalized.length === 0) {
    return []
  }

  const resolvedActiveId =
    activeAccountId || normalized.find((account) => account.is_active)?.id || normalized[0]?.id || null

  const ordered = [...normalized].sort((left, right) => {
    if (left.id === resolvedActiveId && right.id !== resolvedActiveId) {
      return -1
    }
    if (right.id === resolvedActiveId && left.id !== resolvedActiveId) {
      return 1
    }
    return (right.last_used_at || 0) - (left.last_used_at || 0)
  })

  return ordered.map((account) => ({
    id: account.id,
    label: account.label,
    planLabel: humanizePlan(account.plan),
    isActive: Boolean(resolvedActiveId) && account.id === resolvedActiveId,
    switching: switchingAccountId === account.id,
  }))
}

function formatRateLimitWindow(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 'n/a'
  }
  if (Math.round(value) === 10080) {
    return 'weekly'
  }
  if (value >= 60) {
    const hours = value / 60
    if (Number.isInteger(hours)) {
      return `${hours}h`
    }
    return `${hours.toFixed(1)}h`
  }
  return `${Math.round(value)}m`
}

function formatRateLimitBucketLabel(bucket: {
  label?: string | null
  window_minutes?: number | null
}) {
  if (typeof bucket.window_minutes === 'number') {
    return formatRateLimitWindow(bucket.window_minutes)
  }

  if (bucket.label) {
    return bucket.label.toLowerCase()
  }

  return null
}

function formatRateLimitReset(value: string) {
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) {
      const millis = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
      const date = new Date(millis)
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date)
      }
    }
  }

  const timestamp = Date.parse(trimmed)
  if (Number.isNaN(timestamp)) {
    return value
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function formatRateLimitNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '0'
  }
  if (Math.abs(value - Math.round(value)) < 0.01) {
    return Math.round(value).toLocaleString('en-US')
  }
  return value.toFixed(1)
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

function shellNavigationEquals(left: ShellNavigationEntry, right: ShellNavigationEntry) {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'project' && right.kind === 'project') {
    return left.rootPath === right.rootPath
  }

  if (left.kind === 'thread' && right.kind === 'thread') {
    return left.threadId === right.threadId
  }

  return false
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
