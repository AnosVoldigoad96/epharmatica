'use client'

import { useRef, type KeyboardEvent } from 'react'
import { cx } from '../lib/cx'

/**
 * SegmentedControl — the canvas `.seg` (STYLE.md §11): inline-flex row, 1px
 * ink outer border, 36px cells (44 on coarse pointers), selected cell solid
 * primary with on-primary text. Radiogroup semantics with arrow-key movement
 * and a roving tabindex (the TextSizeControl pattern generalized to string
 * options). Controlled only.
 */
export type SegmentedControlOption = { value: string; label: string }

export type SegmentedControlProps = {
  options: ReadonlyArray<SegmentedControlOption>
  value: string
  onChange: (v: string) => void
  label?: string
  className?: string
}

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((o) => o.value === value)
    let nextIndex: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % options.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + options.length) % options.length
    }
    if (nextIndex === null) return
    const next = options[nextIndex]
    if (!next) return
    e.preventDefault()
    onChange(next.value)
    refs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cx('inline-flex border border-ink', className)}
    >
      {options.map((option, i) => {
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
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex h-9 cursor-pointer items-center justify-center border-e border-ink px-3.5 text-[13px] last:border-e-0 [@media(pointer:coarse)]:h-11',
              selected
                ? 'bg-primary font-medium text-on-primary'
                : 'bg-surface text-ink hover:bg-primary-tint active:bg-primary-tint',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
