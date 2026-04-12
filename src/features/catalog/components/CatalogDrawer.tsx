import { ExternalLink, LoaderCircle } from 'lucide-react'
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

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-white/5 bg-[#0b0b0c]">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-shell-faint)]">
            Catalog
          </div>
          <div className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--color-shell-primary)]">
            {title}
          </div>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded-[10px] border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-[color:var(--color-shell-muted)] transition hover:border-white/10 hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="shell-scroll flex-1 overflow-y-auto px-5 py-5">
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

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[18px] font-semibold tracking-[-0.03em] text-[color:var(--color-shell-primary)]">
          {detail.catalog.display_name}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-[color:var(--color-shell-muted)]">
          {detail.catalog.long_description}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusChip label={detail.source.display_name} tone="neutral" />
        <StatusChip label={statusLabel(getPluginCardStatusFromDetail(detail))} tone={statusTone(getPluginCardStatusFromDetail(detail))} />
        {detail.installed_state.installed_version ? (
          <StatusChip label={`v${detail.installed_state.installed_version}`} tone="neutral" />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DetailStat label="Publisher" value={detail.source.publisher} />
        <DetailStat label="Category" value={detail.catalog.category.replace(/_/g, ' ')} />
      </div>

      <ListBlock title="Capabilities" items={detail.catalog.capabilities.map((item) => item.replace(/_/g, ' '))} />
      <ListBlock title="Bundled skills" items={detail.catalog.bundled_skills} />
      <ListBlock title="Bundled apps" items={detail.catalog.bundled_apps} />
      <ListBlock title="Bundled MCP servers" items={detail.catalog.bundled_mcp_servers} />
      <ListBlock title="Operational notes" items={detail.management_notes} />

      <div className="flex flex-wrap gap-2">
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

      <LinkButtons
        items={[
          {
            label: 'Website',
            url: detail.catalog.website_url,
            onOpen: props.onOpenExternalUrl,
          },
          {
            label: 'Privacy',
            url: detail.catalog.privacy_policy_url,
            onOpen: props.onOpenExternalUrl,
          },
          {
            label: 'Terms',
            url: detail.catalog.terms_of_service_url,
            onOpen: props.onOpenExternalUrl,
          },
        ]}
      />
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

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[18px] font-semibold tracking-[-0.03em] text-[color:var(--color-shell-primary)]">
          {detail.record.display_name}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-[color:var(--color-shell-muted)]">
          {detail.record.description}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusChip label={skillScopeLabel(detail.record.scope)} tone="neutral" />
        <StatusChip label={skillSourceKindLabel(detail.record.source_kind)} tone="neutral" />
        <StatusChip label={statusLabel(getSkillCardStatusFromDetail(detail))} tone={statusTone(getSkillCardStatusFromDetail(detail))} />
      </div>

      <DetailStat label="Invocation" value={detail.invocation_behavior === 'explicit_or_implicit' ? 'Explicit or implicit' : 'Explicit only'} />
      {detail.bundled_by_plugin_name ? (
        <DetailStat label="Bundled by" value={detail.bundled_by_plugin_name} />
      ) : null}
      {detail.record.default_prompt ? <DetailStat label="Default prompt" value={detail.record.default_prompt} /> : null}

      <ListBlock title="Dependencies" items={detail.dependency_notes.length > 0 ? detail.dependency_notes : ['No declared dependencies']} />

      <div className="flex flex-wrap gap-2">
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
        <div key={entry.catalog.plugin_id} className="rounded-[16px] border border-white/6 bg-white/[0.03] p-3.5">
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
        <div key={entry.record.skill_id} className="rounded-[16px] border border-white/6 bg-white/[0.03] p-3.5">
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
      <div className="rounded-[16px] border border-white/6 bg-white/[0.03] p-4">
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
        <div className="rounded-[16px] border border-emerald-400/15 bg-emerald-500/8 p-4">
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
      <div className="rounded-[16px] border border-white/6 bg-white/[0.03] p-4">
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
        <div className="rounded-[16px] border border-emerald-400/15 bg-emerald-500/8 p-4">
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
    <div className="rounded-[18px] border border-dashed border-white/8 bg-white/[0.02] px-4 py-8 text-center">
      <div className="text-[15px] font-medium text-[color:var(--color-shell-primary)]">{props.title}</div>
      <div className="mt-2 text-[12.5px] leading-6 text-[color:var(--color-shell-muted)]">
        {props.description}
      </div>
    </div>
  )
}

function DetailStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/6 bg-white/[0.03] p-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-shell-faint)]">
        {props.label}
      </div>
      <div className="mt-2 text-[12.5px] leading-6 text-[color:var(--color-shell-primary)]">{props.value}</div>
    </div>
  )
}

function ListBlock(props: { title: string; items: string[] }) {
  return (
    <div className="rounded-[16px] border border-white/6 bg-white/[0.03] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-shell-faint)]">
        {props.title}
      </div>
      <div className="mt-3 space-y-2">
        {props.items.length > 0 ? (
          props.items.map((item) => (
            <div key={item} className="text-[12.5px] leading-6 text-[color:var(--color-shell-muted)]">
              {item}
            </div>
          ))
        ) : (
          <div className="text-[12.5px] leading-6 text-[color:var(--color-shell-faint)]">None</div>
        )}
      </div>
    </div>
  )
}

function StatusChip(props: { label: string; tone: 'neutral' | 'success' | 'warning' | 'muted' }) {
  const toneClass =
    props.tone === 'success'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
      : props.tone === 'warning'
        ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
        : props.tone === 'muted'
          ? 'border-white/5 bg-white/[0.03] text-[color:var(--color-shell-faint)]'
          : 'border-white/8 bg-white/[0.04] text-[color:var(--color-shell-primary)]'

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${toneClass}`}>
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

function LinkButtons(props: {
  items: {
    label: string
    url: string | null
    onOpen: (url: string) => Promise<void>
  }[]
}) {
  const available = props.items.filter((item) => item.url)
  if (available.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {available.map((item) => (
        <SecondaryButton key={item.label} onClick={() => void item.onOpen(item.url!)}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          {item.label}
        </SecondaryButton>
      ))}
    </div>
  )
}

function PrimaryButton(props: { children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex items-center rounded-[11px] border border-white/8 bg-white/[0.09] px-3 py-2 text-[12.5px] font-medium text-white transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
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
      className="inline-flex items-center rounded-[11px] border border-white/6 bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium text-[color:var(--color-shell-primary)] transition hover:border-white/10 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
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
      className="inline-flex items-center rounded-[11px] border border-red-400/15 bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
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
      className="rounded-[10px] border border-white/6 bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] text-[color:var(--color-shell-primary)] transition hover:border-white/10 hover:bg-white/[0.06]"
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
      className="rounded-[10px] border border-red-400/15 bg-red-500/10 px-2.5 py-1.5 text-[11.5px] text-red-100 transition hover:bg-red-500/15"
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
  'w-full rounded-[12px] border border-white/6 bg-white/[0.04] px-3 py-2 text-[12.5px] text-[color:var(--color-shell-primary)] outline-none transition placeholder:text-[color:var(--color-shell-faint)] focus:border-white/12'

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
