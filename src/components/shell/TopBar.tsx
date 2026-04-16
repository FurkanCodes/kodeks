import { getCurrentWindow } from '@tauri-apps/api/window'
import { type MouseEvent, type ReactNode } from 'react'
import { IconTooltip } from '../IconTooltip'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BranchIcon,
  FileCodeIcon,
  GaugeIcon,
  PinIcon,
  ShieldAlertIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  SquarePenIcon,
  MonitorIcon,
  TerminalIcon,
} from './icons'

export type TopBarRunState = 'idle' | 'running' | 'done'

type TopBarProps = {
  title: string
  isMacOs: boolean
  minimal?: boolean
  sidebarCollapsed: boolean
  canGoBack: boolean
  canGoForward: boolean
  runState: TopBarRunState
  titlePinned?: boolean
  onTitleAccessoryClick?: () => void
  changesCount: number
  changesDisabled: boolean
  changesOpen: boolean
  codeReady: boolean
  codeOpen: boolean
  browserReady: boolean
  browserOpen: boolean
  terminalReady: boolean
  terminalOpen: boolean
  approvalsCount: number
  approvalsOpen: boolean
  approvalsDisabled?: boolean
  diagnosticsCount: number
  diagnosticsOpen: boolean
  commitReady?: boolean
  onOpenCommit?: () => void
  onToggleSidebar: () => void
  onGoBack: () => void
  onGoForward: () => void
  onToggleChanges: () => void
  onToggleCode: () => void
  onToggleBrowser: () => void
  onToggleTerminal: () => void
  onToggleApprovals: () => void
  onToggleDiagnostics: () => void
}

function WindowIconButton(props: {
  label: string
  disabled?: boolean
  onClick?: () => void
  icon: typeof ArrowLeftIcon
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      aria-label={props.label}
      className={`group relative flex size-8 items-center justify-center rounded-[10px] text-[color:var(--color-shell-faint)] transition ${
        props.disabled
          ? 'cursor-not-allowed bg-transparent text-neutral-600'
          : 'hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
      }`}
    >
      <Icon className="h-3.25 w-3.25" />
      <IconTooltip label={props.label} />
    </button>
  )
}

function HeaderToggle(props: {
  icon: typeof BranchIcon
  label: string
  count: number
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.count > 0 ? `${props.label} (${props.count})` : props.label}
      aria-label={props.count > 0 ? `${props.label} (${props.count})` : props.label}
      className={`group relative flex size-8 items-center justify-center rounded-[10px] transition ${
        props.active
          ? 'bg-[color:var(--color-shell-control)] text-[color:var(--color-shell-primary)]'
          : 'text-[color:var(--color-shell-muted)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
      } ${props.disabled ? 'cursor-not-allowed opacity-60 hover:bg-transparent hover:text-[color:var(--color-shell-muted)]' : ''}`}
    >
      <Icon className="h-3.25 w-3.25" />
      {props.count > 0 ? (
        <span className="shell-tabular absolute -right-1 -top-1 rounded-full bg-white/14 px-1 text-[9px] leading-[1.2] text-[color:var(--color-shell-primary)]">
          {props.count}
        </span>
      ) : null}
      <IconTooltip label={props.count > 0 ? `${props.label} (${props.count})` : props.label} />
    </button>
  )
}

function HeaderAction(props: {
  icon: typeof SquarePenIcon
  label: string
  disabled?: boolean
  onClick?: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      aria-label={props.label}
      className={`group relative flex size-8 items-center justify-center rounded-[10px] transition ${
        props.disabled
          ? 'cursor-not-allowed text-neutral-600'
          : 'text-[color:var(--color-shell-muted)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
      }`}
    >
      <Icon className="h-3.25 w-3.25" />
      <IconTooltip label={props.label} />
    </button>
  )
}

function RunStatePill(props: { state: TopBarRunState }) {
  const status =
    props.state === 'running'
      ? {
          label: 'Busy',
          dotClass: 'bg-amber-300',
          ringClass: 'ring-amber-300/30',
          surfaceClass: 'bg-amber-300/[0.16]',
        }
      : props.state === 'done'
        ? {
            label: 'Ready',
            dotClass: 'bg-emerald-300',
            ringClass: 'ring-emerald-300/30',
            surfaceClass: 'bg-emerald-300/[0.18]',
        }
      : {
          label: 'Idle',
          dotClass: 'bg-[color:var(--color-shell-faint)]',
          ringClass: 'ring-white/10',
          surfaceClass: 'bg-[color:var(--color-shell-control)]',
        }

  return (
    <div className="group relative">
      <div
        title={status.label}
        aria-label={status.label}
        className={`flex size-8 items-center justify-center rounded-[10px] ring-1 ${status.ringClass} ${status.surfaceClass}`}
      >
        <span className={`size-1.5 rounded-full ${status.dotClass}`} />
      </div>
      <IconTooltip label={status.label} />
    </div>
  )
}

function DragRegion(props: {
  enabled: boolean
  className?: string
  children?: ReactNode
}) {
  async function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!props.enabled || event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement | null
    if (target?.closest('button, a, input, textarea, select, [role="button"]')) {
      return
    }

    try {
      await getCurrentWindow().startDragging()
    } catch {
      // Ignore when running in the web preview without a Tauri window handle.
    }
  }

  return (
    <div onMouseDown={(event) => void handleMouseDown(event)} className={props.className}>
      {props.children}
    </div>
  )
}

function TitlePill(props: {
  title: string
  pinned?: boolean
  onAccessoryClick?: () => void
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-[12px] bg-[color:var(--color-shell-control)] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <PinIcon
        className={`h-3.25 w-3.25 shrink-0 ${
          props.pinned ? 'text-[color:var(--color-shell-primary)]' : 'text-[color:var(--color-shell-faint)]'
        }`}
      />
      <span className="truncate text-[13.5px] font-semibold tracking-[-0.022em] text-[color:var(--color-shell-primary)]">
        {props.title}
      </span>
      {props.onAccessoryClick ? (
        <button
          type="button"
          title="Archive thread"
          onClick={props.onAccessoryClick}
          className="group relative flex size-6 shrink-0 items-center justify-center rounded-[8px] text-[color:var(--color-shell-faint)] transition hover:bg-white/[0.06] hover:text-[color:var(--color-shell-primary)]"
        >
          <ArchiveIcon className="h-3.25 w-3.25" />
          <IconTooltip label="Archive thread" />
        </button>
      ) : null}
    </div>
  )
}

export function TopBar(props: TopBarProps) {
  const SidebarToggleIcon = props.sidebarCollapsed ? SidebarExpandIcon : SidebarCollapseIcon

  if (props.minimal) {
    return (
      <header className="relative z-30 flex h-11 shrink-0 items-center bg-[#0f1115]/94 px-3 text-neutral-200 shadow-[inset_0_-1px_0_rgba(255,255,255,0.035)] backdrop-blur-[18px]">
        {props.isMacOs ? <DragRegion enabled className="h-full w-[84px] shrink-0" /> : null}
        <DragRegion
          enabled={props.isMacOs}
          className={`min-w-0 flex-1 select-none ${props.isMacOs ? 'ml-3' : ''}`}
        >
          <span className="block truncate text-[13px] font-medium tracking-[-0.02em] text-neutral-200">
            {props.title}
          </span>
        </DragRegion>
      </header>
    )
  }

  return (
    <header className="relative z-30 flex h-11 shrink-0 items-center justify-between bg-[#0f1115]/94 px-3 text-neutral-200 shadow-[inset_0_-1px_0_rgba(255,255,255,0.035)] backdrop-blur-[18px]">
      <div className="flex min-w-0 flex-1 items-center">
        {props.isMacOs ? <DragRegion enabled className="h-full w-[84px] shrink-0" /> : null}

        <div className="flex shrink-0 items-center gap-0.5">
          <WindowIconButton
            label={props.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            icon={SidebarToggleIcon}
            onClick={props.onToggleSidebar}
          />
          <WindowIconButton
            label="Back"
            icon={ArrowLeftIcon}
            disabled={!props.canGoBack}
            onClick={props.onGoBack}
          />
          <WindowIconButton
            label="Forward"
            icon={ArrowRightIcon}
            disabled={!props.canGoForward}
            onClick={props.onGoForward}
          />
        </div>

        <DragRegion
          enabled={props.isMacOs}
          className={`min-w-0 flex-1 select-none ${props.isMacOs ? 'ml-3' : 'ml-2.5'}`}
        >
          <TitlePill
            title={props.title}
            pinned={props.titlePinned}
            onAccessoryClick={props.onTitleAccessoryClick}
          />
        </DragRegion>
      </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <RunStatePill state={props.runState} />
        <div className="mx-1 hidden h-4 w-px bg-[color:var(--color-shell-divider)] lg:block" />
        {props.onOpenCommit ? (
          <HeaderAction
            icon={SquarePenIcon}
            label="Commit"
            disabled={!props.commitReady}
            onClick={props.onOpenCommit}
          />
        ) : null}
        <HeaderToggle
          icon={BranchIcon}
          label="Changes"
          count={props.changesCount}
          active={props.changesOpen}
          disabled={props.changesDisabled}
          onClick={props.onToggleChanges}
        />
        <HeaderToggle
          icon={FileCodeIcon}
          label="Code"
          count={props.codeReady ? 1 : 0}
          active={props.codeOpen}
          disabled={!props.codeReady}
          onClick={props.onToggleCode}
        />
        <HeaderToggle
          icon={MonitorIcon}
          label="Browser"
          count={0}
          active={props.browserOpen}
          disabled={!props.browserReady}
          onClick={props.onToggleBrowser}
        />
        <HeaderToggle
          icon={TerminalIcon}
          label="Terminal"
          count={0}
          active={props.terminalOpen}
          disabled={!props.terminalReady}
          onClick={props.onToggleTerminal}
        />
        <HeaderToggle
          icon={ShieldAlertIcon}
          label="Approvals"
          count={props.approvalsCount}
          active={props.approvalsOpen}
          disabled={props.approvalsDisabled}
          onClick={props.onToggleApprovals}
        />
        <HeaderToggle
          icon={GaugeIcon}
          label="Diagnostics"
          count={props.diagnosticsCount}
          active={props.diagnosticsOpen}
          onClick={props.onToggleDiagnostics}
        />
      </div>
    </header>
  )
}
