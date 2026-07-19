import type { ReactNode } from 'react'

/**
 * Lot-code chip (STYLE §11 · canvas .chip): 24px mono, 1px border, square,
 * uppercase. Not an @epharmatica/ui primitive — owned by the marketing
 * surface. The warn variant carries its status in the border/fill alpha on
 * the warn token while the text stays ink — text-warn on the tinted fill is
 * only 4.14:1 in light theme, below the §15 AA floor for 11px text.
 */
const VARIANT_CLASSES = {
  line: 'border-line bg-surface text-ink-2',
  ink: 'border-ink bg-surface text-ink',
  warn: 'border-warn/40 bg-warn/10 text-ink',
} as const

export function Chip({
  variant = 'line',
  className,
  children,
}: {
  variant?: keyof typeof VARIANT_CLASSES
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap border px-[9px] py-1 font-mono text-[11px] uppercase leading-[14px] tracking-[.05em] ${VARIANT_CLASSES[variant]} ${className ?? ''}`}
    >
      {children}
    </span>
  )
}
