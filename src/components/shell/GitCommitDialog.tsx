import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowUpIcon,
  BranchIcon,
  ChevronIcon,
  CloseIcon,
  PlusIcon,
  PullRequestIcon,
  ShieldAlertIcon,
} from './icons'

type GitCommitDialogProps = {
  open: boolean
  busy?: boolean
  branchLabel: string
  fileCount: number
  additions: number
  deletions: number
  aheadCount?: number
  includeUnstaged: boolean
  subject: string
  body: string
  nextStep?: 'commit' | 'commit_push' | 'commit_pr'
  canPush?: boolean
  canCreatePullRequest?: boolean
  warnings?: string[]
  error?: string | null
  onClose: () => void
  onToggleIncludeUnstaged: (next: boolean) => void
  onSubjectChange: (value: string) => void
  onBodyChange: (value: string) => void
  onNextStepChange?: (next: 'commit' | 'commit_push' | 'commit_pr') => void
  onSubmit: () => void
}

export function GitCommitDialog(props: GitCommitDialogProps) {
  const [showBody, setShowBody] = useState(false)

  useEffect(() => {
    if (!props.open) {
      return
    }
    setShowBody(Boolean(props.body.trim()))
  }, [props.body, props.open])

  if (!props.open) {
    return null
  }

  const aheadCount = props.aheadCount ?? 0
  const canPush = props.canPush ?? false
  const canCreatePullRequest = props.canCreatePullRequest ?? false
  const nextStep =
    props.nextStep === 'commit_pr' && canCreatePullRequest
      ? 'commit_pr'
      : props.nextStep === 'commit_push' && canPush
        ? 'commit_push'
        : 'commit'
  const canContinue =
    nextStep === 'commit_pr'
      ? canCreatePullRequest
      : nextStep === 'commit_push'
        ? canPush && (props.fileCount > 0 || aheadCount > 0)
        : props.fileCount > 0
  const busyLabel =
    nextStep === 'commit_pr'
      ? 'Preparing pull request…'
      : nextStep === 'commit_push'
        ? 'Committing and pushing…'
        : 'Committing…'
  const pushDescription = !canPush
    ? 'Detached HEAD cannot be pushed.'
    : aheadCount > 0 && props.fileCount > 0
      ? `Commit changes, then publish this branch with ${aheadCount} existing local ${
          aheadCount === 1 ? 'commit' : 'commits'
        }.`
      : aheadCount > 0
        ? `Publish ${aheadCount} existing local ${aheadCount === 1 ? 'commit' : 'commits'} on this branch.`
        : 'Create the commit, then push this branch to origin.'
  const pullRequestDescription = !canCreatePullRequest
    ? 'GitHub remote and named branch required.'
    : aheadCount > 0 && props.fileCount > 0
      ? 'Commit changes, push this branch, then open the GitHub PR page.'
      : aheadCount > 0
        ? 'Push existing local commits, then open the GitHub PR page.'
        : 'Open the GitHub PR page for this branch.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-[3px]">
      <div className="w-full max-w-[28rem] rounded-[22px] border border-white/7 bg-[#242424] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
              <div className="flex size-8 items-center justify-center rounded-[11px] bg-white/[0.04]">
                <BranchIcon className="h-3.5 w-3.5 text-neutral-300" />
              </div>
              <span>Commit</span>
            </div>
            <h2 className="mt-4 text-[1.42rem] font-medium tracking-[-0.045em] text-white">Commit your changes</h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="flex size-9 items-center justify-center rounded-[12px] bg-white/[0.03] text-neutral-400 transition hover:bg-white/[0.055] hover:text-white"
            title="Close"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] font-medium text-neutral-200">Branch</span>
            <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-100">
              <BranchIcon className="h-3.5 w-3.5 text-neutral-400" />
              <span>{props.branchLabel}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] font-medium text-neutral-200">Changes</span>
            <div className="flex items-center gap-3 text-[13px] font-medium">
              <span className="text-neutral-300">
                {props.fileCount} {props.fileCount === 1 ? 'file' : 'files'}
              </span>
              <span className="text-emerald-400">+{props.additions}</span>
              <span className="text-rose-400">-{props.deletions}</span>
            </div>
          </div>
          <label className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-medium text-neutral-200">Include unstaged</div>
            </div>
            <button
              type="button"
              onClick={() => props.onToggleIncludeUnstaged(!props.includeUnstaged)}
              className={`relative inline-flex h-6 w-11 items-center justify-self-end rounded-full transition ${
                props.includeUnstaged ? 'bg-blue-500/90' : 'bg-white/12'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white transition ${
                  props.includeUnstaged ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>

        {props.warnings?.length ? (
          <div className="mt-4 rounded-[14px] border border-amber-300/12 bg-amber-400/[0.08] px-3.5 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
              <ShieldAlertIcon className="h-3.5 w-3.5" />
              <span>Warnings</span>
            </div>
            <div className="mt-2.5 space-y-1.5">
              {props.warnings.map((warning) => (
                <div key={warning} className="text-[12px] leading-[1.55] text-amber-50/95">
                  {warning}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[13px] font-medium text-neutral-200">Commit message</div>
            <span className="text-[12px] font-medium text-neutral-500">Custom instructions</span>
          </div>
          <input
            value={props.subject}
            onChange={(event) => props.onSubjectChange(event.target.value)}
            placeholder="Leave blank to autogenerate a commit message"
            className="mt-3 w-full rounded-[14px] border border-white/7 bg-black/18 px-4 py-3 text-[14px] text-neutral-100 placeholder:text-neutral-600"
          />
          {showBody ? (
            <textarea
              value={props.body}
              onChange={(event) => props.onBodyChange(event.target.value)}
              placeholder="Optional body"
              rows={3}
              className="mt-3 w-full resize-none rounded-[14px] border border-white/7 bg-black/18 px-4 py-3 text-[13px] leading-[1.65] text-neutral-100 placeholder:text-neutral-600"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowBody(true)}
              className="mt-3 flex items-center gap-2 text-[12px] font-medium text-neutral-500 transition hover:text-neutral-300"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              <span>Add optional body</span>
            </button>
          )}
          {showBody ? (
            <button
              type="button"
              onClick={() => setShowBody(false)}
              className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-neutral-500 transition hover:text-neutral-300"
            >
              <ChevronIcon className="h-3 w-3 rotate-90" />
              <span>Hide body</span>
            </button>
          ) : null}
        </div>

        <div className="mt-5">
          <div className="text-[13px] font-medium text-neutral-200">Next steps</div>
          <div className="mt-3 overflow-hidden rounded-[14px] border border-white/7 bg-white/[0.03]">
            <GitNextStepOption
              icon={<BranchIcon className="h-3.5 w-3.5" />}
              label="Commit"
              description="Create a local commit on this branch."
              selected={nextStep === 'commit'}
              onClick={() => props.onNextStepChange?.('commit')}
            />
            <GitNextStepOption
              icon={<ArrowUpIcon className="h-3.5 w-3.5" />}
              label="Commit & push"
              description={pushDescription}
              selected={nextStep === 'commit_push'}
              disabled={!canPush}
              bordered
              onClick={() => {
                if (canPush) {
                  props.onNextStepChange?.('commit_push')
                }
              }}
            />
            <GitNextStepOption
              icon={<PullRequestIcon className="h-3.5 w-3.5" />}
              label="Commit & create PR"
              description={pullRequestDescription}
              selected={nextStep === 'commit_pr'}
              disabled={!canCreatePullRequest}
              bordered
              onClick={() => {
                if (canCreatePullRequest) {
                  props.onNextStepChange?.('commit_pr')
                }
              }}
            />
          </div>
        </div>

        {props.error ? (
          <div className="mt-4 rounded-[14px] border border-red-400/12 bg-red-500/8 px-4 py-3 text-[12px] text-red-100">
            {props.error}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            disabled={props.busy || !canContinue}
            onClick={props.onSubmit}
            className="min-w-[8.5rem] rounded-[13px] border border-white/8 bg-white px-4 py-2.5 text-[13px] font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-neutral-500"
          >
            {props.busy ? busyLabel : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GitNextStepOption(props: {
  icon: ReactNode
  label: string
  description: string
  selected: boolean
  disabled?: boolean
  bordered?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition ${
        props.bordered ? 'border-t border-white/7' : ''
      } ${props.selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'} ${
        props.disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : ''
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-neutral-300">
          {props.icon}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-neutral-100">{props.label}</div>
          <div className="mt-0.5 text-[11.5px] leading-[1.45] text-neutral-500">{props.description}</div>
        </div>
      </div>
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
        {props.selected ? <div className="size-2 rounded-full bg-white" /> : null}
      </div>
    </button>
  )
}
