import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

/**
 * Stamp — the completion stamp chip (STYLE.md §7.3), e.g. `COMPLETED · 12 JUL`.
 * Plex Mono 10.5px 500 +0.1em uppercase, primary on primary-tint, 1px primary
 * border (canvas `.stamp`). `animate` runs the one permitted celebration:
 * a single 200ms fade/settle on mount — gated behind
 * prefers-reduced-motion: no-preference so reduced motion is instant even
 * without the app-level global. Server-compatible (CSS-only animation).
 */
export type StampProps = {
  animate?: boolean
  className?: string
  children: ReactNode
}

const STAMP_CSS =
  '@media (prefers-reduced-motion: no-preference){.eph-stamp-anim{animation:eph-stamp-in 200ms cubic-bezier(0.2,0.6,0.2,1) both}}@keyframes eph-stamp-in{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}'

export function Stamp({ animate = false, className, children }: StampProps) {
  return (
    <span
      className={cx(
        'inline-block whitespace-nowrap border border-primary bg-primary-tint px-2 py-0.75 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-primary',
        animate && 'eph-stamp-anim',
        className,
      )}
    >
      {animate ? <style>{STAMP_CSS}</style> : null}
      {children}
    </span>
  )
}
