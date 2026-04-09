import type { ReactNode } from 'react'
import type { ApprovalEntry, DiagnosticTrace, DiagnosticWarning } from '../../lib/kodeks'
import { ChevronIcon, CloseIcon, DiffAddIcon, DiffRemoveIcon, FileCodeIcon } from './icons'

export type DrawerMode = 'changes' | 'code' | 'approvals' | 'diagnostics'

export type DiffFileView = {
  path: string
  additions: number
  deletions: number
  status: 'A' | 'M' | 'D'
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
  codeLanguage?: string
  approvals: ApprovalEntry[]
  warnings: DiagnosticWarning[]
  traces: DiagnosticTrace[]
  onClose: () => void
  onSelectFile: (path: string) => void
  onToggleHiddenFiles?: () => void
  onJumpToContext?: () => void
  onViewCode?: () => void
  onShowChanges?: () => void
  onOpenFile?: () => void
  onApprove: (approval: ApprovalEntry, decision: string) => void
  onExportDiagnostics: () => void
}

function StatusBadge(props: { status: 'A' | 'M' | 'D' }) {
  const map = {
    A: { label: 'A', color: '#4ade80', background: 'rgba(74,222,128,0.08)' },
    M: { label: 'M', color: '#fbbf24', background: 'rgba(251,191,36,0.08)' },
    D: { label: 'D', color: '#f87171', background: 'rgba(248,113,113,0.08)' },
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

function decisionLabel(decision: string) {
  switch (decision) {
    case 'accept':
    case 'approved':
      return 'Allow'
    case 'acceptForSession':
    case 'approved_for_session':
      return 'Allow for session'
    case 'decline':
    case 'denied':
      return 'Deny'
    case 'abort':
      return 'Abort'
    default:
      return decision
  }
}

function CodeTokenLine(props: { text: string; lineNumber: number; language?: string }) {
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
    <div className="flex items-start gap-0">
      <span className="w-9 shrink-0 select-none px-2 pl-4 text-right text-[12px] text-[#525252]">
        {props.lineNumber}
      </span>
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
        width: props.overlay ? undefined : '440px',
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
                <button
                  type="button"
                  className="ml-auto rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-50"
                  onClick={props.onOpenFile}
                  disabled={!props.onOpenFile || !props.selectedPath}
                >
                  Open externally
                </button>
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
            <button
              type="button"
              className="ml-auto rounded-[4px] border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-50"
              onClick={props.onOpenFile}
              disabled={!props.onOpenFile || !props.codePath}
            >
              Open externally
            </button>
          </div>
        </>
      ) : null}

      {props.mode === 'approvals' ? (
        <div className="shell-scroll-none flex-1 space-y-3 overflow-y-auto p-4">
          {props.approvals.length > 0 ? (
            props.approvals.map((approval) => (
              <article className="rounded-xl border border-white/5 bg-white/[0.02] p-4" key={approval.request_id}>
                <div className="mb-2 text-[11px] uppercase tracking-[0.06em] text-neutral-500">{approval.kind}</div>
                <div className="text-[14px] font-medium text-neutral-200">{approval.title}</div>
                <pre className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-neutral-400">{approval.body}</pre>
                <div className="mt-4 flex flex-wrap gap-2">
                  {approval.available_decisions.map((decision) => (
                    <button
                      type="button"
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-300 transition hover:border-white/20 hover:text-white"
                      key={`${approval.request_id}-${decision}`}
                      onClick={() => props.onApprove(approval, decision)}
                    >
                      {decisionLabel(decision)}
                    </button>
                  ))}
                </div>
              </article>
            ))
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
