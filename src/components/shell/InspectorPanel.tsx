import type { ReactNode } from 'react'
import type {
  ApprovalDecisionOption,
  ApprovalEntry,
  ApprovalFileChange,
  DiagnosticTrace,
  DiagnosticWarning,
  OpenWithTarget,
} from '../../lib/kodeks'
import { ChevronIcon, CloseIcon, DiffAddIcon, DiffRemoveIcon, FileCodeIcon } from './icons'

export type DrawerMode = 'changes' | 'code' | 'approvals' | 'diagnostics'

export type DiffFileView = {
  path: string
  additions: number
  deletions: number
  status: 'A' | 'M' | 'D' | 'R'
}

export type DiffLineView = {
  id: string
  number: number
  text: string
  tone: 'context' | 'add' | 'remove' | 'header'
}

type InspectorPanelProps = {
  open: boolean
  mode: DrawerMode
  overlay?: boolean
  width?: number
  badgeLabel: string
  diffFiles: DiffFileView[]
  hiddenDiffFilesCount?: number
  hiddenFilesVisible?: boolean
  selectedPath: string | null
  selectedBreadcrumbs: string[]
  diffHeader: string
  diffLines: DiffLineView[]
  codePath: string | null
  codeBreadcrumbs: string[]
  codeContent: string
  codeChangedLines?: ReadonlySet<number>
  codeLanguage?: string
  approvals: ApprovalEntry[]
  approvalsBusyRequestId?: string | null
  warnings: DiagnosticWarning[]
  traces: DiagnosticTrace[]
  onClose: () => void
  onSelectFile: (path: string) => void
  onToggleHiddenFiles?: () => void
  onJumpToContext?: () => void
  onViewCode?: () => void
  onShowChanges?: () => void
  onOpenFile?: () => void
  onOpenFileWith?: (targetId: string) => void
  openFileTargets?: OpenWithTarget[]
  openFileTargetsLoading?: boolean
  onApprove: (approval: ApprovalEntry, decision: string) => void
  onExportDiagnostics: () => void
}

function StatusBadge(props: { status: 'A' | 'M' | 'D' | 'R' }) {
  const map = {
    A: { label: 'A', color: '#4ade80', background: 'rgba(74,222,128,0.08)' },
    M: { label: 'M', color: '#fbbf24', background: 'rgba(251,191,36,0.08)' },
    D: { label: 'D', color: '#f87171', background: 'rgba(248,113,113,0.08)' },
    R: { label: 'R', color: '#93c5fd', background: 'rgba(147,197,253,0.08)' },
  }
  const current = map[props.status]

  return (
    <span
      style={{
        fontSize: '10px',
        color: current.color,
        background: current.background,
        borderRadius: '3px',
        padding: '1px 4px',
        letterSpacing: '0.04em',
      }}
    >
      {current.label}
    </span>
  )
}

function DiffLine(props: { line: DiffLineView }) {
  const background =
    props.line.tone === 'add'
      ? 'rgba(74,222,128,0.05)'
      : props.line.tone === 'remove'
        ? 'rgba(248,113,113,0.05)'
        : props.line.tone === 'header'
          ? 'rgba(255,255,255,0.02)'
          : 'transparent'

  const color =
    props.line.tone === 'add'
      ? '#4ade80'
      : props.line.tone === 'remove'
        ? '#f87171'
        : props.line.tone === 'header'
          ? '#525252'
          : '#a3a3a3'

  return (
    <div className="flex items-start gap-0" style={{ background }}>
      <span
        style={{
          width: '36px',
          padding: '1px 8px 1px 16px',
          fontSize: '12px',
          color: '#525252',
          flexShrink: 0,
          userSelect: 'none',
          textAlign: 'right',
        }}
      >
        {props.line.tone === 'header' || props.line.number <= 0 ? '' : props.line.number}
      </span>

      <div className="flex shrink-0 items-center justify-center" style={{ width: '20px', paddingTop: '3px' }}>
        {props.line.tone === 'add' ? <DiffAddIcon className="h-3 w-3 text-[#4ade80]" /> : null}
        {props.line.tone === 'remove' ? <DiffRemoveIcon className="h-3 w-3 text-[#f87171]" /> : null}
      </div>

      <span
        className="shell-cousine"
        style={{
          fontSize: '13px',
          color,
          padding: '1px 12px 1px 4px',
          lineHeight: '1.7',
          whiteSpace: 'pre',
          flex: 1,
          minWidth: 0,
        }}
      >
        {props.line.text || ' '}
      </span>
    </div>
  )
}

function ApprovalMetaRow(props: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-[12.5px] leading-6">
      <div className="uppercase tracking-[0.06em] text-neutral-500">{props.label}</div>
      <div className="min-w-0 break-words text-neutral-300">{props.value}</div>
    </div>
  )
}

function approvalToneForLine(line: string): DiffLineView['tone'] {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'add'
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return 'remove'
  }
  if (line.startsWith('@@') || line.startsWith('diff --git') || line.startsWith('rename ')) {
    return 'header'
  }
  return 'context'
}

function buildApprovalDiffPreview(diff: string, limit = 18) {
  const lines = diff.split('\n').filter((line, index, items) => !(index === items.length - 1 && line === ''))
  const preview = lines.slice(0, limit)
  return {
    truncated: lines.length > limit,
    lines: preview.map((text, index) => ({
      id: `${index}-${text}`,
      text,
      tone: approvalToneForLine(text),
    })),
  }
}

function describeCommandAction(action: unknown) {
  if (!action || typeof action !== 'object') {
    return null
  }

  const value = action as Record<string, unknown>
  switch (value.type) {
    case 'read':
      return `Read ${String(value.path || 'file')}`
    case 'listFiles':
      return `List files ${value.path ? `in ${String(value.path)}` : 'in workspace'}`
    case 'search':
      return `Search ${value.query ? `"${String(value.query)}"` : 'repo'}${value.path ? ` in ${String(value.path)}` : ''}`
    case 'unknown':
      return value.command ? `Run ${String(value.command)}` : 'Run command'
    default:
      return null
  }
}

function renderJsonValue(value: unknown) {
  if (value == null) {
    return null
  }

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/6 bg-black/20 p-3 text-[12px] leading-6 text-neutral-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function renderDecisionButtons(
  approval: ApprovalEntry,
  onApprove: (approval: ApprovalEntry, decision: string) => void,
  busy?: boolean,
) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {approval.available_decisions.map((decision: ApprovalDecisionOption) => {
        const normalized = decision.id.toLowerCase()
        const primary = normalized === 'accept' || normalized === 'acceptforsession' || normalized === 'approve'
        const reject = normalized.includes('reject') || normalized.includes('deny') || normalized === 'decline'
        return (
          <button
            type="button"
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
              primary
                ? 'border-emerald-300/30 bg-emerald-300/14 text-emerald-100 hover:border-emerald-200/45 hover:bg-emerald-300/20'
                : reject
                  ? 'border-red-300/28 text-red-100 hover:border-red-200/45 hover:bg-red-300/14'
                  : 'border-white/10 text-neutral-200 hover:border-white/20 hover:text-white'
            } disabled:cursor-not-allowed disabled:opacity-55`}
            key={`${approval.request_id}-${decision.id}`}
            onClick={() => onApprove(approval, decision.id)}
            disabled={busy}
          >
            {busy ? 'Submitting...' : decision.label}
          </button>
        )
      })}
    </div>
  )
}

function OpenWithMenu(props: {
  disabled: boolean
  loading?: boolean
  targets?: OpenWithTarget[]
  onSelect?: (targetId: string) => void
}) {
  const targets =
    props.targets && props.targets.length > 0
      ? props.targets
      : [{ id: 'default', label: 'Default app' }]

  if (props.disabled || !props.onSelect) {
    return (
      <button
        type="button"
        disabled
        className="ml-auto rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 opacity-50"
      >
        Open with
      </button>
    )
  }

  return (
    <details className="relative ml-auto">
      <summary className="list-none cursor-pointer rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white">
        Open with
      </summary>
      <div className="absolute bottom-full right-0 z-20 mb-2 min-w-[13rem] overflow-hidden rounded-[8px] border border-white/10 bg-[#0a0c10] shadow-[0_14px_32px_rgba(0,0,0,0.45)]">
        {props.loading ? (
          <div className="px-3 py-2 text-[12px] text-neutral-400">Loading apps...</div>
        ) : (
          targets.map((target) => (
            <button
              type="button"
              key={target.id}
              className="block w-full px-3 py-2 text-left text-[12.5px] text-neutral-300 transition hover:bg-white/7 hover:text-white"
              onClick={(event) => {
                props.onSelect?.(target.id)
                const details = event.currentTarget.closest('details') as HTMLDetailsElement | null
                if (details) {
                  details.open = false
                }
              }}
            >
              {target.label}
            </button>
          ))
        )}
      </div>
    </details>
  )
}

function renderCommandApprovalCard(
  approval: ApprovalEntry,
  onApprove: (approval: ApprovalEntry, decision: string) => void,
  busy?: boolean,
) {
  const actions = approval.command_actions.map(describeCommandAction).filter(Boolean) as string[]
  const networkContext = approval.network_approval_context as
    | { host?: string | null; protocol?: string | null }
    | null
    | undefined

  return (
    <article className="rounded-xl border border-white/5 bg-white/[0.02] p-4" key={approval.request_id}>
      <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-neutral-500">command</div>
      <div className="text-[14px] font-medium text-neutral-200">{approval.title}</div>
      {approval.reason ? <div className="mt-2 text-[13px] leading-6 text-neutral-400">{approval.reason}</div> : null}
      {approval.command ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/6 bg-black/20 p-3 text-[12.5px] leading-6 text-neutral-200">
          {approval.command}
        </pre>
      ) : null}
      <div className="mt-3 space-y-2.5">
        {approval.cwd ? <ApprovalMetaRow label="cwd" value={<code>{approval.cwd}</code>} /> : null}
        {actions.length > 0 ? (
          <ApprovalMetaRow
            label="actions"
            value={
              <div className="space-y-1">
                {actions.map((action, index) => (
                  <div key={`${approval.request_id}-action-${index}`}>{action}</div>
                ))}
              </div>
            }
          />
        ) : null}
        {networkContext?.host ? (
          <ApprovalMetaRow
            label="network"
            value={`${networkContext.protocol || 'network'}://${networkContext.host}`}
          />
        ) : null}
        {approval.proposed_execpolicy_amendment?.length ? (
          <ApprovalMetaRow
            label="rule"
            value={
              <div className="space-y-1">
                {approval.proposed_execpolicy_amendment.map((entry) => (
                  <code className="block" key={`${approval.request_id}-${entry}`}>
                    {entry}
                  </code>
                ))}
              </div>
            }
          />
        ) : null}
        {approval.additional_permissions ? (
          <ApprovalMetaRow label="permissions" value={renderJsonValue(approval.additional_permissions)} />
        ) : null}
      </div>
      {renderDecisionButtons(approval, onApprove, busy)}
    </article>
  )
}

function renderFileChangeCard(
  approval: ApprovalEntry,
  onApprove: (approval: ApprovalEntry, decision: string) => void,
  busy?: boolean,
) {
  return (
    <article className="rounded-xl border border-white/5 bg-white/[0.02] p-4" key={approval.request_id}>
      <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-neutral-500">file change</div>
      <div className="text-[14px] font-medium text-neutral-200">{approval.title}</div>
      {approval.reason ? <div className="mt-2 text-[13px] leading-6 text-neutral-400">{approval.reason}</div> : null}
      {approval.grant_root ? (
        <div className="mt-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.06] px-3 py-2 text-[12.5px] leading-6 text-sky-100/80">
          Session root request: <code>{approval.grant_root}</code>
        </div>
      ) : null}
      {approval.file_changes.length > 0 ? (
        <div className="mt-4 space-y-4">
          {approval.file_changes.map((change: ApprovalFileChange) => {
            const preview = buildApprovalDiffPreview(change.diff)
            return (
              <div className="rounded-xl border border-white/6 bg-black/10 p-3" key={`${approval.request_id}-${change.path}`}>
                <div className="flex items-start gap-3">
                  <StatusBadge status={(change.status as 'A' | 'M' | 'D' | 'R') || 'M'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-neutral-200">{change.path}</div>
                    {change.previous_path ? (
                      <div className="text-[12px] text-neutral-500">renamed from {change.previous_path}</div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-[11px]">
                    {change.additions > 0 ? <span className="text-[#4ade80]">+{change.additions}</span> : null}
                    {change.deletions > 0 ? <span className="ml-2 text-[#f87171]">-{change.deletions}</span> : null}
                  </div>
                </div>
                {preview.lines.length > 0 ? (
                  <div className="mt-3 overflow-hidden rounded-lg border border-white/6 bg-[#0a0a0c]">
                    {preview.lines.map((line) => (
                      <div
                        className="shell-cousine whitespace-pre-wrap px-3 py-1.5 text-[12px] leading-6"
                        key={`${approval.request_id}-${change.path}-${line.id}`}
                        style={{
                          color:
                            line.tone === 'add'
                              ? '#4ade80'
                              : line.tone === 'remove'
                                ? '#f87171'
                                : line.tone === 'header'
                                  ? '#737373'
                                  : '#d4d4d4',
                          background:
                            line.tone === 'add'
                              ? 'rgba(74,222,128,0.05)'
                              : line.tone === 'remove'
                                ? 'rgba(248,113,113,0.05)'
                                : line.tone === 'header'
                                  ? 'rgba(255,255,255,0.02)'
                                  : 'transparent',
                        }}
                      >
                        {line.text || ' '}
                      </div>
                    ))}
                    {preview.truncated ? (
                      <div className="px-3 py-2 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                        Diff preview truncated
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 text-[12px] text-neutral-500">No textual diff preview.</div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-white/6 bg-black/10 px-3 py-2 text-[12.5px] text-neutral-500">
          Waiting for file diff details from runtime.
        </div>
      )}
      {renderDecisionButtons(approval, onApprove, busy)}
    </article>
  )
}

function renderPermissionApprovalCard(
  approval: ApprovalEntry,
  onApprove: (approval: ApprovalEntry, decision: string) => void,
  busy?: boolean,
) {
  return (
    <article className="rounded-xl border border-white/5 bg-white/[0.02] p-4" key={approval.request_id}>
      <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-neutral-500">permissions</div>
      <div className="text-[14px] font-medium text-neutral-200">{approval.title}</div>
      {approval.reason ? <div className="mt-2 text-[13px] leading-6 text-neutral-400">{approval.reason}</div> : null}
      {approval.permissions ? (
        <div className="mt-3">{renderJsonValue(approval.permissions)}</div>
      ) : (
        <div className="mt-3 text-[12.5px] text-neutral-500">No permission payload attached.</div>
      )}
      {renderDecisionButtons(approval, onApprove, busy)}
    </article>
  )
}

function renderGenericApprovalCard(
  approval: ApprovalEntry,
  onApprove: (approval: ApprovalEntry, decision: string) => void,
  busy?: boolean,
) {
  return (
    <article className="rounded-xl border border-white/5 bg-white/[0.02] p-4" key={approval.request_id}>
      <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-neutral-500">{approval.kind}</div>
      <div className="text-[14px] font-medium text-neutral-200">{approval.title}</div>
      <pre className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-neutral-400">{approval.body}</pre>
      {renderDecisionButtons(approval, onApprove, busy)}
    </article>
  )
}

function renderApprovalCard(
  approval: ApprovalEntry,
  onApprove: (approval: ApprovalEntry, decision: string) => void,
  busy?: boolean,
) {
  if (approval.kind === 'command') {
    return renderCommandApprovalCard(approval, onApprove, busy)
  }
  if (approval.kind === 'file-change' || approval.kind === 'patch') {
    return renderFileChangeCard(approval, onApprove, busy)
  }
  if (
    approval.kind === 'permission' &&
    approval.permissions &&
    approval.available_decisions.every((decision) => decision.id === 'accept' || decision.id === 'acceptForSession')
  ) {
    return renderPermissionApprovalCard(approval, onApprove, busy)
  }
  return renderGenericApprovalCard(approval, onApprove, busy)
}

type ApprovalGroupKey = 'command' | 'file-change' | 'permission' | 'other'

function approvalGroupKeyForKind(kind: string): ApprovalGroupKey {
  if (kind === 'command') {
    return 'command'
  }
  if (kind === 'file-change' || kind === 'patch') {
    return 'file-change'
  }
  if (kind === 'permission') {
    return 'permission'
  }
  return 'other'
}

function approvalGroupLabel(group: ApprovalGroupKey) {
  switch (group) {
    case 'command':
      return 'Command access'
    case 'file-change':
      return 'File changes'
    case 'permission':
      return 'Permission grants'
    default:
      return 'Other requests'
  }
}

function CodeTokenLine(props: { text: string; lineNumber: number; changed?: boolean; language?: string }) {
  const commentIndex =
    props.language === 'css'
      ? props.text.indexOf('/*')
      : props.text.indexOf('//')
  const comment =
    commentIndex >= 0 ? props.text.slice(commentIndex) : ''
  const code = commentIndex >= 0 ? props.text.slice(0, commentIndex) : props.text
  const keywordRegex = /\b(import|from|export|default|function|const|let|var|return|async|await|if|else|for|while|class|type|interface|extends|implements|pub|fn|struct|impl|match|use|mod)\b/g
  const stringRegex = /(".*?"|'.*?'|`.*?`)/g

  const renderCode = code.split(keywordRegex).map((part, index) => {
    if (part.match(keywordRegex)) {
      return (
        <span key={`${props.lineNumber}-kw-${index}`} className="text-[#f5c26b]">
          {part}
        </span>
      )
    }

    return part.split(stringRegex).map((inner, innerIndex) => {
      if (inner.match(stringRegex)) {
        return (
          <span key={`${props.lineNumber}-str-${index}-${innerIndex}`} className="text-[#86efac]">
            {inner}
          </span>
        )
      }
      return <span key={`${props.lineNumber}-txt-${index}-${innerIndex}`}>{inner}</span>
    })
  })

  return (
    <div
      className="flex items-start gap-0"
      style={{ background: props.changed ? 'rgba(74,222,128,0.07)' : 'transparent' }}
    >
      <span
        className="w-9 shrink-0 select-none px-2 pl-4 text-right text-[12px]"
        style={{ color: props.changed ? '#4ade80' : '#525252' }}
      >
        {props.lineNumber}
      </span>
      <span
        className="shrink-0"
        style={{
          width: '2px',
          background: props.changed ? 'rgba(74,222,128,0.7)' : 'transparent',
        }}
      />
      <span className="shell-cousine flex-1 whitespace-pre px-3 text-[13px] leading-[1.7] text-[#d4d4d4]">
        {renderCode}
        {comment ? <span className="text-[#737373]">{comment}</span> : null}
      </span>
    </div>
  )
}

function renderMarkdownInline(text: string, keyPrefix: string) {
  const tokenRegex = /(`[^`\n]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*\n]+\*)/g

  return text.split(tokenRegex).map((part, index) => {
    if (!part) {
      return null
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          className="mx-[0.05em] rounded-md border border-white/7 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[0.92em] text-neutral-100"
          key={`${keyPrefix}-code-${index}`}
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    const markdownLink = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (markdownLink) {
      return (
        <a
          className="font-medium text-[#9dbbf0] underline decoration-[#9dbbf0]/25 underline-offset-3 transition hover:text-[#bdd0f8] hover:decoration-[#bdd0f8]/45"
          href={markdownLink[2]}
          key={`${keyPrefix}-link-${index}`}
          rel="noreferrer"
          target="_blank"
        >
          {markdownLink[1]}
        </a>
      )
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong className="font-semibold text-neutral-50" key={`${keyPrefix}-strong-${index}`}>
          {part.slice(2, -2)}
        </strong>
      )
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em className="italic text-neutral-100" key={`${keyPrefix}-em-${index}`}>
          {part.slice(1, -1)}
        </em>
      )
    }

    return <span key={`${keyPrefix}-text-${index}`}>{part}</span>
  })
}

function MarkdownDocument(props: { content: string }) {
  const sections = props.content.split(/(```[\s\S]*?```)/g)
  const nodes: ReactNode[] = []

  sections.forEach((section, sectionIndex) => {
    if (!section.trim()) {
      return
    }

    if (section.startsWith('```') && section.endsWith('```')) {
      const match = section.match(/^```(\w+)?\n?([\s\S]*?)```$/)
      const language = match?.[1]
      const code = match?.[2] ?? section.slice(3, -3)

      nodes.push(
        <div className="my-5 overflow-hidden rounded-[18px] border border-white/6 bg-[#121214]" key={`code-${sectionIndex}`}>
          {language ? (
            <div className="border-b border-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {language}
            </div>
          ) : null}
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-neutral-300">
            <code>{code.trim()}</code>
          </pre>
        </div>,
      )
      return
    }

    const blocks = section
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)

    blocks.forEach((block, blockIndex) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
      const key = `${sectionIndex}-${blockIndex}`

      if (isMarkdownTable(lines)) {
        const [headerLine, , ...bodyLines] = lines
        const headers = splitMarkdownTableRow(headerLine)
        const rows = bodyLines.map(splitMarkdownTableRow)

        nodes.push(
          <div className="my-5 overflow-x-auto rounded-[18px] border border-white/6" key={`table-${key}`}>
            <table className="w-full min-w-[30rem] border-collapse bg-white/[0.02] text-left">
              <thead className="bg-white/[0.04]">
                <tr>
                  {headers.map((header, headerIndex) => (
                    <th
                      className="border-b border-white/6 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500"
                      key={`table-head-${key}-${headerIndex}`}
                    >
                      {renderMarkdownInline(header, `table-head-${key}-${headerIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr className="border-t border-white/6" key={`table-row-${key}-${rowIndex}`}>
                    {headers.map((_, columnIndex) => (
                      <td
                        className="align-top px-4 py-3 text-[14px] leading-[1.6] text-neutral-200/92"
                        key={`table-cell-${key}-${rowIndex}-${columnIndex}`}
                      >
                        {renderMarkdownInline(row[columnIndex] || '', `table-cell-${key}-${rowIndex}-${columnIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        return
      }

      if (lines.every((line) => /^-\s+/.test(line))) {
        nodes.push(
          <ul className="my-4 list-disc space-y-2 pl-5 marker:text-neutral-500" key={`ul-${key}`}>
            {lines.map((line, lineIndex) => (
              <li className="text-[15px] leading-[1.72] text-neutral-200/92" key={`ul-${key}-${lineIndex}`}>
                {renderMarkdownInline(line.replace(/^-\s+/, ''), `ul-${key}-${lineIndex}`)}
              </li>
            ))}
          </ul>,
        )
        return
      }

      if (lines.every((line) => /^\d+\.\s+/.test(line))) {
        nodes.push(
          <ol className="my-4 list-decimal space-y-2 pl-5 marker:text-neutral-500" key={`ol-${key}`}>
            {lines.map((line, lineIndex) => (
              <li className="text-[15px] leading-[1.72] text-neutral-200/92" key={`ol-${key}-${lineIndex}`}>
                {renderMarkdownInline(line.replace(/^\d+\.\s+/, ''), `ol-${key}-${lineIndex}`)}
              </li>
            ))}
          </ol>,
        )
        return
      }

      if (lines.every((line) => /^>\s?/.test(line))) {
        nodes.push(
          <blockquote
            className="my-4 border-l-2 border-white/10 pl-4 text-[15px] leading-[1.72] text-neutral-300/88"
            key={`quote-${key}`}
          >
            {renderMarkdownInline(
              lines.map((line) => line.replace(/^>\s?/, '')).join(' '),
              `quote-${key}`,
            )}
          </blockquote>,
        )
        return
      }

      const heading = block.match(/^(#{1,4})\s+(.+)$/)
      if (heading) {
        const level = heading[1].length
        const className =
          level === 1
            ? 'mt-1 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.03em] text-white'
            : level === 2
              ? 'mt-6 text-[1.25rem] font-semibold leading-[1.2] tracking-[-0.02em] text-neutral-50'
              : 'mt-5 text-[13px] font-semibold uppercase tracking-[0.08em] text-neutral-500'

        nodes.push(
          <div className={className} key={`heading-${key}`}>
            {renderMarkdownInline(heading[2], `heading-${key}`)}
          </div>,
        )
        return
      }

      if (/^---+$/.test(block)) {
        nodes.push(<div className="my-5 h-px bg-white/8" key={`rule-${key}`} />)
        return
      }

      nodes.push(
        <p className="my-4 text-[15px] leading-[1.72] tracking-[-0.012em] text-neutral-200/92" key={`p-${key}`}>
          {renderMarkdownInline(block, `p-${key}`)}
        </p>,
      )
    })
  })

  return <div className="mx-auto max-w-[39rem] px-5 py-5">{nodes}</div>
}

function isMarkdownTable(lines: string[]) {
  if (lines.length < 2) {
    return false
  }

  if (!lines[0].includes('|')) {
    return false
  }

  return /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(lines[1])
}

function splitMarkdownTableRow(line: string) {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())
}

function SectionHeader(props: {
  mode: DrawerMode
  badgeLabel: string
  onClose: () => void
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-3 px-4"
      style={{
        height: '52px',
        borderBottom: '1px solid rgba(255,255,255,0.055)',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          letterSpacing: '0.06em',
          color: '#737373',
          textTransform: 'uppercase',
        }}
      >
        {props.mode === 'approvals'
          ? 'Approvals'
          : props.mode === 'diagnostics'
            ? 'Diagnostics'
            : props.mode === 'code'
              ? 'Code'
              : 'Changes'}
      </span>
      <div
        style={{
          fontSize: '11px',
          background: 'rgba(255,255,255,0.1)',
          color: '#e5e5e5',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '4px',
          padding: '1px 6px',
          letterSpacing: '0.02em',
        }}
      >
        {props.badgeLabel}
      </div>
      <button
        type="button"
        className="ml-auto text-neutral-500 transition hover:text-neutral-200"
        onClick={props.onClose}
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function Breadcrumbs(props: { parts: string[] }) {
  if (props.parts.length === 0) {
    return null
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1 px-4 py-2.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      {props.parts.map((part, index) => (
        <span className="flex items-center gap-1" key={`${part}-${index}`}>
          <span
            style={{
              fontSize: '12px',
              color: index === props.parts.length - 1 ? '#a3a3a3' : '#525252',
            }}
          >
            {part}
          </span>
          {index < props.parts.length - 1 ? <ChevronIcon className="h-2.5 w-2.5 text-[#525252]" /> : null}
        </span>
      ))}
    </div>
  )
}

export function InspectorPanel(props: InspectorPanelProps) {
  const hiddenCount = props.hiddenDiffFilesCount ?? 0
  const hiddenLabel =
    hiddenCount === 0 ? '' : props.hiddenFilesVisible ? 'Hide generated files' : `Show ${hiddenCount} hidden files`

  if (!props.open) {
    return null
  }

  const panel = (
    <aside
      className={`flex h-full shrink-0 flex-col ${props.overlay ? 'w-full max-w-[min(27.5rem,calc(100vw-1.5rem))]' : ''}`}
      style={{
        width: props.overlay ? undefined : `${props.width ?? 440}px`,
        background: '#09090b',
        borderLeft: '1px solid rgba(255,255,255,0.055)',
      }}
    >
      <SectionHeader mode={props.mode} badgeLabel={props.badgeLabel} onClose={props.onClose} />

      {props.mode === 'changes' ? (
        <>
          {props.diffFiles.length > 0 ? (
            <>
              <div className="shrink-0 space-y-0.5 px-2 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {props.diffFiles.map((file) => (
                  <button
                    type="button"
                    key={file.path}
                    onClick={() => props.onSelectFile(file.path)}
                    className="flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left transition-all duration-150"
                    style={{ background: props.selectedPath === file.path ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                  >
                    <FileCodeIcon className="h-3 w-3 shrink-0" style={{ color: props.selectedPath === file.path ? '#ffffff' : '#525252' }} />
                    <span className="flex-1 truncate text-[13px]" style={{ color: props.selectedPath === file.path ? '#e5e5e5' : '#737373' }}>
                      {file.path.split('/').pop()}
                    </span>
                    {file.additions > 0 ? <span className="text-[11px] text-[#4ade80]">+{file.additions}</span> : null}
                    {file.deletions > 0 ? <span className="text-[11px] text-[#f87171]">-{file.deletions}</span> : null}
                    <StatusBadge status={file.status} />
                  </button>
                ))}
              </div>

              <Breadcrumbs parts={props.selectedBreadcrumbs} />

              <div className="shell-scroll-none flex-1 overflow-y-auto" style={{ fontFamily: 'var(--font-mono)' }}>
                <div
                  style={{
                    padding: '4px 16px',
                    fontSize: '11.5px',
                    color: '#525252',
                    background: 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  {props.diffHeader}
                </div>

                {props.diffLines.length > 0 ? (
                  props.diffLines.map((line) => <DiffLine key={line.id} line={line} />)
                ) : (
                    <div className="p-4 text-[14px] text-neutral-500">Select a changed file to inspect the diff.</div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.055)' }}>
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    className="rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white"
                    onClick={props.onToggleHiddenFiles}
                  >
                    {hiddenLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-50"
                  onClick={props.onJumpToContext}
                  disabled={!props.onJumpToContext}
                >
                  Jump to turn
                </button>
                <button
                  type="button"
                  className="rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-50"
                  onClick={props.onViewCode}
                  disabled={!props.onViewCode || !props.selectedPath}
                >
                  View code
                </button>
                <OpenWithMenu
                  disabled={!props.selectedPath}
                  loading={props.openFileTargetsLoading}
                  targets={props.openFileTargets}
                  onSelect={props.onOpenFileWith}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col justify-between p-4">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-[14px] text-neutral-500">
                {hiddenCount > 0 ? 'Only generated or dependency files changed in this turn.' : 'No code changes detected for this turn.'}
              </div>
              {hiddenCount > 0 ? (
                <div className="pt-4">
                  <button
                    type="button"
                    className="rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white"
                    onClick={props.onToggleHiddenFiles}
                  >
                    {hiddenLabel}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {props.mode === 'code' ? (
        <>
          <Breadcrumbs parts={props.codeBreadcrumbs} />
          <div className="shell-scroll-none flex-1 overflow-y-auto bg-[#09090b]">
            {props.codePath ? (
              props.codeLanguage === 'markdown' ? (
                <MarkdownDocument content={props.codeContent} />
              ) : (
                props.codeContent.split('\n').map((line, index) => (
                  <CodeTokenLine
                    key={`${props.codePath}-${index}`}
                    lineNumber={index + 1}
                    text={line}
                    changed={props.codeChangedLines?.has(index + 1)}
                    language={props.codeLanguage}
                  />
                ))
              )
            ) : (
              <div className="p-4 text-[14px] text-neutral-500">Select a file to view its source.</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.055)' }}>
            <button
              type="button"
              className="rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-50"
              onClick={props.onShowChanges}
              disabled={!props.onShowChanges}
            >
              Show changes
            </button>
            <OpenWithMenu
              disabled={!props.codePath}
              loading={props.openFileTargetsLoading}
              targets={props.openFileTargets}
              onSelect={props.onOpenFileWith}
            />
          </div>
        </>
      ) : null}

      {props.mode === 'approvals' ? (
        <div className="shell-scroll-none flex-1 space-y-3 overflow-y-auto p-4">
          {props.approvals.length > 0 ? (
            <>
              <section className="rounded-xl border border-amber-400/16 bg-[linear-gradient(155deg,rgba(251,191,36,0.14),rgba(251,191,36,0.04)_44%,rgba(9,9,11,0.24))] p-4">
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-amber-100/80">Pending approvals</div>
                <div className="mt-1 text-[14px] font-medium tracking-[-0.012em] text-neutral-100">
                  {props.approvals.length} request{props.approvals.length === 1 ? '' : 's'} waiting
                </div>
                <div className="mt-1 text-[12.5px] leading-6 text-neutral-300/85">
                  Review each request and choose allow/deny to continue execution.
                </div>
              </section>

              {(['command', 'file-change', 'permission', 'other'] as ApprovalGroupKey[]).map((group) => {
                const groupEntries = props.approvals.filter(
                  (approval) => approvalGroupKeyForKind(approval.kind) === group,
                )
                if (groupEntries.length === 0) {
                  return null
                }

                return (
                  <section key={group} className="space-y-3">
                    <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                      {approvalGroupLabel(group)} ({groupEntries.length})
                    </div>
                    {groupEntries.map((approval) =>
                      renderApprovalCard(
                        approval,
                        props.onApprove,
                        props.approvalsBusyRequestId === approval.request_id,
                      ),
                    )}
                  </section>
                )
              })}
            </>
          ) : (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-[14px] text-neutral-500">
              No approvals are waiting right now.
            </div>
          )}
        </div>
      ) : null}

      {props.mode === 'diagnostics' ? (
        <div className="shell-scroll-none flex-1 space-y-4 overflow-y-auto p-4">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-3 text-[11px] uppercase tracking-[0.06em] text-neutral-500">Diagnostics snapshot</div>
            <button
              type="button"
              className="rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white"
              onClick={props.onExportDiagnostics}
            >
              Export JSON
            </button>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-3 text-[11px] uppercase tracking-[0.06em] text-neutral-500">Warnings</div>
            {props.warnings.length > 0 ? (
              <div className="space-y-3">
                {props.warnings.map((warning, index) => (
                  <article className="rounded-xl bg-white/[0.03] p-3" key={`${warning.summary}-${index}`}>
                    <div className="text-[14px] font-medium text-neutral-200">{warning.summary}</div>
                    {warning.details ? <div className="mt-1 text-[13px] leading-6 text-neutral-400">{warning.details}</div> : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-neutral-500">No warnings captured.</div>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-3 text-[11px] uppercase tracking-[0.06em] text-neutral-500">Trace buffer</div>
            {props.traces.length > 0 ? (
              <div className="space-y-3">
                {props.traces.slice(0, 24).map((trace, index) => (
                  <article className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-xl bg-white/[0.03] p-3" key={`${trace.direction}-${index}`}>
                    <div className="text-[11px] uppercase tracking-[0.04em] text-neutral-500">{trace.direction}</div>
                    <pre className="whitespace-pre-wrap text-[12px] leading-6 text-neutral-400">{trace.message}</pre>
                  </article>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-neutral-500">No traces captured.</div>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  )

  if (props.overlay) {
    return (
      <div className="absolute inset-0 z-40 flex justify-end bg-black/30 px-3 py-3 backdrop-blur-[2px]">
        <button
          type="button"
          aria-label="Close inspector"
          className="absolute inset-0"
          onClick={props.onClose}
        />
        <div className="relative h-full max-w-full">{panel}</div>
      </div>
    )
  }

  return panel
}
