import { useEffect, useReducer, useState } from 'react'
import type {
  AsyncResource,
  CatalogTab,
  CreateSkillScaffoldRequest,
  InstalledPluginState,
  PluginCatalogPayload,
  PluginDetails,
  SkillCatalogPayload,
  SkillDetails,
  SkillRecord,
} from './models'
import type { CatalogRepository } from './repository'
import {
  catalogWorkspaceReducer,
  createInitialCatalogWorkspaceState,
} from './state'

function idleResource<T>(): AsyncResource<T> {
  return {
    status: 'idle',
    data: null,
    error: null,
  }
}

function loadingResource<T>(previous: AsyncResource<T>): AsyncResource<T> {
  return {
    status: 'loading',
    data: previous.data,
    error: null,
  }
}

function readyResource<T>(data: T): AsyncResource<T> {
  return {
    status: 'ready',
    data,
    error: null,
  }
}

function errorResource<T>(previous: AsyncResource<T>, error: unknown): AsyncResource<T> {
  return {
    status: 'error',
    data: previous.data,
    error: error instanceof Error ? error.message : String(error),
  }
}

export function useCatalogWorkspace(
  open: boolean,
  initialTab: CatalogTab,
  projectRoot: string,
  repository: CatalogRepository,
) {
  const [state, dispatch] = useReducer(catalogWorkspaceReducer, createInitialCatalogWorkspaceState(initialTab))
  const [plugins, setPlugins] = useState<AsyncResource<PluginCatalogPayload>>(idleResource)
  const [skills, setSkills] = useState<AsyncResource<SkillCatalogPayload>>(idleResource)
  const [pluginDetails, setPluginDetails] = useState<Record<string, AsyncResource<PluginDetails>>>({})
  const [skillDetails, setSkillDetails] = useState<Record<string, AsyncResource<SkillDetails>>>({})
  const [pluginBusy, setPluginBusy] = useState<Record<string, string>>({})
  const [skillBusy, setSkillBusy] = useState<Record<string, string>>({})
  const [createPluginPending, setCreatePluginPending] = useState(false)
  const [createSkillPending, setCreateSkillPending] = useState(false)

  useEffect(() => {
    dispatch({ type: 'set_tab', tab: initialTab })
  }, [initialTab])

  useEffect(() => {
    if (!open) {
      return
    }
    if (plugins.status === 'idle') {
      void reloadPlugins()
    }
    if (skills.status === 'idle') {
      void reloadSkills()
    }
  }, [open, plugins.status, skills.status])

  useEffect(() => {
    if (!open) {
      return
    }
    void reloadPlugins()
    void reloadSkills()
  }, [open, projectRoot])

  async function reloadPlugins(forceRemoteSync = false) {
    setPlugins((current) => loadingResource(current))
    try {
      setPlugins(readyResource(await repository.listPlugins(forceRemoteSync)))
    } catch (error) {
      setPlugins((current) => errorResource(current, error))
    }
  }

  async function reloadSkills() {
    setSkills((current) => loadingResource(current))
    try {
      setSkills(readyResource(await repository.listSkills()))
    } catch (error) {
      setSkills((current) => errorResource(current, error))
    }
  }

  async function openPluginDetails(pluginId: string) {
    dispatch({ type: 'open_drawer', drawer: { kind: 'plugin_details', plugin_id: pluginId } })
    const cached = pluginDetails[pluginId]
    if (cached?.status === 'ready' || cached?.status === 'loading') {
      return
    }

    setPluginDetails((current) => ({
      ...current,
      [pluginId]: loadingResource(current[pluginId] ?? idleResource()),
    }))
    try {
      const detail = await repository.getPluginDetails(pluginId)
      setPluginDetails((current) => ({
        ...current,
        [pluginId]: readyResource(detail),
      }))
    } catch (error) {
      setPluginDetails((current) => ({
        ...current,
        [pluginId]: errorResource(current[pluginId] ?? idleResource(), error),
      }))
    }
  }

  async function openSkillDetails(skillId: string) {
    dispatch({ type: 'open_drawer', drawer: { kind: 'skill_details', skill_id: skillId } })
    const cached = skillDetails[skillId]
    if (cached?.status === 'ready' || cached?.status === 'loading') {
      return
    }

    setSkillDetails((current) => ({
      ...current,
      [skillId]: loadingResource(current[skillId] ?? idleResource()),
    }))
    try {
      const detail = await repository.getSkillDetails(skillId)
      setSkillDetails((current) => ({
        ...current,
        [skillId]: readyResource(detail),
      }))
    } catch (error) {
      setSkillDetails((current) => ({
        ...current,
        [skillId]: errorResource(current[skillId] ?? idleResource(), error),
      }))
    }
  }

  async function mutatePlugin(
    pluginId: string,
    operation: string,
    run: () => Promise<InstalledPluginState>,
  ) {
    setPluginBusy((current) => ({
      ...current,
      [pluginId]: operation,
    }))
    try {
      const nextState = await run()
      setPlugins((current) => updatePluginPayload(current, pluginId, nextState))
      setPluginDetails((current) => updatePluginDetails(current, pluginId, nextState))
      await reloadSkills()
      return nextState
    } finally {
      setPluginBusy((current) => {
        const next = { ...current }
        delete next[pluginId]
        return next
      })
    }
  }

  async function mutateSkill(skillId: string, operation: string, run: () => Promise<SkillRecord>) {
    setSkillBusy((current) => ({
      ...current,
      [skillId]: operation,
    }))
    try {
      const record = await run()
      setSkills((current) => updateSkillPayload(current, skillId, record))
      setSkillDetails((current) => updateSkillDetails(current, skillId, record))
      return record
    } finally {
      setSkillBusy((current) => {
        const next = { ...current }
        delete next[skillId]
        return next
      })
    }
  }

  async function submitCreateSkill() {
    const draft = state.create_skill_draft
    const request: CreateSkillScaffoldRequest = {
      name: draft.name.trim(),
      display_name: draft.display_name.trim() || null,
      description: draft.description.trim(),
      scope: draft.scope,
      destination_root: draft.scope === 'repo' ? projectRoot : null,
      allow_implicit_invocation: draft.allow_implicit_invocation,
      default_prompt: draft.default_prompt.trim() || null,
      brand_color: draft.brand_color.trim() || null,
    }

    setCreateSkillPending(true)
    try {
      const result = await repository.createSkillScaffold(request)
      dispatch({ type: 'set_scaffold_result', result })
      dispatch({ type: 'reset_create_skill' })
      await reloadSkills()
      await openSkillDetails(result.skill_id)
    } finally {
      setCreateSkillPending(false)
    }
  }

  async function submitCreatePlugin() {
    const draft = state.create_plugin_draft
    setCreatePluginPending(true)
    try {
      const result = await repository.createPluginScaffold({
        name: draft.name.trim(),
        display_name: draft.display_name.trim() || null,
        description: draft.description.trim(),
        scope: draft.scope,
        destination_root: draft.scope === 'repo' ? projectRoot : null,
        category: draft.category,
        with_skills: draft.with_skills,
        with_apps: draft.with_apps,
        with_mcp_server: draft.with_mcp_server,
      })
      dispatch({ type: 'set_plugin_scaffold_result', result })
      dispatch({ type: 'reset_create_plugin' })
      await reloadPlugins()
      await openPluginDetails(result.plugin_id)
    } finally {
      setCreatePluginPending(false)
    }
  }

  return {
    state,
    dispatch,
    plugins,
    skills,
    pluginDetails,
    skillDetails,
    pluginBusy,
    skillBusy,
    createPluginPending,
    createSkillPending,
    reloadPlugins,
    reloadSkills,
    openPluginDetails,
    openSkillDetails,
    installPlugin: (pluginId: string) =>
      mutatePlugin(pluginId, 'install', () => repository.installPlugin(pluginId)),
    uninstallPlugin: (pluginId: string) =>
      mutatePlugin(pluginId, 'uninstall', () => repository.uninstallPlugin(pluginId)),
    setPluginEnabled: (pluginId: string, enabled: boolean) =>
      mutatePlugin(pluginId, enabled ? 'enable' : 'disable', () =>
        repository.setPluginEnabled(pluginId, enabled),
      ),
    completePluginAuth: (pluginId: string) =>
      mutatePlugin(pluginId, 'auth', () => repository.completePluginAuth(pluginId)),
    installSkill: (skillId: string) =>
      mutateSkill(skillId, 'install', () => repository.installSkill(skillId)),
    setSkillEnabled: (skillId: string, enabled: boolean) =>
      mutateSkill(skillId, enabled ? 'enable' : 'disable', () => repository.setSkillEnabled(skillId, enabled)),
    submitCreatePlugin,
    submitCreateSkill,
  }
}

function updatePluginPayload(
  resource: AsyncResource<PluginCatalogPayload>,
  pluginId: string,
  installedState: InstalledPluginState,
): AsyncResource<PluginCatalogPayload> {
  if (!resource.data) {
    return resource
  }
  return {
    status: 'ready',
    data: {
      ...resource.data,
      entries: resource.data.entries.map((entry) =>
        entry.catalog.plugin_id === pluginId ? { ...entry, installed_state: installedState } : entry,
      ),
    },
    error: null,
  }
}

function updatePluginDetails(
  resource: Record<string, AsyncResource<PluginDetails>>,
  pluginId: string,
  installedState: InstalledPluginState,
) {
  const current = resource[pluginId]
  if (!current?.data) {
    return resource
  }
  return {
    ...resource,
    [pluginId]: readyResource({
      ...current.data,
      installed_state: installedState,
    }),
  }
}

function updateSkillPayload(
  resource: AsyncResource<SkillCatalogPayload>,
  skillId: string,
  record: SkillRecord,
): AsyncResource<SkillCatalogPayload> {
  if (!resource.data) {
    return resource
  }
  const existing = resource.data.entries.find((entry) => entry.record.skill_id === skillId)
  const nextEntries = existing
    ? resource.data.entries.map((entry) => {
        if (entry.record.skill_id !== skillId) {
          return entry
        }
        return {
          ...entry,
          section:
            record.scope === 'system'
              ? 'system'
              : record.scope === 'recommended'
                ? 'recommended'
                : 'personal',
          record,
        } as typeof entry
      })
    : resource.data.entries

  return {
    status: 'ready',
    data: {
      ...resource.data,
      entries: nextEntries,
    },
    error: null,
  }
}

function updateSkillDetails(
  resource: Record<string, AsyncResource<SkillDetails>>,
  skillId: string,
  record: SkillRecord,
) {
  const current = resource[skillId]
  if (!current?.data) {
    return resource
  }
  return {
    ...resource,
    [skillId]: readyResource({
      ...current.data,
      record,
    }),
  }
}
