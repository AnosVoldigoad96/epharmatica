'use client'

import { useRef, type KeyboardEvent } from 'react'
import { cx } from '../lib/cx'

/**
 * TextSizeControl — A− / A / A+ three-cell segmented control (STYLE.md §8 S7).
 * 1px line frame, shared inner 1px dividers, selected cell = primary-tint +
 * 1px ink inner outline; 40px cells (44 on coarse pointers). Radiogroup
 * semantics with arrow-key movement and a roving tabindex.
 */
export type TextSize = 14 | 16 | 18

export type TextSizeControlProps = {
  value: TextSize
  onChange: (v: TextSize) => void
}

const OPTIONS: ReadonlyArray<{ value: TextSize; glyph: string; label: string }> = [
  { value: 14, glyph: 'A−', label: 'Smaller text' },
  { value: 16, glyph: 'A', label: 'Default' },
  { value: 18, glyph: 'A+', label: 'Larger' },
]

export function TextSizeControl({ value, onChange }: TextSizeControlProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = OPTIONS.findIndex((o) => o.value === value)
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % OPTIONS.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + OPTIONS.length) % OPTIONS.length
    }
    if (nextIndex === null) return
    const next = OPTIONS[nextIndex]
    if (!next) return
    e.preventDefault()
    onChange(next.value)
    refs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Text size"
      onKeyDown={handleKeyDown}
      className="inline-flex border border-line"
    >
      {OPTIONS.map((option, i) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex h-10 w-10 cursor-pointer items-center justify-center border-e border-line text-[13px] text-ink last:border-e-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
              selected
                ? 'bg-primary-tint shadow-[inset_0_0_0_1px_var(--color-ink)]'
                : 'bg-surface hover:bg-primary-tint active:bg-primary-tint',
            )}
          >
            <span aria-hidden>{option.glyph}</span>
          </button>
        )
      })}
    </div>
  )
}
