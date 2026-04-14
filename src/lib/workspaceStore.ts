export type SavedProject = {
  rootPath: string
  label: string
  removed?: boolean
  lastUsedAt: number
}

export type ThreadPreference = {
  model?: string
  reasoningEffort?: string
}

export type WorkspaceStore = {
  projects: SavedProject[]
  threadPreferences: Record<string, ThreadPreference>
  ui: WorkspaceUiState
}

export type WorkspaceUiState = {
  sidebarCollapsed: boolean
  sidebarWidth: number
  inspectorWidth: number
  showComposerRateLimits: boolean
  terminalOpen: boolean
  terminalHeight: number
}

const MIN_SIDEBAR_WIDTH = 248
const MAX_SIDEBAR_WIDTH = 420
const DEFAULT_SIDEBAR_WIDTH = 304

const MIN_INSPECTOR_WIDTH = 340
const MAX_INSPECTOR_WIDTH = 760
const DEFAULT_INSPECTOR_WIDTH = 440

const MIN_TERMINAL_HEIGHT = 160
const MAX_TERMINAL_HEIGHT = 720
const DEFAULT_TERMINAL_HEIGHT = 280

export const LEGACY_WORKSPACE_STORE_KEY = 'kodeks.workspace-store.v1'

export const EMPTY_WORKSPACE_STORE: WorkspaceStore = {
  projects: [],
  threadPreferences: {},
  ui: {
    sidebarCollapsed: false,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    inspectorWidth: DEFAULT_INSPECTOR_WIDTH,
    showComposerRateLimits: true,
    terminalOpen: false,
    terminalHeight: DEFAULT_TERMINAL_HEIGHT,
  },
}

type LegacyWorkspaceStore = WorkspaceStore & {
  recentRoots?: string[]
}

export function normalizeProjectRoot(rootPath: string) {
  const normalized = rootPath.trim().replace(/\\/g, '/')
  const withoutTrailingSlash = normalized.replace(/\/+$/g, '')
  return withoutTrailingSlash || normalized
}

export function normalizeWorkspaceStore(value: Partial<WorkspaceStore> | null | undefined): WorkspaceStore {
  const parsed = value ?? {}
  const normalizedProjects = Array.isArray(parsed.projects)
    ? Array.from(
        parsed.projects
          .filter((project): project is SavedProject => Boolean(project?.rootPath))
          .reduce((projects, project) => {
            const rootPath = normalizeProjectRoot(project.rootPath)
            if (!rootPath) {
              return projects
            }

            const nextProject: SavedProject = {
              rootPath,
              label: project.label || defaultProjectLabel(rootPath),
              removed: Boolean(project.removed),
              lastUsedAt: Number.isFinite(project.lastUsedAt) ? project.lastUsedAt : 0,
            }
            const existing = projects.get(rootPath)

            if (!existing || nextProject.lastUsedAt >= existing.lastUsedAt) {
              projects.set(rootPath, nextProject)
            }

            return projects
          }, new Map<string, SavedProject>())
          .values(),
      )
    : []

  return {
    projects: normalizedProjects,
    threadPreferences:
      parsed.threadPreferences && typeof parsed.threadPreferences === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.threadPreferences)
              .filter(([threadId]) => threadId.trim().length > 0)
              .map(([threadId, preference]) => {
                const nextPreference: ThreadPreference = {}
                if (typeof preference?.model === 'string') {
                  nextPreference.model = preference.model
                }
                if (typeof preference?.reasoningEffort === 'string') {
                  nextPreference.reasoningEffort = preference.reasoningEffort
                }
                return [threadId, nextPreference]
              }),
          )
        : {},
    ui:
      parsed.ui && typeof parsed.ui === 'object'
        ? {
            sidebarCollapsed: Boolean((parsed.ui as Partial<WorkspaceUiState>).sidebarCollapsed),
            sidebarWidth: normalizeSidebarWidth((parsed.ui as Partial<WorkspaceUiState>).sidebarWidth),
            inspectorWidth: normalizeInspectorWidth(
              (parsed.ui as Partial<WorkspaceUiState>).inspectorWidth,
            ),
            showComposerRateLimits:
              (parsed.ui as Partial<WorkspaceUiState>).showComposerRateLimits ??
              EMPTY_WORKSPACE_STORE.ui.showComposerRateLimits,
            terminalOpen:
              (parsed.ui as Partial<WorkspaceUiState>).terminalOpen ??
              EMPTY_WORKSPACE_STORE.ui.terminalOpen,
            terminalHeight: normalizeTerminalHeight(
              (parsed.ui as Partial<WorkspaceUiState>).terminalHeight,
            ),
          }
        : { ...EMPTY_WORKSPACE_STORE.ui },
  }
}

export function loadLegacyWorkspaceStore(): WorkspaceStore {
  if (typeof window === 'undefined') {
    return EMPTY_WORKSPACE_STORE
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_WORKSPACE_STORE_KEY)
    if (!raw) {
      return EMPTY_WORKSPACE_STORE
    }

    return normalizeWorkspaceStore(JSON.parse(raw) as Partial<LegacyWorkspaceStore>)
  } catch {
    return EMPTY_WORKSPACE_STORE
  }
}

export function clearLegacyWorkspaceStore() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(LEGACY_WORKSPACE_STORE_KEY)
}

export function hasWorkspaceStoreData(store: WorkspaceStore) {
  return (
    store.projects.length > 0 ||
    Object.keys(store.threadPreferences).length > 0 ||
    store.ui.sidebarCollapsed !== EMPTY_WORKSPACE_STORE.ui.sidebarCollapsed ||
    store.ui.sidebarWidth !== EMPTY_WORKSPACE_STORE.ui.sidebarWidth ||
    store.ui.inspectorWidth !== EMPTY_WORKSPACE_STORE.ui.inspectorWidth ||
    store.ui.showComposerRateLimits !== EMPTY_WORKSPACE_STORE.ui.showComposerRateLimits ||
    store.ui.terminalOpen !== EMPTY_WORKSPACE_STORE.ui.terminalOpen ||
    store.ui.terminalHeight !== EMPTY_WORKSPACE_STORE.ui.terminalHeight
  )
}

export function resolvePersistedWorkspaceStore(
  nativeStore: WorkspaceStore,
  legacyStore: WorkspaceStore | null | undefined,
) {
  if (hasWorkspaceStoreData(nativeStore)) {
    return {
      store: nativeStore,
      migratedLegacy: false,
    }
  }

  const fallback = normalizeWorkspaceStore(legacyStore)
  if (hasWorkspaceStoreData(fallback)) {
    return {
      store: fallback,
      migratedLegacy: true,
    }
  }

  return {
    store: nativeStore,
    migratedLegacy: false,
  }
}

export function defaultProjectLabel(rootPath: string) {
  const normalized = normalizeProjectRoot(rootPath)
  const tail = normalized.split('/').filter(Boolean).pop() || 'Other'
  return tail.replace(/[-_]/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

export function upsertProject(store: WorkspaceStore, rootPath: string, label?: string) {
  const normalizedRootPath = normalizeProjectRoot(rootPath)
  const next = cloneStore(normalizeWorkspaceStore(store))
  const now = Date.now()
  const existing = next.projects.find((project) => project.rootPath === normalizedRootPath)

  if (existing) {
    existing.label = label || existing.label || defaultProjectLabel(normalizedRootPath)
    existing.lastUsedAt = now
    existing.removed = false
  } else {
    next.projects.push({
      rootPath: normalizedRootPath,
      label: label || defaultProjectLabel(normalizedRootPath),
      lastUsedAt: now,
      removed: false,
    })
  }

  return next
}

export function renameProject(store: WorkspaceStore, rootPath: string, label: string) {
  const normalizedRootPath = normalizeProjectRoot(rootPath)
  const next = cloneStore(normalizeWorkspaceStore(store))
  const project = next.projects.find((item) => item.rootPath === normalizedRootPath)
  if (project) {
    project.label = label.trim() || defaultProjectLabel(normalizedRootPath)
    project.removed = false
  }
  return next
}

export function removeProjectGrouping(store: WorkspaceStore, rootPath: string) {
  const normalizedRootPath = normalizeProjectRoot(rootPath)
  const next = cloneStore(normalizeWorkspaceStore(store))
  const project = next.projects.find((item) => item.rootPath === normalizedRootPath)
  if (project) {
    project.removed = true
  } else {
    next.projects.push({
      rootPath: normalizedRootPath,
      label: defaultProjectLabel(normalizedRootPath),
      lastUsedAt: Date.now(),
      removed: true,
    })
  }
  return next
}

export function setThreadPreference(
  store: WorkspaceStore,
  threadId: string,
  preference: ThreadPreference,
) {
  const next = cloneStore(store)
  next.threadPreferences[threadId] = {
    ...next.threadPreferences[threadId],
    ...preference,
  }
  return next
}

export function setSidebarCollapsed(store: WorkspaceStore, collapsed: boolean) {
  const next = cloneStore(store)
  next.ui.sidebarCollapsed = collapsed
  return next
}

export function setSidebarWidth(store: WorkspaceStore, width: number) {
  const next = cloneStore(store)
  next.ui.sidebarWidth = normalizeSidebarWidth(width)
  return next
}

export function setInspectorWidth(store: WorkspaceStore, width: number) {
  const next = cloneStore(store)
  next.ui.inspectorWidth = normalizeInspectorWidth(width)
  return next
}

export function setComposerRateLimitsVisible(store: WorkspaceStore, visible: boolean) {
  const next = cloneStore(store)
  next.ui.showComposerRateLimits = visible
  return next
}

export function setTerminalOpen(store: WorkspaceStore, open: boolean) {
  const next = cloneStore(store)
  next.ui.terminalOpen = open
  return next
}

export function setTerminalHeight(store: WorkspaceStore, height: number) {
  const next = cloneStore(store)
  next.ui.terminalHeight = normalizeTerminalHeight(height)
  return next
}

function cloneStore(store: WorkspaceStore): WorkspaceStore {
  return {
    projects: store.projects.map((project) => ({ ...project })),
    threadPreferences: { ...store.threadPreferences },
    ui: { ...store.ui },
  }
}

function normalizeTerminalHeight(value: unknown) {
  if (!Number.isFinite(value)) {
    return DEFAULT_TERMINAL_HEIGHT
  }

  const numeric = Math.round(Number(value))
  if (numeric < MIN_TERMINAL_HEIGHT) {
    return MIN_TERMINAL_HEIGHT
  }
  if (numeric > MAX_TERMINAL_HEIGHT) {
    return MAX_TERMINAL_HEIGHT
  }
  return numeric
}

function normalizeSidebarWidth(value: unknown) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SIDEBAR_WIDTH
  }

  const numeric = Math.round(Number(value))
  if (numeric < MIN_SIDEBAR_WIDTH) {
    return MIN_SIDEBAR_WIDTH
  }
  if (numeric > MAX_SIDEBAR_WIDTH) {
    return MAX_SIDEBAR_WIDTH
  }
  return numeric
}

function normalizeInspectorWidth(value: unknown) {
  if (!Number.isFinite(value)) {
    return DEFAULT_INSPECTOR_WIDTH
  }

  const numeric = Math.round(Number(value))
  if (numeric < MIN_INSPECTOR_WIDTH) {
    return MIN_INSPECTOR_WIDTH
  }
  if (numeric > MAX_INSPECTOR_WIDTH) {
    return MAX_INSPECTOR_WIDTH
  }
  return numeric
}
