import { useEffect, useRef, useState } from 'react'
import { CatalogControls } from './components/CatalogControls'
import { CatalogCard } from './components/CatalogCard'
import { CatalogDrawer } from './components/CatalogDrawer'
import { CatalogPanelState, CatalogSection, cardKeyboardHandler } from './components/CatalogSection'
import type { CatalogTab } from './models'
import { createTauriCatalogRepository } from './repository'
import {
  getPluginCardStatus,
  getPluginCategoryOptions,
  getPluginSections,
  getSkillCardStatus,
  getSkillScopeOptions,
  getSkillSections,
  getSkillSourceOptions,
  moveGridFocus,
  pluginCategoryLabel,
  skillScopeLabel,
  skillSourceKindLabel,
} from './selectors'
import { useCatalogWorkspace } from './useCatalogWorkspace'

type CatalogModalProps = {
  open: boolean
  initialTab: CatalogTab
  projectRoot: string
  onClose: () => void
  onOpenLocalPath: (path: string) => Promise<void>
  onOpenExternalUrl: (url: string) => Promise<void>
}

export function CatalogModal(props: CatalogModalProps) {
  const searchRef = useRef<HTMLInputElement | null>(null)
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [openFilter, setOpenFilter] = useState<'plugin_source' | 'plugin_category' | 'skill_scope' | 'skill_source' | null>(null)
  const repository = createTauriCatalogRepository(props.projectRoot)
  const {
    state,
    dispatch,
    plugins,
    skills,
    pluginDetails,
    skillDetails,
    pluginBusy,
    skillBusy,
    createPluginPending,
    createSkillPending,
    reloadPlugins,
    reloadSkills,
    openPluginDetails,
    openSkillDetails,
    installPlugin,
    uninstallPlugin,
    setPluginEnabled,
    completePluginAuth,
    installSkill,
    setSkillEnabled,
    submitCreatePlugin,
    submitCreateSkill,
  } = useCatalogWorkspace(props.open, props.initialTab, props.projectRoot, repository)

  useEffect(() => {
    if (!props.open) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTypingTarget = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable),
      )

      if (event.key === 'Escape') {
        if (state.drawer) {
          dispatch({ type: 'close_drawer' })
        } else {
          props.onClose()
        }
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }

      if (event.key === '/' && !isTypingTarget) {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }

      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault()
        dispatch({ type: 'set_tab', tab: state.active_tab === 'plugins' ? 'skills' : 'plugins' })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, props, state.active_tab, state.drawer])

  if (!props.open) {
    return null
  }

  const pluginSections = getPluginSections(plugins.data?.entries ?? [], state.plugin_filters)
  const skillSections = getSkillSections(skills.data?.entries ?? [], state.skill_filters)
  const orderedIds =
    state.active_tab === 'plugins'
      ? pluginSections.flatMap((section) => section.items.map((entry) => entry.catalog.plugin_id))
      : skillSections.flatMap((section) => section.items.map((entry) => entry.record.skill_id))
  const pluginSourceOptions = [
    { value: 'all', label: 'All sources' },
    ...(plugins.data?.sources ?? []).map((source) => ({
      value: source.id,
      label:
        source.publisher && source.publisher !== source.display_name
          ? `${source.display_name} · ${source.publisher}`
          : source.display_name,
    })),
  ]
  const pluginCategoryOptions = [
    { value: 'all', label: 'All categories' },
    ...getPluginCategoryOptions(plugins.data?.entries ?? []),
  ]
  const skillScopeOptions = [
    { value: 'all', label: 'All scopes' },
    ...getSkillScopeOptions(skills.data?.entries ?? []),
  ]
  const skillSourceOptions = [
    { value: 'all', label: 'All sources' },
    ...getSkillSourceOptions(skills.data?.entries ?? []),
  ]

  const activePluginDetail =
    state.drawer?.kind === 'plugin_details' ? pluginDetails[state.drawer.plugin_id] ?? null : null
  const activeSkillDetail =
    state.drawer?.kind === 'skill_details' ? skillDetails[state.drawer.skill_id] ?? null : null

  const hasDrawer = state.drawer !== null
  const contentResource = state.active_tab === 'plugins' ? plugins : skills
  const contentSections = state.active_tab === 'plugins' ? pluginSections : skillSections
  const searchValue = state.active_tab === 'plugins' ? state.plugin_filters.search : state.skill_filters.search

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="h-[86vh] w-[min(1160px,calc(100vw-48px))] overflow-hidden rounded-[26px] border border-white/8 bg-[#09090b] shadow-[0_40px_120px_rgba(0,0,0,0.55)]">
        <div className="flex h-full min-h-0">
          <div className="flex min-w-0 flex-1 flex-col">
            <CatalogControls
              activeTab={state.active_tab}
              title={state.active_tab === 'plugins' ? 'Make Codex work your way' : 'Make Codex work your way'}
              searchValue={searchValue}
              searchPlaceholder={
                state.active_tab === 'plugins' ? 'Search plugins' : 'Search skills'
              }
              searchRef={searchRef}
              onTabChange={(tab) => {
                dispatch({ type: 'set_tab', tab })
                setOpenFilter(null)
              }}
              onSearchChange={(value) =>
                dispatch({
                  type: state.active_tab === 'plugins' ? 'set_plugin_search' : 'set_skill_search',
                  value,
                })
              }
              onManage={() =>
                dispatch({
                  type: 'open_drawer',
                  drawer: state.active_tab === 'plugins' ? { kind: 'plugin_manage' } : { kind: 'skill_manage' },
                })
              }
              onCreate={() =>
                dispatch({
                  type: 'open_drawer',
                  drawer: state.active_tab === 'plugins' ? { kind: 'plugin_create' } : { kind: 'skill_create' },
                })
              }
              filterButtons={
                state.active_tab === 'plugins'
                  ? [
                      {
                        label: 'Source',
                        value: state.plugin_filters.source_id,
                        options: pluginSourceOptions,
                        open: openFilter === 'plugin_source',
                        onToggle: (next) => setOpenFilter(next ? 'plugin_source' : null),
                        onSelect: (value) => dispatch({ type: 'set_plugin_source', value }),
                      },
                      {
                        label: 'Category',
                        value: state.plugin_filters.category,
                        options: pluginCategoryOptions,
                        open: openFilter === 'plugin_category',
                        onToggle: (next) => setOpenFilter(next ? 'plugin_category' : null),
                        onSelect: (value) =>
                          dispatch({
                            type: 'set_plugin_category',
                            value: value as typeof state.plugin_filters.category,
                          }),
                      },
                    ]
                  : [
                      {
                        label: 'Scope',
                        value: state.skill_filters.scope,
                        options: skillScopeOptions,
                        open: openFilter === 'skill_scope',
                        onToggle: (next) => setOpenFilter(next ? 'skill_scope' : null),
                        onSelect: (value) =>
                          dispatch({
                            type: 'set_skill_scope',
                            value: value as typeof state.skill_filters.scope,
                          }),
                      },
                      {
                        label: 'Source',
                        value: state.skill_filters.source_kind,
                        options: skillSourceOptions,
                        open: openFilter === 'skill_source',
                        onToggle: (next) => setOpenFilter(next ? 'skill_source' : null),
                        onSelect: (value) =>
                          dispatch({
                            type: 'set_skill_source_kind',
                            value: value as typeof state.skill_filters.source_kind,
                          }),
                      },
                    ]
              }
              overflowOpen={state.overflow_open}
              onOverflowToggle={(next) => dispatch({ type: 'toggle_overflow', open: next })}
              onReload={() => {
                dispatch({ type: 'toggle_overflow', open: false })
                void (state.active_tab === 'plugins' ? reloadPlugins(true) : reloadSkills())
              }}
              onClearFilters={() => {
                dispatch({ type: 'clear_filters', tab: state.active_tab })
                dispatch({ type: 'toggle_overflow', open: false })
              }}
            />

            <div className="shell-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {renderContent()}
            </div>
          </div>

          {hasDrawer ? (
            <CatalogDrawer
              drawer={state.drawer!}
              activeTab={state.active_tab}
              plugins={plugins.data}
              skills={skills.data}
              pluginDetails={activePluginDetail}
              skillDetails={activeSkillDetail}
              pluginBusy={pluginBusy}
              skillBusy={skillBusy}
              createPluginDraft={state.create_plugin_draft}
              createSkillDraft={state.create_skill_draft}
              createPluginPending={createPluginPending}
              createSkillPending={createSkillPending}
              lastPluginScaffoldResult={state.last_plugin_scaffold_result}
              lastScaffoldResult={state.last_scaffold_result}
              onClose={() => dispatch({ type: 'close_drawer' })}
              onSetCreatePluginField={(field, value) =>
                dispatch({ type: 'set_create_plugin_field', field, value })
              }
              onSetCreateSkillField={(field, value) =>
                dispatch({ type: 'set_create_skill_field', field, value })
              }
              onSubmitCreatePlugin={submitCreatePlugin}
              onSubmitCreateSkill={submitCreateSkill}
              onInstallPlugin={installPlugin}
              onUninstallPlugin={uninstallPlugin}
              onSetPluginEnabled={setPluginEnabled}
              onCompletePluginAuth={completePluginAuth}
              onInstallSkill={installSkill}
              onSetSkillEnabled={setSkillEnabled}
              onOpenLocalPath={props.onOpenLocalPath}
              onOpenExternalUrl={props.onOpenExternalUrl}
            />
          ) : null}
        </div>
      </div>
    </div>
  )

  function renderContent() {
    if (contentResource.status === 'loading' && !contentResource.data) {
      return (
        <CatalogPanelState
          title={`Loading ${state.active_tab}`}
          description="Preparing catalog entries, install state, and section metadata."
        />
      )
    }

    if (contentResource.status === 'error' && !contentResource.data) {
      return (
        <CatalogPanelState
          title={`Couldn't load ${state.active_tab}`}
          description={contentResource.error ?? 'The catalog is unavailable right now.'}
          action={
            <button
              type="button"
              onClick={() => void (state.active_tab === 'plugins' ? reloadPlugins() : reloadSkills())}
              className="rounded-[11px] border border-white/8 bg-white/[0.08] px-3 py-2 text-[12.5px] font-medium text-white transition hover:bg-white/[0.12]"
            >
              Retry
            </button>
          }
        />
      )
    }

    if (contentSections.length === 0) {
      return (
        <CatalogPanelState
          title={`No ${state.active_tab} match these filters`}
          description="Clear the current search and filters to get back to the full catalog."
          action={
            <button
              type="button"
              onClick={() => dispatch({ type: 'clear_filters', tab: state.active_tab })}
              className="rounded-[11px] border border-white/8 bg-white/[0.08] px-3 py-2 text-[12.5px] font-medium text-white transition hover:bg-white/[0.12]"
            >
              Clear filters
            </button>
          }
        />
      )
    }

    return (
      <div className="space-y-8">
        {state.active_tab === 'plugins'
          ? pluginSections.map((section) => (
              <CatalogSection
                key={section.id}
                section={section}
                renderCard={(entry) => {
                  const source = plugins.data?.sources.find((source) => source.id === entry.source_id)
                  const status = getPluginCardStatus(entry)
                  const selected =
                    state.drawer?.kind === 'plugin_details' &&
                    state.drawer.plugin_id === entry.catalog.plugin_id

                  return (
                    <CatalogCard
                      key={entry.catalog.plugin_id}
                      id={entry.catalog.plugin_id}
                      buttonRef={(node) => {
                        cardRefs.current[entry.catalog.plugin_id] = node
                      }}
                      title={entry.catalog.display_name}
                      description={entry.catalog.short_description}
                      meta={`${source?.display_name ?? 'Source'} • ${pluginCategoryLabel(entry.catalog.category)}`}
                      iconKey={entry.catalog.logo}
                      status={status}
                      busy={Boolean(pluginBusy[entry.catalog.plugin_id])}
                      selected={selected}
                      onClick={() => void openPluginDetails(entry.catalog.plugin_id)}
                      onKeyDown={(event) =>
                        cardKeyboardHandler(event, () => void openPluginDetails(entry.catalog.plugin_id), (key) =>
                          moveCardFocus(entry.catalog.plugin_id, key),
                        )
                      }
                    />
                  )
                }}
              />
            ))
          : skillSections.map((section) => (
              <CatalogSection
                key={section.id}
                section={section}
                renderCard={(entry) => {
                  const status = getSkillCardStatus(entry)
                  const meta =
                    entry.bundled_by_plugin_name && entry.record.source_kind === 'plugin_bundled'
                      ? `${entry.bundled_by_plugin_name} • ${skillSourceKindLabel(entry.record.source_kind)}`
                      : `${skillScopeLabel(entry.record.scope)} • ${skillSourceKindLabel(entry.record.source_kind)}`
                  const selected =
                    state.drawer?.kind === 'skill_details' &&
                    state.drawer.skill_id === entry.record.skill_id

                  return (
                    <CatalogCard
                      key={entry.record.skill_id}
                      id={entry.record.skill_id}
                      buttonRef={(node) => {
                        cardRefs.current[entry.record.skill_id] = node
                      }}
                      title={entry.record.display_name}
                      description={entry.record.short_description}
                      meta={meta}
                      iconKey={entry.record.icon}
                      brandColor={entry.record.brand_color}
                      status={status}
                      busy={Boolean(skillBusy[entry.record.skill_id])}
                      selected={selected}
                      onClick={() => void openSkillDetails(entry.record.skill_id)}
                      onKeyDown={(event) =>
                        cardKeyboardHandler(event, () => void openSkillDetails(entry.record.skill_id), (key) =>
                          moveCardFocus(entry.record.skill_id, key),
                        )
                      }
                    />
                  )
                }}
              />
            ))}
      </div>
    )
  }

  function moveCardFocus(currentId: string, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') {
    const nextId = moveGridFocus(
      orderedIds,
      currentId,
      key,
      typeof window !== 'undefined' && window.innerWidth >= 1280 ? 2 : 1,
    )
    if (!nextId) {
      return
    }
    dispatch({ type: 'set_focused_card', id: nextId })
    cardRefs.current[nextId]?.focus()
  }
}
