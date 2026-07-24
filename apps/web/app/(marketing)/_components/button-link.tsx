import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Link styled as a system button (STYLE §11 · canvas .btn/.btn-primary/
 * .btn-ghost/.btn-sm). Buttons are not an @epharmatica/ui primitive, so the
 * marketing surface owns this local variant. 40px (44 on coarse pointers),
 * square, verb-first labels.
 */
const VARIANT_CLASSES = {
  primary:
    'border-primary bg-primary text-on-primary hover:border-primary-strong hover:bg-primary-strong active:border-primary-strong active:bg-primary-strong',
  ghost: 'border-ink bg-transparent text-ink hover:bg-primary-tint active:bg-primary-tint',
} as const

const SIZE_CLASSES = {
  md: 'h-10 px-[18px] text-[14px] [@media(pointer:coarse)]:h-11',
  sm: 'h-8 px-3 text-[13px] [@media(pointer:coarse)]:h-11',
} as const

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  umamiEvent,
  children,
}: {
  href: string
  variant?: keyof typeof VARIANT_CLASSES
  size?: keyof typeof SIZE_CLASSES
  className?: string
  /** Declarative Umami event (a constant from lib/observability/events). */
  umamiEvent?: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      data-umami-event={umamiEvent}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap border font-medium ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className ?? ''}`}
    >
      {children}
    </Link>
  )
}
