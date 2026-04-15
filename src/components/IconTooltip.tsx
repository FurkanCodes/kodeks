type IconTooltipProps = {
  label: string
  placement?: 'top' | 'bottom'
}

export function IconTooltip(props: IconTooltipProps) {
  const placementClass =
    props.placement === 'top'
      ? 'bottom-full mb-2 -translate-x-1/2'
      : 'top-full mt-2 -translate-x-1/2'

  return (
    <span
      className={`pointer-events-none absolute left-1/2 z-[120] whitespace-nowrap rounded-[8px] border border-white/12 bg-[#0b0d11] px-2 py-1 text-[11px] font-medium tracking-[-0.01em] text-neutral-200 opacity-0 shadow-[0_8px_26px_rgba(0,0,0,0.35)] transition group-hover:opacity-100 group-focus-visible:opacity-100 ${placementClass}`}
    >
      {props.label}
    </span>
  )
}
