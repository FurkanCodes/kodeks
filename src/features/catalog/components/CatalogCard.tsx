import { AlertCircle, Check, LoaderCircle, LockKeyhole, PauseCircle, Plus, Sparkles, Upload } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { CatalogBrandIcon } from './CatalogIcons'
import type { CatalogCardStatusKind } from '../selectors'

export type CatalogCardProps = {
  id: string
  title: string
  description: string
  meta: string
  iconKey?: string | null
  brandColor?: string | null
  status: CatalogCardStatusKind
  busy?: boolean
  selected?: boolean
  buttonRef?: (node: HTMLButtonElement | null) => void
  onClick?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}

export function CatalogCard(props: CatalogCardProps) {
  return (
    <button
      type="button"
      ref={props.buttonRef}
      data-catalog-card-id={props.id}
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
      className={`group flex w-full items-center gap-3 rounded-[18px] border px-4 py-3.5 text-left transition ${
        props.selected
          ? 'border-white/14 bg-white/[0.06]'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.045]'
      }`}
    >
      <CatalogBrandIcon iconKey={props.iconKey} label={props.title} brandColor={props.brandColor} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[14px] font-medium tracking-[-0.02em] text-[color:var(--color-shell-primary)]">
            {props.title}
          </div>
        </div>
        <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 text-[color:var(--color-shell-muted)]">
          {props.description}
        </div>
        <div className="mt-1.75 text-[11px] text-[color:var(--color-shell-faint)]">{props.meta}</div>
      </div>

      <div className="flex shrink-0 items-center justify-center">{renderAffordance(props.status, props.busy)}</div>
    </button>
  )
}

function renderAffordance(status: CatalogCardStatusKind, busy?: boolean) {
  if (busy) {
    return (
      <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-300">
        <LoaderCircle className="h-4 w-4 animate-spin" />
      </span>
    )
  }

  switch (status) {
    case 'available':
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-neutral-300">
          <Plus className="h-4 w-4" />
        </span>
      )
    case 'connected':
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
          <Check className="h-4 w-4" />
        </span>
      )
    case 'needs_auth':
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-amber-100">
          <LockKeyhole className="h-4 w-4" />
        </span>
      )
    case 'disabled':
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-neutral-500">
          <PauseCircle className="h-4 w-4" />
        </span>
      )
    case 'system':
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-sky-300/18 bg-sky-400/10 text-sky-100">
          <Sparkles className="h-4 w-4" />
        </span>
      )
    case 'bundled':
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-fuchsia-300/18 bg-fuchsia-400/10 text-fuchsia-100">
          <Check className="h-4 w-4" />
        </span>
      )
    case 'update':
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-sky-300/18 bg-sky-400/10 text-sky-100">
          <Upload className="h-4 w-4" />
        </span>
      )
    case 'installed':
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-200">
          <Check className="h-4 w-4" />
        </span>
      )
    default:
      return (
        <span className="flex size-9 items-center justify-center rounded-full border border-red-300/20 bg-red-500/10 text-red-100">
          <AlertCircle className="h-4 w-4" />
        </span>
      )
  }
}
