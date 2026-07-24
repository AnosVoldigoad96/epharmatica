'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { MonographLabel } from '@epharmatica/ui'

/**
 * Admin modal sheet (hi-fi 3al chrome): ink-bordered panel on a scrim,
 * monograph header bar, square corners, one shadow (the overlay exception,
 * STYLE §5). Esc and scrim-click close; focus moves into the dialog on
 * open. Deliberately minimal — the admin surface's only overlay primitive.
 */
export function AdminSheet({
  open,
  title,
  wide = false,
  onClose,
  children,
}: {
  open: boolean
  title: string
  wide?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[var(--z-dialog)] flex items-start justify-center overflow-y-auto bg-ink/30 p-6 sm:p-9"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full border border-ink bg-surface shadow-[0_8px_24px_rgba(12,20,24,0.16)] outline-none ${
          wide ? 'max-w-[760px]' : 'max-w-[520px]'
        }`}
      >
        <div className="border-b border-ink px-5 py-4">
          <MonographLabel as="div" className="text-ink">
            {title}
          </MonographLabel>
        </div>
        {children}
      </div>
    </div>
  )
}
