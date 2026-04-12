export type CatalogTab = 'plugins' | 'skills'

export type PluginSourceScope = 'official' | 'personal' | 'repo'

export type PluginCategory =
  | 'collaboration'
  | 'developer_tools'
  | 'documentation'
  | 'productivity'
  | 'design'
  | 'infrastructure'
  | 'native_tooling'

export type PluginCapability =
  | 'issues_and_pull_requests'
  | 'messaging'
  | 'documents'
  | 'calendar'
  | 'design_to_code'
  | 'deployments'
  | 'observability'
  | 'datasets_and_models'
  | 'native_builds'
  | 'automation'

export type PluginAuthPolicy = 'none' | 'optional' | 'required'
export type PluginInstallationPolicy = 'marketplace' | 'local_manifest' | 'bundled'
export type PluginAuthStatus = 'not_required' | 'needs_auth' | 'connected' | 'expired'
export type PluginInstallStatus =
  | 'available'
  | 'installing'
  | 'installed'
  | 'disabled'
  | 'update_available'
  | 'bundled'
  | 'system'

export type PluginSection = 'featured' | 'coding'

export type PluginSource = {
  id: string
  display_name: string
  publisher: string
  is_curated: boolean
  scope: PluginSourceScope
}

export type PluginCatalogEntry = {
  plugin_id: string
  name: string
  display_name: string
  short_description: string
  long_description: string
  category: PluginCategory
  capabilities: PluginCapability[]
  auth_policy: PluginAuthPolicy
  installation_policy: PluginInstallationPolicy
  logo: string | null
  screenshots: string[]
  developer_name: string
  website_url: string | null
  privacy_policy_url: string | null
  terms_of_service_url: string | null
  bundled_skills: string[]
  bundled_apps: string[]
  bundled_mcp_servers: string[]
}

export type InstalledPluginState = {
  plugin_id: string
  installed_version: string | null
  is_installed: boolean
  is_enabled: boolean
  auth_status: PluginAuthStatus
  has_update: boolean
  install_status: PluginInstallStatus
}

export type PluginListEntry = {
  section: PluginSection
  source_id: string
  catalog: PluginCatalogEntry
  installed_state: InstalledPluginState
}

export type PluginCatalogPayload = {
  sources: PluginSource[]
  entries: PluginListEntry[]
}

export type PluginDetails = {
  source: PluginSource
  catalog: PluginCatalogEntry
  installed_state: InstalledPluginState
  management_notes: string[]
}

export type SkillScope = 'recommended' | 'system' | 'personal' | 'repo' | 'plugin_bundled'
export type SkillSourceKind = 'catalog' | 'system' | 'user_installed' | 'local_repo' | 'plugin_bundled'
export type SkillDependencyKind = 'skill' | 'app' | 'mcp_server' | 'binary' | 'file'
export type SkillSection = 'recommended' | 'system' | 'personal'
export type SkillInvocationBehavior = 'explicit_only' | 'explicit_or_implicit'

export type SkillDependency = {
  kind: SkillDependencyKind
  value: string
  label: string
  required: boolean
}

export type SkillRecord = {
  skill_id: string
  name: string
  display_name: string
  description: string
  short_description: string
  scope: SkillScope
  path: string | null
  enabled: boolean
  is_installed: boolean
  source_kind: SkillSourceKind
  allow_implicit_invocation: boolean
  default_prompt: string | null
  icon: string | null
  brand_color: string | null
  dependencies: SkillDependency[]
}

export type SkillListEntry = {
  section: SkillSection
  record: SkillRecord
  bundled_by_plugin_id: string | null
  bundled_by_plugin_name: string | null
}

export type SkillCatalogPayload = {
  entries: SkillListEntry[]
}

export type SkillDetails = {
  record: SkillRecord
  bundled_by_plugin_id: string | null
  bundled_by_plugin_name: string | null
  invocation_behavior: SkillInvocationBehavior
  dependency_notes: string[]
}

export type SkillScaffoldScope = 'repo' | 'user'

export type CreateSkillScaffoldRequest = {
  name: string
  display_name: string | null
  description: string
  scope: SkillScaffoldScope
  destination_root: string | null
  allow_implicit_invocation: boolean
  default_prompt: string | null
  brand_color: string | null
}

export type CreateSkillScaffoldResult = {
  skill_id: string
  scope: SkillScope
  path: string
  created_files: string[]
}

export type PluginScaffoldScope = 'repo' | 'user'

export type CreatePluginScaffoldRequest = {
  name: string
  display_name: string | null
  description: string
  scope: PluginScaffoldScope
  destination_root: string | null
  category: PluginCategory
  with_skills: boolean
  with_apps: boolean
  with_mcp_server: boolean
}

export type CreatePluginScaffoldResult = {
  plugin_id: string
  source_id: string
  path: string
  marketplace_path: string
  created_files: string[]
}

export type CatalogDrawerState =
  | {
      kind: 'plugin_details'
      plugin_id: string
    }
  | {
      kind: 'skill_details'
      skill_id: string
    }
  | {
      kind: 'plugin_manage'
    }
  | {
      kind: 'skill_manage'
    }
  | {
      kind: 'plugin_create'
    }
  | {
      kind: 'skill_create'
    }
  | null

export type AsyncResource<T> =
  | {
      status: 'idle' | 'loading'
      data: T | null
      error: string | null
    }
  | {
      status: 'ready'
      data: T
      error: null
    }
  | {
      status: 'error'
      data: T | null
      error: string
    }

export type PluginFilters = {
  search: string
  source_id: string
  category: PluginCategory | 'all'
}

export type SkillFilters = {
  search: string
  scope: SkillScope | 'all'
  source_kind: SkillSourceKind | 'all'
}
