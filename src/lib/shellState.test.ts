/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSidebarGroups,
  extractReferenceQuery,
  mostRecentProjectRoot,
  resolveWorkspaceReference,
} from './shellState.ts'
import type { Snapshot } from './kodeks.ts'
import type { WorkspaceStore } from './workspaceStore.ts'

function makeStore(): WorkspaceStore {
  return {
    projects: [
      {
        rootPath: '/work/alpha',
        label: 'Alpha',
        lastUsedAt: 40,
        removed: false,
      },
      {
        rootPath: '/work/bravo',
        label: 'Bravo',
        lastUsedAt: 90,
        removed: false,
      },
      {
        rootPath: '/work/hidden',
        label: 'Hidden',
        lastUsedAt: 100,
        removed: true,
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

function makeThreads(): Snapshot['threads'] {
  return [
    {
      id: 'thread-1',
      preview: 'Inspect alpha',
      name: 'Alpha thread',
      cwd: '/work/alpha',
      status: 'idle',
      model_provider: 'openai',
      updated_at: 10,
      repo: '/work/alpha',
      branch: 'main',
      presence: 'cached',
      turn_count: 1,
    },
    {
      id: 'thread-2',
      preview: 'Loose task',
      name: null,
      cwd: '/tmp/misc',
      status: 'idle',
      model_provider: 'openai',
      updated_at: 20,
      repo: null,
      branch: null,
      presence: 'preview',
      turn_count: 0,
    },
  ]
}

test('buildSidebarGroups keeps saved zero-thread projects visible and ordered by recency', () => {
  const groups = buildSidebarGroups(makeThreads(), makeStore(), '/work/bravo', null, {}, null, null, 0)

  assert.deepEqual(
    groups.map((group) => ({
      key: group.key,
      active: group.active,
      threads: group.threads.length,
    })),
    [
      { key: '/work/bravo', active: true, threads: 0 },
      { key: '/work/alpha', active: false, threads: 1 },
      { key: '/tmp/misc', active: false, threads: 1 },
      { key: 'other', active: false, threads: 0 },
    ],
  )
})

test('buildSidebarGroups marks the active live thread inside its project bucket', () => {
  const groups = buildSidebarGroups(
    makeThreads(),
    makeStore(),
    '/work/alpha',
    'thread-1',
    {},
    'turn-9',
    null,
    0,
  )
  const alpha = groups.find((group) => group.key === '/work/alpha')

  if (!alpha) {
    throw new Error('expected alpha project group to exist')
  }
  assert.equal(alpha.active, true)
  assert.deepEqual(alpha.threads, [
    {
      id: 'thread-1',
      label: 'Alpha thread',
      active: true,
      live: true,
      updatedAt: 10,
      accountTag: null,
    },
  ])
})

test('buildSidebarGroups shows a subtle account tag when thread account differs from active', () => {
  const threads = makeThreads().map((thread) =>
    thread.id === 'thread-1'
      ? {
          ...thread,
          last_account_id: 'acct-2',
          last_account_label: 'second@example.com',
        }
      : thread,
  )

  const groups = buildSidebarGroups(threads, makeStore(), '/work/alpha', 'thread-1', {}, null, 'acct-1', 2)
  const alpha = groups.find((group) => group.key === '/work/alpha')

  if (!alpha) {
    throw new Error('expected alpha project group to exist')
  }

  assert.equal(alpha.threads[0]?.accountTag, 'second@example.com')
})

test('buildSidebarGroups merges saved project roots with thread roots when only trailing slashes differ', () => {
  const groups = buildSidebarGroups(
    [
      {
        id: 'thread-drumkit',
        preview: 'Analyze the app',
        name: null,
        cwd: '/work/drumkit',
        status: 'idle',
        model_provider: 'openai',
        updated_at: 40,
        repo: '/work/drumkit',
        branch: 'main',
        presence: 'cached',
        turn_count: 1,
      },
    ],
    {
      projects: [
        {
          rootPath: '/work/drumkit/',
          label: 'Drumkit',
          lastUsedAt: 50,
          removed: false,
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
    },
    '/work/drumkit/',
    'thread-drumkit',
    {},
    null,
    null,
    0,
  )

  assert.equal(groups.filter((group) => group.label === 'Drumkit').length, 1)
  assert.equal(groups[0]?.key, '/work/drumkit')
  assert.equal(groups[0]?.threads.length, 1)
})

test('buildSidebarGroups respects persisted expanded state per project group', () => {
  const groups = buildSidebarGroups(
    makeThreads(),
    makeStore(),
    '/work/alpha',
    'thread-1',
    {
      '/work/alpha': false,
      other: false,
    },
    null,
    null,
    0,
  )

  assert.equal(groups.find((group) => group.key === '/work/alpha')?.expanded, false)
  assert.equal(groups.find((group) => group.key === 'other')?.expanded, false)
  assert.equal(groups.find((group) => group.key === '/work/bravo')?.expanded, true)
})

test('mostRecentProjectRoot ignores removed projects', () => {
  assert.equal(mostRecentProjectRoot(makeStore()), '/work/bravo')
})

test('resolveWorkspaceReference prefers exact paths, then tail matches, then suffix matches', () => {
  const files = [
    'src/App.tsx',
    'src/components/shell/Sidebar.tsx',
    'docs/qa-smoke.md',
  ]

  assert.equal(resolveWorkspaceReference('src/App.tsx', files), 'src/App.tsx')
  assert.equal(resolveWorkspaceReference('Sidebar.tsx', files), 'src/components/shell/Sidebar.tsx')
  assert.equal(resolveWorkspaceReference('qa-smoke.md', files), 'docs/qa-smoke.md')
  assert.equal(resolveWorkspaceReference('missing.ts', files), null)
})

test('extractReferenceQuery only returns the trailing reference token', () => {
  assert.equal(extractReferenceQuery('review @src/components/shell/Side'), 'src/components/shell/Side')
  assert.equal(extractReferenceQuery('look at docs/qa-smoke.md'), 'docs/qa-smoke.md')
  assert.equal(extractReferenceQuery('no trailing ref here '), null)
})
