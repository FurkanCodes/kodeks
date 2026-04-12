import type { Snapshot } from './kodeks.ts'
import { defaultProjectLabel, normalizeProjectRoot, type WorkspaceStore } from './workspaceStore.ts'

export type SidebarThread = {
  id: string
  label: string
  active: boolean
  live: boolean
  updatedAt: number
  accountTag?: string | null
}

export type SidebarGroup = {
  key: string
  label: string
  rootPath: string | null
  active: boolean
  expanded: boolean
  threads: SidebarThread[]
}

export function projectRootForThread(thread: Snapshot['threads'][number]) {
  const rootPath = thread.repo || thread.cwd || null
  return rootPath ? normalizeProjectRoot(rootPath) : null
}

export function mostRecentProjectRoot(store: WorkspaceStore) {
  return [...store.projects]
    .filter((project) => !project.removed)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)[0]?.rootPath || null
}

export function buildSidebarGroups(
  threads: Snapshot['threads'],
  store: WorkspaceStore,
  activeProjectRoot: string | null,
  activeThreadId: string | null,
  expanded: Record<string, boolean>,
  activeTurnId: string | null,
  activeAccountId: string | null,
  savedAccountCount: number,
): SidebarGroup[] {
  const buckets = new Map<string, SidebarGroup>()
  const normalizedActiveProjectRoot = activeProjectRoot ? normalizeProjectRoot(activeProjectRoot) : null
  const projectMap = new Map(store.projects.map((project) => [normalizeProjectRoot(project.rootPath), project]))
  const sortedThreads = [...threads].sort((left, right) => right.updated_at - left.updated_at)

  const ensureBucket = (key: string, label: string, rootPath: string | null, active = false) => {
    const existing = buckets.get(key)
    if (existing) {
      existing.active = existing.active || active
      return existing
    }

    const created: SidebarGroup = {
      key,
      label,
      rootPath,
      active,
      expanded: expanded[key] ?? true,
      threads: [],
    }
    buckets.set(key, created)
    return created
  }

  for (const project of store.projects
    .filter((item) => !item.removed)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)) {
    const rootPath = normalizeProjectRoot(project.rootPath)
    ensureBucket(
      rootPath,
      project.label || defaultProjectLabel(rootPath),
      rootPath,
      rootPath === normalizedActiveProjectRoot,
    )
  }

  for (const thread of sortedThreads) {
    const rootPath = projectRootForThread(thread)
    const savedProject = rootPath ? projectMap.get(rootPath) : null
    const removed = savedProject?.removed
    const key = removed || !rootPath ? 'other' : rootPath
    const label = removed || !rootPath ? 'Other' : savedProject?.label || defaultProjectLabel(rootPath)
    const bucket = ensureBucket(
      key,
      label,
      removed ? null : rootPath,
      rootPath === normalizedActiveProjectRoot || thread.id === activeThreadId,
    )
    bucket.threads.push({
      id: thread.id,
      label: thread.name || thread.preview || 'Untitled thread',
      active: thread.id === activeThreadId,
      live: Boolean(activeTurnId) && thread.id === activeThreadId,
      updatedAt: thread.updated_at,
      accountTag: threadAccountTag(thread, activeAccountId, savedAccountCount),
    })
  }

  const orderedRoots = store.projects
    .filter((project) => !project.removed)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .map((project) => normalizeProjectRoot(project.rootPath))

  const orderedGroups = orderedRoots.map((root) => buckets.get(root)).filter(Boolean) as SidebarGroup[]
  const remainder = [...buckets.values()].filter((group) => !orderedRoots.includes(group.key))
  remainder.sort((left, right) => {
    if (left.label === 'Other' && right.label !== 'Other') {
      return 1
    }
    if (right.label === 'Other' && left.label !== 'Other') {
      return -1
    }
    return left.label.localeCompare(right.label)
  })

  const groups = [...orderedGroups, ...remainder]
  if (!groups.some((group) => group.key === 'other')) {
    groups.push({
      key: 'other',
      label: 'Other',
      rootPath: null,
      active: false,
      expanded: expanded.other ?? true,
      threads: [],
    })
  }
  return groups
}

function threadAccountTag(
  thread: Snapshot['threads'][number],
  activeAccountId: string | null,
  savedAccountCount: number,
) {
  if (savedAccountCount <= 1 || !activeAccountId || !thread.last_account_id) {
    return null
  }

  if (thread.last_account_id === activeAccountId) {
    return null
  }

  return (
    thread.last_account_label ||
    (thread.last_account_plan ? titleCase(thread.last_account_plan) : null) ||
    'Other account'
  )
}

export function resolveWorkspaceReference(token: string, workspaceFiles: string[]) {
  const normalized = normalizeWorkspaceReferenceToken(token)
  if (!normalized) {
    return null
  }

  if (workspaceFiles.includes(normalized)) {
    return normalized
  }

  const exactTail = workspaceFiles.filter((file) => tailPath(file) === tailPath(normalized))
  if (exactTail.length === 1) {
    return exactTail[0]
  }

  const pathMatch = workspaceFiles.find((file) => file.endsWith(normalized))
  return pathMatch || null
}

function normalizeWorkspaceReferenceToken(token: string) {
  return token
    .replace(/^@/, '')
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/\s+\(line\s+\d+\)$/i, '')
    .replace(/#L\d+(?:C\d+)?$/i, '')
    .replace(/:\d+(?::\d+)?$/i, '')
    .trim()
}

export function extractReferenceQuery(value: string) {
  const explicitReference = value.match(/(?:^|\s)@([\w./-]*)$/)
  if (explicitReference) {
    return explicitReference[1] || null
  }

  const fileLikeToken = value.match(/(?:^|\s)([\w./-]+\.[\w]+)$/)
  return fileLikeToken?.[1] || null
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
