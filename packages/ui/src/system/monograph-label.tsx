import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

/**
 * MonographLabel — the signature (STYLE.md §1.1).
 * IBM Plex Mono · 500 · UPPERCASE · +0.12em; md = 11px, sm = 10px.
 * `rule='hard'` draws the 1px hard ink rule under the label and lifts the
 * label color to ink (canvas `.mlabel.hard`); the default label is ink-2
 * (canvas `.mlabel`). Server-compatible.
 */
export type MonographLabelProps = {
  size?: 'md' | 'sm'
  rule?: 'hard' | 'none'
  as?: 'span' | 'div' | 'h2' | 'h3' | 'label'
  className?: string
  children: ReactNode
}

export function MonographLabel({
  size = 'md',
  rule = 'none',
  as: Tag = 'span',
  className,
  children,
}: MonographLabelProps) {
  return (
    <Tag
      className={cx(
        'block font-mono font-medium uppercase tracking-[0.12em]',
        size === 'md' ? 'text-[11px]' : 'text-[10px]',
        rule === 'hard' ? 'border-b border-ink pb-2 text-ink' : 'text-ink-2',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
