export type SavedProject = {
  id: string
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
  recentRoots: string[]
  threadPreferences: Record<string, ThreadPreference>
}

const STORAGE_KEY = 'kodeks.workspace-store.v1'

const EMPTY_STORE: WorkspaceStore = {
  projects: [],
  recentRoots: [],
  threadPreferences: {},
}

export function loadWorkspaceStore(): WorkspaceStore {
  if (typeof window === 'undefined') {
    return EMPTY_STORE
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return EMPTY_STORE
    }

    const parsed = JSON.parse(raw) as Partial<WorkspaceStore>
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter(Boolean) as SavedProject[] : [],
      recentRoots: Array.isArray(parsed.recentRoots) ? parsed.recentRoots.filter(Boolean) as string[] : [],
      threadPreferences:
        parsed.threadPreferences && typeof parsed.threadPreferences === 'object'
          ? parsed.threadPreferences as Record<string, ThreadPreference>
          : {},
    }
  } catch {
    return EMPTY_STORE
  }
}

export function saveWorkspaceStore(store: WorkspaceStore) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function defaultProjectLabel(rootPath: string) {
  const normalized = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const tail = normalized.split('/').filter(Boolean).pop() || 'Other'
  return tail.replace(/[-_]/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

export function upsertProject(store: WorkspaceStore, rootPath: string, label?: string) {
  const next: WorkspaceStore = {
    ...store,
    projects: [...store.projects],
    recentRoots: [...store.recentRoots],
    threadPreferences: { ...store.threadPreferences },
  }
  const now = Date.now()
  const existing = next.projects.find((project) => project.rootPath === rootPath)

  if (existing) {
    existing.label = label || existing.label || defaultProjectLabel(rootPath)
    existing.lastUsedAt = now
    existing.removed = false
  } else {
    next.projects.push({
      id: rootPath,
      rootPath,
      label: label || defaultProjectLabel(rootPath),
      lastUsedAt: now,
      removed: false,
    })
  }

  next.recentRoots = [rootPath, ...next.recentRoots.filter((value) => value !== rootPath)].slice(0, 8)
  return next
}

export function renameProject(store: WorkspaceStore, rootPath: string, label: string) {
  const next = cloneStore(store)
  const project = next.projects.find((item) => item.rootPath === rootPath)
  if (project) {
    project.label = label.trim() || defaultProjectLabel(rootPath)
    project.removed = false
  }
  return next
}

export function removeProjectGrouping(store: WorkspaceStore, rootPath: string) {
  const next = cloneStore(store)
  const project = next.projects.find((item) => item.rootPath === rootPath)
  if (project) {
    project.removed = true
  } else {
    next.projects.push({
      id: rootPath,
      rootPath,
      label: defaultProjectLabel(rootPath),
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

function cloneStore(store: WorkspaceStore): WorkspaceStore {
  return {
    projects: store.projects.map((project) => ({ ...project })),
    recentRoots: [...store.recentRoots],
    threadPreferences: { ...store.threadPreferences },
  }
}
