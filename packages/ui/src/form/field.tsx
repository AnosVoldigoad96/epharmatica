import { cloneElement, isValidElement, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../lib/cx'
import { MonographLabel } from '../system/monograph-label'

/**
 * Field — labelled form-control wrapper (STYLE.md §11 inputs · §6.7 forms on
 * touch). Monograph label above the control (as a real <label> when
 * `labelFor` is given), optional right-aligned mono `trailing` slot (canvas
 * inline statuses: `✓ AVAILABLE`, `BIO · 84 / 280`), then the control, then
 * a 12px ink-2 hint — replaced by the 13px danger error (role='alert') when
 * one is set. The control itself is passed as children and should carry
 * `fieldClass` (the canonical 40/44px 1px-line input treatment, single
 * source shared with WaitlistForm).
 *
 * Self-wiring aria: when `labelFor` is set, the hint/error nodes get the ids
 * `{labelFor}-hint` / `{labelFor}-error` and the single child control is
 * cloned with a merged `aria-describedby` (an existing value on the child is
 * kept) and `aria-invalid={Boolean(error)}` — a control inside a SelectShell
 * child is wired through the shell. Server-compatible.
 */
export type FieldProps = {
  label: string
  labelFor?: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  trailing?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * The canonical field treatment (canvas `.inp`): 40px (44 coarse), 1px line
 * border on surface, 16px input text (no iOS focus-zoom), primary border +
 * square ring on focus. Single source — WaitlistForm imports this too.
 */
export const fieldClass =
  'h-10 w-full min-w-0 border border-line bg-surface px-3 font-sans text-[16px] text-ink focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [@media(pointer:coarse)]:h-11'

/** `fieldClass` for a `<select>` inside a SelectShell: native arrow hidden. */
export const selectClass = cx(fieldClass, 'appearance-none pe-8')

/** Aria props Field injects into the child control via cloneElement. */
type WiredControlProps = {
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  children?: ReactNode
}

/**
 * Clone the single child control with the merged `aria-describedby` and
 * `aria-invalid`. A SelectShell child is a presentation wrapper — descend one
 * level and wire the <select> inside it instead. Anything that is not a
 * single valid element renders unchanged.
 */
function wireControl(
  node: ReactNode,
  describedBy: string | undefined,
  invalid: boolean,
): ReactNode {
  if (!isValidElement<WiredControlProps>(node)) return node
  if (node.type === SelectShell) {
    return cloneElement(node, undefined, wireControl(node.props.children, describedBy, invalid))
  }
  const merged = [node.props['aria-describedby'], describedBy].filter(Boolean).join(' ')
  return cloneElement(node, {
    'aria-describedby': merged || undefined,
    'aria-invalid': invalid,
  })
}

export function Field({
  label,
  labelFor,
  hint,
  error,
  required = false,
  trailing,
  className,
  children,
}: FieldProps) {
  const hintId = labelFor ? `${labelFor}-hint` : undefined
  const errorId = labelFor ? `${labelFor}-error` : undefined
  const describedBy = error ? errorId : hint != null ? hintId : undefined
  const control = labelFor ? wireControl(children, describedBy, Boolean(error)) : children
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <span className="flex items-baseline justify-between gap-3">
        <MonographLabel as={labelFor ? 'label' : 'span'} htmlFor={labelFor} size="sm">
          {label}
          {required ? <span aria-hidden> *</span> : null}
        </MonographLabel>
        {trailing != null ? (
          <span className="flex-none font-mono text-[11px] tracking-[0.05em] text-ink-2">
            {trailing}
          </span>
        ) : null}
      </span>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint != null ? (
        <p id={hintId} className="text-[12px] leading-[1.5] text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * SelectShell — the chevroned select wrapper (the WaitlistForm pattern made
 * shared): relative span around a `selectClass` <select> with the 16px
 * square-cap ChevronDown pinned to the inline end.
 */
export type SelectShellProps = {
  className?: string
  children: ReactNode
}

export function SelectShell({ className, children }: SelectShellProps) {
  return (
    <span className={cx('relative block', className)}>
      {children}
      <ChevronDown
        size={16}
        strokeWidth={1.5}
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden
        className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-ink-2"
      />
    </span>
  )
}
