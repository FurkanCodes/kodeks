/// <reference types="node" />
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultProjectLabel,
  removeProjectGrouping,
  renameProject,
  upsertProject,
  type WorkspaceStore,
} from './workspaceStore.ts'

function makeStore(): WorkspaceStore {
  return {
    projects: [
      {
        id: '/Users/furkan/kodeks',
        rootPath: '/Users/furkan/kodeks',
        label: 'Kodeks',
        removed: true,
        lastUsedAt: 1,
      },
    ],
    recentRoots: [],
    threadPreferences: {},
  }
}

test('upsertProject revives existing removed projects without duplicating them', () => {
  const next = upsertProject(makeStore(), '/Users/furkan/kodeks')

  assert.equal(next.projects.length, 1)
  assert.equal(next.projects[0].removed, false)
  assert.equal(next.projects[0].label, 'Kodeks')
  assert.deepEqual(next.recentRoots, ['/Users/furkan/kodeks'])
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
      id: '/tmp/demo-app',
      rootPath: '/tmp/demo-app',
      label: 'Demo App',
      lastUsedAt: unknown.projects.find((project) => project.rootPath === '/tmp/demo-app')?.lastUsedAt,
      removed: true,
    },
  )
})
