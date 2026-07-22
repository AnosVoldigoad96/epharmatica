import type { ChangeEventHandler, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cx } from '../lib/cx'

/**
 * Checkbox — the canvas 14px square check row (STYLE.md §11 · §6.3 touch
 * floor). The native input is visually hidden (peer + sr-only) and the whole
 * row is the <label>, so the full sentence is the hit area — min 44px on
 * coarse pointers. The drawn box: 1px ink border on surface; checked = solid
 * primary with the white glyph (color flip via peer-checked, the glyph
 * strokes currentColor); focus = the square primary ring via
 * peer-focus-visible. Uncontrolled works — no JS state. Server-compatible.
 */
export type CheckboxProps = {
  name?: string
  checked?: boolean
  defaultChecked?: boolean
  onChange?: ChangeEventHandler<HTMLInputElement>
  required?: boolean
  label: ReactNode
  className?: string
}

export function Checkbox({
  name,
  checked,
  defaultChecked,
  onChange,
  required = false,
  label,
  className,
}: CheckboxProps) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-2.5 text-[13px] leading-[1.5] text-ink [@media(pointer:coarse)]:min-h-11',
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        required={required}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="mt-0.75 flex size-3.5 flex-none items-center justify-center border border-ink bg-surface text-transparent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
      >
        {/* §10 discipline at glyph scale: absoluteStrokeWidth keeps the
            1.5px stroke honest inside the 14px box. */}
        <Check
          size={10}
          strokeWidth={1.5}
          absoluteStrokeWidth
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden
        />
      </span>
      <span className="min-w-0">{label}</span>
    </label>
  )
}
