import {
  CloseIcon,
  CreditCardIcon,
  CubeIcon,
  DatabaseIcon,
  GaugeIcon,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  SparkleIcon,
  TerminalIcon,
  UserIcon,
} from './icons'
import { LoadingSpinner } from './LoadingSpinner'

export type SettingsSectionKey =
  | 'general'
  | 'appearance'
  | 'models'
  | 'editor'
  | 'terminal'
  | 'features'
  | 'database'
  | 'account'
  | 'billing'

export type SettingsRow =
  | {
      kind: 'text'
      label: string
      description: string
      value: string
      inputType?: 'text' | 'email' | 'password'
      placeholder?: string
      disabled?: boolean
      onInput?: (value: string) => void
    }
  | {
      kind: 'toggle'
      label: string
      description: string
      enabled: boolean
      onToggle?: () => void
    }
  | {
      kind: 'select'
      label: string
      description: string
      value: string
      options: { label: string; value: string }[]
      onSelect?: (value: string) => void
    }
  | {
      kind: 'swatches'
      label: string
      description: string
      colors: string[]
      selected?: string
      onSelect?: (value: string) => void
    }
  | {
      kind: 'accounts'
      label: string
      description: string
      accounts: {
        id: string
        label: string
        planLabel: string
        stateLabel: string
        isActive: boolean
        manageable: boolean
        lastUsedLabel?: string | null
        switching?: boolean
        actionsDisabled?: boolean
      }[]
      emptyMessage: string
      loginInProgress: boolean
      switchInProgress: boolean
      switchingAccountLabel?: string | null
      authNotice?: string | null
      authUrl?: string | null
      authCode?: string | null
      loginError?: string | null
      onAddChatgptAccount?: () => void
      onOpenAuthUrl?: (url: string) => void
      onSelectAccount?: (accountId: string) => void
      onDisconnectAccount?: (accountId: string) => void
    }
  | {
      kind: 'rateLimits'
      label: string
      description: string
      planLabel?: string
      composerVisible: boolean
      onToggleComposerVisible?: () => void
      buckets: {
        key: string
        label: string
        primary: string
        secondary: string
        tone: 'calm' | 'warning' | 'muted'
      }[]
      emptyMessage: string
    }

export type SettingsGroup = {
  title: string
  rows: SettingsRow[]
}

export type SettingsSection = {
  key: SettingsSectionKey
  label: string
  groups?: SettingsGroup[]
  emptyMessage?: string
  actionLabel?: string
  actionTone?: 'danger'
  onAction?: () => void
}

type SettingsModalProps = {
  open: boolean
  search: string
  activeSection: SettingsSectionKey
  sections: SettingsSection[]
  onClose: () => void
  onSearchChange: (value: string) => void
  onSectionChange: (section: SettingsSectionKey) => void
}

function sectionIcon(key: SettingsSectionKey) {
  switch (key) {
    case 'appearance':
      return PaletteIcon
    case 'models':
      return SparkleIcon
    case 'editor':
      return CubeIcon
    case 'terminal':
      return TerminalIcon
    case 'features':
      return SparkleIcon
    case 'database':
      return DatabaseIcon
    case 'account':
      return UserIcon
    case 'billing':
      return CreditCardIcon
    default:
      return SettingsIcon
  }
}

function Toggle(props: { checked?: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onToggle?.()}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        props.checked ? 'bg-white' : 'bg-neutral-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full shadow transition duration-200 ease-in-out ${
          props.checked ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white'
        }`}
      />
    </button>
  )
}

function rateLimitToneDotClass(tone: 'calm' | 'warning' | 'muted') {
  switch (tone) {
    case 'warning':
      return 'bg-amber-200'
    case 'calm':
      return 'bg-sky-200'
    default:
      return 'bg-white/40'
  }
}

function SettingRowView(props: { row: SettingsRow }) {
  const row = props.row

  if (row.kind === 'accounts') {
    return (
      <section className="overflow-hidden rounded-[16px] border border-white/5 bg-[color:var(--color-shell-elevated)]">
        <div className="px-4 py-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
            {row.label}
          </div>
          <div className="mb-3 text-[12px] leading-relaxed text-neutral-400">{row.description}</div>
          {row.accounts.length > 0 ? (
            <div className="divide-y divide-white/5">
              {row.accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium tracking-[-0.012em] text-neutral-200">
                      {account.label}
                    </div>
                    <div className="truncate text-[11.5px] text-neutral-500">
                      {account.planLabel}
                      {account.stateLabel ? ` • ${account.stateLabel}` : ''}
                      {account.lastUsedLabel ? ` • ${account.lastUsedLabel}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {account.switching ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-neutral-300">
                        <LoadingSpinner size={11} strokeWidth={1.35} />
                        <span>Switching...</span>
                      </span>
                    ) : account.isActive ? (
                      <span className="text-[10px] uppercase tracking-[0.08em] text-neutral-400">
                        Current
                      </span>
                    ) : account.manageable ? (
                      <button
                        type="button"
                        className={`rounded-[6px] border px-2 py-1 text-[11px] transition ${
                          account.actionsDisabled
                            ? 'cursor-not-allowed border-white/8 text-neutral-500'
                            : 'border-white/10 text-neutral-300 hover:border-white/20 hover:text-white'
                        }`}
                        onClick={() => {
                          console.info('[kodeks-account-ui] settings switch click', {
                            requestedAccountId: account.id,
                            label: account.label,
                          })
                          row.onSelectAccount?.(account.id)
                        }}
                        disabled={account.actionsDisabled}
                      >
                        {account.switching ? 'Switching...' : 'Switch'}
                      </button>
                    ) : null}
                    {account.manageable ? (
                      <button
                        type="button"
                        className={`rounded-[6px] border px-2 py-1 text-[11px] transition ${
                          account.actionsDisabled
                            ? 'cursor-not-allowed border-white/8 text-neutral-500'
                            : 'border-red-300/20 text-red-200/80 hover:bg-red-500/10 hover:text-red-100'
                        }`}
                        onClick={() => row.onDisconnectAccount?.(account.id)}
                        disabled={account.actionsDisabled}
                      >
                        Disconnect
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-neutral-400">{row.emptyMessage}</div>
          )}
        </div>

        <div className="border-t border-white/5 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-[6px] border px-2.5 py-1 text-[11px] font-medium transition ${
                row.loginInProgress || row.switchInProgress
                  ? 'cursor-not-allowed border-white/8 text-neutral-500'
                  : 'border-white/10 text-neutral-300 hover:border-white/20 hover:text-white'
              }`}
              onClick={() => row.onAddChatgptAccount?.()}
              disabled={row.loginInProgress || row.switchInProgress}
            >
              {row.switchInProgress
                ? (
                    <span className="inline-flex items-center gap-1.5">
                      <LoadingSpinner size={12} strokeWidth={1.4} />
                      <span>Switching to {row.switchingAccountLabel || 'account'}...</span>
                    </span>
                  )
                : row.loginInProgress
                  ? 'Adding account...'
                  : 'Add ChatGPT account'}
            </button>
          </div>

          {row.authNotice ? (
            <div className="mt-2 rounded-[10px] bg-white/[0.03] px-3 py-2 text-[11.5px] leading-relaxed text-neutral-400">
              {row.authNotice}
            </div>
          ) : null}
          {row.authCode ? (
            <div className="mt-2 rounded-[10px] bg-white/[0.03] px-3 py-2 text-[11.5px] text-neutral-300">
              Code: <span className="shell-menlo">{row.authCode}</span>
            </div>
          ) : null}
          {row.authUrl ? (
            <button
              type="button"
              className="mt-2 inline-flex text-[11.5px] text-neutral-400 underline-offset-2 transition hover:text-neutral-200 hover:underline"
              onClick={() => row.onOpenAuthUrl?.(row.authUrl!)}
            >
              Open sign-in link
            </button>
          ) : null}
          {row.loginError ? (
            <div className="mt-2 rounded-[10px] bg-red-500/8 px-3 py-2 text-[11.5px] text-red-200/90">
              {row.loginError}
            </div>
          ) : null}
        </div>
      </section>
    )
  }

  if (row.kind === 'rateLimits') {
    return (
      <section className="overflow-hidden rounded-[16px] border border-white/5 bg-[color:var(--color-shell-elevated)]">
        <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GaugeIcon className="h-3.5 w-3.5 text-neutral-400" />
              <div className="text-[13px] font-medium text-[color:var(--color-shell-primary)]">{row.label}</div>
              {row.planLabel ? (
                <span className="rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                  {row.planLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 text-[12px] leading-relaxed text-neutral-400">{row.description}</div>
          </div>

          <div className="flex items-center gap-3 md:pl-4">
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Composer</div>
              <div className="text-[11.5px] text-neutral-400">Show beside permissions</div>
            </div>
            <Toggle checked={row.composerVisible} onToggle={row.onToggleComposerVisible} />
          </div>
        </div>

        <div className="border-t border-white/5">
          {row.buckets.length > 0 ? (
            <div className="divide-y divide-white/5">
              {row.buckets.map((bucket) => (
                <div key={bucket.key} className="px-4 py-3.25">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`size-2 rounded-full ${rateLimitToneDotClass(bucket.tone)}`} />
                        <div className="truncate text-[13px] font-medium text-neutral-200">{bucket.label}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[14px] font-semibold tracking-[-0.015em] text-neutral-100">
                        {bucket.primary}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-4 text-[13px] leading-relaxed text-neutral-400">{row.emptyMessage}</div>
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="flex items-start justify-between border-b border-white/5 py-3 last:border-0">
      <div className="pr-6">
        <div className="mb-0.5 text-[14px] font-medium text-neutral-200">{row.label}</div>
        <div className="sr-only">{row.description}</div>
      </div>

      <div className="flex h-10 shrink-0 items-center">
        {row.kind === 'toggle' ? (
          <Toggle checked={row.enabled} onToggle={row.onToggle} />
        ) : null}

        {row.kind === 'text' ? (
          <input
            type={row.inputType ?? 'text'}
            value={row.value}
            placeholder={row.placeholder}
            disabled={row.disabled}
            onChange={(event) => row.onInput?.(event.currentTarget.value)}
            className={`w-64 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white outline-none focus:border-white/20 ${
              row.disabled ? 'cursor-not-allowed text-neutral-500 opacity-60' : ''
            }`}
          />
        ) : null}

        {row.kind === 'select' ? (
          <select
            value={row.value}
            onChange={(event) => row.onSelect?.(event.currentTarget.value)}
            className="w-64 cursor-pointer rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white outline-none focus:border-white/20"
          >
            {row.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        {row.kind === 'swatches' ? (
          <div className="flex items-center gap-2">
            {row.colors.map((color) => (
              <button
                type="button"
                key={color}
                className="size-5 rounded-full border border-white/10 shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
                onClick={() => row.onSelect?.(color)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function SettingsModal(props: SettingsModalProps) {
  const filteredSections = props.search.trim()
    ? props.sections.filter((section) =>
        section.label.toLowerCase().includes(props.search.trim().toLowerCase()),
      )
    : props.sections

  const activeSection =
    props.sections.find((section) => section.key === props.activeSection) ?? props.sections[0]

  if (!props.open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-[75vh] w-full max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex w-[240px] shrink-0 flex-col border-r border-white/5 bg-[#0a0a0a]">
          <div className="p-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                autoFocus
                value={props.search}
                placeholder="Search settings..."
                onChange={(event) => props.onSearchChange(event.currentTarget.value)}
                className="w-full rounded-lg border border-white/5 bg-white/5 py-1.5 pl-9 pr-3 text-[13px] text-neutral-200 outline-none transition-colors placeholder:text-neutral-500 focus:border-white/20"
              />
            </div>
          </div>

          <div className="shell-scroll-none flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            {filteredSections.map((section) => {
              const Icon = sectionIcon(section.key)
              const isActive = props.activeSection === section.key

              return (
                <button
                  type="button"
                  key={section.key}
                  onClick={() => props.onSectionChange(section.key)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-[#0a0a0a]">
          <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-8 py-5">
            <h2 className="text-lg font-medium tracking-tight text-white">{activeSection?.label}</h2>
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="shell-scroll-none flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl">
              {(activeSection?.groups?.length ?? 0) > 0 ? (
                <div className="space-y-8">
                  {(activeSection?.groups ?? []).map((group) => (
                    <section key={group.title}>
                      <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-neutral-200">
                        {group.title}
                      </h3>
                      <div className="space-y-1">
                        {group.rows.map((row, index) => (
                          <SettingRowView key={`${group.title}-${index}-${row.label}`} row={row} />
                        ))}
                      </div>
                    </section>
                  ))}

                  {activeSection?.actionLabel ? (
                    <div className="border-t border-white/5 pt-4">
                      <button
                        type="button"
                        onClick={() => activeSection.onAction?.()}
                        className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
                          activeSection.actionTone === 'danger'
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        {activeSection.actionLabel}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-neutral-500">
                  {activeSection?.emptyMessage ?? 'Settings for this section are coming soon.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
