import test from 'node:test'
import assert from 'node:assert/strict'
import {
  catalogWorkspaceReducer,
  createInitialCatalogWorkspaceState,
} from './state.ts'
import type { CatalogWorkspaceState } from './state.ts'

test('clear_filters only resets the requested tab filter set', () => {
  const starting: CatalogWorkspaceState = {
    ...createInitialCatalogWorkspaceState('plugins'),
    plugin_filters: {
      search: 'github',
      source_id: 'openai',
      category: 'developer_tools',
    },
    skill_filters: {
      search: 'figma',
      scope: 'plugin_bundled',
      source_kind: 'plugin_bundled',
    },
  }

  const next = catalogWorkspaceReducer(starting, {
    type: 'clear_filters',
    tab: 'plugins',
  })

  assert.deepEqual(next.plugin_filters, {
    search: '',
    source_id: 'all',
    category: 'all',
  })
  assert.deepEqual(next.skill_filters, starting.skill_filters)
})

test('set_tab keeps the workspace open but closes overflow menus', () => {
  const starting: CatalogWorkspaceState = {
    ...createInitialCatalogWorkspaceState('plugins'),
    overflow_open: true,
  }

  const next = catalogWorkspaceReducer(starting, {
    type: 'set_tab',
    tab: 'skills',
  })

  assert.equal(next.active_tab, 'skills')
  assert.equal(next.overflow_open, false)
})

test('set_create_skill_field updates the typed draft without losing sibling fields', () => {
  const starting = createInitialCatalogWorkspaceState('skills')
  const next = catalogWorkspaceReducer(starting, {
    type: 'set_create_skill_field',
    field: 'name',
    value: 'release-checklist',
  })

  assert.equal(next.create_skill_draft.name, 'release-checklist')
  assert.equal(next.create_skill_draft.scope, 'repo')
  assert.equal(next.create_skill_draft.allow_implicit_invocation, true)
})
