import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { SidebarGroup, SidebarThread } from '../../lib/shellState'
import { LoadingSpinner } from './LoadingSpinner'
import {
  ArchiveIcon,
  ChevronIcon,
  FolderGitIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LogoutIcon,
  MoreIcon,
  PlusIcon,
  PuzzleIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
  TrashIcon,
  UndoIcon,
} from './icons'

export type { SidebarGroup, SidebarThread } from '../../lib/shellState'

export type SidebarAccount = {
  id: string
  label: string
  planLabel: string
  isActive: boolean
  switching?: boolean
}

type SidebarProps = {
  collapsed: boolean
  activeUtility?: 'plugins' | 'skills' | null
  groups: SidebarGroup[]
  archivedThreads: SidebarThread[]
  accountMenuOpen: boolean
  accounts: SidebarAccount[]
  accountLabel: string
  planLabel: string
  onAddProject: () => void
  onNewThread: (rootPath?: string | null) => void
  onSearch: () => void
  onOpenPlugins: () => void
  onSelectProject: (rootPath: string) => void
  onSelectThread: (threadId: string) => void
  onArchiveThread: (threadId: string) => void
  onUnarchiveThread: (threadId: string) => void
  onRenameProject: (rootPath: string, label: string) => void
  onRemoveProject: (rootPath: string) => void
  onToggleGroup: (groupKey: string) => void
  onToggleAccountMenu: () => void
  onSelectAccount: (accountId: string) => void
  onAddAccount: () => void
  onOpenSettings: () => void
  onSignOut: () => void
  signOutDisabled: boolean
}

const THREAD_PREVIEW_LIMIT = 5
const SIDEBAR_FADE_EASE = [0.16, 1, 0.3, 1] as const

const THREAD_MENU_VARIANTS = {
  hidden: {
    opacity: 0,
    y: -4,
    scale: 0.985,
    transition: {
      duration: 0.1,
      ease: SIDEBAR_FADE_EASE,
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.14,
      ease: SIDEBAR_FADE_EASE,
    },
  },
} as const

const THREAD_MENU_REDUCED_VARIANTS = {
  hidden: {
    opacity: 0,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.01,
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.01,
    },
  },
} as const

function SidebarUtilityButton(props: {
  label: string
  icon: typeof SquarePenIcon
  active?: boolean
  onClick?: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex h-10 w-full items-center gap-3 rounded-[12px] px-3.5 text-left transition ${
        props.active
          ? 'bg-[color:var(--color-shell-control)] text-[color:var(--color-shell-primary)]'
          : 'text-[color:var(--color-shell-muted)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
      }`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${
          props.active ? 'text-[color:var(--color-shell-primary)]' : 'text-[color:var(--color-shell-faint)]'
        }`}
      />
      <span className="text-[14px] font-semibold tracking-[-0.018em]">{props.label}</span>
    </button>
  )
}

function HeaderIconButton(props: {
  label: string
  icon: typeof PlusIcon
  onClick?: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      title={props.label}
      className="flex size-8 items-center justify-center rounded-[10px] text-[color:var(--color-shell-faint)] transition hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]"
      onClick={props.onClick}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
    </button>
  )
}

function RailIconButton(props: {
  label: string
  active?: boolean
  icon: typeof SettingsIcon
  onClick?: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      title={props.label}
      onClick={props.onClick}
      className={`relative flex size-10 items-center justify-center rounded-[12px] transition ${
        props.active
          ? 'bg-[color:var(--color-shell-control)] text-[color:var(--color-shell-primary)]'
          : 'text-[color:var(--color-shell-muted)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
      }`}
    >
      {props.active ? (
        <span className="absolute left-1 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-[color:var(--color-shell-primary)]" />
      ) : null}
      <Icon className="h-4 w-4" />
    </button>
  )
}

function FlyoutButton(props: {
  label: string
  icon: typeof SettingsIcon
  disabled?: boolean
  danger?: boolean
  onClick?: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      className={`group flex w-full items-center justify-between rounded-[10px] px-3.5 py-2 text-[12.5px] transition-colors ${
        props.disabled
          ? 'cursor-default text-[color:var(--color-shell-faint)] opacity-80'
          : props.danger
            ? 'text-[color:var(--color-shell-muted)] hover:bg-red-500/10 hover:text-[color:var(--color-shell-primary)]'
            : 'text-[color:var(--color-shell-muted)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
      }`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <div className={`flex items-center gap-2 ${props.danger ? 'group-hover:text-red-400' : ''}`}>
        <Icon className="h-3.5 w-3.5" />
        <span>{props.label}</span>
      </div>
    </button>
  )
}

function AccountFlyout(props: {
  collapsed: boolean
  accounts: SidebarAccount[]
  accountLabel: string
  planLabel: string
  onSelectAccount: (accountId: string) => void
  onAddAccount: () => void
  onOpenSettings: () => void
  onSignOut: () => void
  signOutDisabled: boolean
}) {
  const activeAccount =
    props.accounts.find((account) => account.isActive) || {
      id: 'active',
      label: props.accountLabel,
      planLabel: props.planLabel,
      isActive: true,
    }
  const switchingAccount = props.accounts.find((account) => account.switching)
  const switchableAccounts = props.accounts.filter((account) => account.id !== activeAccount.id)

  return (
    <div
      className={`absolute z-50 rounded-[16px] bg-[color:var(--color-shell-elevated-strong)] py-1.5 shadow-[var(--shadow-shell-elevated)] ${
        props.collapsed ? 'bottom-2 left-full ml-2 w-[206px]' : 'bottom-full left-2.5 mb-2 w-[206px]'
      }`}
    >
      <div className="mb-1 px-3.5 py-2.5">
        <div className="truncate text-[13.5px] font-semibold text-[color:var(--color-shell-primary)]">{activeAccount.label}</div>
        <div className="text-[11.5px] text-[color:var(--color-shell-faint)]">{activeAccount.planLabel}</div>
        {switchingAccount ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-[color:var(--color-shell-text)]">
            <LoadingSpinner size={11} strokeWidth={1.4} />
            <span className="truncate">
              {switchingAccount.id === activeAccount.id
                ? 'Finishing account switch...'
                : `Switching to ${switchingAccount.label}...`}
            </span>
          </div>
        ) : null}
      </div>

      {switchableAccounts.length > 0 ? (
        <div className="mb-1 space-y-1 px-3.5 py-1">
          <div className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-shell-faint)]">
            Switch account
          </div>
          {switchableAccounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[12px] transition ${
                props.signOutDisabled
                  ? 'cursor-not-allowed text-[color:var(--color-shell-faint)]'
                  : 'text-[color:var(--color-shell-text)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
              }`}
              onClick={() => {
                props.onSelectAccount(account.id)
              }}
              disabled={props.signOutDisabled}
            >
              <span className="truncate pr-2">{account.label}</span>
              <span className="shrink-0">
                {account.switching ? (
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-shell-text)]">
                    <LoadingSpinner size={10} strokeWidth={1.35} />
                    <span>Switching...</span>
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-shell-faint)]">
                    {account.planLabel}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <FlyoutButton
        label="Add ChatGPT account"
        icon={PlusIcon}
        disabled={props.signOutDisabled}
        onClick={props.onAddAccount}
      />
      <FlyoutButton
        label="Settings"
        icon={SettingsIcon}
        disabled={props.signOutDisabled}
        onClick={props.onOpenSettings}
      />

      <div className="mx-3.5 my-1.5 h-px bg-[color:var(--color-shell-divider)]" />

      <FlyoutButton
        label="Sign out current"
        icon={LogoutIcon}
        danger
        disabled={props.signOutDisabled}
        onClick={props.onSignOut}
      />
    </div>
  )
}

function MenuSurface(props: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <m.div
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={prefersReducedMotion ? THREAD_MENU_REDUCED_VARIANTS : THREAD_MENU_VARIANTS}
      className="absolute right-0 top-full z-40 mt-1 min-w-[172px] rounded-[14px] bg-[color:var(--color-shell-elevated-strong)] p-1.5 shadow-[var(--shadow-shell-elevated)]"
      style={prefersReducedMotion ? undefined : { transformOrigin: 'top right', willChange: 'opacity, transform' }}
    >
      {props.children}
    </m.div>
  )
}

function MenuButton(props: {
  label: string
  icon: typeof ArchiveIcon
  danger?: boolean
  onClick: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[12.5px] transition ${
        props.danger
          ? 'text-red-200/80 hover:bg-red-500/10 hover:text-red-100'
          : 'text-[color:var(--color-shell-text)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
      }`}
      onClick={props.onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{props.label}</span>
    </button>
  )
}

function CollapsibleBody(props: {
  open: boolean
  children: ReactNode
  className?: string
}) {
  if (!props.open) {
    return null
  }

  return <div className={props.className}>{props.children}</div>
}

function ThreadRowMotion(props: {
  rowKey: string
  index: number
  children: ReactNode
  className?: string
}) {
  return <div className={props.className}>{props.children}</div>
}

function formatRelativeThreadAge(updatedAt: number) {
  const timestamp = updatedAt > 1_000_000_000_000 ? updatedAt : updatedAt * 1000
  const deltaMs = Date.now() - timestamp

  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return 'now'
  }

  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) {
    return 'now'
  }
  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }

  const days = Math.floor(hours / 24)
  if (days < 7) {
    return `${days}d`
  }

  const weeks = Math.floor(days / 7)
  if (weeks < 5) {
    return `${weeks}w`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return `${months}mo`
  }

  return `${Math.floor(days / 365)}y`
}

export function Sidebar(props: SidebarProps) {
  const [projectMenuKey, setProjectMenuKey] = useState<string | null>(null)
  const [threadMenuId, setThreadMenuId] = useState<string | null>(null)
  const [archivedExpanded, setArchivedExpanded] = useState(false)
  const [expandedThreadGroups, setExpandedThreadGroups] = useState<Record<string, boolean>>({})

  const archivedLabel = useMemo(
    () => `${props.archivedThreads.length} ${props.archivedThreads.length === 1 ? 'thread' : 'threads'}`,
    [props.archivedThreads.length],
  )

  const railGroups = useMemo(
    () => props.groups.filter((group) => group.rootPath && group.key !== 'other'),
    [props.groups],
  )

  const visibleGroups = useMemo(
    () => props.groups.filter((group) => group.rootPath || group.threads.length > 0),
    [props.groups],
  )

  const activeProjectRoot =
    props.groups.find((group) => group.active && group.rootPath)?.rootPath ||
    props.groups.find((group) => group.rootPath)?.rootPath ||
    null

  useEffect(() => {
    if (!props.collapsed) {
      return
    }

    setProjectMenuKey(null)
    setThreadMenuId(null)
    setArchivedExpanded(false)
    setExpandedThreadGroups({})
  }, [props.collapsed])

  if (props.collapsed) {
    return (
      <LazyMotion features={domAnimation}>
        <aside className="relative flex h-full w-[72px] shrink-0 flex-col items-center bg-[color:var(--color-shell-panel)] py-3 shadow-[inset_-1px_0_0_rgba(255,255,255,0.035)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-[12px] bg-[color:var(--color-shell-control)]">
              <span className="text-[11px] font-bold leading-none text-[color:var(--color-shell-primary)]">◆</span>
            </div>
            <RailIconButton label="Add project" icon={PlusIcon} onClick={props.onAddProject} />
          </div>

          <div className="shell-scroll-none mt-4 flex flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
            {railGroups.map((group) => (
              <RailIconButton
                key={group.key}
                label={group.label}
                icon={FolderOpenIcon}
                active={group.active}
                onClick={() => group.rootPath && props.onSelectProject(group.rootPath)}
              />
            ))}
          </div>

          <div className="relative mt-3">
            {props.accountMenuOpen ? (
              <AccountFlyout
                collapsed
                accounts={props.accounts}
                accountLabel={props.accountLabel}
                planLabel={props.planLabel}
                onSelectAccount={props.onSelectAccount}
                onAddAccount={props.onAddAccount}
                onOpenSettings={props.onOpenSettings}
                onSignOut={props.onSignOut}
                signOutDisabled={props.signOutDisabled}
              />
            ) : null}

            <RailIconButton label="Settings" icon={SettingsIcon} onClick={props.onToggleAccountMenu} />
          </div>
        </aside>
      </LazyMotion>
    )
  }

  return (
    <LazyMotion features={domAnimation}>
      <aside className="relative flex h-full w-[304px] shrink-0 flex-col bg-[color:var(--color-shell-panel)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.035)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        <div className="space-y-1 px-3 pb-3 pt-4">
          <SidebarUtilityButton
            label="New chat"
            icon={SquarePenIcon}
            onClick={() => props.onNewThread(activeProjectRoot)}
          />
          <SidebarUtilityButton label="Search" icon={SearchIcon} onClick={props.onSearch} />
          <SidebarUtilityButton
            label="Plugins"
            icon={PuzzleIcon}
            active={Boolean(props.activeUtility)}
            onClick={props.onOpenPlugins}
          />
        </div>

      <div className="flex items-center justify-between px-4 pb-2.5 pt-4">
        <span className="text-[12.5px] font-semibold tracking-[0.01em] text-[color:var(--color-shell-faint)]">Threads</span>
        <div className="flex items-center gap-1">
          <HeaderIconButton label="Add project" icon={FolderPlusIcon} onClick={props.onAddProject} />
          <HeaderIconButton
            label="New thread"
            icon={SquarePenIcon}
            onClick={() => props.onNewThread(activeProjectRoot)}
          />
        </div>
      </div>

      <div className="shell-scroll-none flex-1 overflow-y-auto px-3 pb-3">
        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const groupExpanded = group.expanded
            const threadsExpanded = expandedThreadGroups[group.key] ?? false
            const hasOverflow = group.threads.length > THREAD_PREVIEW_LIMIT
            const visibleThreads = threadsExpanded
              ? group.threads
              : group.threads.slice(0, THREAD_PREVIEW_LIMIT)
            const hasThreads = group.threads.length > 0
            const toggleGroup = () => {
              props.onToggleGroup(group.key)
              setProjectMenuKey(null)
              setThreadMenuId(null)
            }

            return (
              <section className="space-y-1" key={group.key}>
                <div className="group relative flex items-center justify-between gap-2 px-1.5">
                  <button
                    type="button"
                    aria-expanded={hasThreads ? groupExpanded : undefined}
                    className={`flex min-w-0 flex-1 items-center justify-between rounded-[10px] px-2 py-1 text-left transition ${
                      group.active
                        ? 'text-[color:var(--color-shell-text)] hover:bg-[color:var(--color-shell-control)]'
                        : 'text-[color:var(--color-shell-muted)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-text)]'
                    }`}
                    onClick={() => {
                      if (hasThreads) {
                        toggleGroup()
                        return
                      }
                      if (group.rootPath) {
                        props.onSelectProject(group.rootPath)
                      }
                    }}
                    title={
                      hasThreads
                        ? `${groupExpanded ? 'Collapse' : 'Expand'} ${group.label}`
                        : group.rootPath || group.label
                    }
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      {hasThreads ? (
                        <ChevronIcon direction={groupExpanded ? 'down' : 'right'} className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[color:var(--color-shell-faint)]" aria-hidden="true">
                          <FolderGitIcon className="h-3.25 w-3.25 shrink-0" />
                        </span>
                      )}
                      <span className="min-w-0 truncate text-[13.5px] font-medium tracking-[-0.018em]">
                        {group.label}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium tracking-[-0.01em] text-[color:var(--color-shell-faint)]">
                      {group.threads.length}
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {group.rootPath ? (
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded-[8px] p-1 text-[color:var(--color-shell-faint)] transition hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-text)]"
                          onClick={(event) => {
                            event.stopPropagation()
                            props.onNewThread(group.rootPath)
                          }}
                          title="New thread"
                        >
                          <PlusIcon className="h-3.25 w-3.25" />
                        </button>
                        <button
                          type="button"
                          className="rounded-[8px] p-1 text-[color:var(--color-shell-faint)] transition hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-text)]"
                          onClick={(event) => {
                            event.stopPropagation()
                            setProjectMenuKey((current) => (current === group.key ? null : group.key))
                            setThreadMenuId(null)
                          }}
                          title="Project options"
                        >
                          <MoreIcon className="h-3.25 w-3.25" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <AnimatePresence initial={false}>
                    {projectMenuKey === group.key && group.rootPath ? (
                      <MenuSurface>
                        <MenuButton
                          label="Open project"
                          icon={FolderGitIcon}
                          onClick={() => {
                            props.onSelectProject(group.rootPath!)
                            setProjectMenuKey(null)
                          }}
                        />
                        <MenuButton
                          label="New thread here"
                          icon={FolderOpenIcon}
                          onClick={() => {
                            props.onNewThread(group.rootPath)
                            setProjectMenuKey(null)
                          }}
                        />
                        <MenuButton
                          label="Rename project"
                          icon={SettingsIcon}
                          onClick={() => {
                            const nextLabel = window.prompt('Project name', group.label)
                            if (nextLabel !== null) {
                              props.onRenameProject(group.rootPath!, nextLabel)
                            }
                            setProjectMenuKey(null)
                          }}
                        />
                        <MenuButton
                          label="Remove grouping"
                          icon={TrashIcon}
                          danger
                          onClick={() => {
                            props.onRemoveProject(group.rootPath!)
                            setProjectMenuKey(null)
                          }}
                        />
                      </MenuSurface>
                    ) : null}
                  </AnimatePresence>
                </div>

                {hasThreads ? (
                  <CollapsibleBody open={groupExpanded} className="pl-4.5 pt-0.5">
                    <div className="space-y-1">
                      {visibleThreads.map((thread, index) => (
                        <ThreadRowMotion rowKey={thread.id} index={index} className="group/row relative" key={thread.id}>
                          <button
                            type="button"
                            className={`flex min-h-[32px] w-full items-center gap-2.5 rounded-[12px] px-3.5 py-1.5 text-left transition-[background-color,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              thread.active
                                ? 'bg-[color:var(--color-shell-control)] text-[color:var(--color-shell-primary)]'
                                : 'text-[color:var(--color-shell-text)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)]'
                            }`}
                            onClick={() => props.onSelectThread(thread.id)}
                            title={
                              thread.accountTag
                                ? `${thread.label} · ${thread.accountTag}`
                                : thread.label
                            }
                          >
                            <span className="min-w-0 flex-1 truncate pr-12 text-[13.5px] font-medium tracking-[-0.018em]">
                              {thread.label}
                            </span>
                            <span
                              className={`shrink-0 text-[11.5px] font-medium tracking-[-0.012em] transition-opacity duration-150 group-hover/row:opacity-0 ${
                                thread.active
                                  ? 'text-[color:var(--color-shell-muted)]'
                                  : 'text-[color:var(--color-shell-faint)]'
                              }`}
                            >
                              {formatRelativeThreadAge(thread.updatedAt)}
                            </span>
                          </button>

                          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                            <button
                              type="button"
                              className="pointer-events-auto rounded-[8px] p-1 text-[color:var(--color-shell-faint)] opacity-0 transition hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)] group-hover/row:opacity-100"
                              onClick={(event) => {
                                event.stopPropagation()
                                setThreadMenuId((current) => (current === thread.id ? null : thread.id))
                                setProjectMenuKey(null)
                              }}
                              title="Thread options"
                            >
                              <MoreIcon className="h-3.25 w-3.25" />
                            </button>
                          </div>

                          <AnimatePresence initial={false}>
                            {threadMenuId === thread.id ? (
                              <MenuSurface>
                                <MenuButton
                                  label="Archive thread"
                                  icon={ArchiveIcon}
                                  onClick={() => {
                                    props.onArchiveThread(thread.id)
                                    setThreadMenuId(null)
                                  }}
                                />
                              </MenuSurface>
                            ) : null}
                          </AnimatePresence>
                        </ThreadRowMotion>
                      ))}

                      {hasOverflow ? (
                        <button
                          type="button"
                          className="px-3.5 py-0.5 text-[13px] font-medium tracking-[-0.018em] text-[color:var(--color-shell-muted)] transition hover:text-[color:var(--color-shell-text)]"
                          onClick={() =>
                            setExpandedThreadGroups((current) => ({
                              ...current,
                              [group.key]: !threadsExpanded,
                            }))
                          }
                        >
                          {threadsExpanded ? 'Show less' : 'Show more'}
                        </button>
                      ) : null}
                    </div>
                  </CollapsibleBody>
                ) : null}
              </section>
            )
          })}

          {props.archivedThreads.length > 0 ? (
            <section className="space-y-1.5 pt-1">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-[10px] px-2 py-1 text-left text-[color:var(--color-shell-muted)] transition hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-text)]"
                onClick={() => setArchivedExpanded((value) => !value)}
              >
                <div className="flex items-center gap-1.5">
                  <ChevronIcon direction={archivedExpanded ? 'down' : 'right'} className="h-3.5 w-3.5" />
                  <span className="text-[13.5px] font-medium tracking-[-0.018em]">Archived</span>
                </div>
                <span className="text-[11px] font-medium tracking-[-0.01em] text-[color:var(--color-shell-faint)]">
                  {archivedLabel}
                </span>
              </button>

              <CollapsibleBody open={archivedExpanded} className="pl-4.5 pt-0.5">
                <div className="space-y-1">
                  {props.archivedThreads.map((thread, index) => (
                    <ThreadRowMotion rowKey={thread.id} index={index} className="group/row relative" key={thread.id}>
                      <div className="flex min-h-[32px] items-center gap-2.5 rounded-[12px] px-3.5 py-1.5 text-[color:var(--color-shell-muted)] transition-[background-color,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-text)]">
                        <span className="min-w-0 flex-1 truncate pr-12 text-[13.5px] font-medium tracking-[-0.018em]">
                          {thread.label}
                        </span>
                        <span className="shrink-0 text-[11.5px] font-medium tracking-[-0.012em] text-[color:var(--color-shell-faint)] transition-opacity duration-150 group-hover/row:opacity-0">
                          {formatRelativeThreadAge(thread.updatedAt)}
                        </span>
                      </div>

                      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                        <button
                          type="button"
                          className="pointer-events-auto rounded-[8px] p-1 text-[color:var(--color-shell-faint)] opacity-0 transition hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-primary)] group-hover/row:opacity-100"
                          onClick={() => props.onUnarchiveThread(thread.id)}
                          title="Restore thread"
                        >
                          <UndoIcon className="h-3.25 w-3.25" />
                        </button>
                      </div>
                    </ThreadRowMotion>
                  ))}
                </div>
              </CollapsibleBody>
            </section>
          ) : null}
        </div>
      </div>

        <div className="relative p-3.5 pt-2.5">
          {props.accountMenuOpen ? (
            <AccountFlyout
              collapsed={false}
              accounts={props.accounts}
              accountLabel={props.accountLabel}
              planLabel={props.planLabel}
              onSelectAccount={props.onSelectAccount}
              onAddAccount={props.onAddAccount}
              onOpenSettings={props.onOpenSettings}
              onSignOut={props.onSignOut}
              signOutDisabled={props.signOutDisabled}
            />
          ) : null}

          <button
            type="button"
            onClick={props.onToggleAccountMenu}
            className="flex h-10 w-full items-center justify-between rounded-[12px] px-3.5 text-[color:var(--color-shell-muted)] transition-colors hover:bg-[color:var(--color-shell-control)] hover:text-[color:var(--color-shell-text)]"
          >
            <div className="flex items-center gap-2.5">
              <SettingsIcon className="h-3.5 w-3.5" />
              <span className="text-[14px] font-medium">Settings</span>
            </div>
          </button>
        </div>
      </aside>
    </LazyMotion>
  )
}
