'use client'

import type { LucideIcon } from 'lucide-react'
import { cx } from '../lib/cx'
import { iconProps } from '../lib/icon'

/**
 * ActionBar — the mobile reader bottom action bar (STYLE.md §6.4).
 * Fixed, 56px + safe-area, surface with a 1px hard ink top rule; each action
 * is an icon over a 10px mono uppercase label; `emphasized` gets the primary
 * fill. Nothing floats — this replaces FABs. Hidden ≥ md by default (a caller
 * can override via className, e.g. `md:flex!`).
 */
export type ActionBarAction = {
  id: string
  icon: LucideIcon
  label: string
  emphasized?: boolean
  onSelect: () => void
}

export type ActionBarProps = {
  actions: Array<ActionBarAction>
  className?: string
}

export function ActionBar({ actions, className }: ActionBarProps) {
  return (
    <div
      className={cx(
        'fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex border-t border-ink bg-surface pb-[env(safe-area-inset-bottom,0px)] md:hidden',
        className,
      )}
    >
      {actions.map(({ id, icon: Icon, label, emphasized, onSelect }) => (
        <button
          key={id}
          type="button"
          onClick={onSelect}
          className={cx(
            'flex h-14 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.1em]',
            emphasized
              ? 'bg-primary text-on-primary active:bg-primary-strong'
              : 'text-ink active:bg-primary-tint',
          )}
        >
          <Icon {...iconProps} />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  )
}
