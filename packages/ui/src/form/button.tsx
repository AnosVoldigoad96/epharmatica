import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cx } from '../lib/cx'

/**
 * Button — system button (STYLE.md §11 · canvas .btn-primary/.btn-ghost/
 * .btn-sm). 40px md / 32px sm, both 44px on coarse pointers (§6.3), square,
 * verb-first labels. Variants: primary solid, ghost 1px ink border with tint
 * hover/press, danger outline that fills on hover (the mockups' delete
 * button). `pending` marks an in-flight server action: aria-busy + disabled +
 * default cursor. Disabled/pending drop to 50% opacity and the hover/press
 * tints are `enabled:`-guarded, so non-interactive buttons read as such in
 * both themes. Server-compatible (no hooks); remaining button attributes
 * spread through.
 */
export type ButtonProps = {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  pending?: boolean
  className?: string
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children'>

const VARIANT_CLASSES = {
  primary:
    'border-primary bg-primary text-on-primary enabled:hover:border-primary-strong enabled:hover:bg-primary-strong enabled:active:border-primary-strong enabled:active:bg-primary-strong',
  ghost:
    'border-ink bg-transparent text-ink enabled:hover:bg-primary-tint enabled:active:bg-primary-tint',
  danger:
    'border-danger bg-transparent text-danger enabled:hover:bg-danger enabled:hover:text-on-primary enabled:active:bg-danger enabled:active:text-on-primary',
} as const

const SIZE_CLASSES = {
  md: 'h-10 px-4.5 text-[14px] [@media(pointer:coarse)]:h-11',
  sm: 'h-8 px-3 text-[13px] [@media(pointer:coarse)]:h-11',
} as const

export function Button({
  variant = 'primary',
  size = 'md',
  pending = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={pending}
      disabled={disabled || pending}
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap border font-sans font-medium disabled:cursor-default disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
