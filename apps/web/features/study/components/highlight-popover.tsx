'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { StickyNote, Trash2 } from 'lucide-react'
import type { StudyHighlight, StudyHighlightColor } from '../anchor-schema'
import { HIGHLIGHT_COLORS } from '../anchor-schema'

/**
 * Tap/click popover for an EXISTING highlight (1.D · M1 §5.5/§5.6):
 * color swap (4 dots, current outlined), Note (add or edit), Delete —
 * which asks ONCE when a note is attached ("deletes the note too") and
 * then removes both in one action. Square strip in the selection-popover
 * language (STYLE §11); the caller positions it (caret vs docked).
 */

const DOT_BG: Record<StudyHighlightColor, string> = {
  amber: 'bg-hl-amber',
  mint: 'bg-hl-mint',
  lilac: 'bg-hl-lilac',
  rose: 'bg-hl-rose',
}

export function HighlightPopover({
  highlight,
  busy = false,
  docked = false,
  onColor,
  onNote,
  onDelete,
}: {
  highlight: StudyHighlight
  busy?: boolean
  docked?: boolean
  onColor: (color: StudyHighlightColor) => void
  onNote: () => void
  onDelete: () => void
}) {
  const t = useTranslations('learn.study.highlight')
  const [confirming, setConfirming] = useState(false)

  const buttonBase = `inline-flex cursor-pointer items-center gap-[7px] border-e border-line bg-transparent font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink last:border-e-0 hover:bg-primary-tint active:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-50 ${
    docked ? 'h-12 flex-1 justify-center px-3' : 'h-11 px-3'
  }`

  if (confirming) {
    return (
      <div
        className={`border border-ink bg-surface shadow-overlay ${docked ? 'flex w-full' : 'inline-flex'}`}
      >
        <span
          className={`inline-flex items-center border-e border-line px-3 text-[12px] leading-[1.3] text-ink ${docked ? 'h-12 flex-1' : 'h-11 max-w-[220px]'}`}
        >
          {highlight.note ? t('deleteWithNote') : t('deleteConfirm')}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className={`${buttonBase} text-danger`}
        >
          {t('delete')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={buttonBase}>
          {t('cancel')}
        </button>
      </div>
    )
  }

  return (
    <div
      className={`border border-ink bg-surface shadow-overlay ${docked ? 'flex w-full' : 'inline-flex'}`}
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          disabled={busy}
          aria-label={t('colorAria', { color })}
          aria-pressed={color === highlight.color}
          onClick={() => onColor(color)}
          className={`${buttonBase} ${docked ? '' : 'w-11 justify-center px-0'}`}
        >
          <span
            className={`inline-block size-3 flex-none ${DOT_BG[color]} ${
              color === highlight.color ? 'outline outline-1 outline-offset-2 outline-ink' : ''
            }`}
          />
        </button>
      ))}
      <button type="button" disabled={busy} onClick={onNote} className={buttonBase}>
        <StickyNote size={16} strokeWidth={1.5} aria-hidden />
        {highlight.note ? t('editNote') : t('note')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (highlight.note) setConfirming(true)
          else onDelete()
        }}
        className={buttonBase}
      >
        <Trash2 size={16} strokeWidth={1.5} aria-hidden />
        {t('delete')}
      </button>
    </div>
  )
}
