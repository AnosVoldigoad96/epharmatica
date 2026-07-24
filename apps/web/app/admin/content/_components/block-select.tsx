'use client'

import { useEffect, useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'

/**
 * Block selection over the read-only preview (1.B-3c): wraps the rendered
 * RichText, resolves clicks to the nearest `[data-block-id]` (the same
 * stable ids the highlight machinery uses), outlines the pick, and reports
 * {blockId, snapshot} up so the discussions panel can anchor a thread.
 * DOM-level by design — the renderer stays untouched (I4).
 */

export type BlockSelection = { blockId: string; snapshot: string }

/** Captured at click time — drift-tolerant quote, mirrors snapshot column cap. */
const SNAPSHOT_MAX = 240

/** Toggled onto the selected block (2px primary outline, square — no radius). */
const SELECTED_CLASSES = ['outline', 'outline-2', 'outline-primary', 'outline-offset-2']

export function BlockSelect({
  selectedId,
  onSelect,
  children,
}: {
  selectedId: string | null
  onSelect: (selection: BlockSelection | null) => void
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  // The outline follows the LIFTED state (not the click), so external
  // clears — submit, cancel — also clear the visual.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    for (const el of root.querySelectorAll('[data-block-id]')) {
      if (el.getAttribute('data-block-id') === selectedId) el.classList.add(...SELECTED_CLASSES)
      else el.classList.remove(...SELECTED_CLASSES)
    }
  }, [selectedId])

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const block = target.closest<HTMLElement>('[data-block-id]')
    if (!block || !rootRef.current?.contains(block)) return
    const blockId = block.getAttribute('data-block-id')
    if (!blockId) return
    if (blockId === selectedId) {
      onSelect(null) // second click toggles the selection off
      return
    }
    onSelect({ blockId, snapshot: (block.textContent ?? '').trim().slice(0, SNAPSHOT_MAX) })
  }

  return (
    <div ref={rootRef} onClick={onClick} className="cursor-pointer">
      {children}
    </div>
  )
}
