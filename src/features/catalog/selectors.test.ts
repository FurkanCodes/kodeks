import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPluginSections,
  getSkillSections,
  moveGridFocus,
} from './selectors.ts'
import type {
  PluginListEntry,
  SkillListEntry,
} from './models.ts'

function makePluginEntries(): PluginListEntry[] {
  return [
    {
      section: 'featured',
      source_id: 'openai',
      catalog: {
        plugin_id: 'github',
        name: 'github',
        display_name: 'GitHub',
        short_description: 'Review pull requests and issues',
        long_description: 'Review pull requests and issues',
        category: 'developer_tools',
        capabilities: ['issues_and_pull_requests', 'automation'],
        auth_policy: 'required',
        installation_policy: 'marketplace',
        logo: 'github',
        screenshots: [],
        developer_name: 'OpenAI',
        website_url: null,
        privacy_policy_url: null,
        terms_of_service_url: null,
        bundled_skills: [],
        bundled_apps: [],
        bundled_mcp_servers: [],
      },
      installed_state: {
        plugin_id: 'github',
        installed_version: '1.0.0',
        is_installed: true,
        is_enabled: true,
        auth_status: 'connected',
        has_update: false,
        install_status: 'installed',
      },
    },
    {
      section: 'coding',
      source_id: 'community',
      catalog: {
        plugin_id: 'sentry',
        name: 'sentry',
        display_name: 'Sentry',
        short_description: 'Inspect issues and runtime errors',
        long_description: 'Inspect issues and runtime errors',
        category: 'infrastructure',
        capabilities: ['observability'],
        auth_policy: 'required',
        installation_policy: 'marketplace',
        logo: 'sentry',
        screenshots: [],
        developer_name: 'Community',
        website_url: null,
        privacy_policy_url: null,
        terms_of_service_url: null,
        bundled_skills: [],
        bundled_apps: [],
        bundled_mcp_servers: [],
      },
      installed_state: {
        plugin_id: 'sentry',
        installed_version: null,
        is_installed: false,
        is_enabled: false,
        auth_status: 'needs_auth',
        has_update: false,
        install_status: 'available',
      },
    },
  ]
}

function makeSkillEntries(): SkillListEntry[] {
  return [
    {
      section: 'recommended',
      bundled_by_plugin_id: null,
      bundled_by_plugin_name: null,
      record: {
        skill_id: 'doc',
        name: 'doc',
        display_name: 'Doc',
        description: 'Edit and review documents',
        short_description: 'Edit and review documents',
        scope: 'recommended',
        path: null,
        enabled: false,
        is_installed: false,
        source_kind: 'catalog',
        allow_implicit_invocation: true,
        default_prompt: null,
        icon: 'doc',
        brand_color: null,
        dependencies: [
          {
            kind: 'binary',
            value: 'python3',
            label: 'Python',
            required: true,
          },
        ],
      },
    },
    {
      section: 'personal',
      bundled_by_plugin_id: 'figma',
      bundled_by_plugin_name: 'Figma',
      record: {
        skill_id: 'figma-use',
        name: 'figma-use',
        display_name: 'Figma Use',
        description: 'Write to Figma safely',
        short_description: 'Write to Figma safely',
        scope: 'plugin_bundled',
        path: '/tmp/figma-use/SKILL.md',
        enabled: true,
        is_installed: true,
        source_kind: 'plugin_bundled',
        allow_implicit_invocation: true,
        default_prompt: null,
        icon: 'figma',
        brand_color: null,
        dependencies: [],
      },
    },
  ]
}

test('getPluginSections filters by source, category, and text match', () => {
  const sections = getPluginSections(makePluginEntries(), {
    search: 'errors',
    source_id: 'community',
    category: 'infrastructure',
  })

  assert.deepEqual(sections.map((section) => section.id), ['coding'])
  assert.equal(sections[0]?.items[0]?.catalog.plugin_id, 'sentry')
})

test('getSkillSections matches dependency labels and bundled plugin names', () => {
  const fromDependency = getSkillSections(makeSkillEntries(), {
    search: 'python',
    scope: 'all',
    source_kind: 'all',
  })
  const fromBundledPlugin = getSkillSections(makeSkillEntries(), {
    search: 'figma',
    scope: 'all',
    source_kind: 'all',
  })

  assert.equal(fromDependency[0]?.items[0]?.record.skill_id, 'doc')
  assert.equal(fromBundledPlugin[0]?.items[0]?.record.skill_id, 'figma-use')
})

test('moveGridFocus respects two-column navigation offsets', () => {
  const orderedIds = ['a', 'b', 'c', 'd', 'e']

  assert.equal(moveGridFocus(orderedIds, 'a', 'ArrowRight', 2), 'b')
  assert.equal(moveGridFocus(orderedIds, 'a', 'ArrowDown', 2), 'c')
  assert.equal(moveGridFocus(orderedIds, 'd', 'ArrowLeft', 2), 'c')
  assert.equal(moveGridFocus(orderedIds, 'e', 'ArrowDown', 2), null)
})
