import { ChevronDown, MoreHorizontal, Plus, Search, Settings2 } from 'lucide-react'
import type { RefObject } from 'react'
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
  return (
    <div className="shrink-0 border-b border-white/5 px-6 pb-5 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="inline-flex rounded-[11px] border border-white/5 bg-white/[0.03] p-1">
          {(['plugins', 'skills'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={props.activeTab === tab}
              onClick={() => props.onTabChange(tab)}
              className={`rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] transition ${
                props.activeTab === tab
                  ? 'bg-white/[0.08] text-white'
                  : 'text-[color:var(--color-shell-muted)] hover:text-[color:var(--color-shell-primary)]'
              }`}
            >
              {tab === 'plugins' ? 'Plugins' : 'Skills'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ActionButton icon={Settings2} label="Manage" onClick={props.onManage} />
          <ActionButton icon={Plus} label="Create" onClick={props.onCreate} />
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              onClick={() => props.onOverflowToggle()}
              className={`flex size-9 items-center justify-center rounded-[10px] border transition ${
                props.overflowOpen
                  ? 'border-white/12 bg-white/[0.07] text-white'
                  : 'border-white/5 bg-white/[0.03] text-[color:var(--color-shell-muted)] hover:text-white'
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {props.overflowOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-[14px] border border-white/8 bg-[#111112] p-1.5 shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
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

      <div className="mt-6 text-center">
        <h1 className="text-[2rem] font-semibold tracking-[-0.035em] text-[color:var(--color-shell-primary)]">
          {props.title}
        </h1>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-shell-faint)]" />
          <input
            ref={props.searchRef}
            type="text"
            value={props.searchValue}
            onChange={(event) => props.onSearchChange(event.currentTarget.value)}
            placeholder={props.searchPlaceholder}
            className="w-full rounded-[14px] border border-white/6 bg-white/[0.035] py-3 pl-11 pr-4 text-[13px] text-[color:var(--color-shell-primary)] outline-none transition placeholder:text-[color:var(--color-shell-faint)] focus:border-white/12 focus:bg-white/[0.05]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
      className="inline-flex items-center gap-2 rounded-[10px] border border-white/5 bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium text-[color:var(--color-shell-primary)] transition hover:border-white/10 hover:bg-white/[0.055]"
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
        className={`inline-flex items-center gap-2 rounded-[11px] border px-3 py-2 text-[12.5px] font-medium transition ${
          props.open
            ? 'border-white/12 bg-white/[0.07] text-white'
            : 'border-white/5 bg-white/[0.03] text-[color:var(--color-shell-primary)] hover:border-white/10 hover:bg-white/[0.05]'
        }`}
      >
        <span>{activeLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[color:var(--color-shell-faint)]" />
      </button>

      {props.open ? (
        <div className="absolute right-0 z-20 mt-2 min-w-44 rounded-[14px] border border-white/8 bg-[#111112] p-1.5 shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                props.onSelect(option.value)
                props.onToggle(false)
              }}
              className={`flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[12.5px] transition ${
                option.value === props.value
                  ? 'bg-white/[0.08] text-white'
                  : 'text-[color:var(--color-shell-muted)] hover:bg-white/[0.05] hover:text-white'
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
      className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[12.5px] text-[color:var(--color-shell-muted)] transition hover:bg-white/[0.05] hover:text-white"
    >
      {props.label}
    </button>
  )
}
