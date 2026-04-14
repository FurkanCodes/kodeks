import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import type { IDisposable } from '@xterm/xterm'
import {
  createProjectTerminal,
  killProjectTerminal,
  onProjectTerminalExit,
  onProjectTerminalOutput,
  openExternalUrl,
  resizeProjectTerminal,
  writeProjectTerminal,
  type ProjectTerminalExitEvent,
} from '../../lib/kodeks'
import {
  appendTerminalTab,
  closeTerminalTab,
  EMPTY_TERMINAL_TABS_STATE,
  ensureProjectActiveTerminalTab,
  setProjectActiveTerminalTab,
  type TerminalTabsState,
} from './terminalTabs'
import { CloseIcon, PlusIcon, TerminalIcon } from './icons'

const OUTPUT_BUFFER_LIMIT = 250_000
const MIN_TERMINAL_HEIGHT = 160
const MAX_TERMINAL_HEIGHT = 720

type TerminalDrawerProps = {
  open: boolean
  placement?: 'drawer' | 'pane'
  projectRoot: string | null
  projectLabel: string
  height: number
  onHeightChange: (height: number) => void
  onToggleOpen: () => void
}

export function TerminalDrawer(props: TerminalDrawerProps) {
  const placement = props.placement || 'drawer'
  const pane = placement === 'pane'
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const outputBySessionRef = useRef<Map<string, string>>(new Map())
  const exitBySessionRef = useRef<Map<string, ProjectTerminalExitEvent>>(new Map())
  const activeSessionIdRef = useRef<string | null>(null)
  const creatingProjectsRef = useRef<Set<string>>(new Set())
  const initializedProjectsRef = useRef<Set<string>>(new Set())

  const [status, setStatus] = useState('Terminal idle')
  const [connecting, setConnecting] = useState(false)
  const [tabsState, setTabsState] = useState<TerminalTabsState>(EMPTY_TERMINAL_TABS_STATE)
  const [exitedTabs, setExitedTabs] = useState<Record<string, true>>({})

  const currentProjectRoot = props.projectRoot
  const currentTabs = useMemo(
    () => (currentProjectRoot ? tabsState.tabsByProject[currentProjectRoot] || [] : []),
    [currentProjectRoot, tabsState.tabsByProject],
  )
  const currentActiveSessionId = currentProjectRoot
    ? tabsState.activeByProject[currentProjectRoot] || null
    : null
  const activeTab = useMemo(() => {
    if (currentTabs.length === 0) {
      return null
    }
    if (!currentActiveSessionId) {
      return currentTabs[0]
    }
    return currentTabs.find((tab) => tab.session.session_id === currentActiveSessionId) || currentTabs[0]
  }, [currentActiveSessionId, currentTabs])

  useEffect(() => {
    if (!props.open || !hostRef.current || terminalRef.current) {
      return
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.8,
      lineHeight: 1.32,
      scrollback: 7000,
      theme: {
        background: '#09090b',
        foreground: '#d8d2c8',
        cursor: '#f3efe8',
        cursorAccent: '#09090b',
        selectionBackground: 'rgba(243,239,232,0.2)',
        black: '#18181b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e5e7eb',
        brightBlack: '#52525b',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
    })
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      event?.preventDefault()
      void openExternalUrl(uri).catch((error) => {
        setStatus(`Link open failed: ${stringifyError(error)}`)
      })
    })
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.open(hostRef.current)
    fitAddon.fit()
    terminal.focus()

    const writeDisposable: IDisposable = terminal.onData((data) => {
      const activeSessionId = activeSessionIdRef.current
      if (!activeSessionId) {
        return
      }
      void writeProjectTerminal(activeSessionId, data).catch((error) => {
        setStatus(`Input failed: ${stringifyError(error)}`)
      })
    })

    const resizeDisposable: IDisposable = terminal.onResize((size) => {
      const activeSessionId = activeSessionIdRef.current
      if (!activeSessionId) {
        return
      }
      void resizeProjectTerminal(activeSessionId, size.cols, size.rows).catch((error) => {
        setStatus(`Resize failed: ${stringifyError(error)}`)
      })
    })

    const observer = new ResizeObserver(() => {
      const fit = fitAddonRef.current
      const current = terminalRef.current
      if (!fit || !current || !props.open) {
        return
      }
      fit.fit()
      const activeSessionId = activeSessionIdRef.current
      if (!activeSessionId) {
        return
      }
      void resizeProjectTerminal(activeSessionId, current.cols, current.rows).catch((error) => {
        setStatus(`Resize failed: ${stringifyError(error)}`)
      })
    })
    observer.observe(hostRef.current)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    return () => {
      observer.disconnect()
      writeDisposable.dispose()
      resizeDisposable.dispose()
      terminalRef.current?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      activeSessionIdRef.current = null
    }
  }, [props.open])

  useEffect(() => {
    let disposed = false
    let unlistenOutput: undefined | (() => void)
    let unlistenExit: undefined | (() => void)

    const subscribe = async () => {
      const outputUnsubscribe = await onProjectTerminalOutput((payload) => {
        if (disposed) {
          return
        }

        const previous = outputBySessionRef.current.get(payload.session_id) || ''
        const merged = capOutput(previous + payload.chunk)
        outputBySessionRef.current.set(payload.session_id, merged)

        if (activeSessionIdRef.current === payload.session_id) {
          terminalRef.current?.write(payload.chunk)
        }
      })
      if (disposed) {
        outputUnsubscribe()
        return
      }
      unlistenOutput = outputUnsubscribe

      const exitUnsubscribe = await onProjectTerminalExit((payload) => {
        if (disposed) {
          return
        }
        exitBySessionRef.current.set(payload.session_id, payload)
        setExitedTabs((current) =>
          current[payload.session_id]
            ? current
            : {
                ...current,
                [payload.session_id]: true,
              },
        )

        if (activeSessionIdRef.current !== payload.session_id) {
          return
        }

        const reason = payload.reason || payload.signal || `exit code ${payload.code ?? 'unknown'}`
        setStatus(`Session ended: ${reason}`)
      })
      if (disposed) {
        exitUnsubscribe()
        return
      }
      unlistenExit = exitUnsubscribe
    }

    void subscribe()

    return () => {
      disposed = true
      unlistenOutput?.()
      unlistenExit?.()
    }
  }, [])

  useEffect(() => {
    if (!currentProjectRoot) {
      return
    }
    setTabsState((current) => ensureProjectActiveTerminalTab(current, currentProjectRoot))
  }, [currentProjectRoot, currentActiveSessionId, currentTabs])

  useEffect(() => {
    if (!props.open || !currentProjectRoot || currentTabs.length > 0) {
      return
    }
    if (initializedProjectsRef.current.has(currentProjectRoot)) {
      return
    }
    if (creatingProjectsRef.current.has(currentProjectRoot)) {
      return
    }
    initializedProjectsRef.current.add(currentProjectRoot)
    void createTerminalTab(currentProjectRoot, true).then((created) => {
      if (!created) {
        initializedProjectsRef.current.delete(currentProjectRoot)
      }
    })
  }, [currentProjectRoot, currentTabs.length, props.open])

  useEffect(() => {
    if (!props.open) {
      return
    }

    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.reset()

    if (!currentProjectRoot) {
      activeSessionIdRef.current = null
      setStatus('No project selected')
      return
    }

    if (!activeTab) {
      activeSessionIdRef.current = null
      setStatus('No terminal sessions')
      return
    }

    const sessionId = activeTab.session.session_id
    activeSessionIdRef.current = sessionId

    const exit = exitBySessionRef.current.get(sessionId)
    if (exit) {
      const reason = exit.reason || exit.signal || `exit code ${exit.code ?? 'unknown'}`
      setStatus(`Session ended: ${reason}`)
    } else {
      setStatus(`Connected (${activeTab.session.shell})`)
    }

    const backlog = outputBySessionRef.current.get(sessionId)
    if (backlog) {
      terminal.write(backlog)
    }

    fitAddonRef.current?.fit()
    if (!exit) {
      void resizeProjectTerminal(sessionId, terminal.cols, terminal.rows).catch((error) => {
        setStatus(`Resize failed: ${stringifyError(error)}`)
      })
    }
  }, [activeTab, currentProjectRoot, props.open])

  useEffect(() => {
    if (!props.open) {
      return
    }

    const fit = fitAddonRef.current
    const terminal = terminalRef.current
    if (!fit || !terminal) {
      return
    }
    fit.fit()

    const activeSessionId = activeSessionIdRef.current
    if (!activeSessionId || exitBySessionRef.current.has(activeSessionId)) {
      return
    }

    void resizeProjectTerminal(activeSessionId, terminal.cols, terminal.rows).catch((error) => {
      setStatus(`Resize failed: ${stringifyError(error)}`)
    })
  }, [activeTab?.session.session_id, props.height, props.open])

  async function createTerminalTab(projectRoot: string, activate: boolean) {
    if (creatingProjectsRef.current.has(projectRoot)) {
      return false
    }

    creatingProjectsRef.current.add(projectRoot)
    setConnecting(true)
    setStatus(`Connecting to ${props.projectLabel} terminal...`)

    try {
      const terminal = terminalRef.current
      const cols = terminal?.cols && terminal.cols > 0 ? terminal.cols : 120
      const rows = terminal?.rows && terminal.rows > 0 ? terminal.rows : 32
      const session = await createProjectTerminal(projectRoot, cols, rows)

      setTabsState((current) => {
        const currentTabs = current.tabsByProject[projectRoot] || []
        return appendTerminalTab(
          current,
          projectRoot,
          {
            session,
            title: nextTerminalTitle(currentTabs),
          },
          {
            activate,
          },
        )
      })

      setStatus(`Connected (${session.shell})`)
      initializedProjectsRef.current.add(projectRoot)
      return true
    } catch (error) {
      const message = stringifyError(error)
      setStatus(`Connect failed: ${message}`)
      return false
    } finally {
      creatingProjectsRef.current.delete(projectRoot)
      setConnecting(false)
    }
  }

  function handleMouseDownResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = props.height

    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = startY - moveEvent.clientY
      const next = clampHeight(startHeight + delta)
      startTransition(() => {
        props.onHeightChange(next)
      })
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleSelectTab(sessionId: string) {
    if (!currentProjectRoot) {
      return
    }
    setTabsState((current) => setProjectActiveTerminalTab(current, currentProjectRoot, sessionId))
  }

  async function handleCloseTab(sessionId: string) {
    if (!currentProjectRoot) {
      return
    }

    if (activeSessionIdRef.current === sessionId) {
      activeSessionIdRef.current = null
    }

    setTabsState((current) => closeTerminalTab(current, currentProjectRoot, sessionId))
    outputBySessionRef.current.delete(sessionId)
    exitBySessionRef.current.delete(sessionId)
    setExitedTabs((current) => {
      if (!current[sessionId]) {
        return current
      }
      const next = { ...current }
      delete next[sessionId]
      return next
    })

    try {
      await killProjectTerminal(sessionId)
      setStatus('Terminal closed')
    } catch (error) {
      if (isIgnorableTabCloseError(error)) {
        setStatus('Terminal closed')
        return
      }
      setStatus(`Failed to close tab: ${stringifyError(error)}`)
    }
  }

  async function handleKillSession() {
    const sessionId = activeSessionIdRef.current
    if (!sessionId) {
      return
    }

    try {
      await killProjectTerminal(sessionId)
      setStatus('Termination requested')
    } catch (error) {
      setStatus(`Failed to terminate: ${stringifyError(error)}`)
    }
  }

  async function handleAddTab() {
    if (!currentProjectRoot) {
      return
    }
    await createTerminalTab(currentProjectRoot, true)
  }

  return (
    <section
      className={
        pane
          ? 'relative flex min-h-0 flex-1 flex-col bg-[#09090b]'
          : 'relative shrink-0 border-t border-[color:var(--color-shell-divider)] bg-[#09090b]'
      }
      style={
        pane
          ? undefined
          : {
              height: props.open ? `${clampHeight(props.height)}px` : '0px',
              transition: 'height 180ms cubic-bezier(0.22,1,0.36,1)',
            }
      }
    >
      <div
        className={
          pane
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : `absolute inset-0 flex flex-col overflow-hidden ${props.open ? 'opacity-100' : 'pointer-events-none opacity-0'}`
        }
      >
        {!pane ? (
          <div
            className="group absolute inset-x-0 top-0 z-10 h-2 cursor-row-resize"
            onMouseDown={handleMouseDownResize}
          >
            <div className="mx-auto mt-0.5 h-[3px] w-14 rounded-full bg-white/8 transition group-hover:bg-white/20" />
          </div>
        ) : null}

        <header className="flex h-11 items-center gap-2 border-b border-white/5 px-3">
          <div className="inline-flex items-center gap-2 text-[12px] text-[color:var(--color-shell-muted)]">
            <TerminalIcon className="h-3.5 w-3.5" />
            <span className="font-medium tracking-[0.02em]">Terminal</span>
          </div>
          <div className="truncate text-[12px] text-[color:var(--color-shell-faint)]">
            {props.projectRoot ? props.projectRoot : 'Select a project to start a terminal'}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="max-w-[24rem] truncate text-[11px] text-[color:var(--color-shell-faint)]">
              {connecting ? 'Connecting...' : status}
            </span>
            <button
              type="button"
              onClick={() => void handleKillSession()}
              className="rounded-[8px] border border-white/10 px-2.5 py-1 text-[11px] text-neutral-300 transition hover:border-white/20 hover:text-white"
              disabled={!activeTab || Boolean(exitedTabs[activeTab.session.session_id])}
            >
              Kill
            </button>
            <button
              type="button"
              onClick={props.onToggleOpen}
              className="rounded-[8px] p-1.5 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
              title="Close terminal"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="flex h-9 items-center gap-1 px-2">
          {currentTabs.length === 0 ? (
            <span className="truncate px-1.5 text-[11px] text-[color:var(--color-shell-faint)]">
              No terminal sessions yet
            </span>
          ) : null}
          {currentTabs.map((tab) => {
            const sessionId = tab.session.session_id
            const active = activeTab?.session.session_id === sessionId
            const exited = Boolean(exitedTabs[sessionId])
            return (
              <div
                key={sessionId}
                className={`group inline-flex h-7 max-w-[14rem] items-center rounded-[9px] ${
                  active ? 'bg-white/9' : 'bg-white/4 hover:bg-white/8'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectTab(sessionId)}
                  className="flex min-w-0 items-center gap-1.5 px-2 text-[11px] text-[color:var(--color-shell-muted)] transition hover:text-[color:var(--color-shell-primary)]"
                >
                  <span className="truncate">{tab.title}</span>
                  {exited ? (
                    <span className="rounded bg-red-300/16 px-1 py-[1px] text-[10px] text-red-200">
                      Ended
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void handleCloseTab(sessionId)
                  }}
                  title={`Close ${tab.title}`}
                  className="mr-0.5 flex h-5 w-5 items-center justify-center rounded-[6px] text-neutral-500 transition hover:bg-white/10 hover:text-neutral-200"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => void handleAddTab()}
            title="New terminal"
            disabled={!currentProjectRoot || connecting}
            className={`ml-1 inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-neutral-300 transition ${
              !currentProjectRoot || connecting
                ? 'cursor-not-allowed opacity-50'
                : 'hover:bg-white/8 hover:text-white'
            }`}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          ref={hostRef}
          className="shell-scroll-none min-h-0 flex-1 px-2 pb-2 pt-1"
          onClick={() => terminalRef.current?.focus()}
        />
      </div>
    </section>
  )
}

function capOutput(value: string) {
  if (value.length <= OUTPUT_BUFFER_LIMIT) {
    return value
  }
  return value.slice(value.length - OUTPUT_BUFFER_LIMIT)
}

function nextTerminalTitle(tabs: Array<{ title: string }>) {
  const used = new Set<number>()
  for (const tab of tabs) {
    const match = tab.title.match(/^Terminal\s+(\d+)$/i)
    if (!match) {
      continue
    }
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0) {
      used.add(Math.floor(value))
    }
  }

  let next = 1
  while (used.has(next)) {
    next += 1
  }
  return `Terminal ${next}`
}

function clampHeight(height: number) {
  if (!Number.isFinite(height)) {
    return 280
  }
  if (height < MIN_TERMINAL_HEIGHT) {
    return MIN_TERMINAL_HEIGHT
  }
  if (height > MAX_TERMINAL_HEIGHT) {
    return MAX_TERMINAL_HEIGHT
  }
  return Math.round(height)
}

function stringifyError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown terminal error'
}

function isIgnorableTabCloseError(error: unknown) {
  const message = stringifyError(error).toLowerCase()
  return message.includes('unknown terminal session') || message.includes('already exited')
}
