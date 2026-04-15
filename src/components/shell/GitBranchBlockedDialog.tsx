import { IconTooltip } from '../IconTooltip'
import { BranchIcon, CloseIcon } from './icons'

type GitBranchBlockedDialogProps = {
  open: boolean
  branchName: string
  mode: 'checkout' | 'create_and_checkout'
  fileCount: number
  additions: number
  deletions: number
  onClose: () => void
  onOpenCommit: () => void
}

export function GitBranchBlockedDialog(props: GitBranchBlockedDialogProps) {
  if (!props.open) {
    return null
  }

  const actionLabel =
    props.mode === 'create_and_checkout' ? 'Create and switch branch' : 'Switch branch'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-[3px]">
      <div className="w-full max-w-[30rem] rounded-[24px] border border-white/7 bg-[#17171a] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.52)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/85">
              <BranchIcon className="h-3.5 w-3.5" />
              <span>Branch switch</span>
            </div>
            <h2 className="mt-1.5 text-[1.22rem] font-medium tracking-[-0.04em] text-white">
              Finish changes before switching
            </h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="group relative flex size-9 items-center justify-center rounded-[12px] border border-white/7 bg-white/[0.03] text-neutral-400 transition hover:bg-white/[0.055] hover:text-white"
            title="Close"
          >
            <CloseIcon className="h-3.5 w-3.5" />
            <IconTooltip label="Close" />
          </button>
        </div>

        <div className="mt-4 rounded-[18px] border border-amber-300/12 bg-amber-400/[0.07] px-4 py-3.5">
          <p className="text-[13.5px] leading-[1.65] text-neutral-100">
            {actionLabel} to <span className="font-medium text-white">{props.branchName}</span> is blocked while this
            worktree still has local changes. Commit, stash, or restore them before continuing.
          </p>
        </div>

        <div className="mt-4 border-y border-white/6">
          <div className="grid grid-cols-[5.5rem,1fr] items-center gap-4 py-2.5 text-[12.5px]">
            <span className="text-neutral-500">Target</span>
            <span className="justify-self-end font-medium text-neutral-100">{props.branchName}</span>
          </div>
          <div className="grid grid-cols-[5.5rem,1fr] items-center gap-4 border-t border-white/6 py-2.5 text-[12.5px]">
            <span className="text-neutral-500">Changes</span>
            <span className="justify-self-end font-medium text-neutral-100">
              {props.fileCount} {props.fileCount === 1 ? 'file' : 'files'}  +{props.additions} -{props.deletions}
            </span>
          </div>
        </div>

        <p className="mt-4 text-[12.5px] leading-[1.65] text-neutral-400">
          Opening commit from here keeps you on the current branch. After that, retry the branch action from the
          composer Git menu.
        </p>

        <div className="mt-4 flex items-center justify-end gap-3 border-t border-white/6 pt-4">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-[12px] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-[13px] font-medium text-neutral-200 transition hover:bg-white/[0.08] hover:text-white"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={props.onOpenCommit}
            disabled={props.fileCount === 0}
            className="rounded-[12px] border border-white/8 bg-white px-4 py-2.5 text-[13px] font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-neutral-500"
          >
            Commit changes
          </button>
        </div>
      </div>
    </div>
  )
}
