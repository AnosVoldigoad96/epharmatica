import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

/**
 * BlisterGrid / BlisterCell — shared collapsed 1px line borders inside a
 * 1px-framed container (STYLE.md §5 #1), done with the gap-px + bg-line
 * trick from the canvas CSS (`.blister` / `.cell`). Container-query wrapper:
 * the column count responds to the container, not the viewport (§6.1).
 *
 * Both components are server-compatible. A BlisterCell given `onSelect`
 * carries an event handler, so that usage must come from a client component
 * (the function prop cannot cross the RSC boundary); `href`-only and static
 * cells render fine from server components.
 */
export type BlisterGridProps = {
  minCell?: number
  columns?: number
  className?: string
  children: ReactNode
}

export function BlisterGrid({ minCell = 240, columns, className, children }: BlisterGridProps) {
  return (
    <div className={cx('[container-type:inline-size]', className)}>
      <div
        className="grid gap-px border border-line bg-line"
        style={{
          gridTemplateColumns: columns
            ? `repeat(${columns}, minmax(0, 1fr))`
            : `repeat(auto-fit, minmax(min(${minCell}px, 100%), 1fr))`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

export type BlisterCellProps = {
  href?: string
  onSelect?: () => void
  className?: string
  children: ReactNode
}

const cellBase = 'block bg-surface p-4.5'
// Hover gated behind (hover:hover) by the Tailwind v4 default variant; press
// via :active (§6.3). Inner ink outline is the inset ring from the canvas CSS.
const cellInteractive =
  'cursor-pointer text-start hover:bg-primary-tint hover:shadow-[inset_0_0_0_1px_var(--color-ink)] active:bg-primary-tint active:shadow-[inset_0_0_0_1px_var(--color-ink)]'

export function BlisterCell({ href, onSelect, className, children }: BlisterCellProps) {
  if (href) {
    return (
      <a
        href={href}
        onClick={onSelect}
        className={cx(cellBase, cellInteractive, 'text-ink no-underline', className)}
      >
        {children}
      </a>
    )
  }
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cx(cellBase, cellInteractive, 'w-full appearance-none', className)}
      >
        {children}
      </button>
    )
  }
  return <div className={cx(cellBase, className)}>{children}</div>
}
