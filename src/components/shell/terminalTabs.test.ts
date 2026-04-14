import test from 'node:test'
import assert from 'node:assert/strict'
import type { ProjectTerminalSession } from '../../lib/kodeks'
import {
  appendTerminalTab,
  closeTerminalTab,
  EMPTY_TERMINAL_TABS_STATE,
  ensureProjectActiveTerminalTab,
  setProjectActiveTerminalTab,
  type ProjectTerminalTab,
  type TerminalTabsState,
} from './terminalTabs.ts'

const PROJECT_ROOT = '/work/demo'

function makeSession(sessionId: string): ProjectTerminalSession {
  return {
    session_id: sessionId,
    project_root: PROJECT_ROOT,
    shell: '/bin/zsh',
    pid: null,
  }
}

function makeTab(sessionId: string, title = sessionId): ProjectTerminalTab {
  return {
    session: makeSession(sessionId),
    title,
  }
}

function makeState(): TerminalTabsState {
  return EMPTY_TERMINAL_TABS_STATE
}

test('appendTerminalTab sets the first tab active by default', () => {
  const next = appendTerminalTab(makeState(), PROJECT_ROOT, makeTab('term-1'))

  assert.equal(next.tabsByProject[PROJECT_ROOT]?.length, 1)
  assert.equal(next.activeByProject[PROJECT_ROOT], 'term-1')
})

test('appendTerminalTab preserves active tab when activate=false', () => {
  const withFirst = appendTerminalTab(makeState(), PROJECT_ROOT, makeTab('term-1'))
  const next = appendTerminalTab(withFirst, PROJECT_ROOT, makeTab('term-2'), {
    activate: false,
  })

  assert.deepEqual(
    next.tabsByProject[PROJECT_ROOT]?.map((entry) => entry.session.session_id),
    ['term-1', 'term-2'],
  )
  assert.equal(next.activeByProject[PROJECT_ROOT], 'term-1')
})

test('setProjectActiveTerminalTab switches to a valid tab and ignores unknown tabs', () => {
  const state = appendTerminalTab(
    appendTerminalTab(makeState(), PROJECT_ROOT, makeTab('term-1')),
    PROJECT_ROOT,
    makeTab('term-2'),
    { activate: false },
  )

  const switched = setProjectActiveTerminalTab(state, PROJECT_ROOT, 'term-2')
  const unchanged = setProjectActiveTerminalTab(switched, PROJECT_ROOT, 'term-x')

  assert.equal(switched.activeByProject[PROJECT_ROOT], 'term-2')
  assert.equal(unchanged.activeByProject[PROJECT_ROOT], 'term-2')
})

test('closeTerminalTab re-targets active tab when closing the active entry', () => {
  const state = appendTerminalTab(
    appendTerminalTab(makeState(), PROJECT_ROOT, makeTab('term-1')),
    PROJECT_ROOT,
    makeTab('term-2'),
  )
  const next = closeTerminalTab(state, PROJECT_ROOT, 'term-2')

  assert.deepEqual(
    next.tabsByProject[PROJECT_ROOT]?.map((entry) => entry.session.session_id),
    ['term-1'],
  )
  assert.equal(next.activeByProject[PROJECT_ROOT], 'term-1')
})

test('closeTerminalTab preserves active tab when removing an inactive entry', () => {
  const state = appendTerminalTab(
    appendTerminalTab(makeState(), PROJECT_ROOT, makeTab('term-1')),
    PROJECT_ROOT,
    makeTab('term-2'),
    { activate: false },
  )
  const next = closeTerminalTab(state, PROJECT_ROOT, 'term-2')

  assert.deepEqual(
    next.tabsByProject[PROJECT_ROOT]?.map((entry) => entry.session.session_id),
    ['term-1'],
  )
  assert.equal(next.activeByProject[PROJECT_ROOT], 'term-1')
})

test('ensureProjectActiveTerminalTab assigns first tab when active tab is missing', () => {
  const staleState: TerminalTabsState = {
    tabsByProject: {
      [PROJECT_ROOT]: [makeTab('term-1'), makeTab('term-2')],
    },
    activeByProject: {
      [PROJECT_ROOT]: 'term-x',
    },
  }

  const next = ensureProjectActiveTerminalTab(staleState, PROJECT_ROOT)
  assert.equal(next.activeByProject[PROJECT_ROOT], 'term-1')
})
