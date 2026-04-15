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

export type WorkspaceReferenceKind = 'file' | 'folder'

export type ResolvedWorkspaceReference = {
  path: string
  kind: WorkspaceReferenceKind
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
  return resolveWorkspacePathReference(token, workspaceFiles)?.path ?? null
}

export function resolveWorkspacePathReference(
  token: string,
  workspaceFiles: string[],
): ResolvedWorkspaceReference | null {
  const normalized = normalizeWorkspaceReferenceToken(token)
  if (!normalized) {
    return null
  }

  const folders = collectWorkspaceFolders(workspaceFiles)
  const candidates = [...workspaceFiles, ...folders]
  const resolvedPath = resolveWorkspaceCandidate(normalized, candidates)
  if (!resolvedPath) {
    return null
  }

  const fileSet = new Set(workspaceFiles)
  return {
    path: resolvedPath,
    kind: fileSet.has(resolvedPath) ? 'file' : 'folder',
  }
}

function resolveWorkspaceCandidate(token: string, candidates: string[]) {
  if (candidates.includes(token)) {
    return token
  }

  const tokenTail = tailPath(token)

  const exactTailMatches = candidates.filter((candidate) => tailPath(candidate) === tokenTail)
  if (exactTailMatches.length === 1) {
    return exactTailMatches[0]
  }

  const exactSuffixMatches = candidates.filter((candidate) => candidate.endsWith(token))
  if (exactSuffixMatches.length === 1) {
    return exactSuffixMatches[0]
  }

  const loweredToken = token.toLowerCase()
  const loweredTail = tokenTail.toLowerCase()

  const caseInsensitiveExact = candidates.filter(
    (candidate) => candidate.toLowerCase() === loweredToken,
  )
  if (caseInsensitiveExact.length === 1) {
    return caseInsensitiveExact[0]
  }

  const caseInsensitiveTail = candidates.filter(
    (candidate) => tailPath(candidate).toLowerCase() === loweredTail,
  )
  if (caseInsensitiveTail.length === 1) {
    return caseInsensitiveTail[0]
  }

  const caseInsensitiveSuffix = candidates.filter((candidate) =>
    candidate.toLowerCase().endsWith(loweredToken),
  )
  if (caseInsensitiveSuffix.length === 1) {
    return caseInsensitiveSuffix[0]
  }

  return null
}

function collectWorkspaceFolders(workspaceFiles: string[]) {
  const folders = new Set<string>()

  for (const file of workspaceFiles) {
    const normalized = file.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (!normalized) {
      continue
    }

    const segments = normalized.split('/').filter(Boolean)
    if (segments.length < 2) {
      continue
    }

    for (let index = 1; index < segments.length; index += 1) {
      folders.add(segments.slice(0, index).join('/'))
    }
  }

  return [...folders]
}

function normalizeWorkspaceReferenceToken(token: string) {
  return token
    .replace(/^@/, '')
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/\s+\(line\s+\d+\)$/i, '')
    .replace(/#L\d+(?:C\d+)?$/i, '')
    .replace(/:\d+(?::\d+)?$/i, '')
    .replace(/\/+$/g, '')
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
