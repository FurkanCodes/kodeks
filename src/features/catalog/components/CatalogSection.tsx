import type { KeyboardEvent, ReactNode } from 'react'
import type { CatalogSectionView } from '../selectors'

type CatalogSectionProps<T> = {
  section: CatalogSectionView<T>
  renderCard: (item: T) => ReactNode
}

export function CatalogSection<T>(props: CatalogSectionProps<T>) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[color:var(--color-shell-primary)]">
          {props.section.label}
        </h2>
        <div className="h-px flex-1 bg-white/5" />
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {props.section.items.map((item) => props.renderCard(item))}
      </div>
    </section>
  )
}

export function CatalogPanelState(props: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[20px] border border-dashed border-white/8 bg-white/[0.02] px-6 text-center">
      <div className="text-[16px] font-medium tracking-[-0.02em] text-[color:var(--color-shell-primary)]">
        {props.title}
      </div>
      <div className="mt-2 max-w-md text-[13px] leading-6 text-[color:var(--color-shell-muted)]">
        {props.description}
      </div>
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </div>
  )
}

export function cardKeyboardHandler(
  event: KeyboardEvent<HTMLButtonElement>,
  onOpen: () => void,
  onMoveFocus: (key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') => void,
) {
  if (
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown'
  ) {
    event.preventDefault()
    onMoveFocus(event.key)
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen()
  }
}
