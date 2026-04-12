import type {
  PluginCategory,
  PluginFilters,
  PluginListEntry,
  PluginSection,
  SkillFilters,
  SkillListEntry,
  SkillScope,
  SkillSection,
  SkillSourceKind,
} from './models'

export type CatalogCardStatusKind =
  | 'available'
  | 'installed'
  | 'connected'
  | 'needs_auth'
  | 'disabled'
  | 'system'
  | 'bundled'
  | 'update'

export type CatalogSectionView<T> = {
  id: string
  label: string
  items: T[]
}

export function getPluginSections(
  entries: PluginListEntry[],
  filters: PluginFilters,
): CatalogSectionView<PluginListEntry>[] {
  const normalizedQuery = normalizeQuery(filters.search)
  const filtered = entries.filter((entry) => {
    if (filters.source_id !== 'all' && entry.source_id !== filters.source_id) {
      return false
    }
    if (filters.category !== 'all' && entry.catalog.category !== filters.category) {
      return false
    }
    if (!normalizedQuery) {
      return true
    }

    const haystack = [
      entry.catalog.display_name,
      entry.catalog.short_description,
      entry.catalog.long_description,
      entry.catalog.category,
      entry.catalog.developer_name,
      ...entry.catalog.capabilities,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQuery)
  })

  return sectionOrder<PluginSection>(['featured', 'coding'])
    .map((section) => ({
      id: section,
      label: pluginSectionLabel(section),
      items: filtered.filter((entry) => entry.section === section),
    }))
    .filter((section) => section.items.length > 0)
}

export function getSkillSections(
  entries: SkillListEntry[],
  filters: SkillFilters,
): CatalogSectionView<SkillListEntry>[] {
  const normalizedQuery = normalizeQuery(filters.search)
  const filtered = entries.filter((entry) => {
    if (filters.scope !== 'all' && entry.record.scope !== filters.scope) {
      return false
    }
    if (filters.source_kind !== 'all' && entry.record.source_kind !== filters.source_kind) {
      return false
    }
    if (!normalizedQuery) {
      return true
    }

    const haystack = [
      entry.record.display_name,
      entry.record.short_description,
      entry.record.description,
      entry.record.scope,
      entry.record.source_kind,
      entry.bundled_by_plugin_name,
      ...entry.record.dependencies.map((dependency) => dependency.label),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQuery)
  })

  return sectionOrder<SkillSection>(['recommended', 'system', 'personal'])
    .map((section) => ({
      id: section,
      label: skillSectionLabel(section),
      items: filtered.filter((entry) => entry.section === section),
    }))
    .filter((section) => section.items.length > 0)
}

export function getPluginCategoryOptions(entries: PluginListEntry[]) {
  return uniqueValues(entries.map((entry) => entry.catalog.category))
    .sort()
    .map((value) => ({
      value,
      label: pluginCategoryLabel(value),
    }))
}

export function getSkillScopeOptions(entries: SkillListEntry[]) {
  return uniqueValues(entries.map((entry) => entry.record.scope))
    .sort()
    .map((value) => ({
      value,
      label: skillScopeLabel(value),
    }))
}

export function getSkillSourceOptions(entries: SkillListEntry[]) {
  return uniqueValues(entries.map((entry) => entry.record.source_kind))
    .sort()
    .map((value) => ({
      value,
      label: skillSourceKindLabel(value),
    }))
}

export function getPluginCardStatus(entry: PluginListEntry): CatalogCardStatusKind {
  const { installed_state } = entry
  if (installed_state.install_status === 'update_available' || installed_state.has_update) {
    return 'update'
  }
  if (!installed_state.is_installed) {
    return 'available'
  }
  if (!installed_state.is_enabled || installed_state.install_status === 'disabled') {
    return 'disabled'
  }
  if (installed_state.auth_status === 'connected') {
    return 'connected'
  }
  if (installed_state.auth_status === 'needs_auth') {
    return 'needs_auth'
  }
  return 'installed'
}

export function getSkillCardStatus(entry: SkillListEntry): CatalogCardStatusKind {
  if (entry.record.scope === 'system') {
    return 'system'
  }
  if (entry.record.scope === 'plugin_bundled') {
    return entry.record.is_installed ? 'bundled' : 'disabled'
  }
  if (!entry.record.is_installed) {
    return 'available'
  }
  if (!entry.record.enabled) {
    return 'disabled'
  }
  return 'installed'
}

export function pluginCategoryLabel(category: PluginCategory) {
  switch (category) {
    case 'developer_tools':
      return 'Developer Tools'
    case 'native_tooling':
      return 'Native Tooling'
    default:
      return titleCase(category)
  }
}

export function skillScopeLabel(scope: SkillScope | 'all') {
  if (scope === 'all') {
    return 'All scopes'
  }
  if (scope === 'plugin_bundled') {
    return 'Plugin bundled'
  }
  return titleCase(scope)
}

export function skillSourceKindLabel(sourceKind: SkillSourceKind | 'all') {
  if (sourceKind === 'all') {
    return 'All sources'
  }
  switch (sourceKind) {
    case 'user_installed':
      return 'User installed'
    case 'local_repo':
      return 'Repo local'
    case 'plugin_bundled':
      return 'Plugin bundled'
    default:
      return titleCase(sourceKind)
  }
}

export function pluginSectionLabel(section: PluginSection) {
  return titleCase(section)
}

export function skillSectionLabel(section: SkillSection) {
  return titleCase(section)
}

export function moveGridFocus(
  orderedIds: string[],
  currentId: string,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
  columns: number,
) {
  const currentIndex = orderedIds.indexOf(currentId)
  if (currentIndex === -1 || orderedIds.length === 0) {
    return null
  }

  const safeColumns = Math.max(columns, 1)
  const offset =
    key === 'ArrowLeft'
      ? -1
      : key === 'ArrowRight'
        ? 1
        : key === 'ArrowUp'
          ? -safeColumns
          : safeColumns

  const nextIndex = currentIndex + offset
  if (nextIndex < 0 || nextIndex >= orderedIds.length) {
    return null
  }
  return orderedIds[nextIndex] ?? null
}

export function flattenSectionIds<T extends { catalog?: { plugin_id: string }; record?: { skill_id: string } }>(
  sections: CatalogSectionView<T>[],
) {
  return sections.flatMap((section) =>
    section.items.map((item) => {
      if ('catalog' in item && item.catalog) {
        return item.catalog.plugin_id
      }
      if ('record' in item && item.record) {
        return item.record.skill_id
      }
      return ''
    }),
  )
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase()
}

function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values))
}

function titleCase(value: string) {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function sectionOrder<T extends string>(values: T[]) {
  return values
}
