import { cx } from '../lib/cx'

/**
 * StateGlyph — learning-state language (STYLE.md §7).
 * 12px square: not-started = 1px line outline · in-progress = outline +
 * left-half primary fill (inner half block, RTL-safe: the fill sits at
 * inline-start) · complete = solid primary. Server-compatible.
 */
export type StateGlyphState = 'not-started' | 'in-progress' | 'complete'

export type StateGlyphProps = {
  state: StateGlyphState
  size?: number
  label?: string
  className?: string
}

export function StateGlyph({ state, size = 12, label, className }: StateGlyphProps) {
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const)

  return (
    <span
      {...a11y}
      className={cx(
        'inline-flex flex-none align-[-1px]',
        state === 'not-started' && 'border border-line bg-surface',
        state === 'in-progress' && 'border border-primary bg-surface',
        state === 'complete' && 'border border-primary bg-primary',
        className,
      )}
      style={{ inlineSize: size, blockSize: size }}
    >
      {state === 'in-progress' ? (
        <span className="block h-full w-1/2 flex-none bg-primary" />
      ) : null}
    </span>
  )
}
