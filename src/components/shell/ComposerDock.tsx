import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ModelOption } from '../../lib/kodeks'
import { extractReferenceQuery, resolveWorkspaceReference } from '../../lib/shellState'
import {
  ArrowUpIcon,
  ChevronIcon,
  CloseIcon,
  CloudOffIcon,
  ExternalLinkIcon,
  GaugeIcon,
  MonitorIcon,
  PaperclipIcon,
  PlusIcon,
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
  busy: boolean
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
}

export function ComposerDock(props: ComposerDockProps) {
  const [draftPrompt, setDraftPrompt] = useState('')
  const [focused, setFocused] = useState(false)
  const [showContinueMenu, setShowContinueMenu] = useState(false)
  const [showPermissionMenu, setShowPermissionMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showReasoningMenu, setShowReasoningMenu] = useState(false)
  const [activeModelIndex, setActiveModelIndex] = useState<number | null>(null)
  const deferredPrompt = useDeferredValue(draftPrompt)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const continueRef = useRef<HTMLDivElement | null>(null)
  const permissionRef = useRef<HTMLDivElement | null>(null)
  const modelRef = useRef<HTMLDivElement | null>(null)
  const reasoningRef = useRef<HTMLDivElement | null>(null)
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

  return (
    <div className="bg-gradient-to-t from-[#09090b] via-[#09090b] to-transparent px-4 pb-3.5 pt-1">
      <div className="relative mx-auto w-full max-w-[680px]">
        {referenceSuggestions.length > 0 ? (
          <div className="mb-1.5 rounded-[12px] border border-white/5 bg-[#121214] p-1 shadow-2xl">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Project files
            </div>
            <div className="space-y-1">
              {referenceSuggestions.slice(0, 6).map((reference) => (
                <button
                  type="button"
                  key={reference}
                  onClick={() => handleSelectReference(reference)}
                  className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-[12px] text-neutral-300 transition hover:bg-white/5 hover:text-white"
                >
                  <PaperclipIcon className="h-3.25 w-3.25 text-neutral-500" />
                  <span className="truncate">{reference}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div
          className={`flex flex-col rounded-[16px] transition-all duration-200 ${
            focused
              ? 'bg-white/[0.05] shadow-[0_0_0_1px_rgba(255,255,255,0.1)]'
              : 'bg-white/[0.03]'
          }`}
        >
          {detectedReferences.length > 0 ? (
            <div className="px-3.5 pt-2.5">
              <div className="flex flex-wrap gap-1.5">
                {detectedReferences.map((reference) => (
                  <div
                    className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[11px] text-neutral-300"
                    key={reference}
                  >
                    @{reference}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {props.attachments.length > 0 ? (
            <div className="px-3.5 pt-2.5">
              <div className="flex flex-wrap gap-2">
                {props.attachments.map((attachment) => (
                  <div
                    className="group relative overflow-hidden rounded-[12px] border border-white/8 bg-[#121214]"
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

          <div className="flex min-h-[44px] items-center px-3.5 py-2.5">
            <textarea
              ref={textareaRef}
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.currentTarget.value)}
              rows={1}
              placeholder="Ask anything, build anything..."
              className="w-full resize-none border-none bg-transparent font-sans text-[15px] leading-[1.55] text-neutral-200 outline-none placeholder:text-neutral-500"
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

          <div className="flex flex-wrap items-end justify-between gap-2.5 px-3.5 pb-2.5 pt-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200"
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
                  }}
                  className={`flex items-center gap-1.25 rounded-full px-1.75 py-1 text-[12.5px] font-medium transition-colors ${
                    showModelMenu
                      ? 'bg-white/5 text-white'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {selectedModelOption?.display_name || props.selectedModel}
                  <ChevronIcon className="h-3.25 w-3.25 opacity-60" />
                </button>

                {showModelMenu ? (
                  <div
                    role="menu"
                    aria-label="Select model"
                    className="absolute bottom-full left-0 z-50 mb-2 rounded-[16px] border border-white/6 bg-[#1a1b1f] py-1.5 shadow-[0_24px_72px_rgba(0,0,0,0.46)]"
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
                                  ? 'bg-[#2a2c31] text-white'
                                  : 'text-neutral-300 hover:bg-[#23252a] hover:text-white'
                              }`}
                            >
                              <span>{model.display_name}</span>
                              {selected ? <span className="text-[14px] text-neutral-100">✓</span> : <span className="w-3.5" />}
                            </button>

                            {!props.compactModelMenu && active && description ? (
                              <div className="pointer-events-none absolute left-full top-1/2 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-[10px] border border-white/8 bg-[#25272c] px-3 py-1.5 text-[13px] text-neutral-100 shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
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
                      <div className="mx-2 mb-1 rounded-[11px] border border-white/7 bg-[#23252a] px-3 py-2 text-[13px] leading-[1.45] text-neutral-200">
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
                  }}
                  className={`flex items-center gap-1.25 rounded-full px-1.75 py-1 text-[12.5px] font-medium transition-colors ${
                    props.selectedReasoning !== (selectedModelOption?.default_reasoning_effort || 'medium')
                      ? 'text-neutral-200 hover:bg-white/5 hover:text-white'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                  }`}
                >
                  <SparkleIcon className="h-3.25 w-3.25 opacity-80" />
                  {selectedReasoningOption?.label || 'High'}
                  <ChevronIcon className="h-3.25 w-3.25 opacity-60" />
                </button>

                {showReasoningMenu ? (
                  <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[224px] rounded-[13px] border border-white/5 bg-[#18181b] py-1 shadow-2xl">
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
                            ? 'bg-white/5 text-white'
                            : 'text-neutral-400 hover:bg-white/5 hover:text-white'
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
                  className="rounded-full border border-white/8 px-2.25 py-1 text-[11.5px] font-medium text-neutral-400 transition hover:border-white/15 hover:text-neutral-200 disabled:opacity-70"
                >
                  Interrupt
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => props.onSubmit(draftPrompt)}
              disabled={!canSubmit || props.busy}
              className={`flex size-7 items-center justify-center rounded-full transition-all duration-200 ${
                canSubmit
                  ? 'bg-white text-black hover:scale-105 hover:bg-neutral-200'
                  : 'cursor-not-allowed bg-white/5 text-neutral-500'
              }`}
            >
              <ArrowUpIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 px-0.5">
          <div className="relative" ref={continueRef}>
            <button
              type="button"
              onClick={() => {
                setShowContinueMenu((value) => !value)
                setShowPermissionMenu(false)
                setShowModelMenu(false)
                setShowReasoningMenu(false)
              }}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-300 transition-colors hover:text-white"
            >
              <MonitorIcon className="h-3.5 w-3.5 text-neutral-400" />
              <span>Local</span>
              <ChevronIcon className="h-3.25 w-3.25 opacity-60" />
            </button>

            {showContinueMenu ? (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-[256px] rounded-[20px] border border-white/6 bg-[#2a2a2d] py-2.5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-sm">
                <div className="px-4 pb-1.5 text-[12.5px] font-medium tracking-[-0.015em] text-neutral-400">
                  Continue in
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowContinueMenu(false)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.25 text-left text-[13px] text-white transition-colors hover:bg-white/5"
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

                <div className="mx-4 my-2 h-px bg-white/8" />

                <button
                  type="button"
                  onClick={() => {
                    props.onOpenRateLimits()
                    setShowContinueMenu(false)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.25 text-left text-[13px] text-neutral-200 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <GaugeIcon className="h-3.5 w-3.5 text-neutral-300" />
                  <span className="flex-1 font-medium">Rate limits remaining</span>
                  <ChevronIcon className="h-3.25 w-3.25 text-neutral-500" />
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={permissionRef}>
            <button
              type="button"
              onClick={() => {
                setShowPermissionMenu((value) => !value)
                setShowContinueMenu(false)
                setShowModelMenu(false)
                setShowReasoningMenu(false)
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
              <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[220px] rounded-[16px] border border-white/6 bg-[#262629] py-1.5 shadow-[0_20px_70px_rgba(0,0,0,0.4)]">
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
                        : 'text-neutral-300 hover:bg-white/5 hover:text-white'
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
