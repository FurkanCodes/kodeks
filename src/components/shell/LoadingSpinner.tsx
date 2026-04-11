import type { CSSProperties } from 'react'

type LoadingSpinnerProps = {
  className?: string
  size?: number
  strokeWidth?: number
}

export function LoadingSpinner({
  className,
  size = 14,
  strokeWidth = 1.5,
}: LoadingSpinnerProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderWidth: strokeWidth,
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderTopColor: 'rgba(229, 229, 229, 0.78)',
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full animate-spin motion-reduce:animate-none ${className ?? ''}`.trim()}
      style={style}
    />
  )
}
