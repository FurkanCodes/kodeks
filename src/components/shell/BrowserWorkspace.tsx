import { useCallback, useEffect, useRef, useState } from 'react'
import { IconTooltip } from '../IconTooltip'
import type {
  InAppBrowserBounds,
  InAppBrowserClearTarget,
  InAppBrowserInspectEvent,
} from '../../lib/kodeks'
import type { BrowserProjectEmulation } from '../../lib/workspaceStore'
import {
  CookieIcon,
  CrosshairIcon,
  DatabaseIcon,
  EraserIcon,
  GlobeIcon,
  HandIcon,
  RefreshIcon,
  WrenchIcon,
} from './icons'

type BrowserWorkspaceProps = {
  currentUrl: string
  devtoolsOpen: boolean
  inspectEnabled: boolean
  inspectResult: InAppBrowserInspectEvent | null
  emulation: BrowserProjectEmulation
  busy?: boolean
  status?: string | null
  onNavigate: (url: string) => void
  onRefresh: () => void
  onToggleDevtools: () => void
  onClearData: (target: InAppBrowserClearTarget) => void
  onSetInspectEnabled: (enabled: boolean) => void
  onViewportChange: (bounds: InAppBrowserBounds | null) => void
  onEmulationChange: (emulation: BrowserProjectEmulation) => void
}

const CLEAR_ACTIONS: Array<{
  target: InAppBrowserClearTarget
  label: string
}> = [
  { target: 'cache', label: 'Clear cache' },
  { target: 'local_storage', label: 'Clear local storage' },
  { target: 'system_storage', label: 'Clear system storage' },
  { target: 'cookies', label: 'Clear cookies' },
]

type BrowserViewportPreset = {
  id: string
  label: string
  width: number
  height: number
  touchRecommended: boolean
}

const BROWSER_VIEWPORT_PRESETS: BrowserViewportPreset[] = [
  { id: 'iphone-se', label: 'iPhone SE (375×667)', width: 375, height: 667, touchRecommended: true },
  { id: 'iphone-14', label: 'iPhone 14 (390×844)', width: 390, height: 844, touchRecommended: true },
  { id: 'pixel-7', label: 'Pixel 7 (412×915)', width: 412, height: 915, touchRecommended: true },
  { id: 'ipad-mini', label: 'iPad Mini (768×1024)', width: 768, height: 1024, touchRecommended: true },
  { id: 'tablet', label: 'Tablet (1024×768)', width: 1024, height: 768, touchRecommended: true },
  { id: 'laptop', label: 'Laptop (1366×768)', width: 1366, height: 768, touchRecommended: false },
  { id: 'desktop', label: 'Desktop (1440×900)', width: 1440, height: 900, touchRecommended: false },
]

const RESPONSIVE_VIEWPORT_PRESET = 'responsive'
const VIEWPORT_FRAME_PADDING = 12
const BROWSER_VIEWPORT_DEBUG_STORAGE_KEY = 'kodeks:debug:browser-viewport'

function isBrowserViewportDebugEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(BROWSER_VIEWPORT_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function browserBoundsEqual(
  left: InAppBrowserBounds | null,
  right: InAppBrowserBounds | null,
): boolean {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  return (
    left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height
  )
}

export function BrowserWorkspace(props: BrowserWorkspaceProps) {
  const viewportShellRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const onViewportChangeRef = useRef(props.onViewportChange)
  const lastBoundsRef = useRef<InAppBrowserBounds | null>(null)
  const frameRef = useRef<number | null>(null)
  const viewportDebugSeqRef = useRef(0)
  const [draftUrl, setDraftUrl] = useState(props.currentUrl)
  const [viewportShellSize, setViewportShellSize] = useState({ width: 0, height: 0 })
  const viewportPresetId = (
    props.emulation.viewportPresetId
    && (
      props.emulation.viewportPresetId === RESPONSIVE_VIEWPORT_PRESET
      || BROWSER_VIEWPORT_PRESETS.some((preset) => preset.id === props.emulation.viewportPresetId)
    )
      ? props.emulation.viewportPresetId
      : RESPONSIVE_VIEWPORT_PRESET
  )
  const viewportOrientation = props.emulation.orientation === 'landscape' ? 'landscape' : 'portrait'
  const inspectComponentName = (props.inspectResult?.reactComponentName || '').trim()
  const inspectComponentChain = Array.isArray(props.inspectResult?.reactComponentChain)
    ? props.inspectResult.reactComponentChain
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
    : []
  const inspectComponentSource = (props.inspectResult?.reactComponentSource || '').trim()
  const showInspectComponentInfo = inspectComponentName.length > 0 || inspectComponentChain.length > 0

  const debugViewport = useCallback((event: string, payload?: unknown) => {
    if (!isBrowserViewportDebugEnabled()) {
      return
    }
    viewportDebugSeqRef.current += 1
    if (payload === undefined) {
      console.debug(`[browser-viewport][workspace][${viewportDebugSeqRef.current}] ${event}`)
      return
    }
    console.debug(`[browser-viewport][workspace][${viewportDebugSeqRef.current}] ${event}`, payload)
  }, [])

  useEffect(() => {
    setDraftUrl(props.currentUrl)
  }, [props.currentUrl])

  useEffect(() => {
    onViewportChangeRef.current = props.onViewportChange
  }, [props.onViewportChange])

  useEffect(() => {
    const node = viewportShellRef.current
    if (!node) {
      return
    }

    const emitSize = () => {
      const rect = node.getBoundingClientRect()
      setViewportShellSize({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      })
    }

    emitSize()
    const observer = new ResizeObserver(emitSize)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  const selectedViewportPreset = BROWSER_VIEWPORT_PRESETS.find((preset) => preset.id === viewportPresetId) || null
  const responsiveViewport = !selectedViewportPreset
  const selectedViewportFrame = selectedViewportPreset
    ? viewportOrientation === 'landscape'
      ? { width: selectedViewportPreset.height, height: selectedViewportPreset.width }
      : { width: selectedViewportPreset.width, height: selectedViewportPreset.height }
    : null
  const presetViewportSize =
    selectedViewportFrame && viewportShellSize.width > 0 && viewportShellSize.height > 0
      ? (() => {
          const availableWidth = Math.max(2, viewportShellSize.width - VIEWPORT_FRAME_PADDING * 2)
          const availableHeight = Math.max(2, viewportShellSize.height - VIEWPORT_FRAME_PADDING * 2)
          const scale = Math.min(
            availableWidth / selectedViewportFrame.width,
            availableHeight / selectedViewportFrame.height,
            1,
          )
          return {
            width: Math.max(2, Math.round(selectedViewportFrame.width * scale)),
            height: Math.max(2, Math.round(selectedViewportFrame.height * scale)),
          }
        })()
      : null

  useEffect(() => {
    debugViewport('effect:init')

    const emitChange = (bounds: InAppBrowserBounds | null) => {
      if (browserBoundsEqual(lastBoundsRef.current, bounds)) {
        debugViewport('emit:dedupe-skip', { bounds })
        return
      }
      const previous = lastBoundsRef.current
      lastBoundsRef.current = bounds
      debugViewport('emit:forward', { previous, next: bounds })
      onViewportChangeRef.current(bounds)
    }

    const node = viewportRef.current
    if (!node) {
      debugViewport('viewport:missing-node')
      emitChange(null)
      return
    }

    const emitBounds = () => {
      const target = viewportRef.current
      if (!target) {
        debugViewport('emitBounds:missing-target')
        emitChange(null)
        return
      }

      const rect = target.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) {
        debugViewport('emitBounds:small-rect', {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        })
        emitChange(null)
        return
      }

      const rounded = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
      debugViewport('emitBounds:rect', rounded)
      emitChange(rounded)
    }

    const scheduleEmitBounds = (reason: string) => {
      if (frameRef.current !== null) {
        debugViewport('schedule:skip-frame-pending', { reason })
        return
      }
      debugViewport('schedule:queue', { reason })
      frameRef.current = window.requestAnimationFrame(() => {
        debugViewport('raf:run', { reason })
        frameRef.current = null
        emitBounds()
      })
    }

    const handleResize = () => scheduleEmitBounds('window-resize')
    const handleFocus = () => debugViewport('window:focus')
    const handleBlur = () => debugViewport('window:blur')
    const handleVisibilityChange = () => {
      debugViewport('document:visibilitychange', { state: document.visibilityState })
    }

    scheduleEmitBounds('init')
    const observer = new ResizeObserver(() => scheduleEmitBounds('resize-observer'))
    observer.observe(node)
    window.addEventListener('resize', handleResize)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      debugViewport('effect:cleanup')
      observer.disconnect()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
        debugViewport('raf:cancel')
      }
      emitChange(null)
    }
  }, [debugViewport])

  function updateEmulation(nextPartial: Partial<BrowserProjectEmulation>) {
    props.onEmulationChange({
      viewportPresetId: nextPartial.viewportPresetId ?? viewportPresetId,
      orientation: nextPartial.orientation ?? viewportOrientation,
      touchEnabled: nextPartial.touchEnabled ?? props.emulation.touchEnabled,
    })
  }

  function handleViewportPresetChange(nextPresetId: string) {
    const normalizedPresetId = nextPresetId || RESPONSIVE_VIEWPORT_PRESET
    updateEmulation({
      viewportPresetId: normalizedPresetId,
      orientation:
        normalizedPresetId === RESPONSIVE_VIEWPORT_PRESET
          ? 'portrait'
          : viewportOrientation,
    })
  }

  function handleViewportOrientationChange(nextOrientation: 'portrait' | 'landscape') {
    if (!selectedViewportPreset) {
      return
    }
    updateEmulation({ orientation: nextOrientation })
  }

  function handleToggleTouchEmulation() {
    updateEmulation({ touchEnabled: !props.emulation.touchEnabled })
  }

  function handleSubmitUrl() {
    const trimmed = draftUrl.trim()
    if (!trimmed) {
      return
    }
    props.onNavigate(trimmed)
  }

  const touchLabel = props.emulation.touchEnabled ? 'Touch emulation on' : 'Touch emulation off'
  const viewportMetricsLabel = selectedViewportFrame
    ? `${selectedViewportFrame.width}×${selectedViewportFrame.height} CSS px`
    : 'Responsive layout'
  const viewportModeLabel = selectedViewportPreset
    ? `${selectedViewportPreset.label} • ${viewportOrientation}`
    : 'Responsive (fit to panel)'

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-[#09090b]">
      <header className="flex h-11 items-center gap-2 px-3">
        <button
          type="button"
          className="group relative inline-flex size-8 items-center justify-center rounded-[9px] text-neutral-400 transition hover:bg-white/8 hover:text-white"
          title="Browser panel"
          aria-label="Browser panel"
        >
          <GlobeIcon className="h-3.5 w-3.5" />
          <IconTooltip label="Browser panel" placement="top" />
        </button>

        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmitUrl()
          }}
        >
          <input
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            placeholder="http://localhost:5173"
            spellCheck={false}
            className="h-8 w-full rounded-[10px] bg-[#101014] px-2.5 text-[12px] text-neutral-200 outline-none transition placeholder:text-neutral-500 focus:bg-[#13151a]"
          />
        </form>

        <button
          type="button"
          onClick={props.onRefresh}
          className="group relative inline-flex size-8 items-center justify-center rounded-[9px] text-neutral-300 transition hover:bg-white/8 hover:text-white"
          title="Refresh page"
          aria-label="Refresh page"
        >
          <RefreshIcon className="h-3.5 w-3.5" />
          <IconTooltip label="Refresh page" placement="top" />
        </button>

        <button
          type="button"
          onClick={props.onToggleDevtools}
          className={`group relative inline-flex size-8 items-center justify-center rounded-[9px] transition ${
            props.devtoolsOpen
              ? 'bg-emerald-300/18 text-emerald-100'
              : 'text-neutral-300 hover:bg-white/8 hover:text-white'
          }`}
          title={props.devtoolsOpen ? 'Disable browser devtools' : 'Enable browser devtools'}
          aria-label={props.devtoolsOpen ? 'Disable browser devtools' : 'Enable browser devtools'}
        >
          <WrenchIcon className="h-3.5 w-3.5" />
          <IconTooltip
            label={props.devtoolsOpen ? 'Disable browser devtools' : 'Enable browser devtools'}
            placement="top"
          />
        </button>

        <button
          type="button"
          onClick={() => props.onSetInspectEnabled(!props.inspectEnabled)}
          className={`group relative inline-flex size-8 items-center justify-center rounded-[9px] transition ${
            props.inspectEnabled
              ? 'bg-sky-300/18 text-sky-100'
              : 'text-neutral-300 hover:bg-white/8 hover:text-white'
          }`}
          title={props.inspectEnabled ? 'Disable inspect mode' : 'Enable inspect mode'}
          aria-label={props.inspectEnabled ? 'Disable inspect mode' : 'Enable inspect mode'}
        >
          <CrosshairIcon className="h-3.5 w-3.5" />
          <IconTooltip
            label={props.inspectEnabled ? 'Disable inspect mode' : 'Enable inspect mode'}
            placement="top"
          />
        </button>

        <div className="group relative">
          <select
            value={viewportPresetId}
            onChange={(event) => handleViewportPresetChange(event.target.value)}
            className="h-8 min-w-[11.5rem] rounded-[10px] bg-[#101014] px-2.5 text-[11.5px] text-neutral-200 outline-none transition hover:bg-[#13151a] focus:bg-[#13151a]"
            aria-label="Viewport size preset"
            title="Viewport size preset"
          >
            <option value={RESPONSIVE_VIEWPORT_PRESET}>Responsive (Fit to panel)</option>
            {BROWSER_VIEWPORT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <IconTooltip label="Viewport size preset" placement="top" />
        </div>

        {selectedViewportPreset ? (
          <div className="group relative inline-flex h-8 items-center rounded-[10px] border border-white/10 bg-[#101014] p-0.5">
            <button
              type="button"
              onClick={() => handleViewportOrientationChange('portrait')}
              className={`inline-flex h-full min-w-[2.15rem] items-center justify-center rounded-[8px] px-1.5 text-[11px] transition ${
                viewportOrientation === 'portrait'
                  ? 'bg-white/14 text-white'
                  : 'text-neutral-400 hover:bg-white/8 hover:text-neutral-200'
              }`}
              aria-label="Portrait orientation"
              title="Portrait orientation"
            >
              P
            </button>
            <button
              type="button"
              onClick={() => handleViewportOrientationChange('landscape')}
              className={`inline-flex h-full min-w-[2.15rem] items-center justify-center rounded-[8px] px-1.5 text-[11px] transition ${
                viewportOrientation === 'landscape'
                  ? 'bg-white/14 text-white'
                  : 'text-neutral-400 hover:bg-white/8 hover:text-neutral-200'
              }`}
              aria-label="Landscape orientation"
              title="Landscape orientation"
            >
              L
            </button>
            <IconTooltip label="Viewport orientation" placement="top" />
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleToggleTouchEmulation}
          className={`group relative inline-flex size-8 items-center justify-center rounded-[9px] transition ${
            props.emulation.touchEnabled
              ? 'bg-amber-300/20 text-amber-100'
              : selectedViewportPreset?.touchRecommended
                ? 'text-amber-200/85 hover:bg-amber-300/10 hover:text-amber-100'
                : 'text-neutral-300 hover:bg-white/8 hover:text-white'
          }`}
          title={touchLabel}
          aria-label={touchLabel}
        >
          <HandIcon className="h-3.5 w-3.5" />
          <IconTooltip label={touchLabel} placement="top" />
        </button>

        {CLEAR_ACTIONS.map((action) => (
          <button
            key={action.target}
            type="button"
            onClick={() => props.onClearData(action.target)}
            className="group relative inline-flex size-8 items-center justify-center rounded-[9px] text-neutral-300 transition hover:bg-white/8 hover:text-white"
            title={action.label}
            aria-label={action.label}
          >
            {action.target === 'local_storage' ? (
              <DatabaseIcon className="h-3.5 w-3.5" />
            ) : action.target === 'system_storage' ? (
              <EraserIcon className="h-3.5 w-3.5" />
            ) : action.target === 'cookies' ? (
              <CookieIcon className="h-3.5 w-3.5" />
            ) : (
              <RefreshIcon className="h-3.5 w-3.5" />
            )}
            <IconTooltip label={action.label} placement="top" />
          </button>
        ))}
      </header>

      <div ref={viewportShellRef} className="relative min-h-0 flex-1 bg-[#08090c]">
        <div
          className={`absolute inset-0 ${responsiveViewport ? '' : 'flex items-center justify-center p-3'}`}
        >
          <div
            ref={viewportRef}
            className={`relative overflow-hidden bg-[#08090c] ${
              responsiveViewport
                ? 'h-full w-full'
                : 'rounded-[14px] border border-white/8 shadow-[0_16px_40px_rgba(0,0,0,0.45)]'
            }`}
            style={
              responsiveViewport || !presetViewportSize
                ? undefined
                : {
                    width: `${presetViewportSize.width}px`,
                    height: `${presetViewportSize.height}px`,
                  }
            }
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="flex h-full w-full items-end justify-start p-3">
                <div className="space-y-1 rounded-[8px] bg-black/38 px-2 py-1.5 text-[10px] text-neutral-400">
                  <div>{props.currentUrl || 'No page loaded yet'}</div>
                  <div className="text-[9px] uppercase tracking-[0.06em] text-neutral-500">
                    {viewportModeLabel} · {viewportMetricsLabel} · {props.emulation.touchEnabled ? 'touch' : 'mouse'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 z-20 max-h-[45%] w-[min(25rem,calc(100%-1.5rem))] overflow-y-auto rounded-[11px] bg-[#0a0b10]/94 p-2.5 text-[11px] text-neutral-300 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
          {props.inspectEnabled ? (
            <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-sky-200/80">Hunt mode</p>
          ) : null}

          {props.inspectResult ? (
            <div className="space-y-2">
              <InfoRow label="URL" value={props.inspectResult.pageUrl} mono />
              <InfoRow label="Selector" value={props.inspectResult.selector || '-'} mono />
              <InfoRow label="Element" value={props.inspectResult.tag || '-'} mono />
              <InfoRow label="Text" value={props.inspectResult.textSnippet || '-'} />
              {showInspectComponentInfo ? (
                <InfoRow label="Component" value={inspectComponentName || 'unknown'} mono />
              ) : null}
              {inspectComponentChain.length > 0 ? (
                <InfoRow label="Component chain" value={inspectComponentChain.join(' > ')} />
              ) : null}
              {inspectComponentSource ? (
                <InfoRow label="Component file" value={inspectComponentSource} mono />
              ) : null}
            </div>
          ) : (
            <p className="leading-[1.55] text-neutral-400">
              Enable hunt mode, then click an element in the preview to capture source context.
            </p>
          )}

          {props.status ? <p className="mt-3 text-neutral-400">{props.status}</p> : null}
          {props.busy ? (
            <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-neutral-500">Working...</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function InfoRow(props: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.08em] text-neutral-500">{props.label}</div>
      <div className={`mt-0.5 break-all leading-[1.5] ${props.mono ? 'shell-menlo text-[10.5px]' : ''}`}>
        {props.value}
      </div>
    </div>
  )
}
