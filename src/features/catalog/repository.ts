import {
  completePluginAuth,
  createPluginScaffold,
  createSkillScaffold,
  getPluginDetails,
  getSkillDetails,
  installPlugin,
  installSkill,
  listPlugins,
  listSkills,
  setPluginEnabled,
  setSkillEnabled,
  uninstallPlugin,
} from '../../lib/kodeks'
import type {
  CreatePluginScaffoldRequest,
  CreatePluginScaffoldResult,
  CreateSkillScaffoldRequest,
  CreateSkillScaffoldResult,
  InstalledPluginState,
  PluginCatalogPayload,
  PluginDetails,
  SkillCatalogPayload,
  SkillDetails,
  SkillRecord,
} from './models'

export type CatalogRepository = {
  listPlugins: (forceRemoteSync?: boolean) => Promise<PluginCatalogPayload>
  getPluginDetails: (pluginId: string) => Promise<PluginDetails>
  installPlugin: (pluginId: string) => Promise<InstalledPluginState>
  uninstallPlugin: (pluginId: string) => Promise<InstalledPluginState>
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<InstalledPluginState>
  completePluginAuth: (pluginId: string) => Promise<InstalledPluginState>
  listSkills: () => Promise<SkillCatalogPayload>
  getSkillDetails: (skillId: string) => Promise<SkillDetails>
  installSkill: (skillId: string) => Promise<SkillRecord>
  setSkillEnabled: (skillId: string, enabled: boolean) => Promise<SkillRecord>
  createSkillScaffold: (request: CreateSkillScaffoldRequest) => Promise<CreateSkillScaffoldResult>
  createPluginScaffold: (request: CreatePluginScaffoldRequest) => Promise<CreatePluginScaffoldResult>
}

export function createTauriCatalogRepository(projectRoot: string): CatalogRepository {
  return {
    listPlugins: (forceRemoteSync) => listPlugins(projectRoot, forceRemoteSync),
    getPluginDetails: (pluginId) => getPluginDetails(pluginId, projectRoot),
    installPlugin: (pluginId) => installPlugin(pluginId, projectRoot),
    uninstallPlugin: (pluginId) => uninstallPlugin(pluginId, projectRoot),
    setPluginEnabled: (pluginId, enabled) => setPluginEnabled(pluginId, enabled, projectRoot),
    completePluginAuth: (pluginId) => completePluginAuth(pluginId, projectRoot),
    listSkills: () => listSkills(projectRoot),
    getSkillDetails: (skillId) => getSkillDetails(skillId, projectRoot),
    installSkill: (skillId) => installSkill(skillId, projectRoot),
    setSkillEnabled: (skillId, enabled) => setSkillEnabled(skillId, enabled, projectRoot),
    createSkillScaffold,
    createPluginScaffold,
  }
}
