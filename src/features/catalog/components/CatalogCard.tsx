import {
  AlertCircle,
  Check,
  LoaderCircle,
  LockKeyhole,
  PauseCircle,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { CatalogBrandIcon } from './CatalogIcons'
import type { CatalogCardStatusKind } from '../selectors'

export type CatalogCardProps = {
  id: string
  title: string
  description: string
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
      className={`group flex w-full items-center gap-4 rounded-[18px] px-3 py-3.5 text-left transition ${
        props.selected
          ? 'bg-[color:var(--color-shell-control)]'
          : 'hover:bg-white/[0.022]'
      }`}
    >
      <CatalogBrandIcon
        iconKey={props.iconKey}
        label={props.title}
        brandColor={props.brandColor}
        className="size-14 rounded-[18px]"
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-semibold tracking-[-0.038em] text-[color:var(--color-shell-primary)]">
          {props.title}
        </div>
        <div className="mt-1 truncate text-[14px] leading-6 text-[color:var(--color-shell-muted)]">
          {props.description}
        </div>
      </div>

      <div className="shrink-0">{renderAffordance(props.status, props.busy)}</div>
    </button>
  )
}

function renderAffordance(status: CatalogCardStatusKind, busy?: boolean) {
  if (busy) {
    return (
      <span
        aria-label="Working"
        title="Working"
        className="inline-flex size-10 items-center justify-center rounded-[14px] bg-[color:var(--color-shell-control)] text-[color:var(--color-shell-primary)]"
      >
        <LoaderCircle className="h-4.5 w-4.5 animate-spin" />
      </span>
    )
  }

  const { icon: Icon, className, title } = statusCopy(status)

  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex size-10 items-center justify-center rounded-[14px] ${className}`}
    >
      <Icon className="h-4.5 w-4.5" />
    </span>
  )
}

function statusCopy(status: CatalogCardStatusKind) {
  switch (status) {
    case 'available':
      return {
        icon: Plus,
        className: 'bg-[color:var(--color-shell-control)] text-neutral-200',
        title: 'Available to add',
      }
    case 'connected':
      return {
        icon: Check,
        className: 'text-emerald-100',
        title: 'Connected',
      }
    case 'needs_auth':
      return {
        icon: LockKeyhole,
        className: 'bg-[color:var(--color-shell-control)] text-amber-100',
        title: 'Needs authentication',
      }
    case 'disabled':
      return {
        icon: PauseCircle,
        className: 'bg-[color:var(--color-shell-control)] text-neutral-400',
        title: 'Disabled',
      }
    case 'system':
      return {
        icon: Sparkles,
        className: 'text-sky-100',
        title: 'Built in',
      }
    case 'bundled':
      return {
        icon: Check,
        className: 'text-fuchsia-100',
        title: 'Bundled',
      }
    case 'update':
      return {
        icon: Upload,
        className: 'bg-[color:var(--color-shell-control)] text-sky-100',
        title: 'Update available',
      }
    case 'installed':
      return {
        icon: Check,
        className: 'text-neutral-200',
        title: 'Installed',
      }
    default:
      return {
        icon: AlertCircle,
        className: 'bg-[color:var(--color-shell-control)] text-red-100',
        title: 'Issue',
      }
  }
}
