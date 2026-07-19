'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { MessageSquare, StickyNote } from 'lucide-react'
import { cx } from '../lib/cx'
import { iconProps } from '../lib/icon'

/**
 * SelectionPopover — text-selection actions (STYLE.md §11, §6.8).
 * Square strip, surface, 1px ink border, the one overlay shadow. Actions as
 * icon+label: Highlight (expands the 4 square color-dot row), Note, Explain
 * (only when onExplain is provided). Caret-anchored on desktop (`anchor`,
 * absolute inside the caller's positioned container), bottom-docked strip on
 * touch (`docked`). Esc + outside click dismiss. Never obscures the selection.
 */
export type HighlightColor = 'amber' | 'mint' | 'lilac' | 'rose'

export type SelectionPopoverProps = {
  open: boolean
  anchor?: { x: number; y: number }
  docked?: boolean
  highlightColors?: ReadonlyArray<HighlightColor>
  onHighlight: (color: HighlightColor) => void
  onNote: () => void
  onExplain?: () => void
  onDismiss: () => void
}

const DEFAULT_COLORS: ReadonlyArray<HighlightColor> = ['amber', 'mint', 'lilac', 'rose']

// The one place raw highlight tokens are allowed on product chrome — the
// dots ARE the color choice (user layer, STYLE.md §3).
const DOT_BG: Record<HighlightColor, string> = {
  amber: 'bg-hl-amber',
  mint: 'bg-hl-mint',
  lilac: 'bg-hl-lilac',
  rose: 'bg-hl-rose',
}

export function SelectionPopover({
  open,
  anchor,
  docked = false,
  highlightColors = DEFAULT_COLORS,
  onHighlight,
  onNote,
  onExplain,
  onDismiss,
}: SelectionPopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const firstDotRef = useRef<HTMLButtonElement | null>(null)
  const colorsId = useId()
  const [expanded, setExpanded] = useState(false)

  // Keyboard continuity: expanding the color row moves focus onto the first
  // swatch; the Highlight button itself stays mounted (aria-expanded).
  useEffect(() => {
    if (expanded) firstDotRef.current?.focus()
  }, [expanded])

  useEffect(() => {
    if (!open) {
      setExpanded(false)
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        onDismiss()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onDismiss])

  if (!open) return null

  const buttonBase = cx(
    'inline-flex cursor-pointer items-center gap-[7px] border-e border-line bg-transparent font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink last:border-e-0 hover:bg-primary-tint active:bg-primary-tint',
    docked ? 'h-12 flex-1 justify-center px-3' : 'h-11 px-3.5',
  )

  return (
    <div
      ref={rootRef}
      className={cx(
        'border border-ink bg-surface shadow-overlay',
        docked
          ? // Docks directly above the 56px reader action bar (§6.4/§6.8) —
            // never over it.
            'fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] z-[var(--z-overlay)] flex'
          : 'absolute z-[var(--z-overlay)] inline-flex',
      )}
      style={
        docked || !anchor
          ? undefined
          : {
              left: anchor.x,
              top: anchor.y,
              transform: 'translate(-50%, calc(-100% - 8px))',
            }
      }
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={colorsId}
        className={cx(buttonBase, expanded && 'hidden')}
      >
        <span className="inline-flex gap-1" aria-hidden>
          {highlightColors.map((color) => (
            <span key={color} className={cx('inline-block size-[9px] flex-none', DOT_BG[color])} />
          ))}
        </span>
        Highlight
      </button>
      {expanded ? (
        <span id={colorsId} role="group" aria-label="Highlight colors" className="contents">
          {highlightColors.map((color, i) => (
            <button
              key={color}
              ref={i === 0 ? firstDotRef : undefined}
              type="button"
              aria-label={`Highlight ${color}`}
              onClick={() => {
                setExpanded(false)
                onHighlight(color)
              }}
              className={cx(buttonBase, docked ? undefined : 'w-11 justify-center px-0')}
            >
              <span className={cx('inline-block size-3 flex-none', DOT_BG[color])} />
            </button>
          ))}
        </span>
      ) : null}
      <button type="button" onClick={onNote} className={buttonBase}>
        <StickyNote {...iconProps} />
        Note
      </button>
      {onExplain ? (
        <button type="button" onClick={onExplain} className={buttonBase}>
          <MessageSquare {...iconProps} />
          Explain
        </button>
      ) : null}
    </div>
  )
}
