import { LazyMotion, domAnimation, m, useMotionTemplate, useReducedMotion, useSpring } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { CatalogControls } from './components/CatalogControls'
import { CatalogCard } from './components/CatalogCard'
import { CatalogDrawer } from './components/CatalogDrawer'
import { CatalogPanelState, CatalogSection, cardKeyboardHandler } from './components/CatalogSection'
import type { CatalogDrawerState, CatalogTab } from './models'
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
} from './selectors'
import { useCatalogWorkspace } from './useCatalogWorkspace'

type CatalogWorkspaceProps = {
  activeTab: CatalogTab
  projectRoot: string
  onOpenLocalPath: (path: string) => Promise<void>
  onOpenExternalUrl: (url: string) => Promise<void>
  onTabChange?: (tab: CatalogTab) => void
}

const TAB_CONTENT_VARIANTS = {
  hidden: {
    opacity: 0.78,
    y: 10,
    scale: 0.992,
    transition: {
      duration: 0.14,
      ease: [0.32, 0, 0.67, 0],
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.045,
      delayChildren: 0.02,
    },
  },
} as const

const TAB_CONTENT_REDUCED_VARIANTS = {
  hidden: {
    opacity: 1,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.01,
    },
  },
} as const

const SECTION_VARIANTS = {
  hidden: {
    opacity: 0.72,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
    },
  },
} as const

const SECTION_REDUCED_VARIANTS = {
  hidden: {
    opacity: 1,
    y: 0,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.01,
    },
  },
} as const

const DRAWER_OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.22, ease: [0.32, 0, 0.67, 0] },
  },
} as const

const DRAWER_BACKDROP_VARIANTS = {
  hidden: { opacity: 0, backgroundColor: 'rgba(0, 0, 0, 0)' },
  visible: {
    opacity: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    transition: { duration: 0.22, ease: [0.32, 0, 0.67, 0] },
  },
} as const

const DRAWER_SHEET_VARIANTS = {
  hidden: { opacity: 0, x: 48, scale: 0.985 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 28,
      mass: 0.92,
    },
  },
  exit: {
    opacity: 0,
    x: 56,
    scale: 0.985,
    transition: { duration: 0.22, ease: [0.32, 0, 0.67, 0] },
  },
} as const

const DRAWER_OVERLAY_REDUCED_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
  exit: { opacity: 0, transition: { duration: 0.01 } },
} as const

const DRAWER_BACKDROP_REDUCED_VARIANTS = {
  hidden: { opacity: 0, backgroundColor: 'rgba(0, 0, 0, 0)' },
  visible: { opacity: 1, backgroundColor: 'rgba(0, 0, 0, 0.22)', transition: { duration: 0.01 } },
  exit: { opacity: 0, backgroundColor: 'rgba(0, 0, 0, 0)', transition: { duration: 0.01 } },
} as const

const DRAWER_SHEET_REDUCED_VARIANTS = {
  hidden: { opacity: 0, x: 0, scale: 1 },
  visible: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.01 } },
  exit: { opacity: 0, x: 0, scale: 1, transition: { duration: 0.01 } },
} as const

export function CatalogWorkspace(props: CatalogWorkspaceProps) {
  const searchRef = useRef<HTMLInputElement | null>(null)
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const prefersReducedMotion = useReducedMotion()
  const canvasBlur = useSpring(0, {
    stiffness: 220,
    damping: 28,
    mass: 0.9,
  })
  const canvasFilter = useMotionTemplate`blur(${canvasBlur}px)`
  const [openFilter, setOpenFilter] = useState<'plugin_source' | 'plugin_category' | 'skill_scope' | 'skill_source' | null>(null)
  const [drawerPresentationActive, setDrawerPresentationActive] = useState(false)
  const [presentedDrawer, setPresentedDrawer] = useState<Exclude<CatalogDrawerState, null> | null>(null)
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
  } = useCatalogWorkspace(true, props.activeTab, props.projectRoot, repository)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTypingTarget = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable),
      )

      if (event.key === 'Escape' && state.drawer) {
        dispatch({ type: 'close_drawer' })
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
        const nextTab = state.active_tab === 'plugins' ? 'skills' : 'plugins'
        dispatch({ type: 'set_tab', tab: nextTab })
        props.onTabChange?.(nextTab)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, props, state.active_tab, state.drawer])

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

  const hasDrawer = state.drawer !== null
  const drawerMounted = hasDrawer || drawerPresentationActive
  const effectiveDrawer = state.drawer ?? presentedDrawer
  const activePluginDetail =
    effectiveDrawer?.kind === 'plugin_details' ? pluginDetails[effectiveDrawer.plugin_id] ?? null : null
  const activeSkillDetail =
    effectiveDrawer?.kind === 'skill_details' ? skillDetails[effectiveDrawer.skill_id] ?? null : null
  const contentResource = state.active_tab === 'plugins' ? plugins : skills
  const contentSections = state.active_tab === 'plugins' ? pluginSections : skillSections
  const searchValue = state.active_tab === 'plugins' ? state.plugin_filters.search : state.skill_filters.search

  useEffect(() => {
    if (hasDrawer) {
      setPresentedDrawer(state.drawer)
      setDrawerPresentationActive(true)
    }
  }, [hasDrawer, state.drawer])

  useEffect(() => {
    canvasBlur.set(prefersReducedMotion ? 0 : drawerMounted ? 8 : 0)
  }, [canvasBlur, drawerMounted, prefersReducedMotion])

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#09090b]">
      <m.div
        className="flex min-w-0 flex-1 flex-col"
        animate={
          drawerMounted
            ? {
                scale: 0.986,
                x: -10,
                opacity: 0.82,
              }
            : {
                scale: 1,
                x: 0,
                opacity: 1,
              }
        }
        transition={
          prefersReducedMotion
            ? { duration: 0.01 }
            : {
                type: 'spring',
                stiffness: 280,
                damping: 30,
                mass: 0.95,
              }
        }
        style={{
          originX: 1,
          originY: 0.5,
          filter: prefersReducedMotion ? 'blur(0px)' : canvasFilter,
          willChange: drawerMounted ? 'transform, opacity, filter' : 'transform, opacity',
        }}
      >
        <CatalogControls
          activeTab={state.active_tab}
          title="Make Codex work your way"
          searchValue={searchValue}
          searchPlaceholder={state.active_tab === 'plugins' ? 'Search plugins' : 'Search skills'}
          searchRef={searchRef}
          onTabChange={(tab) => {
            dispatch({ type: 'set_tab', tab })
            props.onTabChange?.(tab)
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

        <div className="shell-scroll min-h-0 flex-1 overflow-y-auto px-10 pb-12 pt-8">
          <div className="mx-auto w-full max-w-[72rem]">
            <LazyMotion features={domAnimation}>
              {renderContent()}
            </LazyMotion>
          </div>
        </div>
      </m.div>

      {effectiveDrawer ? (
        <LazyMotion features={domAnimation}>
          <m.div
            className={`absolute inset-0 z-20 ${hasDrawer ? '' : 'pointer-events-none'}`}
            initial="hidden"
            animate={hasDrawer ? 'visible' : 'exit'}
            variants={prefersReducedMotion ? DRAWER_OVERLAY_REDUCED_VARIANTS : DRAWER_OVERLAY_VARIANTS}
          >
            <m.button
              type="button"
              aria-label="Close panel"
              onClick={() => dispatch({ type: 'close_drawer' })}
              className="absolute inset-0"
              variants={prefersReducedMotion ? DRAWER_BACKDROP_REDUCED_VARIANTS : DRAWER_BACKDROP_VARIANTS}
            />

            <div className="absolute inset-y-5 right-5 left-[max(12rem,18vw)] flex max-w-full justify-end">
              <m.div
                initial="hidden"
                animate={hasDrawer ? 'visible' : 'exit'}
                variants={prefersReducedMotion ? DRAWER_SHEET_REDUCED_VARIANTS : DRAWER_SHEET_VARIANTS}
                onAnimationComplete={() => {
                  if (!hasDrawer) {
                    setDrawerPresentationActive(false)
                    setPresentedDrawer(null)
                  }
                }}
                className="flex w-full"
              >
                <CatalogDrawer
                  drawer={effectiveDrawer}
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
              </m.div>
            </div>
          </m.div>
        </LazyMotion>
      ) : null}
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
              className="rounded-full bg-[color:var(--color-shell-elevated-strong)] px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[color:var(--color-shell-control-hover)]"
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
              className="rounded-full bg-[color:var(--color-shell-elevated-strong)] px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[color:var(--color-shell-control-hover)]"
            >
              Clear filters
            </button>
          }
        />
      )
    }

    const contentVariants = prefersReducedMotion ? TAB_CONTENT_REDUCED_VARIANTS : TAB_CONTENT_VARIANTS
    const sectionVariants = prefersReducedMotion ? SECTION_REDUCED_VARIANTS : SECTION_VARIANTS

    return (
      <m.div
        key={state.active_tab}
        initial="hidden"
        animate="visible"
        variants={contentVariants}
        style={prefersReducedMotion ? undefined : { willChange: 'opacity, transform' }}
        className="space-y-9"
      >
        {state.active_tab === 'plugins'
          ? pluginSections.map((section) => (
              <m.div
                key={section.id}
                variants={sectionVariants}
                style={prefersReducedMotion ? undefined : { willChange: 'opacity, transform' }}
              >
                <CatalogSection
                  section={section}
                  columns={hasDrawer ? 1 : 2}
                  renderCard={(entry) => {
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
              </m.div>
            ))
          : skillSections.map((section) => (
              <m.div
                key={section.id}
                variants={sectionVariants}
                style={prefersReducedMotion ? undefined : { willChange: 'opacity, transform' }}
              >
                <CatalogSection
                  section={section}
                  columns={hasDrawer ? 1 : 2}
                  renderCard={(entry) => {
                    const status = getSkillCardStatus(entry)
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
              </m.div>
            ))}
      </m.div>
    )
  }

  function moveCardFocus(currentId: string, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') {
    const nextId = moveGridFocus(
      orderedIds,
      currentId,
      key,
      hasDrawer || typeof window === 'undefined' || window.innerWidth < 1320 ? 1 : 2,
    )
    if (!nextId) {
      return
    }
    dispatch({ type: 'set_focused_card', id: nextId })
    cardRefs.current[nextId]?.focus()
  }
}
