import { cx } from '../lib/cx'
import { StateGlyph, type StateGlyphState } from './state-glyph'

/**
 * ProgressStrip — blister progress (STYLE.md §7): one StateGlyph per unit,
 * 2px gaps, single row that wraps. Replaces percentage bars in learning
 * contexts. Server-compatible.
 */
export type ProgressStripProps = {
  units: ReadonlyArray<StateGlyphState>
  label?: string
  className?: string
}

export function ProgressStrip({ units, label, className }: ProgressStripProps) {
  const complete = units.filter((u) => u === 'complete').length
  return (
    <div
      role="img"
      aria-label={label ?? `${complete} of ${units.length} units complete`}
      className={cx('flex flex-wrap gap-0.5', className)}
    >
      {units.map((unit, i) => (
        <StateGlyph key={i} state={unit} />
      ))}
    </div>
  )
}
