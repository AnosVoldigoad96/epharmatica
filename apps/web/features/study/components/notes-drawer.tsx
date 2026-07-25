'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { MonographLabel } from '@epharmatica/ui'
import type { StudyHighlight, StudyHighlightColor, StudyNote } from '../anchor-schema'
import { NoteEditor } from './note-editor'

/**
 * The notes drawer (1.D · M1 §5.6, drawer surface): side panel ≥md,
 * bottom sheet below. Sections: ON THIS PAGE — highlight-notes with color
 * dot + snapshot context + jump-to-anchor, orphaned highlights flagged
 * ORPHANED with snapshot + Restore (re-selection flow) — then free
 * subtopic notes with Add note. Square, 1px ink edge, the one overlay
 * shadow (STYLE §5/§11).
 */

const DOT_BG: Record<StudyHighlightColor, string> = {
  amber: 'bg-hl-amber',
  mint: 'bg-hl-mint',
  lilac: 'bg-hl-lilac',
  rose: 'bg-hl-rose',
}

type EditTarget = { kind: 'add-free' } | { kind: 'edit'; note: StudyNote } | null

export function NotesDrawer({
  open,
  highlights,
  freeNotes,
  busy = false,
  onClose,
  onJump,
  onRestore,
  onSaveFree,
  onSaveEdit,
  onDeleteNote,
}: {
  open: boolean
  highlights: StudyHighlight[]
  freeNotes: StudyNote[]
  busy?: boolean
  onClose: () => void
  onJump: (highlight: StudyHighlight) => void
  onRestore: (highlight: StudyHighlight) => void
  onSaveFree: (text: string) => void
  onSaveEdit: (note: StudyNote, text: string) => void
  onDeleteNote: (note: StudyNote) => void
}) {
  const t = useTranslations('learn.study.drawer')
  // The parent keys this component on `open`, so closing remounts it and
  // clears the editing/confirm sub-states without effect churn.
  const [editing, setEditing] = useState<EditTarget>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // On this page: every highlight carrying a note, plus every orphan
  // (orphans surface here even without a note — M1 §5.5, never silent).
  const onThisPage = highlights.filter((highlight) => highlight.note || highlight.orphaned)

  const noteActions = (note: StudyNote) => (
    <span className="flex gap-3">
      <button
        type="button"
        onClick={() => setEditing({ kind: 'edit', note })}
        className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 underline underline-offset-2 hover:text-primary"
      >
        {t('edit')}
      </button>
      {confirmingDeleteId === note.id ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirmingDeleteId(null)
              onDeleteNote(note)
            }}
            className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-danger underline underline-offset-2"
          >
            {t('deleteConfirm')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDeleteId(null)}
            className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 underline underline-offset-2"
          >
            {t('cancel')}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDeleteId(note.id)}
          className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 underline underline-offset-2 hover:text-danger"
        >
          {t('delete')}
        </button>
      )}
    </span>
  )

  return (
    <div
      data-study-ui
      role="dialog"
      aria-modal="false"
      aria-label={t('title')}
      className="fixed inset-x-0 bottom-0 z-[var(--z-overlay)] flex max-h-[75dvh] flex-col border-t border-ink bg-surface shadow-overlay md:inset-x-auto md:inset-y-0 md:end-0 md:max-h-none md:w-[360px] md:border-s md:border-t-0"
    >
      <div className="flex items-center justify-between border-b border-ink px-4 py-3">
        <MonographLabel as="div" size="sm">
          {t('title')}
        </MonographLabel>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="flex size-8 items-center justify-center text-ink-2 hover:bg-primary-tint hover:text-ink [@media(pointer:coarse)]:size-11"
        >
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* ── On this page (highlight notes + orphans) ─────────────── */}
        <MonographLabel as="div" size="sm" rule="hard" className="mb-3">
          {t('onThisPage')}
        </MonographLabel>
        {onThisPage.length === 0 ? (
          <p className="mb-5 text-[13px] leading-[1.5] text-ink-2">{t('emptyOnPage')}</p>
        ) : (
          <ul className="mb-6 space-y-3">
            {onThisPage.map((highlight) => (
              <li key={highlight.id} className="border border-line bg-paper p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`inline-block size-3 flex-none ${DOT_BG[highlight.color]}`}
                  />
                  {highlight.orphaned ? (
                    <span className="inline-block border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-ink">
                      {t('orphaned')}
                    </span>
                  ) : null}
                </div>
                {highlight.orphaned ? (
                  <p className="mb-1 text-[13px] italic leading-[1.5] text-ink-2">
                    “{highlight.textSnapshot}”
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => onJump(highlight)}
                    title={t('jumpAria')}
                    className="mb-1 block text-start text-[13px] italic leading-[1.5] text-ink-2 underline decoration-line underline-offset-2 hover:text-primary"
                  >
                    “
                    {highlight.textSnapshot.length > 120
                      ? `${highlight.textSnapshot.slice(0, 117)}…`
                      : highlight.textSnapshot}
                    ”
                  </button>
                )}
                {highlight.note ? (
                  editing?.kind === 'edit' && editing.note.id === highlight.note.id ? (
                    <NoteEditor
                      initialText={highlight.note.text}
                      busy={busy}
                      onSave={(text) => {
                        const note = highlight.note
                        setEditing(null)
                        if (note) onSaveEdit(note, text)
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55]">
                        {highlight.note.text}
                      </p>
                      <div className="mt-2">{noteActions(highlight.note)}</div>
                    </>
                  )
                ) : null}
                {highlight.orphaned ? (
                  <button
                    type="button"
                    onClick={() => onRestore(highlight)}
                    className="mt-2 h-8 border border-ink bg-transparent px-3 text-[12.5px] font-medium text-ink hover:bg-primary-tint [@media(pointer:coarse)]:h-11"
                  >
                    {t('restore')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* ── Free notes ───────────────────────────────────────────── */}
        <MonographLabel as="div" size="sm" rule="hard" className="mb-3">
          {t('freeNotes')}
        </MonographLabel>
        {freeNotes.length === 0 && editing?.kind !== 'add-free' ? (
          <p className="mb-3 text-[13px] leading-[1.5] text-ink-2">{t('emptyFree')}</p>
        ) : (
          <ul className="mb-3 space-y-3">
            {freeNotes.map((note) => (
              <li key={note.id} className="border border-line bg-paper p-3">
                {editing?.kind === 'edit' && editing.note.id === note.id ? (
                  <NoteEditor
                    initialText={note.text}
                    busy={busy}
                    onSave={(text) => {
                      setEditing(null)
                      onSaveEdit(note, text)
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55]">{note.text}</p>
                    <div className="mt-2">{noteActions(note)}</div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {editing?.kind === 'add-free' ? (
          <NoteEditor
            busy={busy}
            onSave={(text) => {
              setEditing(null)
              onSaveFree(text)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing({ kind: 'add-free' })}
            className="h-9 border border-ink bg-transparent px-3.5 text-[13px] font-medium text-ink hover:bg-primary-tint [@media(pointer:coarse)]:h-11"
          >
            {t('addNote')}
          </button>
        )}
      </div>
    </div>
  )
}
