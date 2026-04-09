import { convertFileSrc } from '@tauri-apps/api/core'
import { type ReactNode, type RefObject, useEffect, useMemo, useRef } from 'react'
import {
  BranchIcon,
  ChevronIcon,
  FileCodeIcon,
  FolderOpenIcon,
  NoteIcon,
  SearchIcon,
  TerminalIcon,
} from './icons'

const FILE_TOKEN_PATTERN = String.raw`(?:\/Users\/[^\s)]+|(?:[\w.-]+\/)*[\w.-]+\.(?:tsx?|jsx?|py|rs|json|md|css|html|toml|ya?ml))(?:#L\d+(?:C\d+)?|:\d+(?::\d+)?)?(?:\s+\(line\s+\d+\))?`
const FILE_TOKEN_REGEX = new RegExp(`(${FILE_TOKEN_PATTERN})`, 'g')
const FILE_TOKEN_EXACT_REGEX = new RegExp(`^${FILE_TOKEN_PATTERN}$`)
const INLINE_TOKEN_REGEX =
  /(!\[[^\]]*\]\([^)]+\)|`[^`\n]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g
const MARKDOWN_LINK_EXACT_REGEX = /^\[([^\]]+)\]\(([^)]+)\)$/
const MARKDOWN_IMAGE_EXACT_REGEX = /^!\[([^\]]*)\]\(([^)]+)\)$/

export type ChatChangeFile = {
  path: string
  status: 'A' | 'M' | 'D'
  additions: number
  deletions: number
}

export type ChatChangeReceipt = {
  files: ChatChangeFile[]
  totalAdditions: number
  totalDeletions: number
}

export type ChatActivityTrace =
  | {
      kind: 'research'
      label: string
    }
  | {
      kind: 'edit'
      label: string
      path: string
      additions: number
      deletions: number
    }

export type ChatAttachment = {
  kind: string
  path?: string | null
}

export type QuickStartSuggestion = {
  kind: 'review' | 'plan' | 'explore' | 'diagnose'
  title: string
  detail: string
  prompt: string
}

export type ChatMessage = {
  id: string
  author: 'You' | 'Agent' | 'System'
  timestamp: string
  tone: 'user' | 'agent' | 'system'
  text: string
  turnId?: string | null
  blockTone?: 'error' | 'muted'
  blockLines?: string[]
  workLabel?: string | null
  changeReceipt?: ChatChangeReceipt | null
  presentation?: 'chat' | 'summary' | 'trace'
  trace?: ChatActivityTrace | null
  attachments?: ChatAttachment[]
}

type LiveStatusView = {
  label: string
  detailLines?: string[]
}

type MessageTimelineProps = {
  messages: ChatMessage[]
  liveStatus?: LiveStatusView | null
  suggestions?: QuickStartSuggestion[]
  composerEngaged?: boolean
  emptyState?: {
    eyebrow?: string
    title: string
    projectLabel?: string
    description?: string
    projectPath?: string | null
  }
  focusedMessageId?: string | null
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  onSuggestionSelect?: (value: string) => void
  onOpenFileReference?: (path: string) => void
  onOpenChangeReference?: (path: string) => void
  onOpenExternalFile?: (path: string) => void
  resolveFileReference?: (token: string) => string | null
}

function MessageBlock(props: { tone: 'error' | 'muted'; lines: string[] }) {
  if (props.tone === 'error') {
    return (
      <div className="mt-2.5 rounded-[16px] bg-red-500/5 p-3 shell-menlo text-[13px] leading-[1.6] text-red-200/80">
        {props.lines.map((line, index) => (
          <div
            key={`${line}-${index}`}
            className={`${
              index === 0
                ? 'mb-2 font-semibold text-red-400'
                : line.includes('ERR_')
                  ? 'mb-1 text-red-400/80'
                  : index < props.lines.length - 1
                    ? 'mb-4'
                    : ''
            }`}
          >
            {line || '\u00A0'}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-2.5 rounded-[16px] bg-white/[0.04] p-3 font-mono text-[13px] leading-[1.6] text-neutral-300">
      {props.lines.map((line, index) => (
        <div key={`${line}-${index}`}>{line || '\u00A0'}</div>
      ))}
    </div>
  )
}

function renderInlineContent(
  text: string,
  resolveFileReference?: (token: string) => string | null,
  onOpenFileReference?: (path: string) => void,
  onOpenExternalFile?: (path: string) => void,
  keyPrefix = 'inline',
) {
  return text.split(INLINE_TOKEN_REGEX).flatMap((part, index) => {
    if (!part) {
      return []
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      const inlineValue = part.slice(1, -1)

      if (looksLikeFileReference(inlineValue)) {
        return renderFileChip(
          inlineValue,
          inlineValue,
          resolveFileReference,
          onOpenFileReference,
          onOpenExternalFile,
          `${keyPrefix}-code-file-${index}`,
          false,
          'code',
        )
      }

      return (
        <code
          className="mx-[0.05em] rounded-md border border-white/7 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[0.92em] text-neutral-100"
          key={`${keyPrefix}-code-${index}`}
        >
          {inlineValue}
        </code>
      )
    }

    const markdownImageMatch = part.match(MARKDOWN_IMAGE_EXACT_REGEX)
    if (markdownImageMatch) {
      return (
        <img
          className="my-3 max-h-[24rem] rounded-[14px] border border-white/8 bg-black/20"
          key={`${keyPrefix}-image-${index}`}
          src={toImageSource(markdownImageMatch[2] || '')}
          alt={markdownImageMatch[1] || 'Image'}
        />
      )
    }

    const markdownLinkMatch = part.match(MARKDOWN_LINK_EXACT_REGEX)
    if (markdownLinkMatch) {
      const linkLabel = markdownLinkMatch[1] || markdownLinkMatch[2] || ''
      const linkTarget = markdownLinkMatch[2] || ''

      if (looksLikeWebUrl(linkTarget)) {
        return (
          <a
            className="font-medium text-[#9dbbf0] underline decoration-[#9dbbf0]/25 underline-offset-3 transition hover:text-[#bdd0f8] hover:decoration-[#bdd0f8]/45"
            href={linkTarget}
            key={`${keyPrefix}-md-link-${index}`}
            rel="noreferrer"
            target="_blank"
          >
            {linkLabel}
          </a>
        )
      }

      return renderFileChip(
        linkLabel,
        linkTarget,
        resolveFileReference,
        onOpenFileReference,
        onOpenExternalFile,
        `${keyPrefix}-md-${index}`,
      )
    }

    if (
      (part.startsWith('**') && part.endsWith('**')) ||
      (part.startsWith('__') && part.endsWith('__'))
    ) {
      const strongText = part.slice(2, -2)
      return (
        <strong className="font-semibold text-neutral-50" key={`${keyPrefix}-strong-${index}`}>
          {renderFileTokens(
            strongText,
            resolveFileReference,
            onOpenFileReference,
            onOpenExternalFile,
            `${keyPrefix}-strong-text-${index}`,
          )}
        </strong>
      )
    }

    if (part.startsWith('~~') && part.endsWith('~~')) {
      return (
        <del className="text-neutral-400/90 line-through" key={`${keyPrefix}-strike-${index}`}>
          {renderFileTokens(
            part.slice(2, -2),
            resolveFileReference,
            onOpenFileReference,
            onOpenExternalFile,
            `${keyPrefix}-strike-text-${index}`,
          )}
        </del>
      )
    }

    if (
      (part.startsWith('*') && part.endsWith('*')) ||
      (part.startsWith('_') && part.endsWith('_'))
    ) {
      return (
        <em className="italic text-neutral-100" key={`${keyPrefix}-em-${index}`}>
          {renderFileTokens(
            part.slice(1, -1),
            resolveFileReference,
            onOpenFileReference,
            onOpenExternalFile,
            `${keyPrefix}-em-text-${index}`,
          )}
        </em>
      )
    }

    return renderFileTokens(
      part,
      resolveFileReference,
      onOpenFileReference,
      onOpenExternalFile,
      `${keyPrefix}-text-${index}`,
    )
  })
}

function renderContent(
  content: string,
  resolveFileReference?: (token: string) => string | null,
  onOpenFileReference?: (path: string) => void,
  onOpenExternalFile?: (path: string) => void,
) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const nodes: ReactNode[] = []
  const paragraphLines: string[] = []
  let blockIndex = 0
  let paragraphCount = 0

  const pushNode = (node: ReactNode) => {
    nodes.push(node)
    blockIndex += 1
  }

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return
    }

    const paragraph = paragraphLines.join('\n').trim()
    const isLead = paragraphCount === 0 && paragraphLines.length === 1 && paragraph.length <= 180
    paragraphLines.length = 0
    paragraphCount += 1

    pushNode(
      <p
        className={`mb-4 whitespace-pre-wrap last:mb-0 ${
          isLead
            ? 'text-[16.5px] leading-[1.72] tracking-[-0.016em] text-neutral-50'
            : 'text-neutral-200/92'
        }`}
        key={`paragraph-${blockIndex}`}
      >
        {renderInlineContent(
          paragraph,
          resolveFileReference,
          onOpenFileReference,
          onOpenExternalFile,
          `paragraph-${blockIndex}`,
        )}
      </p>,
    )
  }

  let index = 0
  while (index < lines.length) {
    const rawLine = lines[index] || ''
    const trimmedLine = rawLine.trim()

    if (!trimmedLine) {
      flushParagraph()
      index += 1
      continue
    }

    const fenceMatch = trimmedLine.match(/^```(\w+)?\s*$/)
    if (fenceMatch) {
      flushParagraph()
      const language = fenceMatch[1]
      index += 1
      const codeLines: string[] = []

      while (index < lines.length && !lines[index]!.trim().startsWith('```')) {
        codeLines.push(lines[index] || '')
        index += 1
      }

      if (index < lines.length) {
        index += 1
      }

      pushNode(
        <div className="my-5 overflow-hidden rounded-[18px] border border-white/6 bg-[#121214]" key={`code-${blockIndex}`}>
          {language ? (
            <div className="border-b border-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {language}
            </div>
          ) : null}
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-neutral-300">
            <code>{codeLines.join('\n').trim()}</code>
          </pre>
        </div>,
      )
      continue
    }

    const nextTrimmedLine = (lines[index + 1] || '').trim()

    if (/^={3,}$/.test(nextTrimmedLine)) {
      flushParagraph()
      pushNode(
        <MarkdownHeading
          content={trimmedLine}
          key={`heading-${blockIndex}`}
          level={1}
          resolveFileReference={resolveFileReference}
          onOpenFileReference={onOpenFileReference}
          onOpenExternalFile={onOpenExternalFile}
        />,
      )
      index += 2
      continue
    }

    if (/^-{3,}$/.test(nextTrimmedLine) && !trimmedLine.includes('|')) {
      flushParagraph()
      pushNode(
        <MarkdownHeading
          content={trimmedLine}
          key={`heading-${blockIndex}`}
          level={2}
          resolveFileReference={resolveFileReference}
          onOpenFileReference={onOpenFileReference}
          onOpenExternalFile={onOpenExternalFile}
        />,
      )
      index += 2
      continue
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      pushNode(
        <MarkdownHeading
          content={headingMatch[2] || ''}
          key={`heading-${blockIndex}`}
          level={headingMatch[1]?.length || 1}
          resolveFileReference={resolveFileReference}
          onOpenFileReference={onOpenFileReference}
          onOpenExternalFile={onOpenExternalFile}
        />,
      )
      index += 1
      continue
    }

    if (/^([-*_])\1{2,}$/.test(trimmedLine)) {
      flushParagraph()
      pushNode(<div className="my-5 h-px bg-white/8" key={`rule-${blockIndex}`} />)
      index += 1
      continue
    }

    if (isMarkdownTableStart(lines, index)) {
      flushParagraph()
      const tableLines = [trimmedLine, lines[index + 1]!.trim()]
      index += 2

      while (index < lines.length) {
        const nextLine = (lines[index] || '').trim()
        if (!nextLine || !nextLine.includes('|')) {
          break
        }
        tableLines.push(nextLine)
        index += 1
      }

      const [headerLine, , ...bodyLines] = tableLines
      const headers = splitMarkdownTableRow(headerLine)
      const rows = bodyLines.map(splitMarkdownTableRow)

      pushNode(
        <div className="my-5 overflow-x-auto rounded-[18px] border border-white/6" key={`table-${blockIndex}`}>
          <table className="w-full min-w-[30rem] border-collapse bg-white/[0.02] text-left">
            <thead className="bg-white/[0.04]">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th
                    className="border-b border-white/6 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500"
                    key={`table-head-${blockIndex}-${headerIndex}`}
                  >
                    {renderInlineContent(
                      header,
                      resolveFileReference,
                      onOpenFileReference,
                      onOpenExternalFile,
                      `table-head-${blockIndex}-${headerIndex}`,
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr className="border-t border-white/6" key={`table-row-${blockIndex}-${rowIndex}`}>
                  {headers.map((_, columnIndex) => (
                    <td
                      className="align-top px-4 py-3 text-[14px] leading-[1.6] text-neutral-200/92"
                      key={`table-cell-${blockIndex}-${rowIndex}-${columnIndex}`}
                    >
                      {renderInlineContent(
                        row[columnIndex] || '',
                        resolveFileReference,
                        onOpenFileReference,
                        onOpenExternalFile,
                        `table-cell-${blockIndex}-${rowIndex}-${columnIndex}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (trimmedLine.startsWith('>')) {
      flushParagraph()
      const quoteLines: string[] = []

      while (index < lines.length) {
        const nextLine = (lines[index] || '').trim()
        if (!nextLine.startsWith('>')) {
          break
        }
        quoteLines.push(nextLine.replace(/^>\s?/, ''))
        index += 1
      }

      pushNode(
        <blockquote
          className="mb-4 border-l-2 border-white/10 pl-4 text-[15px] leading-[1.72] text-neutral-300/88 last:mb-0"
          key={`quote-${blockIndex}`}
        >
          {renderInlineContent(
            quoteLines.join(' '),
            resolveFileReference,
            onOpenFileReference,
            onOpenExternalFile,
            `quote-${blockIndex}`,
          )}
        </blockquote>,
      )
      continue
    }

    if (isUnorderedListLine(trimmedLine) || isOrderedListLine(trimmedLine)) {
      flushParagraph()
      const ordered = isOrderedListLine(trimmedLine)
      const listItems: Array<{ text: string; checked?: boolean | null }> = []

      while (index < lines.length) {
        const nextLine = (lines[index] || '').trim()
        if (!nextLine) {
          break
        }

        const unorderedMatch = nextLine.match(/^[-*+]\s+(?:\[( |x|X)\]\s+)?(.+)$/)
        const orderedMatch = nextLine.match(/^\d+\.\s+(.+)$/)

        if (ordered) {
          if (!orderedMatch) {
            break
          }
          listItems.push({ text: orderedMatch[1] || '' })
        } else {
          if (!unorderedMatch) {
            break
          }
          const checkedState = unorderedMatch[1]
            ? unorderedMatch[1].toLowerCase() === 'x'
            : null
          listItems.push({ text: unorderedMatch[2] || '', checked: checkedState })
        }

        index += 1
      }

      if (ordered) {
        pushNode(
          <ol className="mb-4 list-decimal space-y-2 pl-5 marker:text-neutral-500 last:mb-0" key={`ordered-${blockIndex}`}>
            {listItems.map((item, itemIndex) => (
              <li className="whitespace-pre-wrap text-neutral-200/92" key={`ordered-item-${blockIndex}-${itemIndex}`}>
                {renderInlineContent(
                  item.text,
                  resolveFileReference,
                  onOpenFileReference,
                  onOpenExternalFile,
                  `ordered-${blockIndex}-${itemIndex}`,
                )}
              </li>
            ))}
          </ol>,
        )
      } else {
        pushNode(
          <ul className="mb-4 space-y-2 pl-5 last:mb-0" key={`list-${blockIndex}`}>
            {listItems.map((item, itemIndex) => (
              <li
                className={`flex items-start gap-2 whitespace-pre-wrap text-neutral-200/92 ${
                  item.checked !== null ? 'list-none pl-0' : 'list-disc marker:text-neutral-500'
                }`}
                key={`list-item-${blockIndex}-${itemIndex}`}
              >
                {item.checked !== null ? (
                  <span className="mt-[0.18rem] text-[12px] text-neutral-500">
                    {item.checked ? '☑' : '☐'}
                  </span>
                ) : (
                  <span className="mt-[0.72rem] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500/80" />
                )}
                <span>
                  {renderInlineContent(
                    item.text,
                    resolveFileReference,
                    onOpenFileReference,
                    onOpenExternalFile,
                    `list-${blockIndex}-${itemIndex}`,
                  )}
                </span>
              </li>
            ))}
          </ul>,
        )
      }
      continue
    }

    paragraphLines.push(trimmedLine)
    index += 1
  }

  flushParagraph()

  return <>{nodes}</>
}

function renderFileTokens(
  text: string,
  resolveFileReference?: (token: string) => string | null,
  onOpenFileReference?: (path: string) => void,
  onOpenExternalFile?: (path: string) => void,
  keyPrefix = 'part',
) {
  const parts = text.split(FILE_TOKEN_REGEX)

  return parts.map((part, index) =>
    renderFileChip(
      part,
      part,
      resolveFileReference,
      onOpenFileReference,
      onOpenExternalFile,
      `${keyPrefix}-${index}`,
      true,
    ),
  )
}

function renderFileChip(
  label: string,
  target: string,
  resolveFileReference?: (token: string) => string | null,
  onOpenFileReference?: (path: string) => void,
  onOpenExternalFile?: (path: string) => void,
  key?: string,
  allowPlainText = false,
  variant: 'inline' | 'code' = 'inline',
) {
  const normalizedTarget = normalizeReferenceTarget(target)
  const normalizedLabel = normalizeReferenceTarget(label)
  const workspaceTarget = resolveFileReference?.(normalizedTarget) || resolveFileReference?.(normalizedLabel)
  const externalTarget = workspaceTarget ? null : normalizeLocalPath(normalizedTarget)
  const isFileToken = FILE_TOKEN_EXACT_REGEX.test(target) || FILE_TOKEN_EXACT_REGEX.test(label)
  const sharedClassName =
    variant === 'code'
      ? 'mx-[0.05em] inline rounded-md border border-white/7 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[0.92em] text-[#9dbbf0] transition hover:text-[#bdd0f8]'
      : 'inline text-left text-[0.98em] font-medium text-[#9dbbf0] decoration-[#9dbbf0]/0 underline-offset-3 transition hover:text-[#bdd0f8] hover:decoration-[#bdd0f8]/40'

  if (workspaceTarget && onOpenFileReference) {
    return (
      <button
        type="button"
        key={key}
        title={workspaceTarget}
        className={sharedClassName}
        onClick={() => onOpenFileReference(workspaceTarget)}
      >
        <span>{label}</span>
      </button>
    )
  }

  if (externalTarget && onOpenExternalFile) {
    return (
      <button
        type="button"
        key={key}
        title={externalTarget}
        className={sharedClassName}
        onClick={() => onOpenExternalFile(externalTarget)}
      >
        <span>{label || tailPath(externalTarget)}</span>
      </button>
    )
  }

  if (allowPlainText) {
    return <span className={isFileToken ? 'text-neutral-100' : undefined} key={key}>{label}</span>
  }

  return <span key={key}>{label || target}</span>
}

function normalizeLocalPath(value: string) {
  const trimmed = normalizeReferenceTarget(value)
  if (!trimmed.startsWith('/')) {
    return null
  }
  return /\.[a-z0-9]+$/i.test(trimmed) ? trimmed : null
}

function normalizeReferenceTarget(value: string) {
  return value
    .trim()
    .replace(/\s+\(line\s+\d+\)$/i, '')
    .replace(/#L\d+(?:C\d+)?$/i, '')
    .replace(/:\d+(?::\d+)?$/i, '')
}

function looksLikeFileReference(value: string) {
  return FILE_TOKEN_EXACT_REGEX.test(value.trim())
}

function looksLikeWebUrl(value: string) {
  return /^https?:\/\//i.test(value.trim())
}

function isMarkdownTableStart(lines: string[], startIndex: number) {
  if (startIndex + 1 >= lines.length) {
    return false
  }

  const headerLine = (lines[startIndex] || '').trim()
  const dividerLine = (lines[startIndex + 1] || '').trim()

  if (!headerLine.includes('|')) {
    return false
  }

  return /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(dividerLine)
}

function splitMarkdownTableRow(line: string) {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isUnorderedListLine(line: string) {
  return /^[-*+]\s+(?:\[(?: |x|X)\]\s+)?.+$/.test(line)
}

function isOrderedListLine(line: string) {
  return /^\d+\.\s+.+$/.test(line)
}

function tailPath(value: string) {
  return value.split('/').filter(Boolean).pop() || value
}

function toImageSource(value: string) {
  return value.startsWith('/') ? convertFileSrc(value) : value
}

function MarkdownHeading(props: {
  level: number
  content: string
  resolveFileReference?: (token: string) => string | null
  onOpenFileReference?: (path: string) => void
  onOpenExternalFile?: (path: string) => void
}) {
  const className =
    props.level === 1
      ? 'mt-1 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.03em] text-white'
      : props.level === 2
        ? 'mt-6 text-[1.25rem] font-semibold leading-[1.2] tracking-[-0.02em] text-neutral-50'
        : props.level === 3
          ? 'mt-5 text-[13px] font-semibold uppercase tracking-[0.08em] text-neutral-500'
          : 'mt-4 text-[15px] font-semibold leading-[1.35] tracking-[-0.015em] text-neutral-100'

  return (
    <div className={className}>
      {renderInlineContent(
        props.content,
        props.resolveFileReference,
        props.onOpenFileReference,
        props.onOpenExternalFile,
        `heading-${props.level}-${props.content}`,
      )}
    </div>
  )
}

function MessageAttachments(props: { attachments: ChatAttachment[] }) {
  const visibleAttachments = props.attachments.filter(
    (attachment) => attachment.kind === 'localImage' && attachment.path,
  )

  if (visibleAttachments.length === 0) {
    return null
  }

  return (
    <div className="mt-2.5 grid gap-2">
      {visibleAttachments.map((attachment, index) => (
        <div
          className="overflow-hidden rounded-[14px] border border-white/8 bg-black/20"
          key={`${attachment.path}-${index}`}
        >
          <img
            className="block max-h-[22rem] w-full object-cover"
            src={toImageSource(attachment.path!)}
            alt={tailPath(attachment.path!)}
          />
        </div>
      ))}
    </div>
  )
}

function MessageItem(props: {
  message: ChatMessage
  highlighted?: boolean
  onOpenFileReference?: (path: string) => void
  onOpenChangeReference?: (path: string) => void
  onOpenExternalFile?: (path: string) => void
  resolveFileReference?: (token: string) => string | null
}) {
  const isUser = props.message.tone === 'user'
  const isTrace = props.message.presentation === 'trace'
  const isSummary = !isTrace && props.message.presentation === 'summary'
  const isCompletedTurnSummary = !isUser && (isSummary || isTrace || Boolean(props.message.workLabel))
  const blockLines = props.message.blockLines ?? []
  const showMessageBlock =
    blockLines.length > 0 &&
    (isUser || !isCompletedTurnSummary || props.message.blockTone === 'error')
  const userAttachments = props.message.attachments ?? []

  if (isTrace && props.message.trace) {
    return (
      <div className={`space-y-1.5 ${props.message.workLabel ? 'pt-1' : ''}`} data-message-id={props.message.id}>
        {props.message.workLabel ? <WorkedDivider label={props.message.workLabel} /> : null}
        <div className="px-1.5">
          <TraceRow
            trace={props.message.trace}
            onOpenChangeReference={props.onOpenChangeReference}
            onOpenExternalFile={props.onOpenExternalFile}
          />
        </div>
      </div>
    )
  }

  const content = isUser ? (
    <>
      {props.message.text.trim() ? <p className="whitespace-pre-wrap">{props.message.text}</p> : null}
      <MessageAttachments attachments={userAttachments} />
      {showMessageBlock ? (
        <MessageBlock tone={props.message.blockTone ?? 'muted'} lines={blockLines} />
      ) : null}
    </>
  ) : (
    renderContent(
      props.message.text,
      props.resolveFileReference,
      props.onOpenFileReference,
      props.onOpenExternalFile,
    )
  )

  return (
    <div className={`space-y-2 ${isCompletedTurnSummary ? 'pt-1' : ''}`} data-message-id={props.message.id}>
      {props.message.workLabel ? <WorkedDivider label={props.message.workLabel} /> : null}

      {isCompletedTurnSummary ? (
        <div className="px-1.5">
          <div className="mx-auto max-w-[39rem] text-[16px] leading-[1.72] tracking-[-0.012em] text-neutral-100">
            {content}
          </div>

          {!isUser && showMessageBlock ? (
            <MessageBlock tone={props.message.blockTone ?? 'muted'} lines={blockLines} />
          ) : null}

          {!isUser && props.message.changeReceipt && !props.message.trace ? (
            <ChangeReceiptCard
              receipt={props.message.changeReceipt}
              onOpenChangeReference={props.onOpenChangeReference}
              onOpenExternalFile={props.onOpenExternalFile}
            />
          ) : null}
        </div>
      ) : (
        <div className={`${props.highlighted ? 'rounded-[18px] bg-white/[0.04]' : ''} px-1.5 py-0.5`}>
          {isUser ? (
            <div className="flex justify-end">
              <div className="w-fit max-w-[38rem] rounded-[16px] bg-white/[0.08] px-3.5 py-2.5 text-[15px] leading-[1.6] tracking-[-0.012em] text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                {content}
              </div>
            </div>
          ) : (
            <div className="max-w-[39rem] text-[16px] leading-[1.72] tracking-[-0.012em] text-neutral-200">
              {content}
            </div>
          )}

          {!isUser && props.message.blockLines && props.message.blockLines.length > 0 ? (
            <MessageBlock tone={props.message.blockTone ?? 'muted'} lines={props.message.blockLines} />
          ) : null}

          {!isUser && props.message.changeReceipt ? (
            <ChangeReceiptCard
              receipt={props.message.changeReceipt}
              onOpenChangeReference={props.onOpenChangeReference}
              onOpenExternalFile={props.onOpenExternalFile}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function WorkedDivider(props: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1.5 pt-0.5">
      <div className="h-px flex-1 bg-white/9" />
      <div className="flex items-center gap-1 text-[12px] font-medium tracking-[-0.014em] text-neutral-400">
        <span>{props.label}</span>
        <ChevronIcon className="h-[10px] w-[10px] text-neutral-600" />
      </div>
      <div className="h-px flex-1 bg-white/9" />
    </div>
  )
}

function TraceRow(props: {
  trace: ChatActivityTrace
  onOpenChangeReference?: (path: string) => void
  onOpenExternalFile?: (path: string) => void
}) {
  if (props.trace.kind === 'research') {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-[12px] tracking-[-0.008em] text-neutral-500">
        <SearchIcon className="h-[11px] w-[11px] text-neutral-600" />
        <span>{props.trace.label}</span>
      </div>
    )
  }

  const trace = props.trace

  return (
    <div className="group flex items-center gap-1.5 py-0.5 text-[12px] tracking-[-0.008em] text-neutral-500">
      <FileCodeIcon className="h-[11px] w-[11px] text-neutral-600" />
      <span>Edited</span>
      <button
        type="button"
        className="truncate text-left font-medium text-sky-300 transition hover:text-sky-200"
        title={trace.path}
        onClick={() => props.onOpenChangeReference?.(trace.path)}
      >
        {tailPath(trace.path)}
      </button>
      <span className="font-medium text-emerald-400">+{trace.additions}</span>
      <span className="font-medium text-rose-400">-{trace.deletions}</span>
      {props.onOpenExternalFile ? (
        <button
          type="button"
          className="rounded-full p-1 text-neutral-600 opacity-0 transition group-hover:opacity-100 hover:bg-white/[0.05] hover:text-neutral-300"
          onClick={() => props.onOpenExternalFile?.(trace.path)}
          title="Open externally"
        >
          <FolderOpenIcon className="h-[11px] w-[11px]" />
        </button>
      ) : null}
    </div>
  )
}

function ChangeReceiptCard(props: {
  receipt: ChatChangeReceipt
  onOpenChangeReference?: (path: string) => void
  onOpenExternalFile?: (path: string) => void
}) {
  const fileCount = props.receipt.files.length
  const firstFile = props.receipt.files[0]?.path

  return (
    <section className="mt-3.5 overflow-hidden rounded-[16px] border border-white/6 bg-white/[0.03]">
      <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-3.5 py-2.5">
        <span className="text-[12px] font-medium text-neutral-100">
          {fileCount} {fileCount === 1 ? 'file' : 'files'} changed
        </span>
        <span className="text-[12px] font-medium text-emerald-400">+{props.receipt.totalAdditions}</span>
        <span className="text-[12px] font-medium text-rose-400">-{props.receipt.totalDeletions}</span>
        {firstFile && props.onOpenChangeReference ? (
          <button
            type="button"
            className="ml-auto rounded-full border border-white/8 px-2.5 py-1 text-[11.5px] font-medium text-neutral-300 transition hover:border-white/16 hover:text-white"
            onClick={() => props.onOpenChangeReference?.(firstFile)}
          >
            Open changes
          </button>
        ) : null}
      </div>

      <div>
        {props.receipt.files.map((file) => (
          <div
            className="group/row flex items-center gap-3 border-t border-white/5 px-3.5 py-2 first:border-t-0"
            key={file.path}
          >
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left"
                onClick={() => props.onOpenChangeReference?.(file.path)}
              >
                <span className="truncate text-[12px] font-medium text-neutral-100">{file.path}</span>
                <span className="text-[12px] font-medium text-emerald-400">+{file.additions}</span>
                <span className="text-[12px] font-medium text-rose-400">-{file.deletions}</span>
              </button>
            </div>

            <div className="flex items-center gap-1 opacity-0 transition group-hover/row:opacity-100">
              {props.onOpenExternalFile ? (
                <button
                  type="button"
                  className="rounded-full p-1.25 text-neutral-500 transition hover:bg-white/[0.05] hover:text-neutral-200"
                  onClick={() => props.onOpenExternalFile?.(file.path)}
                  title="Open externally"
                >
                  <FolderOpenIcon className="h-3 w-3" />
                </button>
              ) : null}
              {props.onOpenChangeReference ? (
                <button
                  type="button"
                  className="rounded-full p-1.25 text-neutral-500 transition hover:bg-white/[0.05] hover:text-neutral-200"
                  onClick={() => props.onOpenChangeReference?.(file.path)}
                  title="Open changes"
                >
                  <FileCodeIcon className="h-3 w-3" />
                </button>
              ) : null}
              <div className="rounded-full p-1.25 text-neutral-600">
                <ChevronIcon className="h-3 w-3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function LiveStatusRow(props: { status: LiveStatusView }) {
  return (
    <div className="px-1.5">
      <div className="flex items-center gap-1.5 py-0.5 text-[12px] tracking-[-0.008em] text-neutral-500">
        <div className="flex size-3.5 items-center justify-center">
          <div className="shell-spin size-[10px] rounded-full border-[1.5px] border-b-transparent border-l-transparent border-r-transparent border-t-neutral-500" />
        </div>
        <span className="shell-fade-rise">{props.status.label}</span>
      </div>
      {props.status.detailLines && props.status.detailLines.length > 0 ? (
        <div className="mt-0.5 space-y-0.5 pl-4">
          {props.status.detailLines.map((line, index) => (
            <div
              className="shell-fade-rise text-[11.5px] leading-[1.45] text-neutral-600"
              key={`${line}-${index}`}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EmptyState(props: {
  suggestions: QuickStartSuggestion[]
  composerEngaged?: boolean
  emptyState?: MessageTimelineProps['emptyState']
  liveStatus?: LiveStatusView | null
  onSuggestionSelect?: (value: string) => void
}) {
  const suggestionsHidden = props.composerEngaged
  const projectTail = props.emptyState?.projectPath ? tailPath(props.emptyState.projectPath) : null
  const showProjectTail =
    projectTail &&
    (!props.emptyState?.projectLabel || projectTail.toLowerCase() !== props.emptyState.projectLabel.toLowerCase())

  function renderSuggestionIcon(kind: QuickStartSuggestion['kind']) {
    switch (kind) {
      case 'review':
        return <BranchIcon className="h-4 w-4 text-neutral-200" />
      case 'plan':
        return <NoteIcon className="h-4 w-4 text-neutral-200" />
      case 'explore':
        return <SearchIcon className="h-4 w-4 text-neutral-200" />
      case 'diagnose':
        return <TerminalIcon className="h-4 w-4 text-neutral-200" />
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-6 pb-12 pt-10">
      <div className="w-full max-w-[54rem]">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="shell-fade-rise inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              <FolderOpenIcon className="h-3.5 w-3.5 text-neutral-300" />
              <span>{props.emptyState?.eyebrow || 'Project'}</span>
              {props.emptyState?.projectLabel ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/18" />
                  <span className="max-w-[14rem] truncate normal-case tracking-[-0.01em] text-neutral-200">
                    {props.emptyState.projectLabel}
                  </span>
                </>
              ) : null}
            </div>

            {showProjectTail ? (
              <div
                className="shell-fade-rise mt-3 max-w-[20rem] truncate text-[12px] tracking-[-0.012em] text-neutral-600"
                style={{ animationDelay: '40ms' }}
              >
                {projectTail}
              </div>
            ) : null}

            <h1
              className="shell-fade-rise mt-5 max-w-[12ch] text-[length:var(--text-display)] font-medium leading-[0.92] tracking-[-0.05em] text-white"
              style={{ animationDelay: '80ms' }}
            >
              {props.emptyState?.title || 'What are we building today?'}
            </h1>

            {props.emptyState?.description ? (
              <p
                className="shell-fade-rise mt-4 max-w-[26rem] text-[15px] leading-[1.68] tracking-[-0.015em] text-neutral-400"
                style={{ animationDelay: '120ms' }}
              >
                {props.emptyState.description}
              </p>
            ) : null}

            {props.liveStatus ? (
              <div
                className="shell-fade-rise mt-7 w-full max-w-[24rem] rounded-[16px] border border-white/6 bg-white/[0.025] px-4 py-3.5"
                style={{ animationDelay: '160ms' }}
              >
                <LiveStatusRow status={props.liveStatus} />
              </div>
            ) : null}
          </section>

          {props.suggestions.length > 0 ? (
            <section
              aria-hidden={suggestionsHidden}
              className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                suggestionsHidden ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
              }`}
            >
              <div className="overflow-hidden">
                <div
                  className={`transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                    suggestionsHidden ? 'translate-y-3 opacity-0' : 'translate-y-0 opacity-100'
                  }`}
                >
                  <div className="mb-4 flex flex-col items-center text-center lg:items-start lg:text-left">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      Quick starts
                    </div>
                    <div className="mt-1 text-[13px] leading-[1.5] tracking-[-0.01em] text-neutral-500">
                      Pick a concrete first move. Your first prompt opens the thread.
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {props.suggestions.map((suggestion, index) => (
                      <button
                        type="button"
                        disabled={suggestionsHidden}
                        key={suggestion.prompt}
                        onClick={() => props.onSuggestionSelect?.(suggestion.prompt)}
                        className="group shell-fade-rise relative flex min-h-[148px] flex-col rounded-[18px] border border-white/7 bg-white/[0.025] p-4 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/14 hover:bg-white/[0.04] disabled:pointer-events-none"
                        style={{ animationDelay: `${180 + index * 45}ms` }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/8 bg-white/[0.04]">
                            {renderSuggestionIcon(suggestion.kind)}
                          </div>
                          <ChevronIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-700 transition-all group-hover:translate-x-0.5 group-hover:text-neutral-300" />
                        </div>

                        <div className="mt-7">
                          <div className="text-[15px] font-medium leading-[1.35] tracking-[-0.018em] text-neutral-100">
                            {suggestion.title}
                          </div>
                          <p className="mt-2 max-w-[24ch] text-[13px] leading-[1.55] tracking-[-0.012em] text-neutral-500 transition-colors group-hover:text-neutral-400">
                            {suggestion.detail}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function MessageTimeline(props: MessageTimelineProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const lastMessage = props.messages[props.messages.length - 1]

  const anchorKey = useMemo(
    () =>
      [
        props.messages.length,
        lastMessage?.id || '',
        lastMessage?.text || '',
        lastMessage?.workLabel || '',
        props.liveStatus?.label || '',
        (props.liveStatus?.detailLines || []).join('|'),
      ].join(':'),
    [lastMessage?.id, lastMessage?.text, lastMessage?.workLabel, props.liveStatus?.detailLines, props.liveStatus?.label, props.messages.length],
  )

  useEffect(() => {
    queueMicrotask(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }, [anchorKey])

  useEffect(() => {
    if (!props.focusedMessageId) {
      return
    }

    queueMicrotask(() => {
      const element = document.querySelector<HTMLElement>(`[data-message-id="${props.focusedMessageId}"]`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [props.focusedMessageId])

  if (props.messages.length === 0) {
    return (
      <EmptyState
        suggestions={props.suggestions ?? []}
        composerEngaged={props.composerEngaged}
        emptyState={props.emptyState}
        liveStatus={props.liveStatus}
        onSuggestionSelect={props.onSuggestionSelect}
      />
    )
  }

  return (
    <div className="relative mx-auto max-w-[50rem] space-y-4 px-3.5 py-3.5">
      {props.messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          highlighted={props.focusedMessageId === message.id}
          onOpenFileReference={props.onOpenFileReference}
          onOpenChangeReference={props.onOpenChangeReference}
          onOpenExternalFile={props.onOpenExternalFile}
          resolveFileReference={props.resolveFileReference}
        />
      ))}
      {props.liveStatus ? <LiveStatusRow status={props.liveStatus} /> : null}

      <div ref={bottomRef} className="h-3" />
    </div>
  )
}
