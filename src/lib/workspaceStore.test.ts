/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_WORKSPACE_STORE,
  LEGACY_WORKSPACE_STORE_KEY,
  clearLegacyWorkspaceStore,
  defaultProjectLabel,
  loadLegacyWorkspaceStore,
  normalizeWorkspaceStore,
  removeProjectGrouping,
  renameProject,
  resolvePersistedWorkspaceStore,
  setComposerRateLimitsVisible,
  setInspectorWidth,
  setSidebarWidth,
  setTerminalHeight,
  setTerminalOpen,
  upsertProject,
  type WorkspaceStore,
} from './workspaceStore.ts'

function makeStore(): WorkspaceStore {
  return {
    projects: [
      {
        rootPath: '/Users/furkan/kodeks',
        label: 'Kodeks',
        removed: true,
        lastUsedAt: 1,
      },
    ],
    threadPreferences: {},
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 304,
      inspectorWidth: 440,
      showComposerRateLimits: true,
      terminalOpen: false,
      terminalHeight: 280,
    },
  }
}

test('upsertProject revives existing removed projects without duplicating them', () => {
  const next = upsertProject(makeStore(), '/Users/furkan/kodeks')

  assert.equal(next.projects.length, 1)
  assert.equal(next.projects[0].removed, false)
  assert.equal(next.projects[0].label, 'Kodeks')
})

test('renameProject falls back to a derived label when given blank input', () => {
  const renamed = renameProject(makeStore(), '/Users/furkan/kodeks', '   ')

  assert.equal(renamed.projects[0].label, defaultProjectLabel('/Users/furkan/kodeks'))
  assert.equal(renamed.projects[0].removed, false)
})

test('removeProjectGrouping marks existing projects as removed and creates tombstones for unknown roots', () => {
  const existing = removeProjectGrouping(makeStore(), '/Users/furkan/kodeks')
  const unknown = removeProjectGrouping(makeStore(), '/tmp/demo-app')

  assert.equal(existing.projects[0].removed, true)
  assert.deepEqual(
    unknown.projects.find((project) => project.rootPath === '/tmp/demo-app'),
    {
      rootPath: '/tmp/demo-app',
      label: 'Demo App',
      lastUsedAt: unknown.projects.find((project) => project.rootPath === '/tmp/demo-app')?.lastUsedAt,
      removed: true,
    },
  )
})

test('setComposerRateLimitsVisible updates the persisted ui preference', () => {
  const next = setComposerRateLimitsVisible(makeStore(), false)

  assert.equal(next.ui.showComposerRateLimits, false)
  assert.equal(makeStore().ui.showComposerRateLimits, true)
})

test('setTerminalOpen and setTerminalHeight update the persisted terminal ui preferences', () => {
  const open = setTerminalOpen(makeStore(), true)
  const resized = setTerminalHeight(open, 900)

  assert.equal(open.ui.terminalOpen, true)
  assert.equal(makeStore().ui.terminalOpen, false)
  assert.equal(resized.ui.terminalHeight, 720)
})

test('setSidebarWidth and setInspectorWidth clamp panel widths into supported bounds', () => {
  const resizedSidebar = setSidebarWidth(makeStore(), 1000)
  const resizedInspector = setInspectorWidth(makeStore(), 200)

  assert.equal(resizedSidebar.ui.sidebarWidth, 420)
  assert.equal(resizedInspector.ui.inspectorWidth, 340)
})

test('resolvePersistedWorkspaceStore prefers native data when it exists', () => {
  const nativeStore: WorkspaceStore = {
    projects: [
      {
        rootPath: '/work/native',
        label: 'Native',
        removed: false,
        lastUsedAt: 90,
      },
    ],
    threadPreferences: {},
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 304,
      inspectorWidth: 440,
      showComposerRateLimits: true,
      terminalOpen: false,
      terminalHeight: 280,
    },
  }
  const legacyStore: WorkspaceStore = {
    projects: [
      {
        rootPath: '/work/legacy',
        label: 'Legacy',
        removed: false,
        lastUsedAt: 40,
      },
    ],
    threadPreferences: {},
    ui: {
      sidebarCollapsed: true,
      sidebarWidth: 320,
      inspectorWidth: 520,
      showComposerRateLimits: false,
      terminalOpen: true,
      terminalHeight: 360,
    },
  }

  assert.deepEqual(resolvePersistedWorkspaceStore(nativeStore, legacyStore), {
    store: nativeStore,
    migratedLegacy: false,
  })
})

test('resolvePersistedWorkspaceStore migrates legacy data when native store is empty', () => {
  const legacyStore: WorkspaceStore = {
    projects: [
      {
        rootPath: '/work/legacy',
        label: 'Legacy',
        removed: false,
        lastUsedAt: 40,
      },
    ],
    threadPreferences: {
      'thread-1': {
        model: 'gpt-5.4',
      },
    },
    ui: {
      sidebarCollapsed: true,
      sidebarWidth: 320,
      inspectorWidth: 520,
      showComposerRateLimits: false,
      terminalOpen: true,
      terminalHeight: 360,
    },
  }

  assert.deepEqual(resolvePersistedWorkspaceStore(EMPTY_WORKSPACE_STORE, legacyStore), {
    store: legacyStore,
    migratedLegacy: true,
  })
})

test('normalizeWorkspaceStore collapses duplicate project roots that only differ by trailing slash', () => {
  const normalized = normalizeWorkspaceStore({
    projects: [
      {
        rootPath: '/work/drumkit/',
        label: 'Drumkit',
        removed: false,
        lastUsedAt: 10,
      },
      {
        rootPath: '/work/drumkit',
        label: 'Drumkit',
        removed: false,
        lastUsedAt: 20,
      },
    ],
  })

  assert.deepEqual(normalized.projects, [
    {
      rootPath: '/work/drumkit',
      label: 'Drumkit',
      removed: false,
      lastUsedAt: 20,
    },
  ])
})

test('legacy localStorage payload loads into the normalized workspace store shape', () => {
  const storage = new Map<string, string>()
  const windowStub = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null
      },
      setItem(key: string, value: string) {
        storage.set(key, value)
      },
      removeItem(key: string) {
        storage.delete(key)
      },
    },
  }
  const previousWindow = (globalThis as { window?: unknown }).window

  ;(globalThis as { window?: unknown }).window = windowStub
  windowStub.localStorage.setItem(
    LEGACY_WORKSPACE_STORE_KEY,
    JSON.stringify({
      projects: [
        {
          rootPath: '/work/alpha',
          label: '',
          removed: false,
          lastUsedAt: 33,
        },
      ],
      recentRoots: ['/work/alpha'],
      threadPreferences: {
        'thread-7': {
          model: 'gpt-5.4',
          reasoningEffort: 'high',
        },
      },
      ui: {
        sidebarCollapsed: true,
        sidebarWidth: 320,
        inspectorWidth: 520,
        showComposerRateLimits: false,
        terminalOpen: true,
        terminalHeight: 360,
      },
    }),
  )

  try {
    assert.deepEqual(loadLegacyWorkspaceStore(), {
      projects: [
        {
          rootPath: '/work/alpha',
          label: 'Alpha',
          removed: false,
          lastUsedAt: 33,
        },
      ],
      threadPreferences: {
        'thread-7': {
          model: 'gpt-5.4',
          reasoningEffort: 'high',
        },
      },
      ui: {
        sidebarCollapsed: true,
        sidebarWidth: 320,
        inspectorWidth: 520,
        showComposerRateLimits: false,
        terminalOpen: true,
        terminalHeight: 360,
      },
    })

    clearLegacyWorkspaceStore()
    assert.equal(windowStub.localStorage.getItem(LEGACY_WORKSPACE_STORE_KEY), null)
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = previousWindow
    }
  }
})
