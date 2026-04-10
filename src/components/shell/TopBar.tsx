import { getCurrentWindow } from '@tauri-apps/api/window'
import type { MouseEvent, ReactNode } from 'react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BranchIcon,
  FileCodeIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
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
  changesCount: number
  changesDisabled: boolean
  changesOpen: boolean
  codeReady: boolean
  codeOpen: boolean
  diagnosticsCount: number
  diagnosticsOpen: boolean
  onToggleSidebar: () => void
  onGoBack: () => void
  onGoForward: () => void
  onToggleChanges: () => void
  onToggleCode: () => void
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
      className={`flex size-7 items-center justify-center rounded-[8px] text-neutral-400 transition ${
        props.disabled
          ? 'cursor-not-allowed bg-transparent text-neutral-600'
          : 'bg-white/[0.02] hover:bg-white/[0.055] hover:text-neutral-100'
      }`}
    >
      <Icon className="h-3.25 w-3.25" />
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
      title={props.label}
      className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium transition ${
        props.active
          ? 'bg-white/[0.08] text-neutral-100'
          : 'text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200'
      } ${props.disabled ? 'cursor-not-allowed opacity-60 hover:bg-transparent hover:text-neutral-400' : ''}`}
    >
      <Icon className="h-3.25 w-3.25" />
      <span>{props.label}</span>
      <span className="rounded-[5px] bg-black/20 px-1.25 py-0.5 text-[9.5px] text-neutral-300">
        {props.count}
      </span>
    </button>
  )
}

function RunStatePill(props: { state: TopBarRunState }) {
  const status =
    props.state === 'running'
      ? {
          label: 'Busy',
          dotClass: 'bg-amber-300',
          textClass: 'text-amber-100',
          surfaceClass: 'bg-amber-300/[0.08]',
        }
      : props.state === 'done'
        ? {
            label: 'Ready',
            dotClass: 'bg-emerald-300',
            textClass: 'text-emerald-100',
            surfaceClass: 'bg-emerald-300/[0.07]',
          }
        : {
            label: 'Idle',
            dotClass: 'bg-neutral-500',
            textClass: 'text-neutral-400',
            surfaceClass: 'bg-white/[0.04]',
          }

  return (
    <div
      className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium ${status.surfaceClass} ${status.textClass}`}
    >
      <span className={`size-1.5 rounded-full ${status.dotClass}`} />
      <span>{status.label}</span>
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

export function TopBar(props: TopBarProps) {
  const SidebarToggleIcon = props.sidebarCollapsed ? SidebarExpandIcon : SidebarCollapseIcon

  if (props.minimal) {
    return (
      <header className="flex h-10 shrink-0 items-center bg-[#111114]/95 px-3 text-neutral-200 backdrop-blur-[12px]">
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
    <header className="flex h-10 shrink-0 items-center justify-between bg-[#111114]/95 px-3 text-neutral-200 backdrop-blur-[12px]">
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
          <span className="block truncate text-[13px] font-medium tracking-[-0.02em] text-neutral-200">
            {props.title}
          </span>
        </DragRegion>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-1">
        <RunStatePill state={props.runState} />
        <div className="mx-1 hidden h-3 w-px bg-white/[0.05] lg:block" />
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
          icon={TerminalIcon}
          label="Diagnostics"
          count={props.diagnosticsCount}
          active={props.diagnosticsOpen}
          onClick={props.onToggleDiagnostics}
        />
      </div>
    </header>
  )
}
