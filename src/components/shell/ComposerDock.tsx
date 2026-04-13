import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ModelOption } from '../../lib/kodeks'
import { extractReferenceQuery, resolveWorkspaceReference } from '../../lib/shellState'
import {
  ArrowUpIcon,
  BranchIcon,
  ChevronIcon,
  CloseIcon,
  CloudOffIcon,
  ExternalLinkIcon,
  GaugeIcon,
  MonitorIcon,
  PaperclipIcon,
  PlusIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldIcon,
  SparkleIcon,
} from './icons'

export type ComposerChoice = {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export type ComposerAttachment = {
  id: string
  path: string
  previewUrl: string
  name: string
}

type ComposerGitBranch = {
  name: string
  is_current: boolean
  is_default: boolean
}

type ComposerGitSummary = {
  fileCount: number
  additions: number
  deletions: number
}

type ComposerDockProps = {
  attachments: ComposerAttachment[]
  clearToken: number
  projectLabel: string
  projectPath?: string | null
  models: ModelOption[]
  selectedModel: string
  selectedReasoning: string
  reasoningOptions: ComposerChoice[]
  selectedPermissionPreset: string
  permissionOptions: ComposerChoice[]
  workspaceFiles: string[]
  liveTurn: boolean
  authenticated: boolean
  rateLimitDisplays?: Array<{
    label: string
    value: string
    reset?: string | null
    tone: 'calm' | 'warning' | 'muted'
  }> | null
  showRateLimitsInline: boolean
  busy: boolean
  gitBranchLabel?: string | null
  gitBranches?: ComposerGitBranch[] | null
  gitSummary?: ComposerGitSummary | null
  gitBusy?: boolean
  compactModelMenu?: boolean
  touchModelPreview?: boolean
  onOpenProjectPicker: () => void
  onPasteImages: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onComposingChange: (active: boolean) => void
  onSubmit: (prompt: string) => void
  onInterrupt: () => void
  onSelectModel: (model: string) => void
  onSelectReasoning: (reasoning: string) => void
  onSelectPermissionPreset: (preset: string) => void
  onOpenRateLimits: () => void
  onCheckoutGitBranch?: (branchName: string) => void
  onCreateGitBranch?: (branchName: string) => void
}

export function ComposerDock(props: ComposerDockProps) {
  const [draftPrompt, setDraftPrompt] = useState('')
  const [focused, setFocused] = useState(false)
  const [showContinueMenu, setShowContinueMenu] = useState(false)
  const [showPermissionMenu, setShowPermissionMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showReasoningMenu, setShowReasoningMenu] = useState(false)
  const [showGitBranchMenu, setShowGitBranchMenu] = useState(false)
  const [activeModelIndex, setActiveModelIndex] = useState<number | null>(null)
  const [gitBranchQuery, setGitBranchQuery] = useState('')
  const deferredPrompt = useDeferredValue(draftPrompt)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const continueRef = useRef<HTMLDivElement | null>(null)
  const permissionRef = useRef<HTMLDivElement | null>(null)
  const modelRef = useRef<HTMLDivElement | null>(null)
  const reasoningRef = useRef<HTMLDivElement | null>(null)
  const gitBranchRef = useRef<HTMLDivElement | null>(null)
  const modelButtonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectedModelOption = useMemo(
    () => props.models.find((item) => item.model === props.selectedModel) ?? null,
    [props.models, props.selectedModel],
  )
  const selectedModelIndex = useMemo(
    () => props.models.findIndex((item) => item.model === props.selectedModel),
    [props.models, props.selectedModel],
  )
  const selectedReasoningOption = useMemo(
    () => props.reasoningOptions.find((item) => item.value === props.selectedReasoning) ?? null,
    [props.reasoningOptions, props.selectedReasoning],
  )
  const selectedPermissionOption = useMemo(
    () => props.permissionOptions.find((item) => item.value === props.selectedPermissionPreset) ?? null,
    [props.permissionOptions, props.selectedPermissionPreset],
  )
  const detectedReferences = useMemo(
    () =>
      [
        ...new Set(
          Array.from(deferredPrompt.matchAll(/@([^\s]+)/g)).map(
            (match) => resolveWorkspaceReference(match[1], props.workspaceFiles) || match[1],
          ),
        ),
      ],
    [deferredPrompt, props.workspaceFiles],
  )
  const referenceSuggestions = useMemo(() => {
    const query = extractReferenceQuery(deferredPrompt)
    if (!query || props.workspaceFiles.length === 0) {
      return []
    }

    const lowered = query.toLowerCase()
    const basenameMatches = props.workspaceFiles
      .filter((file) => tailPath(file).toLowerCase().startsWith(lowered))
      .slice(0, 6)
    const pathMatches = props.workspaceFiles
      .filter((file) => file.toLowerCase().includes(lowered) && !basenameMatches.includes(file))
      .slice(0, 6 - basenameMatches.length)
    return [...basenameMatches, ...pathMatches]
  }, [deferredPrompt, props.workspaceFiles])
  const isComposing = draftPrompt.trim().length > 0 || props.attachments.length > 0
  const canSubmit = props.authenticated && (draftPrompt.trim().length > 0 || props.attachments.length > 0)
  const filteredGitBranches = useMemo(() => {
    const branches = props.gitBranches ?? []
    const query = gitBranchQuery.trim().toLowerCase()

    if (!query) {
      return branches
    }

    return branches.filter((branch) => branch.name.toLowerCase().includes(query))
  }, [gitBranchQuery, props.gitBranches])
  const canCreateGitBranch = useMemo(() => {
    const query = gitBranchQuery.trim()
    if (!query) {
      return false
    }

    return !(props.gitBranches ?? []).some((branch) => branch.name === query)
  }, [gitBranchQuery, props.gitBranches])

  useEffect(() => {
    setDraftPrompt('')
  }, [props.clearToken])

  useLayoutEffect(() => {
    props.onComposingChange(isComposing)
  }, [isComposing, props.onComposingChange])

  useEffect(() => {
    if (!textareaRef.current) {
      return
    }

    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`
  }, [draftPrompt])

  useEffect(() => {
    if (!showModelMenu) {
      setActiveModelIndex(null)
      return
    }

    if (props.models.length === 0) {
      setActiveModelIndex(null)
      return
    }

    const nextIndex = selectedModelIndex >= 0 ? selectedModelIndex : 0
    setActiveModelIndex(nextIndex)

    requestAnimationFrame(() => {
      modelButtonRefs.current[nextIndex]?.focus()
    })
  }, [selectedModelIndex, showModelMenu])

  useEffect(() => {
    const closeModelMenu = () => {
      setShowModelMenu(false)
      setActiveModelIndex(null)
    }

    const closeAllMenus = () => {
      setShowContinueMenu(false)
      setShowPermissionMenu(false)
      closeModelMenu()
      setShowReasoningMenu(false)
      setShowGitBranchMenu(false)
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (continueRef.current && !continueRef.current.contains(event.target as Node)) {
        setShowContinueMenu(false)
      }

      if (permissionRef.current && !permissionRef.current.contains(event.target as Node)) {
        setShowPermissionMenu(false)
      }

      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        closeModelMenu()
      }

      if (reasoningRef.current && !reasoningRef.current.contains(event.target as Node)) {
        setShowReasoningMenu(false)
      }

      if (gitBranchRef.current && !gitBranchRef.current.contains(event.target as Node)) {
        setShowGitBranchMenu(false)
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (continueRef.current && !continueRef.current.contains(event.target as Node)) {
        setShowContinueMenu(false)
      }

      if (permissionRef.current && !permissionRef.current.contains(event.target as Node)) {
        setShowPermissionMenu(false)
      }

      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        closeModelMenu()
      }

      if (reasoningRef.current && !reasoningRef.current.contains(event.target as Node)) {
        setShowReasoningMenu(false)
      }

      if (gitBranchRef.current && !gitBranchRef.current.contains(event.target as Node)) {
        setShowGitBranchMenu(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAllMenus()
        return
      }

      if (!showModelMenu) {
        return
      }

      if (props.models.length === 0) {
        return
      }

      const withinModelMenu = modelRef.current?.contains(document.activeElement) ?? false
      if (!withinModelMenu) {
        return
      }

      if (event.key === 'Tab') {
        closeModelMenu()
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()

        const delta = event.key === 'ArrowDown' ? 1 : -1
        const nextIndex =
          activeModelIndex === null
            ? selectedModelIndex >= 0
              ? selectedModelIndex
              : 0
            : (activeModelIndex + delta + props.models.length) % props.models.length

        setActiveModelIndex(nextIndex)
        modelButtonRefs.current[nextIndex]?.focus()
      }

      if ((event.key === 'Enter' || event.key === ' ') && activeModelIndex !== null) {
        event.preventDefault()
        props.onSelectModel(props.models[activeModelIndex].model)
        closeModelMenu()
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeModelIndex, props.models, props.onSelectModel, selectedModelIndex, showModelMenu])

  function handleSelectReference(reference: string) {
    const query = extractReferenceQuery(draftPrompt)
    if (!query) {
      return
    }

    setDraftPrompt((current) =>
      current.replace(new RegExp(`${escapeRegExp(query)}$`), `@${reference} `),
    )
    textareaRef.current?.focus()
  }

  function closeAuxMenus() {
    setShowContinueMenu(false)
    setShowPermissionMenu(false)
    setShowModelMenu(false)
    setShowReasoningMenu(false)
  }

  async function handleCreateGitBranch() {
    const branchName = gitBranchQuery.trim()
    if (!branchName || !props.onCreateGitBranch || !canCreateGitBranch) {
      return
    }

    await props.onCreateGitBranch(branchName)
    setGitBranchQuery('')
    setShowGitBranchMenu(false)
  }

  async function handleCheckoutGitBranch(branchName: string) {
    if (!props.onCheckoutGitBranch) {
      return
    }

    await props.onCheckoutGitBranch(branchName)
    setShowGitBranchMenu(false)
  }

  return (
    <div className="bg-gradient-to-t from-[#090b0e] via-[#090b0e] to-transparent px-4 pb-3.5 pt-1">
      <div className="relative mx-auto w-full max-w-[700px]">
        {referenceSuggestions.length > 0 ? (
          <div className="mb-2 rounded-[16px] bg-[color:var(--color-shell-elevated-strong)] p-1.5 shadow-[var(--shadow-shell-elevated)]">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Project files
            </div>
            <div className="space-y-1">
              {referenceSuggestions.slice(0, 6).map((reference) => (
                <button
                  type="button"
                  key={reference}
                  onClick={() => handleSelectReference(reference)}
                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[12.5px] text-neutral-300 transition hover:bg-[color:var(--color-shell-control)] hover:text-white"
                >
                  <PaperclipIcon className="h-3.25 w-3.25 text-neutral-500" />
                  <span className="truncate">{reference}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div
          className={`flex flex-col rounded-[20px] transition-all duration-200 ${
            focused
              ? 'bg-[color:var(--color-shell-elevated)] shadow-[0_18px_40px_rgba(0,0,0,0.2)]'
              : 'bg-[color:var(--color-shell-control)]'
          }`}
        >
          {detectedReferences.length > 0 ? (
            <div className="px-4 pt-3">
              <div className="flex flex-wrap gap-1.5">
                {detectedReferences.map((reference) => (
                  <div
                    className="rounded-full bg-white/[0.045] px-2.5 py-1 text-[11.5px] text-neutral-300"
                    key={reference}
                  >
                    @{reference}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {props.attachments.length > 0 ? (
            <div className="px-4 pt-3">
              <div className="flex flex-wrap gap-2">
                {props.attachments.map((attachment) => (
                  <div
                    className="group relative overflow-hidden rounded-[14px] bg-[#15181d]"
                    key={attachment.id}
                  >
                    <img
                      alt={attachment.name}
                      className="block h-16 w-24 object-cover opacity-90 transition group-hover:opacity-100"
                      src={attachment.previewUrl}
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                      <PaperclipIcon className="h-3 w-3 shrink-0 text-neutral-300" />
                      <span className="truncate text-[11px] text-neutral-200">{attachment.name}</span>
                      <button
                        type="button"
                        className="ml-auto rounded-full bg-black/45 p-1 text-neutral-300 transition hover:bg-black/70 hover:text-white"
                        onClick={() => props.onRemoveAttachment(attachment.id)}
                        title="Remove screenshot"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex min-h-[52px] items-center px-4 py-3">
            <textarea
              ref={textareaRef}
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.currentTarget.value)}
              rows={1}
              placeholder="Ask anything, build anything..."
              className="w-full resize-none border-none bg-transparent font-sans text-[15.5px] leading-[1.6] text-neutral-200 outline-none placeholder:text-neutral-500"
              style={{
                minHeight: '20px',
                maxHeight: '220px',
                scrollbarWidth: 'none',
              }}
              onPaste={(event) => {
                const imageFiles = Array.from(event.clipboardData?.items || [])
                  .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => Boolean(file))

                if (imageFiles.length > 0) {
                  event.preventDefault()
                  props.onPasteImages(imageFiles)
                }
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  props.onSubmit(draftPrompt)
                }
              }}
            />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-white/[0.05] hover:text-neutral-200"
                title="Choose workspace"
                onClick={props.onOpenProjectPicker}
              >
                <PlusIcon className="h-4 w-4" />
              </button>

              <div className="relative" ref={modelRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={showModelMenu}
                  onClick={() => {
                    setShowModelMenu((value) => !value)
                    setShowContinueMenu(false)
                    setShowPermissionMenu(false)
                    setShowReasoningMenu(false)
                    setShowGitBranchMenu(false)
                  }}
                  className={`flex h-8 items-center gap-1.25 rounded-full px-2.5 text-[12.5px] font-medium transition-colors ${
                    showModelMenu
                      ? 'bg-white/[0.06] text-white'
                      : 'text-neutral-400 hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  {selectedModelOption?.display_name || props.selectedModel}
                  <ChevronIcon className="h-3.25 w-3.25 opacity-60" />
                </button>

                {showModelMenu ? (
                  <div
                    role="menu"
                    aria-label="Select model"
                    className="absolute bottom-full left-0 z-50 mb-2 rounded-[18px] bg-[#171a1f] py-2 shadow-[var(--shadow-shell-elevated)]"
                    style={{
                      width: props.compactModelMenu ? 'min(calc(100vw - 2rem), 18.25rem)' : '11rem',
                      maxWidth: 'calc(100vw - 2rem)',
                    }}
                  >
                    <div className="px-4 pb-1.5 pt-1 text-[13px] font-medium tracking-[-0.01em] text-neutral-400">
                      Select model
                    </div>

                    <div className="relative px-1.5 pb-1">
                      {props.models.map((model, index) => {
                        const selected = props.selectedModel === model.model
                        const active = activeModelIndex === index
                        const description = model.description.trim()

                        return (
                          <div className="relative" key={model.id}>
                            <button
                              ref={(node) => {
                                modelButtonRefs.current[index] = node
                              }}
                              type="button"
                              role="menuitemradio"
                              aria-checked={selected}
                              tabIndex={active ? 0 : -1}
                              onFocus={() => setActiveModelIndex(index)}
                              onMouseEnter={() => {
                                if (!props.touchModelPreview) {
                                  setActiveModelIndex(index)
                                }
                              }}
                              onClick={() => {
                                if (props.touchModelPreview && description && activeModelIndex !== index) {
                                  setActiveModelIndex(index)
                                  modelButtonRefs.current[index]?.focus()
                                  return
                                }

                                props.onSelectModel(model.model)
                                setShowModelMenu(false)
                                setActiveModelIndex(null)
                              }}
                              className={`flex ${props.touchModelPreview ? 'h-[44px]' : 'h-[36px]'} w-full items-center justify-between rounded-[11px] px-3 text-left text-[14px] tracking-[-0.012em] transition-colors ${
                                selected || active
                                  ? 'bg-[color:var(--color-shell-control)] text-white'
                                  : 'text-neutral-300 hover:bg-[color:var(--color-shell-control)] hover:text-white'
                              }`}
                            >
                              <span>{model.display_name}</span>
                              {selected ? <span className="text-[14px] text-neutral-100">✓</span> : <span className="w-3.5" />}
                            </button>

                            {!props.compactModelMenu && active && description ? (
                              <div className="pointer-events-none absolute left-full top-1/2 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-[12px] bg-[#20242a] px-3 py-1.5 text-[13px] text-neutral-100 shadow-[var(--shadow-shell-elevated)]">
                                {description}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>

                    {props.compactModelMenu &&
                    activeModelIndex !== null &&
                    props.models[activeModelIndex]?.description.trim() ? (
                      <div className="mx-2 mb-1 rounded-[12px] bg-[color:var(--color-shell-control)] px-3 py-2 text-[13px] leading-[1.45] text-neutral-200">
                        {props.models[activeModelIndex]?.description.trim()}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="relative" ref={reasoningRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowReasoningMenu((value) => !value)
                    setShowContinueMenu(false)
                    setShowPermissionMenu(false)
                    setShowModelMenu(false)
                    setShowGitBranchMenu(false)
                  }}
                  className={`flex h-8 items-center gap-1.25 rounded-full px-2.5 text-[12.5px] font-medium transition-colors ${
                    props.selectedReasoning !== (selectedModelOption?.default_reasoning_effort || 'medium')
                      ? 'text-neutral-200 hover:bg-white/[0.05] hover:text-white'
                      : 'text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200'
                  }`}
                >
                  <SparkleIcon className="h-3.25 w-3.25 opacity-80" />
                  {selectedReasoningOption?.label || 'High'}
                  <ChevronIcon className="h-3.25 w-3.25 opacity-60" />
                </button>

                {showReasoningMenu ? (
                  <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[224px] rounded-[16px] bg-[#171a1f] py-1.5 shadow-[var(--shadow-shell-elevated)]">
                    {props.reasoningOptions.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => {
                          if (option.disabled) {
                            return
                          }
                          props.onSelectReasoning(option.value)
                          setShowReasoningMenu(false)
                        }}
                        disabled={option.disabled}
                        className={`flex w-full items-center justify-between px-3.5 py-2 text-[13px] transition-colors ${
                          props.selectedReasoning === option.value
                            ? 'bg-[color:var(--color-shell-control)] text-white'
                            : 'text-neutral-400 hover:bg-[color:var(--color-shell-control)] hover:text-white'
                        } ${option.disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-left">{option.label}</span>
                          {option.description ? (
                            <span className="mt-0.5 block text-left text-[11.5px] leading-[1.4] text-neutral-500">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        {props.selectedReasoning === option.value ? <div className="size-1.5 rounded-full bg-white" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {props.liveTurn ? (
                <button
                  type="button"
                  onClick={props.onInterrupt}
                  disabled={props.busy}
                  className="rounded-full bg-white/[0.045] px-2.75 py-1.5 text-[11.5px] font-medium text-neutral-300 transition hover:bg-white/[0.065] hover:text-neutral-100 disabled:opacity-70"
                >
                  Interrupt
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => props.onSubmit(draftPrompt)}
              disabled={!canSubmit || props.busy}
              className={`flex size-9 items-center justify-center rounded-full transition-all duration-200 ${
                canSubmit
                  ? 'bg-white text-black hover:scale-105 hover:bg-neutral-200'
                  : 'cursor-not-allowed bg-white/[0.05] text-neutral-500'
              }`}
            >
              <ArrowUpIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          <div className="relative" ref={continueRef}>
            <button
              type="button"
              onClick={() => {
                setShowContinueMenu((value) => !value)
                setShowPermissionMenu(false)
                setShowModelMenu(false)
                setShowReasoningMenu(false)
                setShowGitBranchMenu(false)
              }}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-300 transition-colors hover:text-white"
            >
              <MonitorIcon className="h-3.5 w-3.5 text-neutral-400" />
              <span>Local</span>
              <ChevronIcon className="h-3.25 w-3.25 opacity-60" />
            </button>

            {showContinueMenu ? (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-[256px] rounded-[18px] bg-[#181b20] py-2.5 shadow-[var(--shadow-shell-elevated)] backdrop-blur-sm">
                <div className="px-4 pb-1.5 text-[12.5px] font-medium tracking-[-0.015em] text-neutral-400">
                  Continue in
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowContinueMenu(false)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.25 text-left text-[13px] text-white transition-colors hover:bg-[color:var(--color-shell-control)]"
                >
                  <MonitorIcon className="h-3.5 w-3.5 text-neutral-300" />
                  <span className="flex-1 font-medium">Local project</span>
                  <span className="text-[14px] text-neutral-300">✓</span>
                </button>

                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center gap-3 px-4 py-2.25 text-left text-[13px] text-neutral-500 opacity-75"
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="flex-1 font-medium">Connect Codex web</span>
                  <ExternalLinkIcon className="h-3.25 w-3.25 text-neutral-500" />
                </button>

                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center gap-3 px-4 py-2.25 text-left text-[13px] text-neutral-600 opacity-70"
                >
                  <CloudOffIcon className="h-3.5 w-3.5 text-neutral-600" />
                  <span className="flex-1 font-medium">Send to cloud</span>
                </button>

                <div className="mx-4 my-2 h-px bg-[color:var(--color-shell-divider)]" />

                <button
                  type="button"
                  onClick={() => {
                    props.onOpenRateLimits()
                    setShowContinueMenu(false)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.25 text-left text-[13px] text-neutral-200 transition-colors hover:bg-[color:var(--color-shell-control)] hover:text-white"
                >
                  <GaugeIcon className="h-3.5 w-3.5 text-neutral-300" />
                  <span className="flex-1 font-medium">Open rate limits</span>
                  <ChevronIcon className="h-3.25 w-3.25 text-neutral-500" />
                </button>
              </div>
            ) : null}
          </div>

          {props.gitBranchLabel ? (
            <div className="relative" ref={gitBranchRef}>
              <button
                type="button"
                onClick={() => {
                  setShowGitBranchMenu((value) => !value)
                  closeAuxMenus()
                }}
                disabled={props.gitBusy}
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <BranchIcon className="h-3.5 w-3.5 text-neutral-400" />
                <span className="max-w-[13rem] truncate">{props.gitBranchLabel}</span>
                <ChevronIcon className="h-3.25 w-3.25 opacity-60" />
              </button>

              {showGitBranchMenu ? (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-[19rem] rounded-[18px] bg-[#171a1f] p-3 shadow-[var(--shadow-shell-elevated)]">
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                    <input
                      value={gitBranchQuery}
                      onChange={(event) => setGitBranchQuery(event.target.value)}
                      placeholder="Search branches"
                      className="h-10 w-full rounded-[12px] bg-black/18 py-2 pl-9 pr-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 focus:bg-black/24 focus:outline-none"
                    />
                  </div>

                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    Branches
                  </div>

                  <div className="mt-2 max-h-[15rem] space-y-1 overflow-y-auto shell-scroll">
                    {filteredGitBranches.length > 0 ? (
                      filteredGitBranches.map((branch) => (
                        <button
                          key={branch.name}
                          type="button"
                          disabled={props.gitBusy || branch.is_current}
                          onClick={() => void handleCheckoutGitBranch(branch.name)}
                          className={`w-full rounded-[12px] px-3 py-2.5 text-left transition ${
                            branch.is_current
                              ? 'bg-[color:var(--color-shell-control)] text-white'
                              : 'text-neutral-300 hover:bg-[color:var(--color-shell-control)] hover:text-white'
                          } ${props.gitBusy ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[13px] font-medium">
                            <span className="truncate">{branch.name}</span>
                            <span className="text-[16px] leading-none text-neutral-300">
                              {branch.is_current ? '✓' : branch.is_default ? '•' : ''}
                            </span>
                          </div>
                          {branch.is_current && props.gitSummary?.fileCount ? (
                            <div className="mt-1 text-[11.5px] text-neutral-500">
                              Uncommitted: {props.gitSummary.fileCount}{' '}
                              {props.gitSummary.fileCount === 1 ? 'file' : 'files'}
                            </div>
                          ) : branch.is_default ? (
                            <div className="mt-1 text-[11.5px] text-neutral-500">Default branch</div>
                          ) : null}
                        </button>
                      ))
                    ) : (
                      <div className="rounded-[12px] bg-[color:var(--color-shell-control)] px-3 py-3 text-[12.5px] text-neutral-500">
                        No branches match.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                    <button
                      type="button"
                      disabled={props.gitBusy || !canCreateGitBranch}
                      onClick={() => void handleCreateGitBranch()}
                      className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-medium text-neutral-200 transition hover:bg-[color:var(--color-shell-control)] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <PlusIcon className="h-3.5 w-3.5 text-neutral-400" />
                      <span className="truncate">
                        {gitBranchQuery.trim()
                          ? `Create and checkout ${gitBranchQuery.trim()}`
                          : 'Create and checkout new branch...'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="relative" ref={permissionRef}>
            <button
              type="button"
              onClick={() => {
                setShowPermissionMenu((value) => !value)
                setShowContinueMenu(false)
                setShowModelMenu(false)
                setShowReasoningMenu(false)
                setShowGitBranchMenu(false)
              }}
              className={`flex items-center gap-1.5 text-[12.5px] font-medium transition-colors ${
                props.selectedPermissionPreset === 'full-access'
                  ? 'text-amber-100 hover:text-amber-50'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              {props.selectedPermissionPreset === 'full-access' ? (
                <ShieldAlertIcon className="h-3.5 w-3.5" />
              ) : (
                <ShieldIcon className="h-3.5 w-3.5 text-neutral-400" />
              )}
              <span>{selectedPermissionOption?.label || 'Default permissions'}</span>
              <ChevronIcon className="h-3.25 w-3.25 opacity-60" />
            </button>

            {showPermissionMenu ? (
              <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[220px] rounded-[16px] bg-[#171a1f] py-1.5 shadow-[var(--shadow-shell-elevated)]">
                {props.permissionOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => {
                      props.onSelectPermissionPreset(option.value)
                      setShowPermissionMenu(false)
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.25 text-left text-[13px] transition-colors ${
                      props.selectedPermissionPreset === option.value
                        ? 'text-white'
                        : 'text-neutral-300 hover:bg-[color:var(--color-shell-control)] hover:text-white'
                    }`}
                  >
                    {option.value === 'full-access' ? (
                      <ShieldAlertIcon className="h-3.5 w-3.5 text-amber-200" />
                    ) : (
                      <ShieldIcon className="h-3.5 w-3.5 text-neutral-300" />
                    )}
                    <span className="flex-1 font-medium">{option.label}</span>
                    {props.selectedPermissionPreset === option.value ? (
                      <span className="text-[14px] text-neutral-200">✓</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {props.showRateLimitsInline ? (
            <button
              type="button"
              onClick={props.onOpenRateLimits}
              title="Open account settings"
              className="group flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-neutral-300 transition-colors hover:text-white focus-visible:outline-none"
            >
              <GaugeIcon className="h-3.25 w-3.25 shrink-0 text-neutral-500" />
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {props.rateLimitDisplays && props.rateLimitDisplays.length > 0 ? (
                  props.rateLimitDisplays.map((item, index) => (
                    <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
                      <span
                        className={`truncate text-[12px] font-medium ${
                          item.tone === 'warning'
                            ? 'text-amber-100'
                            : item.tone === 'calm'
                              ? 'text-neutral-100'
                              : 'text-neutral-400'
                        }`}
                      >
                        {item.value}
                      </span>
                      {index < (props.rateLimitDisplays?.length ?? 0) - 1 ? (
                        <span className="text-neutral-600">·</span>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-neutral-500">Unavailable</span>
                )}
              </span>
              <ChevronIcon className="h-3 w-3 shrink-0 opacity-45" />
            </button>
          ) : null}
        </div>

        <p className="mt-2 text-center text-[11.5px] font-medium tracking-[0.005em] text-neutral-500">
          {props.liveTurn
            ? 'Agent is mid-turn. Sending now will steer the live run.'
            : 'Agent can make mistakes. Consider verifying important information.'}
        </p>
      </div>
    </div>
  )
}

function tailPath(value: string | null | undefined) {
  const parts = (value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
  return parts[parts.length - 1] || ''
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
