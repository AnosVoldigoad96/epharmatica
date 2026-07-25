'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MonographLabel } from '@epharmatica/ui'

/**
 * Inline note input (1.D · M1 §5.6) — one editor for every creation/edit
 * path: popover → Note (atomic highlight+note), glyph → edit, drawer →
 * add/edit. Square panel per the system; the POSITIONING (caret panel vs
 * bottom sheet) belongs to the caller. 16px textarea text keeps iOS from
 * focus-zooming (STYLE §6.7).
 */
export function NoteEditor({
  initialText = '',
  busy = false,
  onSave,
  onCancel,
}: {
  initialText?: string
  busy?: boolean
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const t = useTranslations('learn.study.note')
  const [text, setText] = useState(initialText)

  return (
    <div className="border border-ink bg-surface p-3 shadow-overlay">
      <MonographLabel as="div" size="sm" className="mb-2">
        {t('label')}
      </MonographLabel>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('placeholder')}
        rows={4}
        autoFocus
        maxLength={5000}
        className="mb-2.5 block w-full resize-y border border-line bg-paper p-2 text-[16px] leading-[1.5] focus:border-primary focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || text.trim().length === 0}
          onClick={() => onSave(text)}
          className="h-9 border border-primary bg-primary px-3.5 text-[13px] font-medium text-on-primary hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:h-11"
        >
          {t('save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 border border-ink bg-transparent px-3.5 text-[13px] font-medium text-ink hover:bg-primary-tint [@media(pointer:coarse)]:h-11"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
