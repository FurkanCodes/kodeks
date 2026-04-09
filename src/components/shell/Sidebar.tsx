import { type ReactNode, useMemo, useState } from 'react'
import type { SidebarGroup, SidebarThread } from '../../lib/shellState'
import {
  ArchiveIcon,
  ChevronIcon,
  FolderOpenIcon,
  LogoutIcon,
  MoreIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
  UndoIcon,
} from './icons'

export type { SidebarGroup, SidebarThread } from '../../lib/shellState'

type SidebarProps = {
  groups: SidebarGroup[]
  archivedThreads: SidebarThread[]
  accountMenuOpen: boolean
  accountLabel: string
  planLabel: string
  onAddProject: () => void
  onNewThread: (rootPath?: string | null) => void
  onSelectProject: (rootPath: string) => void
  onSelectThread: (threadId: string) => void
  onArchiveThread: (threadId: string) => void
  onUnarchiveThread: (threadId: string) => void
  onRenameProject: (rootPath: string, label: string) => void
  onRemoveProject: (rootPath: string) => void
  onToggleGroup: (groupKey: string) => void
  onToggleAccountMenu: () => void
  onOpenSettings: () => void
  onSignOut: () => void
  signOutDisabled: boolean
}

function SidebarActionButton(props: {
  label: string
  active?: boolean
  disabled?: boolean
  icon: typeof PlusIcon
  onClick?: () => void
}) {
  const Icon = props.icon

  return (
    <button
      type="button"
      className={`group flex h-[34px] w-full items-center gap-2.5 rounded-[9px] px-3 text-left transition-colors ${
        props.active
          ? 'text-neutral-300'
          : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
      } ${props.disabled ? 'cursor-default opacity-85' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[13px] font-medium tracking-[-0.02em]">{props.label}</span>
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
      className={`group flex w-full items-center justify-between px-3 py-1.5 text-[12px] transition-colors ${
        props.disabled
          ? 'cursor-default text-neutral-400 opacity-80'
          : props.danger
            ? 'text-neutral-400 hover:bg-red-500/10 hover:text-white'
            : 'text-neutral-400 hover:bg-white/5 hover:text-white'
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
  accountLabel: string
  planLabel: string
  onOpenSettings: () => void
  onSignOut: () => void
  signOutDisabled: boolean
}) {
  return (
    <div className="absolute bottom-full left-2.5 z-50 mb-2 w-[206px] rounded-[13px] border border-white/5 bg-[#18181b] py-1 shadow-2xl">
        <div className="mb-1 border-b border-white/5 px-3 py-2">
          <div className="truncate text-[13px] font-medium text-neutral-200">{props.accountLabel}</div>
          <div className="text-[11.5px] text-neutral-500">{props.planLabel}</div>
      </div>

      <FlyoutButton label="Settings" icon={SettingsIcon} onClick={props.onOpenSettings} />

      <div className="mx-2 my-1.5 h-px bg-white/5" />

      <FlyoutButton
        label="Sign Out"
        icon={LogoutIcon}
        danger
        disabled={props.signOutDisabled}
        onClick={props.onSignOut}
      />
    </div>
  )
}

function MenuSurface(props: { children: ReactNode }) {
  return (
    <div className="absolute right-0 top-full z-40 mt-1 min-w-[164px] rounded-[11px] border border-white/5 bg-[#18181b] p-1 shadow-2xl">
      {props.children}
    </div>
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
      className={`flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[11.5px] transition ${
        props.danger
          ? 'text-red-200/80 hover:bg-red-500/10 hover:text-red-100'
          : 'text-neutral-300 hover:bg-white/5 hover:text-white'
      }`}
      onClick={props.onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{props.label}</span>
    </button>
  )
}

export function Sidebar(props: SidebarProps) {
  const [projectMenuKey, setProjectMenuKey] = useState<string | null>(null)
  const [threadMenuId, setThreadMenuId] = useState<string | null>(null)
  const [archivedExpanded, setArchivedExpanded] = useState(false)

  const archivedLabel = useMemo(
    () => `${props.archivedThreads.length} ${props.archivedThreads.length === 1 ? 'thread' : 'threads'}`,
    [props.archivedThreads.length],
  )

  return (
    <aside className="relative flex h-full w-[286px] shrink-0 flex-col border-r border-white/[0.04] bg-[#101012] font-sans">
      <div className="flex h-[54px] shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-[18px] items-center justify-center rounded-[7px] bg-white shadow-[0_0_12px_rgba(255,255,255,0.15)]">
          <span className="text-[10px] font-bold leading-none text-black">◆</span>
        </div>
          <span className="text-[15px] font-medium tracking-[-0.02em] text-neutral-200">Agent</span>
        </div>
        <div className="rounded border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-300">
          BETA
        </div>
      </div>

      <div className="space-y-1 px-3.5 pb-1 pt-2.5">
        <SidebarActionButton label="Add project" icon={PlusIcon} onClick={props.onAddProject} />
      </div>

      <div className="px-3.5 pb-1.5 pt-3.5">
        <span className="text-[11.5px] font-medium tracking-[0.08em] text-neutral-500">
          Projects
        </span>
      </div>

      <div className="shell-scroll-none flex-1 overflow-y-auto px-2.5 pb-3.5">
        <div className="space-y-1">
          {props.groups.map((group) => (
            <div className="space-y-0.5" key={group.key}>
              <div
                className={`group relative flex min-h-[30px] w-full items-center justify-between rounded-[9px] px-2.5 py-0 text-left transition-colors ${
                  group.active
                    ? 'bg-white/8 text-neutral-200'
                    : 'text-neutral-400 hover:bg-white/5'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5 py-1">
                  <button
                    type="button"
                    className={`rounded p-0.5 transition-colors ${
                      group.active ? 'text-neutral-300' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                    onClick={() => props.onToggleGroup(group.key)}
                    title={group.expanded ? 'Collapse project' : 'Expand project'}
                  >
                    <ChevronIcon
                      direction={group.expanded ? 'down' : 'right'}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                  </button>
                  {group.rootPath ? (
                    <button
                      type="button"
                      className={`min-w-0 flex-1 text-left ${
                        group.active ? 'text-neutral-100' : 'text-neutral-300 group-hover:text-neutral-200'
                      }`}
                      onClick={() => props.onSelectProject(group.rootPath!)}
                    >
                      <span className="block truncate text-[13px] font-medium tracking-[-0.015em]">
                        {group.label}
                      </span>
                    </button>
                  ) : (
                    <span className="truncate text-[13px] font-medium tracking-[-0.015em] text-neutral-300">
                      {group.label}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {group.rootPath ? (
                    <button
                      type="button"
                      className="rounded p-0.75 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        props.onNewThread(group.rootPath)
                      }}
                      title="New thread"
                    >
                      <PlusIcon className="h-3.25 w-3.25" />
                    </button>
                  ) : null}
                  {group.rootPath ? (
                    <button
                      type="button"
                      className="rounded p-0.75 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        setProjectMenuKey((current) => (current === group.key ? null : group.key))
                        setThreadMenuId(null)
                      }}
                      title="Project options"
                    >
                      <MoreIcon className="h-3.25 w-3.25" />
                    </button>
                  ) : null}
                </div>

                {projectMenuKey === group.key && group.rootPath ? (
                  <MenuSurface>
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
              </div>

              {group.expanded ? (
                <div className="mt-0.5 space-y-0.5 pl-4.5 pr-1">
                  {group.threads.map((thread) => (
                    <div
                      className={`group relative flex min-h-[34px] w-full cursor-pointer items-center justify-between rounded-[10px] px-3 py-0.5 text-left transition-colors ${
                        thread.active
                          ? 'bg-white/9 font-medium text-white'
                          : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                      }`}
                      key={thread.id}
                      onClick={() => props.onSelectThread(thread.id)}
                    >
                      <span className="min-w-0 flex-1 truncate py-0.5 pr-2 text-[13px] tracking-[-0.02em]">
                        {thread.label}
                      </span>

                      <div className="flex h-4.5 shrink-0 items-center">
                        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            className="rounded p-0.75 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
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

                        {thread.active ? (
                        <div className="ml-1 text-[12px] font-medium text-neutral-500 group-hover:hidden">•</div>
                        ) : null}
                      </div>

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
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {props.archivedThreads.length > 0 ? (
            <div className="space-y-0.5">
              <button
                type="button"
                className="flex min-h-[30px] w-full items-center justify-between rounded-[9px] px-2.5 py-0.5 text-left text-neutral-400 transition hover:bg-white/5 hover:text-neutral-200"
                onClick={() => setArchivedExpanded((value) => !value)}
              >
                <div className="flex items-center gap-2">
                  <ChevronIcon direction={archivedExpanded ? 'down' : 'right'} className="h-3.5 w-3.5" />
                  <span className="text-[13px] font-medium tracking-[-0.015em] text-neutral-300">Archived</span>
                </div>
                <span className="text-[11px] text-neutral-500">{archivedLabel}</span>
              </button>

              {archivedExpanded ? (
                <div className="space-y-0.5 pl-4.5 pr-1">
                  {props.archivedThreads.map((thread) => (
                    <div
                      className="group flex min-h-[33px] items-center justify-between rounded-[9px] px-3 py-0.5 text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
                      key={thread.id}
                    >
                      <span className="min-w-0 flex-1 truncate py-0.5 pr-2 text-[13px]">{thread.label}</span>
                      <button
                        type="button"
                        className="rounded p-0.75 text-neutral-400 transition hover:bg-white/10 hover:text-white"
                        onClick={() => props.onUnarchiveThread(thread.id)}
                        title="Restore thread"
                      >
                        <UndoIcon className="h-3.25 w-3.25" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative p-3.5 pt-2.5">
        {props.accountMenuOpen ? (
          <AccountFlyout
            accountLabel={props.accountLabel}
            planLabel={props.planLabel}
            onOpenSettings={props.onOpenSettings}
            onSignOut={props.onSignOut}
            signOutDisabled={props.signOutDisabled}
          />
        ) : null}

        <button
          type="button"
          onClick={props.onToggleAccountMenu}
          className="flex h-[34px] w-full items-center justify-between rounded-[9px] px-3 text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
        >
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="h-3.5 w-3.5" />
            <span className="text-[13px]">Settings</span>
          </div>
        </button>
      </div>
    </aside>
  )
}
