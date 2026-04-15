import { ChevronDown, MoreHorizontal, Plus, Search, Settings2 } from 'lucide-react'
import type { RefObject } from 'react'
import { LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react'
import { IconTooltip } from '../../../components/IconTooltip'
import type { CatalogTab } from '../models'

type FilterOption = {
  value: string
  label: string
}

type FilterButtonProps = {
  label: string
  value: string
  options: FilterOption[]
  open: boolean
  onToggle: (next: boolean) => void
  onSelect: (value: string) => void
}

type CatalogControlsProps = {
  activeTab: CatalogTab
  title: string
  searchValue: string
  searchPlaceholder: string
  searchRef: RefObject<HTMLInputElement | null>
  onTabChange: (tab: CatalogTab) => void
  onSearchChange: (value: string) => void
  onManage: () => void
  onCreate: () => void
  filterButtons: FilterButtonProps[]
  overflowOpen: boolean
  onOverflowToggle: (next?: boolean) => void
  onReload: () => void
  onClearFilters: () => void
}

export function CatalogControls(props: CatalogControlsProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="shrink-0 px-10 pb-5 pt-5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.035)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <LazyMotion features={domAnimation}>
          <div className="inline-flex rounded-[14px] bg-[color:var(--color-shell-control)] p-1">
            {(['plugins', 'skills'] as const).map((tab) => {
              const active = props.activeTab === tab

              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => props.onTabChange(tab)}
                  className="relative rounded-[10px] px-3.5 py-1.5 text-[13.5px] font-semibold tracking-[-0.015em] text-[color:var(--color-shell-muted)] transition hover:text-[color:var(--color-shell-primary)]"
                >
                  {active ? (
                    <m.span
                      layoutId="catalog-active-tab"
                      className="absolute inset-0 rounded-[10px] bg-[color:var(--color-shell-elevated-strong)]"
                      transition={
                        prefersReducedMotion
                          ? { duration: 0.01 }
                          : {
                              type: 'spring',
                              stiffness: 380,
                              damping: 32,
                              mass: 0.85,
                            }
                      }
                    />
                  ) : null}
                  <m.span
                    className="relative z-[1] block"
                    animate={
                      prefersReducedMotion
                        ? undefined
                        : {
                            opacity: active ? 1 : 0.74,
                            y: active ? 0 : 0.5,
                          }
                    }
                    transition={{
                      duration: prefersReducedMotion ? 0.01 : 0.2,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    style={{ color: active ? 'white' : undefined }}
                  >
                    {tab === 'plugins' ? 'Plugins' : 'Skills'}
                  </m.span>
                </button>
              )
            })}
          </div>
        </LazyMotion>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <ActionButton icon={Settings2} label="Manage" onClick={props.onManage} />
          <ActionButton icon={Plus} label="Create" onClick={props.onCreate} />
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              onClick={() => props.onOverflowToggle()}
              className={`group relative flex size-10 items-center justify-center rounded-[12px] transition ${
                props.overflowOpen
                  ? 'bg-[color:var(--color-shell-elevated-strong)] text-white'
                  : 'bg-[color:var(--color-shell-control)] text-[color:var(--color-shell-muted)] hover:bg-[color:var(--color-shell-control-hover)] hover:text-white'
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
              <IconTooltip label="More actions" />
            </button>

            {props.overflowOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-[16px] bg-[color:var(--color-shell-elevated-strong)] p-1.5 shadow-[var(--shadow-shell-elevated)]">
                <OverflowItem label="Reload catalog" onClick={props.onReload} />
                <OverflowItem label="Clear filters" onClick={props.onClearFilters} />
                <div className="px-3 py-2 text-[11px] leading-5 text-[color:var(--color-shell-faint)]">
                  Search: `/` or `Cmd/Ctrl+K`
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-[60rem] text-center">
        <h1 className="text-[clamp(2.3rem,3.7vw,3.5rem)] font-semibold tracking-[-0.055em] text-[color:var(--color-shell-primary)]">
          {props.title}
        </h1>
      </div>

      <div className="mx-auto mt-8 flex max-w-[70rem] flex-col items-stretch gap-3 xl:flex-row xl:items-center xl:justify-center">
        <div className="relative min-w-0 flex-1 xl:max-w-[50rem]">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-shell-faint)]" />
          <input
            ref={props.searchRef}
            type="text"
            value={props.searchValue}
            onChange={(event) => props.onSearchChange(event.currentTarget.value)}
            placeholder={props.searchPlaceholder}
            className="h-11 w-full rounded-[15px] bg-[color:var(--color-shell-control)] py-3 pl-11 pr-4 text-[14px] text-[color:var(--color-shell-primary)] outline-none transition placeholder:text-[color:var(--color-shell-faint)] focus:bg-[color:var(--color-shell-control-hover)]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
          {props.filterButtons.map((filter) => (
            <FilterButton key={filter.label} {...filter} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionButton(props: { icon: typeof Settings2; label: string; onClick: () => void }) {
  const Icon = props.icon
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[color:var(--color-shell-control)] px-4 text-[13px] font-semibold text-[color:var(--color-shell-primary)] transition hover:bg-[color:var(--color-shell-control-hover)]"
    >
      <Icon className="h-3.5 w-3.5 text-[color:var(--color-shell-muted)]" />
      {props.label}
    </button>
  )
}

function FilterButton(props: FilterButtonProps) {
  const activeLabel = props.options.find((option) => option.value === props.value)?.label ?? props.label

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => props.onToggle(!props.open)}
        className={`inline-flex h-10 max-w-full items-center gap-2 rounded-[12px] px-4 text-[13px] font-medium transition ${
          props.open
            ? 'bg-[color:var(--color-shell-elevated-strong)] text-white'
            : 'bg-[color:var(--color-shell-control)] text-[color:var(--color-shell-primary)] hover:bg-[color:var(--color-shell-control-hover)]'
        }`}
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[color:var(--color-shell-faint)]" />
      </button>

      {props.open ? (
        <div className="absolute right-0 z-20 mt-2 min-w-44 rounded-[16px] bg-[color:var(--color-shell-elevated-strong)] p-1.5 shadow-[var(--shadow-shell-elevated)]">
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                props.onSelect(option.value)
                props.onToggle(false)
              }}
              className={`flex w-full items-center rounded-[12px] px-3 py-2 text-left text-[12.5px] transition ${
                option.value === props.value
                  ? 'bg-[color:var(--color-shell-control)] text-white'
                  : 'text-[color:var(--color-shell-muted)] hover:bg-[color:var(--color-shell-control)] hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function OverflowItem(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[12.5px] text-[color:var(--color-shell-muted)] transition hover:bg-[color:var(--color-shell-control)] hover:text-white"
    >
      {props.label}
    </button>
  )
}
