import type { ProjectTerminalSession } from '../../lib/kodeks'

export type ProjectTerminalTab = {
  session: ProjectTerminalSession
  title: string
}

export type TerminalTabsState = {
  tabsByProject: Record<string, ProjectTerminalTab[]>
  activeByProject: Record<string, string | null>
}

export const EMPTY_TERMINAL_TABS_STATE: TerminalTabsState = {
  tabsByProject: {},
  activeByProject: {},
}

export function appendTerminalTab(
  state: TerminalTabsState,
  projectRoot: string,
  tab: ProjectTerminalTab,
  options?: {
    activate?: boolean
  },
) {
  const currentTabs = state.tabsByProject[projectRoot] || []
  const withoutExisting = currentTabs.filter(
    (entry) => entry.session.session_id !== tab.session.session_id,
  )
  const nextTabs = [...withoutExisting, tab]
  const currentActive = state.activeByProject[projectRoot] || null
  const shouldActivate = options?.activate ?? true
  const nextActive = shouldActivate
    ? tab.session.session_id
    : currentActive || tab.session.session_id

  return {
    tabsByProject: {
      ...state.tabsByProject,
      [projectRoot]: nextTabs,
    },
    activeByProject: {
      ...state.activeByProject,
      [projectRoot]: nextActive,
    },
  } satisfies TerminalTabsState
}

export function setProjectActiveTerminalTab(
  state: TerminalTabsState,
  projectRoot: string,
  sessionId: string,
) {
  const tabs = state.tabsByProject[projectRoot] || []
  if (!tabs.some((entry) => entry.session.session_id === sessionId)) {
    return state
  }

  if (state.activeByProject[projectRoot] === sessionId) {
    return state
  }

  return {
    tabsByProject: state.tabsByProject,
    activeByProject: {
      ...state.activeByProject,
      [projectRoot]: sessionId,
    },
  } satisfies TerminalTabsState
}

export function ensureProjectActiveTerminalTab(state: TerminalTabsState, projectRoot: string) {
  const tabs = state.tabsByProject[projectRoot] || []
  const currentActive = state.activeByProject[projectRoot] || null

  if (tabs.length === 0) {
    if (currentActive === null) {
      return state
    }

    return {
      tabsByProject: state.tabsByProject,
      activeByProject: {
        ...state.activeByProject,
        [projectRoot]: null,
      },
    } satisfies TerminalTabsState
  }

  if (currentActive && tabs.some((tab) => tab.session.session_id === currentActive)) {
    return state
  }

  return {
    tabsByProject: state.tabsByProject,
    activeByProject: {
      ...state.activeByProject,
      [projectRoot]: tabs[0].session.session_id,
    },
  } satisfies TerminalTabsState
}

export function closeTerminalTab(
  state: TerminalTabsState,
  projectRoot: string,
  sessionId: string,
) {
  const currentTabs = state.tabsByProject[projectRoot] || []
  const removeIndex = currentTabs.findIndex((entry) => entry.session.session_id === sessionId)
  if (removeIndex === -1) {
    return state
  }

  const nextTabs = currentTabs.filter((entry) => entry.session.session_id !== sessionId)
  const currentActive = state.activeByProject[projectRoot] || null
  let nextActive = currentActive

  if (currentActive === sessionId) {
    const fallback =
      nextTabs[removeIndex] || nextTabs[removeIndex - 1] || nextTabs[0] || null
    nextActive = fallback ? fallback.session.session_id : null
  } else if (currentActive && !nextTabs.some((entry) => entry.session.session_id === currentActive)) {
    nextActive = nextTabs[0]?.session.session_id || null
  }

  return {
    tabsByProject: {
      ...state.tabsByProject,
      [projectRoot]: nextTabs,
    },
    activeByProject: {
      ...state.activeByProject,
      [projectRoot]: nextActive,
    },
  } satisfies TerminalTabsState
}
