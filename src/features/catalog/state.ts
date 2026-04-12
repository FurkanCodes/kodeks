import type {
  CatalogDrawerState,
  CatalogTab,
  CreatePluginScaffoldResult,
  CreateSkillScaffoldResult,
  PluginCategory,
  PluginFilters,
  PluginScaffoldScope,
  SkillFilters,
  SkillScaffoldScope,
  SkillScope,
  SkillSourceKind,
} from './models'

export type CreatePluginDraft = {
  name: string
  display_name: string
  description: string
  scope: PluginScaffoldScope
  category: PluginCategory
  with_skills: boolean
  with_apps: boolean
  with_mcp_server: boolean
}

export type CreateSkillDraft = {
  name: string
  display_name: string
  description: string
  scope: SkillScaffoldScope
  allow_implicit_invocation: boolean
  default_prompt: string
  brand_color: string
}

export type CatalogWorkspaceState = {
  active_tab: CatalogTab
  drawer: CatalogDrawerState
  overflow_open: boolean
  focused_card_id: string | null
  plugin_filters: PluginFilters
  skill_filters: SkillFilters
  create_plugin_draft: CreatePluginDraft
  create_skill_draft: CreateSkillDraft
  last_plugin_scaffold_result: CreatePluginScaffoldResult | null
  last_scaffold_result: CreateSkillScaffoldResult | null
}

export type CatalogWorkspaceAction =
  | {
      type: 'set_tab'
      tab: CatalogTab
    }
  | {
      type: 'set_plugin_search'
      value: string
    }
  | {
      type: 'set_plugin_source'
      value: string
    }
  | {
      type: 'set_plugin_category'
      value: PluginCategory | 'all'
    }
  | {
      type: 'set_skill_search'
      value: string
    }
  | {
      type: 'set_skill_scope'
      value: SkillScope | 'all'
    }
  | {
      type: 'set_skill_source_kind'
      value: SkillSourceKind | 'all'
    }
  | {
      type: 'open_drawer'
      drawer: Exclude<CatalogDrawerState, null>
    }
  | {
      type: 'close_drawer'
    }
  | {
      type: 'toggle_overflow'
      open?: boolean
    }
  | {
      type: 'set_focused_card'
      id: string | null
    }
  | {
      type: 'clear_filters'
      tab?: CatalogTab
    }
  | {
      type: 'set_create_plugin_field'
      field: keyof CreatePluginDraft
      value: string | boolean
    }
  | {
      type: 'reset_create_plugin'
    }
  | {
      type: 'set_create_skill_field'
      field: keyof CreateSkillDraft
      value: string | boolean
    }
  | {
      type: 'reset_create_skill'
    }
  | {
      type: 'set_scaffold_result'
      result: CreateSkillScaffoldResult | null
    }
  | {
      type: 'set_plugin_scaffold_result'
      result: CreatePluginScaffoldResult | null
    }

export const INITIAL_PLUGIN_FILTERS: PluginFilters = {
  search: '',
  source_id: 'all',
  category: 'all',
}

export const INITIAL_SKILL_FILTERS: SkillFilters = {
  search: '',
  scope: 'all',
  source_kind: 'all',
}

export const INITIAL_CREATE_PLUGIN_DRAFT: CreatePluginDraft = {
  name: '',
  display_name: '',
  description: '',
  scope: 'repo',
  category: 'developer_tools',
  with_skills: true,
  with_apps: false,
  with_mcp_server: false,
}

export const INITIAL_CREATE_SKILL_DRAFT: CreateSkillDraft = {
  name: '',
  display_name: '',
  description: '',
  scope: 'repo',
  allow_implicit_invocation: true,
  default_prompt: '',
  brand_color: '',
}

export function createInitialCatalogWorkspaceState(tab: CatalogTab): CatalogWorkspaceState {
  return {
    active_tab: tab,
    drawer: null,
    overflow_open: false,
    focused_card_id: null,
    plugin_filters: { ...INITIAL_PLUGIN_FILTERS },
    skill_filters: { ...INITIAL_SKILL_FILTERS },
    create_plugin_draft: { ...INITIAL_CREATE_PLUGIN_DRAFT },
    create_skill_draft: { ...INITIAL_CREATE_SKILL_DRAFT },
    last_plugin_scaffold_result: null,
    last_scaffold_result: null,
  }
}

export function catalogWorkspaceReducer(
  state: CatalogWorkspaceState,
  action: CatalogWorkspaceAction,
): CatalogWorkspaceState {
  switch (action.type) {
    case 'set_tab':
      return {
        ...state,
        active_tab: action.tab,
        overflow_open: false,
      }
    case 'set_plugin_search':
      return {
        ...state,
        plugin_filters: {
          ...state.plugin_filters,
          search: action.value,
        },
      }
    case 'set_plugin_source':
      return {
        ...state,
        plugin_filters: {
          ...state.plugin_filters,
          source_id: action.value,
        },
      }
    case 'set_plugin_category':
      return {
        ...state,
        plugin_filters: {
          ...state.plugin_filters,
          category: action.value,
        },
      }
    case 'set_skill_search':
      return {
        ...state,
        skill_filters: {
          ...state.skill_filters,
          search: action.value,
        },
      }
    case 'set_skill_scope':
      return {
        ...state,
        skill_filters: {
          ...state.skill_filters,
          scope: action.value,
        },
      }
    case 'set_skill_source_kind':
      return {
        ...state,
        skill_filters: {
          ...state.skill_filters,
          source_kind: action.value,
        },
      }
    case 'open_drawer':
      return {
        ...state,
        drawer: action.drawer,
        overflow_open: false,
      }
    case 'close_drawer':
      return {
        ...state,
        drawer: null,
        overflow_open: false,
      }
    case 'toggle_overflow':
      return {
        ...state,
        overflow_open: action.open ?? !state.overflow_open,
      }
    case 'set_focused_card':
      return {
        ...state,
        focused_card_id: action.id,
      }
    case 'clear_filters':
      if (action.tab === 'plugins') {
        return {
          ...state,
          plugin_filters: { ...INITIAL_PLUGIN_FILTERS },
        }
      }
      if (action.tab === 'skills') {
        return {
          ...state,
          skill_filters: { ...INITIAL_SKILL_FILTERS },
        }
      }
      return {
        ...state,
        plugin_filters: { ...INITIAL_PLUGIN_FILTERS },
        skill_filters: { ...INITIAL_SKILL_FILTERS },
      }
    case 'set_create_plugin_field':
      return {
        ...state,
        create_plugin_draft: {
          ...state.create_plugin_draft,
          [action.field]: action.value,
        } as CreatePluginDraft,
      }
    case 'reset_create_plugin':
      return {
        ...state,
        create_plugin_draft: { ...INITIAL_CREATE_PLUGIN_DRAFT },
      }
    case 'set_create_skill_field':
      return {
        ...state,
        create_skill_draft: {
          ...state.create_skill_draft,
          [action.field]: action.value,
        } as CreateSkillDraft,
      }
    case 'reset_create_skill':
      return {
        ...state,
        create_skill_draft: { ...INITIAL_CREATE_SKILL_DRAFT },
      }
    case 'set_scaffold_result':
      return {
        ...state,
        last_scaffold_result: action.result,
      }
    case 'set_plugin_scaffold_result':
      return {
        ...state,
        last_plugin_scaffold_result: action.result,
      }
    default:
      return state
  }
}
