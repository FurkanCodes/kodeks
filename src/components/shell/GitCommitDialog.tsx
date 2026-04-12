import { useEffect, useState } from 'react'
import { ChevronIcon, CloseIcon, PlusIcon } from './icons'

type GitCommitDialogProps = {
  open: boolean
  busy?: boolean
  branchLabel: string
  fileCount: number
  additions: number
  deletions: number
  includeUnstaged: boolean
  subject: string
  body: string
  autoSubject: string
  autoBody: string
  error?: string | null
  onClose: () => void
  onToggleIncludeUnstaged: (next: boolean) => void
  onSubjectChange: (value: string) => void
  onBodyChange: (value: string) => void
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

  const useAutoMessage = !props.subject.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-[3px]">
      <div className="w-full max-w-[28rem] rounded-[22px] border border-white/7 bg-[#17171a] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.48)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Commit</div>
            <h2 className="mt-1.5 text-[1.22rem] font-medium tracking-[-0.04em] text-white">Commit changes</h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="flex size-9 items-center justify-center rounded-[12px] border border-white/7 bg-white/[0.03] text-neutral-400 transition hover:bg-white/[0.055] hover:text-white"
            title="Close"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 border-y border-white/6">
          <div className="grid grid-cols-[5.5rem,1fr] items-center gap-4 py-2.5 text-[12.5px]">
            <span className="text-neutral-500">Branch</span>
            <span className="justify-self-end font-medium text-neutral-100">{props.branchLabel}</span>
          </div>
          <div className="grid grid-cols-[5.5rem,1fr] items-center gap-4 border-t border-white/6 py-2.5 text-[12.5px]">
            <span className="text-neutral-500">Changes</span>
            <span className="justify-self-end font-medium text-neutral-100">
              {props.fileCount} {props.fileCount === 1 ? 'file' : 'files'}  +{props.additions} -{props.deletions}
            </span>
          </div>
          <label className="grid grid-cols-[5.5rem,1fr] items-center gap-4 border-t border-white/6 py-2.5 text-[12.5px]">
            <span className="text-neutral-500">All changes</span>
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

        <div className="mt-4 space-y-3">
          <input
            value={props.subject}
            onChange={(event) => props.onSubjectChange(event.target.value)}
            placeholder="Leave blank to auto-write commit message"
            className="w-full rounded-[14px] border border-white/7 bg-black/20 px-4 py-3 text-[14px] text-neutral-100 placeholder:text-neutral-600"
          />
          {useAutoMessage ? (
            <div className="rounded-[12px] border border-white/6 bg-white/[0.03] px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                Auto message
              </div>
              <div className="mt-1 text-[12.5px] font-medium text-neutral-200">{props.autoSubject}</div>
            </div>
          ) : null}
          {showBody ? (
            <textarea
              value={props.body}
              onChange={(event) => props.onBodyChange(event.target.value)}
              placeholder="Optional body"
              rows={4}
              className="w-full resize-none rounded-[14px] border border-white/7 bg-black/20 px-4 py-3 text-[13px] leading-[1.7] text-neutral-100 placeholder:text-neutral-600"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowBody(true)}
              className="flex items-center gap-2 text-[12.5px] font-medium text-neutral-400 transition hover:text-white"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              <span>Add optional body</span>
            </button>
          )}
        </div>

        {props.error ? (
          <div className="mt-4 rounded-[14px] border border-red-400/12 bg-red-500/8 px-4 py-3 text-[12.5px] text-red-100">
            {props.error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/6 pt-4">
          <button
            type="button"
            onClick={() => setShowBody((value) => !value)}
            className="flex items-center gap-1.5 text-[12px] text-neutral-500 transition hover:text-neutral-300"
          >
            <ChevronIcon className={`h-3 w-3 ${showBody ? 'rotate-90' : ''}`} />
            <span>{showBody ? 'Hide body' : 'Body hidden'}</span>
          </button>
          <button
            type="button"
            disabled={props.busy || props.fileCount === 0}
            onClick={props.onSubmit}
            className="rounded-[12px] border border-white/8 bg-white px-4 py-2.5 text-[13px] font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-neutral-500"
          >
            {props.busy ? 'Committing…' : 'Commit'}
          </button>
        </div>
      </div>
    </div>
  )
}
