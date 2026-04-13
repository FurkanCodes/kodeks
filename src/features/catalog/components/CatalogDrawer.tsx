import { ChevronLeft, ExternalLink, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  AsyncResource,
  CatalogDrawerState,
  CatalogTab,
  CreatePluginScaffoldResult,
  CreateSkillScaffoldResult,
  PluginCatalogPayload,
  PluginDetails,
  SkillCatalogPayload,
  SkillDetails,
} from '../models'
import { getPluginCardStatus, getSkillCardStatus, skillScopeLabel, skillSourceKindLabel } from '../selectors'
import type { CreateSkillDraft } from '../state'
import type { CreatePluginDraft } from '../state'
import { CatalogBrandIcon } from './CatalogIcons'

type CatalogDrawerProps = {
  drawer: Exclude<CatalogDrawerState, null>
  activeTab: CatalogTab
  plugins: PluginCatalogPayload | null
  skills: SkillCatalogPayload | null
  pluginDetails: AsyncResource<PluginDetails> | null
  skillDetails: AsyncResource<SkillDetails> | null
  pluginBusy: Record<string, string>
  skillBusy: Record<string, string>
  createPluginDraft: CreatePluginDraft
  createSkillDraft: CreateSkillDraft
  createPluginPending: boolean
  createSkillPending: boolean
  lastPluginScaffoldResult: CreatePluginScaffoldResult | null
  lastScaffoldResult: CreateSkillScaffoldResult | null
  onClose: () => void
  onSetCreatePluginField: (field: keyof CreatePluginDraft, value: string | boolean) => void
  onSetCreateSkillField: (field: keyof CreateSkillDraft, value: string | boolean) => void
  onSubmitCreatePlugin: () => void
  onSubmitCreateSkill: () => void
  onInstallPlugin: (pluginId: string) => Promise<unknown>
  onUninstallPlugin: (pluginId: string) => Promise<unknown>
  onSetPluginEnabled: (pluginId: string, enabled: boolean) => Promise<unknown>
  onCompletePluginAuth: (pluginId: string) => Promise<unknown>
  onInstallSkill: (skillId: string) => Promise<unknown>
  onSetSkillEnabled: (skillId: string, enabled: boolean) => Promise<unknown>
  onOpenLocalPath: (path: string) => Promise<void>
  onOpenExternalUrl: (url: string) => Promise<void>
}

export function CatalogDrawer(props: CatalogDrawerProps) {
  const title = drawerTitle(props.drawer, props.activeTab)
  const detailDrawer = props.drawer.kind === 'plugin_details' || props.drawer.kind === 'skill_details'

  return (
    <aside
      role="dialog"
      aria-modal="true"
      className="flex h-full w-full flex-col overflow-hidden rounded-[30px] bg-[rgba(15,18,22,0.96)] shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
    >
      <div className="px-7 py-6 shadow-[inset_0_-1px_0_rgba(255,255,255,0.035)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-shell-faint)]">
              Catalog
            </div>
            <div className="mt-2 text-[22px] font-semibold tracking-[-0.045em] text-[color:var(--color-shell-primary)]">
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-shell-control)] px-4 py-2 text-[12.5px] font-medium text-[color:var(--color-shell-muted)] transition hover:bg-[color:var(--color-shell-control-hover)] hover:text-white"
          >
            {detailDrawer ? <ChevronLeft className="h-3.5 w-3.5" /> : null}
            {detailDrawer ? 'Back' : 'Close'}
          </button>
        </div>
      </div>

      <div className="shell-scroll flex-1 overflow-y-auto px-7 py-7">
        {renderDrawerContent(props)}
      </div>
    </aside>
  )
}

function renderDrawerContent(props: CatalogDrawerProps) {
  switch (props.drawer.kind) {
    case 'plugin_details':
      return renderPluginDetails(props)
    case 'skill_details':
      return renderSkillDetails(props)
    case 'plugin_manage':
      return renderPluginManage(props)
    case 'skill_manage':
      return renderSkillManage(props)
    case 'plugin_create':
      return renderPluginCreate(props)
    case 'skill_create':
      return renderSkillCreate(props)
    default:
      return null
  }
}

function renderPluginDetails(props: CatalogDrawerProps) {
  const resource = props.pluginDetails
  if (!resource || resource.status === 'loading' || resource.status === 'idle') {
    return <DrawerLoading label="Loading plugin details" />
  }
  if (resource.status === 'error' || !resource.data) {
    return <DrawerError message={resource.error ?? 'Plugin details are unavailable.'} />
  }

  const detail = resource.data
  const busy = Boolean(props.pluginBusy[detail.catalog.plugin_id])
  const status = getPluginCardStatusFromDetail(detail)
  const includes = [
    {
      key: `${detail.catalog.plugin_id}-plugin`,
      kind: 'Plugin',
      title: detail.catalog.display_name,
      description: detail.catalog.short_description,
      state: statusLabel(status),
    },
    ...detail.catalog.bundled_skills.map((item) => ({
      key: `skill-${item}`,
      kind: 'Skill',
      title: titleCaseToken(item),
      description: 'Bundled with this plugin and available when the plugin is installed.',
      state: 'Included',
    })),
    ...detail.catalog.bundled_apps.map((item) => ({
      key: `app-${item}`,
      kind: 'App',
      title: titleCaseToken(item),
      description: 'Connector surface installed alongside the plugin bundle.',
      state: 'Included',
    })),
    ...detail.catalog.bundled_mcp_servers.map((item) => ({
      key: `mcp-${item}`,
      kind: 'MCP server',
      title: titleCaseToken(item),
      description: 'Server capability exposed through the plugin package.',
      state: 'Included',
    })),
  ]

  const infoRows = [
    { label: 'Category', value: titleCaseToken(detail.catalog.category) },
    {
      label: 'Built by',
      value:
        detail.source.publisher && detail.source.publisher !== detail.source.display_name
          ? `${detail.source.publisher}, ${detail.source.display_name}`
          : detail.source.display_name,
    },
    {
      label: 'Capabilities',
      value:
        detail.catalog.capabilities.length > 0
          ? detail.catalog.capabilities.map(titleCaseToken).join(', ')
          : 'None declared',
    },
    { label: 'Developer', value: detail.catalog.developer_name },
    {
      label: 'Version',
      value: detail.installed_state.installed_version ? `v${detail.installed_state.installed_version}` : 'Not installed',
    },
    {
      label: 'Website',
      value: detail.catalog.website_url ? (
        <InfoLink label="Open site" onClick={() => void props.onOpenExternalUrl(detail.catalog.website_url!)} />
      ) : (
        'None'
      ),
    },
    {
      label: 'Privacy policy',
      value: detail.catalog.privacy_policy_url ? (
        <InfoLink label="Open policy" onClick={() => void props.onOpenExternalUrl(detail.catalog.privacy_policy_url!)} />
      ) : (
        'None'
      ),
    },
    {
      label: 'Terms of service',
      value: detail.catalog.terms_of_service_url ? (
        <InfoLink label="Open terms" onClick={() => void props.onOpenExternalUrl(detail.catalog.terms_of_service_url!)} />
      ) : (
        'None'
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <DetailHero
        iconKey={detail.catalog.logo}
        title={detail.catalog.display_name}
        subtitle={detail.catalog.short_description}
        description={detail.catalog.long_description}
        eyebrow="Plugin"
        chips={[
          { label: detail.source.display_name, tone: 'neutral' },
          { label: statusLabel(status), tone: statusTone(status) },
          ...(detail.installed_state.installed_version
            ? [{ label: `v${detail.installed_state.installed_version}`, tone: 'neutral' as const }]
            : []),
        ]}
      />

      <AmbientFeatureCard title={detail.catalog.display_name} summary={detail.catalog.long_description} />

      <DetailSection title="Includes">
        <IncludeList items={includes} />
      </DetailSection>

      <DetailSection title="Information">
        <InfoTable rows={infoRows} />
      </DetailSection>

      {detail.management_notes.length > 0 ? (
        <DetailSection title="Operational notes">
          <NarrativeBlock items={detail.management_notes} />
        </DetailSection>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        {!detail.installed_state.is_installed ? (
          <PrimaryButton disabled={busy} onClick={() => void props.onInstallPlugin(detail.catalog.plugin_id)}>
            Install plugin
          </PrimaryButton>
        ) : null}
        {detail.installed_state.is_installed && detail.installed_state.auth_status === 'needs_auth' ? (
          <PrimaryButton disabled={busy} onClick={() => void props.onCompletePluginAuth(detail.catalog.plugin_id)}>
            Connect account
          </PrimaryButton>
        ) : null}
        {detail.installed_state.is_installed ? (
          <SecondaryButton
            disabled={busy}
            onClick={() =>
              void props.onSetPluginEnabled(detail.catalog.plugin_id, !detail.installed_state.is_enabled)
            }
          >
            {detail.installed_state.is_enabled ? 'Disable' : 'Enable'}
          </SecondaryButton>
        ) : null}
        {detail.installed_state.is_installed ? (
          <DangerButton disabled={busy} onClick={() => void props.onUninstallPlugin(detail.catalog.plugin_id)}>
            Uninstall
          </DangerButton>
        ) : null}
      </div>
    </div>
  )
}

function renderSkillDetails(props: CatalogDrawerProps) {
  const resource = props.skillDetails
  if (!resource || resource.status === 'loading' || resource.status === 'idle') {
    return <DrawerLoading label="Loading skill details" />
  }
  if (resource.status === 'error' || !resource.data) {
    return <DrawerError message={resource.error ?? 'Skill details are unavailable.'} />
  }

  const detail = resource.data
  const busy = Boolean(props.skillBusy[detail.record.skill_id])
  const status = getSkillCardStatusFromDetail(detail)
  const includes = [
    {
      key: `${detail.record.skill_id}-skill`,
      kind: 'Skill',
      title: detail.record.display_name,
      description: detail.record.short_description,
      state: statusLabel(status),
    },
    ...(detail.bundled_by_plugin_name
      ? [
          {
            key: `plugin-${detail.bundled_by_plugin_name}`,
            kind: 'Plugin',
            title: detail.bundled_by_plugin_name,
            description: 'This skill ships as part of a plugin bundle.',
            state: 'Bundled',
          },
        ]
      : []),
    ...detail.dependency_notes.map((item) => ({
      key: `dep-${item}`,
      kind: 'Dependency',
      title: item,
      description: 'Required or recommended for the skill workflow.',
      state: 'Linked',
    })),
  ]

  const infoRows = [
    { label: 'Scope', value: skillScopeLabel(detail.record.scope) },
    { label: 'Source', value: skillSourceKindLabel(detail.record.source_kind) },
    {
      label: 'Invocation',
      value: detail.invocation_behavior === 'explicit_or_implicit' ? 'Explicit or implicit' : 'Explicit only',
    },
    {
      label: 'Status',
      value: detail.record.is_installed ? (detail.record.enabled ? 'Installed and enabled' : 'Installed and disabled') : 'Available',
    },
    {
      label: 'Default prompt',
      value: detail.record.default_prompt ?? 'None',
    },
    {
      label: 'Local files',
      value: detail.record.path ? (
        <InfoLink label="Open files" onClick={() => void props.onOpenLocalPath(detail.record.path!)} />
      ) : (
        'None'
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <DetailHero
        iconKey={detail.record.icon}
        brandColor={detail.record.brand_color}
        title={detail.record.display_name}
        subtitle={detail.record.short_description}
        description={detail.record.description}
        eyebrow="Skill"
        chips={[
          { label: skillScopeLabel(detail.record.scope), tone: 'neutral' },
          { label: skillSourceKindLabel(detail.record.source_kind), tone: 'neutral' },
          { label: statusLabel(status), tone: statusTone(status) },
        ]}
      />

      <AmbientFeatureCard title={detail.record.display_name} summary={detail.record.description} />

      <DetailSection title="Includes">
        <IncludeList items={includes.length > 0 ? includes : []} emptyLabel="No related items" />
      </DetailSection>

      <DetailSection title="Information">
        <InfoTable rows={infoRows} />
      </DetailSection>

      <div className="flex flex-wrap gap-2 pt-1">
        {!detail.record.is_installed && detail.record.source_kind !== 'plugin_bundled' ? (
          <PrimaryButton disabled={busy} onClick={() => void props.onInstallSkill(detail.record.skill_id)}>
            Add skill
          </PrimaryButton>
        ) : null}
        {detail.record.is_installed ? (
          <SecondaryButton
            disabled={busy}
            onClick={() => void props.onSetSkillEnabled(detail.record.skill_id, !detail.record.enabled)}
          >
            {detail.record.enabled ? 'Disable' : 'Enable'}
          </SecondaryButton>
        ) : null}
        {detail.record.path ? (
          <SecondaryButton disabled={busy} onClick={() => void props.onOpenLocalPath(detail.record.path!)}>
            Open local files
          </SecondaryButton>
        ) : null}
      </div>
    </div>
  )
}

function renderPluginManage(props: CatalogDrawerProps) {
  const entries = props.plugins?.entries.filter((entry) => entry.installed_state.is_installed) ?? []
  if (entries.length === 0) {
    return <DrawerEmpty title="No installed plugins" description="Install a plugin to manage connection, enablement, and uninstall state here." />
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.catalog.plugin_id} className="rounded-[16px] bg-[color:var(--color-shell-control)] p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-[color:var(--color-shell-primary)]">
                {entry.catalog.display_name}
              </div>
              <div className="mt-1 text-[12px] text-[color:var(--color-shell-muted)]">
                {entry.catalog.short_description}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusChip label={statusLabel(getPluginCardStatus(entry))} tone={statusTone(getPluginCardStatus(entry))} />
                {entry.installed_state.auth_status === 'connected' ? <StatusChip label="Connected" tone="success" /> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <MiniButton onClick={() => void props.onSetPluginEnabled(entry.catalog.plugin_id, !entry.installed_state.is_enabled)}>
                {entry.installed_state.is_enabled ? 'Disable' : 'Enable'}
              </MiniButton>
              {entry.installed_state.auth_status === 'needs_auth' ? (
                <MiniButton onClick={() => void props.onCompletePluginAuth(entry.catalog.plugin_id)}>
                  Connect
                </MiniButton>
              ) : null}
              <MiniDangerButton onClick={() => void props.onUninstallPlugin(entry.catalog.plugin_id)}>
                Uninstall
              </MiniDangerButton>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function renderSkillManage(props: CatalogDrawerProps) {
  const entries = props.skills?.entries.filter((entry) => entry.record.is_installed) ?? []
  if (entries.length === 0) {
    return <DrawerEmpty title="No installed skills" description="Install or create a skill and it will show up here for quick enablement and local editing." />
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.record.skill_id} className="rounded-[16px] bg-[color:var(--color-shell-control)] p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-[color:var(--color-shell-primary)]">
                {entry.record.display_name}
              </div>
              <div className="mt-1 text-[12px] text-[color:var(--color-shell-muted)]">
                {skillScopeLabel(entry.record.scope)} • {skillSourceKindLabel(entry.record.source_kind)}
              </div>
              <div className="mt-2 text-[12px] text-[color:var(--color-shell-muted)]">
                {entry.record.short_description}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <MiniButton onClick={() => void props.onSetSkillEnabled(entry.record.skill_id, !entry.record.enabled)}>
                {entry.record.enabled ? 'Disable' : 'Enable'}
              </MiniButton>
              {entry.record.path ? (
                <MiniButton onClick={() => void props.onOpenLocalPath(entry.record.path!)}>
                  Open
                </MiniButton>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function renderSkillCreate(props: CatalogDrawerProps) {
  const draft = props.createSkillDraft
  const canSubmit = draft.name.trim().length > 0 && draft.description.trim().length > 0

  return (
    <div className="space-y-4">
      <div className="rounded-[16px] bg-[color:var(--color-shell-control)] p-4">
        <FormField label="Skill name">
          <input
            value={draft.name}
            onChange={(event) => props.onSetCreateSkillField('name', event.currentTarget.value)}
            placeholder="release-checklist"
            className={inputClassName}
          />
        </FormField>
        <FormField label="Display name">
          <input
            value={draft.display_name}
            onChange={(event) => props.onSetCreateSkillField('display_name', event.currentTarget.value)}
            placeholder="Release Checklist"
            className={inputClassName}
          />
        </FormField>
        <FormField label="Description">
          <textarea
            value={draft.description}
            onChange={(event) => props.onSetCreateSkillField('description', event.currentTarget.value)}
            rows={4}
            placeholder="Checks a release branch before shipping."
            className={`${inputClassName} min-h-24 resize-none py-3`}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Scope">
            <select
              value={draft.scope}
              onChange={(event) => props.onSetCreateSkillField('scope', event.currentTarget.value)}
              className={inputClassName}
            >
              <option value="repo">Repo local</option>
              <option value="user">Personal</option>
            </select>
          </FormField>
          <FormField label="Brand color">
            <input
              value={draft.brand_color}
              onChange={(event) => props.onSetCreateSkillField('brand_color', event.currentTarget.value)}
              placeholder="#f59e0b"
              className={inputClassName}
            />
          </FormField>
        </div>
        <FormField label="Default prompt">
          <input
            value={draft.default_prompt}
            onChange={(event) => props.onSetCreateSkillField('default_prompt', event.currentTarget.value)}
            placeholder="Start with the highest-risk checks."
            className={inputClassName}
          />
        </FormField>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-[color:var(--color-shell-muted)]">
          <input
            type="checkbox"
            checked={draft.allow_implicit_invocation}
            onChange={(event) =>
              props.onSetCreateSkillField('allow_implicit_invocation', event.currentTarget.checked)
            }
            className="size-4 rounded border-white/10 bg-white/[0.05]"
          />
          Allow implicit invocation
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton disabled={!canSubmit || props.createSkillPending} onClick={() => void props.onSubmitCreateSkill()}>
            {props.createSkillPending ? 'Creating…' : 'Create skill'}
          </PrimaryButton>
        </div>
      </div>

      {props.lastScaffoldResult ? (
        <div className="rounded-[16px] bg-emerald-500/10 p-4">
          <div className="text-[12px] font-medium text-emerald-100">Last scaffold created</div>
          <div className="mt-2 text-[12px] leading-6 text-emerald-50/90">
            {props.lastScaffoldResult.path}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function renderPluginCreate(props: CatalogDrawerProps) {
  const draft = props.createPluginDraft
  const canSubmit = draft.name.trim().length > 0 && draft.description.trim().length > 0

  return (
    <div className="space-y-4">
      <div className="rounded-[16px] bg-[color:var(--color-shell-control)] p-4">
        <FormField label="Plugin name">
          <input
            value={draft.name}
            onChange={(event) => props.onSetCreatePluginField('name', event.currentTarget.value)}
            placeholder="release-assistant"
            className={inputClassName}
          />
        </FormField>
        <FormField label="Display name">
          <input
            value={draft.display_name}
            onChange={(event) => props.onSetCreatePluginField('display_name', event.currentTarget.value)}
            placeholder="Release Assistant"
            className={inputClassName}
          />
        </FormField>
        <FormField label="Description">
          <textarea
            value={draft.description}
            onChange={(event) => props.onSetCreatePluginField('description', event.currentTarget.value)}
            rows={4}
            placeholder="Bundle release automation, checks, and supporting skills."
            className={`${inputClassName} min-h-24 resize-none py-3`}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Scope">
            <select
              value={draft.scope}
              onChange={(event) => props.onSetCreatePluginField('scope', event.currentTarget.value)}
              className={inputClassName}
            >
              <option value="repo">Repo local</option>
              <option value="user">Personal</option>
            </select>
          </FormField>
          <FormField label="Category">
            <select
              value={draft.category}
              onChange={(event) => props.onSetCreatePluginField('category', event.currentTarget.value)}
              className={inputClassName}
            >
              <option value="developer_tools">Developer Tools</option>
              <option value="productivity">Productivity</option>
              <option value="documentation">Documentation</option>
              <option value="design">Design</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="collaboration">Collaboration</option>
              <option value="native_tooling">Native Tooling</option>
            </select>
          </FormField>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-[color:var(--color-shell-muted)]">
            <input
              type="checkbox"
              checked={draft.with_skills}
              onChange={(event) => props.onSetCreatePluginField('with_skills', event.currentTarget.checked)}
            className="size-4 rounded border-white/10 bg-white/[0.05]"
            />
            Create a bundled `skills/` directory with a starter workflow skill
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-[color:var(--color-shell-muted)]">
            <input
              type="checkbox"
              checked={draft.with_apps}
              onChange={(event) => props.onSetCreatePluginField('with_apps', event.currentTarget.checked)}
            className="size-4 rounded border-white/10 bg-white/[0.05]"
            />
            Create an `.app.json` connector stub plus an integration brief
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-[color:var(--color-shell-muted)]">
            <input
              type="checkbox"
              checked={draft.with_mcp_server}
              onChange={(event) => props.onSetCreatePluginField('with_mcp_server', event.currentTarget.checked)}
            className="size-4 rounded border-white/10 bg-white/[0.05]"
            />
            Create an `.mcp.json` server stub plus an integration brief
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton disabled={!canSubmit || props.createPluginPending} onClick={() => void props.onSubmitCreatePlugin()}>
            {props.createPluginPending ? 'Creating…' : 'Create plugin'}
          </PrimaryButton>
        </div>
      </div>

      {props.lastPluginScaffoldResult ? (
        <div className="rounded-[16px] bg-emerald-500/10 p-4">
          <div className="text-[12px] font-medium text-emerald-100">Last plugin scaffold created</div>
          <div className="mt-2 text-[12px] leading-6 text-emerald-50/90">
            {props.lastPluginScaffoldResult.path}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-emerald-50/75">
            Registered in {props.lastPluginScaffoldResult.marketplace_path}
          </div>
          <div className="mt-2 text-[11px] leading-5 text-emerald-50/75">
            Includes generated SVG assets and any starter skill or connector templates selected above.
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DetailHero(props: {
  eyebrow: string
  iconKey?: string | null
  brandColor?: string | null
  title: string
  subtitle: string
  description: string
  chips: { label: string; tone: 'neutral' | 'success' | 'warning' | 'muted' }[]
}) {
  return (
    <section className="space-y-4">
      <CatalogBrandIcon
        iconKey={props.iconKey}
        label={props.title}
        brandColor={props.brandColor}
        className="size-[4.5rem] rounded-[22px]"
      />
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-shell-faint)]">
          {props.eyebrow}
        </div>
        <h2 className="mt-3 text-[2rem] font-semibold tracking-[-0.06em] text-[color:var(--color-shell-primary)]">
          {props.title}
        </h2>
        <p className="mt-2 text-[1.05rem] leading-8 text-[color:var(--color-shell-muted)]">{props.subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.chips.map((chip) => (
          <StatusChip key={`${chip.label}-${chip.tone}`} label={chip.label} tone={chip.tone} />
        ))}
      </div>
      <p className="max-w-[34rem] text-[14.5px] leading-8 text-[color:var(--color-shell-muted)]">{props.description}</p>
    </section>
  )
}

function AmbientFeatureCard(props: { title: string; summary: string }) {
  return (
    <div className="overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_18%_22%,rgba(111,146,255,0.22),transparent_35%),radial-gradient(circle_at_82%_18%,rgba(183,145,255,0.18),transparent_30%),linear-gradient(135deg,rgba(29,36,60,0.94),rgba(28,22,44,0.92))] p-5">
      <div className="rounded-[22px] bg-[rgba(11,13,18,0.76)] px-6 py-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-md">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-shell-faint)]">
          Preview
        </div>
        <div className="mt-3 text-[1.15rem] font-medium leading-8 tracking-[-0.03em] text-[color:var(--color-shell-primary)]">
          <span className="text-white">{props.title}</span> {condensePreviewCopy(props.summary)}
        </div>
      </div>
    </div>
  )
}

function DetailSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[color:var(--color-shell-primary)]">
        {props.title}
      </h3>
      {props.children}
    </section>
  )
}

function IncludeList(props: {
  items: { key: string; kind: string; title: string; description: string; state: string }[]
  emptyLabel?: string
}) {
  if (props.items.length === 0) {
    return (
      <div className="rounded-[22px] bg-[color:var(--color-shell-control)] px-5 py-8 text-[13px] text-[color:var(--color-shell-faint)]">
        {props.emptyLabel ?? 'Nothing included'}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[22px] bg-[color:var(--color-shell-control)]">
      {props.items.map((item, index) => (
        <div
          key={item.key}
          className={`flex items-start gap-4 px-5 py-4 ${index > 0 ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]' : ''}`}
        >
          <div className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-black/10 text-[12px] font-semibold text-[color:var(--color-shell-faint)]">
            {item.kind.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[17px] font-semibold tracking-[-0.03em] text-[color:var(--color-shell-primary)]">
                {item.title}
              </span>
              <span className="text-[12px] text-[color:var(--color-shell-faint)]">{item.kind}</span>
            </div>
            <div className="mt-1 text-[14px] leading-6 text-[color:var(--color-shell-muted)]">{item.description}</div>
          </div>
          <span className="rounded-full bg-black/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-shell-faint)]">
            {item.state}
          </span>
        </div>
      ))}
    </div>
  )
}

function InfoTable(props: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="overflow-hidden rounded-[22px] bg-[color:var(--color-shell-control)]">
      {props.rows.map((row, index) => (
        <div
          key={row.label}
          className={`grid gap-3 px-5 py-4 md:grid-cols-[11rem_minmax(0,1fr)] ${index > 0 ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]' : ''}`}
        >
          <div className="text-[14px] text-[color:var(--color-shell-muted)]">{row.label}</div>
          <div className="text-[14.5px] leading-7 text-[color:var(--color-shell-primary)]">{row.value}</div>
        </div>
      ))}
    </div>
  )
}

function NarrativeBlock(props: { items: string[] }) {
  return (
    <div className="rounded-[22px] bg-[color:var(--color-shell-control)] px-5 py-4">
      <div className="space-y-2.5">
        {props.items.map((item) => (
          <div key={item} className="text-[14px] leading-7 text-[color:var(--color-shell-muted)]">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function InfoLink(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[color:var(--color-shell-primary)] transition hover:text-white"
    >
      {props.label}
      <ExternalLink className="h-3.5 w-3.5" />
    </button>
  )
}

function DrawerLoading(props: { label: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
      <LoaderCircle className="h-6 w-6 animate-spin text-[color:var(--color-shell-muted)]" />
      <div className="mt-3 text-[13px] text-[color:var(--color-shell-muted)]">{props.label}</div>
    </div>
  )
}

function DrawerError(props: { message: string }) {
  return <DrawerEmpty title="Something went wrong" description={props.message} />
}

function DrawerEmpty(props: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] bg-[color:var(--color-shell-control)] px-4 py-8 text-center">
      <div className="text-[15px] font-medium text-[color:var(--color-shell-primary)]">{props.title}</div>
      <div className="mt-2 text-[12.5px] leading-6 text-[color:var(--color-shell-muted)]">
        {props.description}
      </div>
    </div>
  )
}

function condensePreviewCopy(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= 96) {
    return normalized
  }
  return `${normalized.slice(0, 93).trimEnd()}...`
}

function titleCaseToken(value: string) {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function StatusChip(props: { label: string; tone: 'neutral' | 'success' | 'warning' | 'muted' }) {
  const toneClass =
    props.tone === 'success'
      ? 'bg-emerald-400/10 text-emerald-100'
      : props.tone === 'warning'
        ? 'bg-amber-400/10 text-amber-100'
        : props.tone === 'muted'
          ? 'bg-white/[0.04] text-[color:var(--color-shell-faint)]'
          : 'bg-[color:var(--color-shell-control)] text-[color:var(--color-shell-primary)]'

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] ${toneClass}`}>
      {props.label}
    </span>
  )
}

function statusTone(status: ReturnType<typeof getPluginCardStatusFromDetail>) {
  switch (status) {
    case 'connected':
      return 'success'
    case 'needs_auth':
    case 'update':
      return 'warning'
    case 'disabled':
      return 'muted'
    default:
      return 'neutral'
  }
}

function statusLabel(status: ReturnType<typeof getPluginCardStatusFromDetail>) {
  switch (status) {
    case 'available':
      return 'Available'
    case 'connected':
      return 'Connected'
    case 'needs_auth':
      return 'Needs auth'
    case 'disabled':
      return 'Disabled'
    case 'system':
      return 'System'
    case 'bundled':
      return 'Bundled'
    case 'update':
      return 'Update available'
    default:
      return 'Installed'
  }
}

function getPluginCardStatusFromDetail(detail: PluginDetails) {
  return getPluginCardStatus({
    section: 'featured',
    source_id: detail.source.id,
    catalog: detail.catalog,
    installed_state: detail.installed_state,
  })
}

function getSkillCardStatusFromDetail(detail: SkillDetails) {
  return getSkillCardStatus({
    section: 'personal',
    record: detail.record,
    bundled_by_plugin_id: detail.bundled_by_plugin_id,
    bundled_by_plugin_name: detail.bundled_by_plugin_name,
  })
}

function PrimaryButton(props: { children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex items-center rounded-full bg-[color:var(--color-shell-elevated-strong)] px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[color:var(--color-shell-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {props.children}
    </button>
  )
}

function SecondaryButton(props: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex items-center rounded-full bg-[color:var(--color-shell-control)] px-3.5 py-2 text-[12.5px] font-semibold text-[color:var(--color-shell-primary)] transition hover:bg-[color:var(--color-shell-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {props.children}
    </button>
  )
}

function DangerButton(props: { children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex items-center rounded-full bg-red-500/12 px-3.5 py-2 text-[12.5px] font-semibold text-red-100 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {props.children}
    </button>
  )
}

function MiniButton(props: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-full bg-[color:var(--color-shell-control)] px-2.5 py-1.5 text-[11.5px] text-[color:var(--color-shell-primary)] transition hover:bg-[color:var(--color-shell-control-hover)]"
    >
      {props.children}
    </button>
  )
}

function MiniDangerButton(props: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-full bg-red-500/12 px-2.5 py-1.5 text-[11.5px] text-red-100 transition hover:bg-red-500/18"
    >
      {props.children}
    </button>
  )
}

function FormField(props: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-shell-faint)]">
        {props.label}
      </div>
      {props.children}
    </label>
  )
}

const inputClassName =
  'h-10 w-full rounded-[12px] bg-white/[0.045] px-3 py-2 text-[12.5px] text-[color:var(--color-shell-primary)] outline-none transition placeholder:text-[color:var(--color-shell-faint)] focus:bg-white/[0.06]'

function drawerTitle(drawer: Exclude<CatalogDrawerState, null>, activeTab: CatalogTab) {
  switch (drawer.kind) {
    case 'plugin_details':
      return 'Plugin details'
    case 'skill_details':
      return 'Skill details'
    case 'plugin_manage':
      return 'Manage plugins'
    case 'skill_manage':
      return 'Manage skills'
    case 'plugin_create':
      return 'Create plugin'
    case 'skill_create':
      return 'Create skill'
    default:
      return activeTab === 'plugins' ? 'Plugins' : 'Skills'
  }
}
