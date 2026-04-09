import { BranchIcon, FileCodeIcon, TerminalIcon } from './icons'

export type TopBarRunState = 'idle' | 'running' | 'done'

type TopBarProps = {
  title: string
  runState: TopBarRunState
  changesCount: number
  changesDisabled: boolean
  changesOpen: boolean
  codeReady: boolean
  codeOpen: boolean
  diagnosticsCount: number
  diagnosticsOpen: boolean
  onToggleChanges: () => void
  onToggleCode: () => void
  onToggleDiagnostics: () => void
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
      className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition ${
        props.active
          ? 'border-white/20 bg-white/10 text-neutral-100'
          : 'border-white/10 text-neutral-400 hover:border-white/15 hover:bg-white/5 hover:text-neutral-200'
      } ${props.disabled ? 'cursor-not-allowed opacity-60 hover:border-white/10 hover:bg-transparent hover:text-neutral-400' : ''}`}
    >
      <Icon className="h-3.25 w-3.25" />
      <span>{props.label}</span>
      <span className="rounded-[4px] border border-white/10 bg-white/[0.04] px-1.25 py-0.5 text-[9.5px] text-neutral-300">
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
          surfaceClass: 'border-amber-300/15 bg-amber-300/[0.06]',
        }
      : props.state === 'done'
        ? {
            label: 'Ready',
            dotClass: 'bg-emerald-300',
            textClass: 'text-emerald-100',
            surfaceClass: 'border-emerald-300/15 bg-emerald-300/[0.05]',
          }
        : {
            label: 'Idle',
            dotClass: 'bg-neutral-500',
            textClass: 'text-neutral-400',
            surfaceClass: 'border-white/10 bg-white/[0.02]',
          }

  return (
    <div
      className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium ${status.surfaceClass} ${status.textClass}`}
    >
      <span className={`size-1.5 rounded-full ${status.dotClass}`} />
      <span>{status.label}</span>
    </div>
  )
}

export function TopBar(props: TopBarProps) {
  return (
    <header className="flex min-h-[54px] shrink-0 flex-wrap items-center gap-y-2 px-4 py-2 md:h-[54px] md:flex-nowrap md:py-0">
      <div className="mr-auto flex min-w-0 items-center gap-3">
        <span className="truncate text-[13px] font-medium tracking-[-0.015em] text-neutral-400">{props.title}</span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:flex-nowrap">
        <RunStatePill state={props.runState} />
        <div className="mx-1.5 hidden h-3.5 w-px bg-white/10 md:block" />
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
