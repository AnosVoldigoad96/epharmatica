'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Bookmark, BookmarkCheck, CheckSquare, Square, StickyNote } from 'lucide-react'
import { ActionBar, MonographLabel, SelectionPopover, Stamp } from '@epharmatica/ui'
import { EVENTS, trackEvent } from '@/lib/observability/events'
import type { StudyAnchor, StudyHighlightColor, StudyNote, StudyState } from '../anchor-schema'
import { anchorFromRange, rangeForAnchor, runKey, runPositionForDomPoint } from '../anchor-dom'
import { clearHighlightPaint, paintHighlights } from '../paint'
import {
  createHighlight,
  createNote,
  deleteHighlight,
  deleteNote,
  restoreOrphan,
  setProgress,
  toggleBookmark,
  touchLastVisited,
  updateHighlightColor,
  updateNote,
} from '../actions'
import { getStudyState } from '../queries'
import { HighlightPopover } from './highlight-popover'
import { NoteEditor } from './note-editor'
import { NotesDrawer } from './notes-drawer'

/*
 * STUDY LAYER (1.D · M1 §5.2/§5.5–§5.8). Mounted lazily by the reader's
 * StudyLayerMount, signed-in sessions only — the static anon shell never
 * ships or shows any of this. On mount it fetches the study state (one
 * round trip), paints highlights via the CSS Custom Highlight API, places
 * note glyphs in a zero-layout overlay, upserts last_visited, and fires
 * subtopic_opened. Covers BOTH the server-rendered preview blocks and the
 * client-swapped member-unlock blocks: a MutationObserver on the scope
 * repaints when the unlock arrives.
 */

type Pos = { x: number; yTop: number; yBottom: number }

type PanelState =
  | { kind: 'selection-actions'; anchor: StudyAnchor; pos: Pos }
  | { kind: 'selection-note'; anchor: StudyAnchor; pos: Pos }
  | { kind: 'selection-too-long'; pos: Pos }
  | { kind: 'restore-confirm'; anchor: StudyAnchor; pos: Pos }
  | { kind: 'hl-menu'; id: string; pos: Pos }
  | { kind: 'hl-note-edit'; id: string; pos: Pos }
  | { kind: 'note-view'; id: string; pos: Pos }
  | null

type GlyphPos = { id: string; x: number; y: number }

const LAST_COLOR_KEY = 'eph-study-last-color'

function loadLastColor(): StudyHighlightColor {
  try {
    const stored = window.localStorage.getItem(LAST_COLOR_KEY)
    if (stored === 'amber' || stored === 'mint' || stored === 'lilac' || stored === 'rose') {
      return stored
    }
  } catch {
    // Storage unavailable — default below.
  }
  return 'amber'
}

type CaretPoint = { offsetNode: Node; offset: number }

/** caretPositionFromPoint with the WebKit fallback — hit-testing clicks. */
function caretPointAt(doc: Document, x: number, y: number): CaretPoint | null {
  const d = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (typeof d.caretPositionFromPoint === 'function') {
    const position = d.caretPositionFromPoint(x, y)
    return position ? { offsetNode: position.offsetNode, offset: position.offset } : null
  }
  if (typeof d.caretRangeFromPoint === 'function') {
    const range = d.caretRangeFromPoint(x, y)
    return range ? { offsetNode: range.startContainer, offset: range.startOffset } : null
  }
  return null
}

function glyphsEqual(a: GlyphPos[], b: GlyphPos[]): boolean {
  return (
    a.length === b.length &&
    a.every((g, i) => g.id === b[i]?.id && g.x === b[i]?.x && g.y === b[i]?.y)
  )
}

/** `COMPLETED · 24 JUL` stamp date (chip CSS uppercases). */
function stampDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(iso))
}

export default function StudyLayer({ subtopicId }: { subtopicId: string }) {
  const t = useTranslations('learn.study')

  // The layer renders exclusively client-side (ssr:false dynamic import,
  // after the session check), so the reader DOM exists at first render —
  // lazy initializers bind the scope/rail elements without effect churn.
  const [scope] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>('[data-study-scope]'),
  )
  const [rail] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>('[data-study-rail]'),
  )
  const [coarse] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(pointer: coarse)').matches,
  )
  const [state, setState] = useState<StudyState | null>(null)
  const [panel, setPanel] = useState<PanelState>(null)
  const [glyphs, setGlyphs] = useState<GlyphPos[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [justCompleted, setJustCompleted] = useState(false)
  const [tick, setTick] = useState(0)

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<StudyState | null>(null)
  const restoreRef = useRef<string | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => {
    restoreRef.current = restoreId
  }, [restoreId])

  const showError = useCallback((message: string) => {
    setErrorText(message)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const result = await getStudyState(subtopicId)
        if (!cancelled && result.ok) setState(result.state)
        void touchLastVisited(subtopicId)
      } catch {
        // Network hiccup — the reader stays usable without the layer.
      }
    }
    void load()
    trackEvent(EVENTS.subtopic_opened)
    return () => {
      cancelled = true
    }
  }, [subtopicId])

  useEffect(() => {
    if (!errorText) return
    const timer = window.setTimeout(() => setErrorText(null), 5000)
    return () => window.clearTimeout(timer)
  }, [errorText])

  /* ------------------------------------------------- paint + note glyphs */

  useEffect(() => {
    if (!scope || !state) return
    paintHighlights(scope, state.highlights)
    // Glyph placement measures layout — defer to the next frame (also keeps
    // the state update out of the synchronous effect body).
    const raf = requestAnimationFrame(() => {
      const scopeRect = scope.getBoundingClientRect()
      const next: GlyphPos[] = []
      for (const highlight of state.highlights) {
        if (!highlight.note || highlight.orphaned || !highlight.anchor) continue
        const range = rangeForAnchor(scope, highlight.anchor)
        if (!range) continue
        const end = range.cloneRange()
        end.collapse(false)
        const rect = end.getBoundingClientRect()
        if (rect.top === 0 && rect.left === 0 && rect.height === 0) continue
        next.push({
          id: highlight.id,
          x: Math.round(rect.left - scopeRect.left),
          y: Math.round(rect.top - scopeRect.top),
        })
      }
      setGlyphs((previous) => (glyphsEqual(previous, next) ? previous : next))
    })
    return () => cancelAnimationFrame(raf)
  }, [scope, state, tick])

  useEffect(() => () => clearHighlightPaint(), [])

  // Repaint triggers: member-unlock swap (childList), reflow (resize), fonts.
  useEffect(() => {
    if (!scope) return
    let raf = 0
    const bump = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setTick((value) => value + 1)
      })
    }
    const mutationObserver = new MutationObserver((records) => {
      const overlay = overlayRef.current
      if (records.some((record) => !overlay || !overlay.contains(record.target))) bump()
    })
    mutationObserver.observe(scope, { childList: true, subtree: true, characterData: true })
    const resizeObserver = new ResizeObserver(bump)
    resizeObserver.observe(scope)
    window.addEventListener('resize', bump)
    void document.fonts?.ready.then(bump)
    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', bump)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scope])

  /* ------------------------------------------------- selection popover */

  const positionFor = useCallback(
    (rect: DOMRect): Pos => {
      const scopeRect = scope?.getBoundingClientRect()
      if (!scopeRect) return { x: 0, yTop: 0, yBottom: 0 }
      const raw = rect.left + rect.width / 2 - scopeRect.left
      const x = scopeRect.width > 300 ? Math.min(Math.max(raw, 140), scopeRect.width - 140) : raw
      return { x, yTop: rect.top - scopeRect.top, yBottom: rect.bottom - scopeRect.top }
    },
    [scope],
  )

  useEffect(() => {
    if (!scope) return
    const evaluate = () => {
      const current = stateRef.current
      if (!current) return
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setPanel((existing) =>
          existing &&
          (existing.kind === 'selection-actions' ||
            existing.kind === 'selection-too-long' ||
            existing.kind === 'restore-confirm')
            ? null
            : existing,
        )
        return
      }
      const range = selection.getRangeAt(0)
      if (!scope.contains(range.commonAncestorContainer)) return
      const result = anchorFromRange(range, scope)
      if (result.ok) {
        const pos = positionFor(range.getBoundingClientRect())
        if (restoreRef.current) {
          setPanel({ kind: 'restore-confirm', anchor: result.anchor, pos })
          return
        }
        if (!current.highlightsEnabled || !current.allowedKinds.includes(result.anchor.kind)) {
          return
        }
        setPanel({ kind: 'selection-actions', anchor: result.anchor, pos })
        return
      }
      if (result.reason === 'too-long') {
        setPanel({ kind: 'selection-too-long', pos: positionFor(range.getBoundingClientRect()) })
        return
      }
      setPanel((existing) =>
        existing &&
        (existing.kind === 'selection-actions' || existing.kind === 'selection-too-long')
          ? null
          : existing,
      )
    }

    let pointerTimer = 0
    let selectionTimer = 0
    const onPointerUp = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-study-ui]')) return
      window.clearTimeout(pointerTimer)
      pointerTimer = window.setTimeout(evaluate, 10)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key.startsWith('Arrow')) {
        window.clearTimeout(pointerTimer)
        pointerTimer = window.setTimeout(evaluate, 10)
      }
    }
    // Touch selection handles never fire pointerup — debounce selectionchange.
    const onSelectionChange = () => {
      if (!window.matchMedia('(pointer: coarse)').matches) return
      window.clearTimeout(selectionTimer)
      selectionTimer = window.setTimeout(evaluate, 350)
    }
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('selectionchange', onSelectionChange)
      window.clearTimeout(pointerTimer)
      window.clearTimeout(selectionTimer)
    }
  }, [scope, positionFor])

  /* --------------------------------------------- click-on-highlight */

  useEffect(() => {
    if (!scope) return
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-study-ui]')) return
      const selection = document.getSelection()
      if (selection && !selection.isCollapsed) return
      const point = caretPointAt(document, event.clientX, event.clientY)
      if (!point || !scope.contains(point.offsetNode)) return
      const runPosition = runPositionForDomPoint(scope, point.offsetNode, point.offset)
      if (!runPosition) return
      const key = runKey(runPosition.blockId, runPosition.path)
      const hits = (stateRef.current?.highlights ?? []).filter(
        (highlight) =>
          !highlight.orphaned &&
          highlight.anchor &&
          runKey(highlight.anchor.block_id, highlight.anchor.path) === key &&
          highlight.anchor.start <= runPosition.offset &&
          runPosition.offset < highlight.anchor.end,
      )
      if (hits.length === 0) return
      const newest = hits.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
      const scopeRect = scope.getBoundingClientRect()
      setPanel({
        kind: 'hl-menu',
        id: newest.id,
        pos: {
          x: event.clientX - scopeRect.left,
          yTop: event.clientY - scopeRect.top,
          yBottom: event.clientY - scopeRect.top,
        },
      })
    }
    scope.addEventListener('click', onClick)
    return () => scope.removeEventListener('click', onClick)
  }, [scope])

  /* -------------------------------------------------- global dismissal */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPanel(null)
      setRestoreId(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!panel) return
    const dismissible =
      panel.kind === 'hl-menu' ||
      panel.kind === 'note-view' ||
      panel.kind === 'selection-too-long' ||
      panel.kind === 'restore-confirm'
    if (!dismissible) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-study-ui]')) return
      setPanel(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [panel])

  /* ------------------------------------------------------- mutations */

  const applyHighlight = useCallback(
    async (anchor: StudyAnchor, color: StudyHighlightColor, noteText?: string) => {
      setBusy(true)
      const result = await createHighlight({
        subtopicId,
        anchor,
        color,
        ...(noteText !== undefined ? { note: noteText } : {}),
      })
      setBusy(false)
      if (!result.ok) {
        showError(result.error)
        return
      }
      const now = new Date().toISOString()
      const note: StudyNote | null =
        noteText !== undefined && result.noteId
          ? { id: result.noteId, text: noteText, highlightId: result.id, updatedAt: now }
          : null
      setState((current) =>
        current
          ? {
              ...current,
              highlights: [
                ...current.highlights,
                {
                  id: result.id,
                  color,
                  anchor,
                  textSnapshot: anchor.snapshot,
                  moved: false,
                  orphaned: false,
                  createdAt: now,
                  note,
                },
              ],
            }
          : current,
      )
      try {
        window.localStorage.setItem(LAST_COLOR_KEY, color)
      } catch {
        // Storage unavailable — the amber default stands next time.
      }
      setPanel(null)
      document.getSelection()?.removeAllRanges()
      trackEvent(EVENTS.highlight_created, { kind: anchor.kind })
      if (note) trackEvent(EVENTS.note_created, { kind: 'attached' })
    },
    [subtopicId, showError],
  )

  const changeColor = useCallback(
    async (highlightId: string, color: StudyHighlightColor) => {
      setBusy(true)
      const result = await updateHighlightColor({ highlightId, color })
      setBusy(false)
      if (!result.ok) {
        showError(result.error)
        return
      }
      setState((current) =>
        current
          ? {
              ...current,
              highlights: current.highlights.map((highlight) =>
                highlight.id === highlightId ? { ...highlight, color } : highlight,
              ),
            }
          : current,
      )
      setPanel(null)
    },
    [showError],
  )

  const removeHighlight = useCallback(
    async (highlightId: string) => {
      setBusy(true)
      const result = await deleteHighlight(highlightId)
      setBusy(false)
      if (!result.ok) {
        showError(result.error)
        return
      }
      setState((current) =>
        current
          ? {
              ...current,
              highlights: current.highlights.filter((highlight) => highlight.id !== highlightId),
            }
          : current,
      )
      setPanel(null)
    },
    [showError],
  )

  const saveHighlightNote = useCallback(
    async (highlightId: string, text: string) => {
      const highlight = stateRef.current?.highlights.find((entry) => entry.id === highlightId)
      if (!highlight) return
      const isNew = highlight.note === null
      setBusy(true)
      let noteId: string
      if (isNew) {
        const created = await createNote({ subtopicId, text, highlightId })
        setBusy(false)
        if (!created.ok) {
          showError(created.error)
          return
        }
        noteId = created.id
      } else {
        const existingId = highlight.note?.id
        if (!existingId) {
          setBusy(false)
          return
        }
        const updated = await updateNote({ noteId: existingId, text })
        setBusy(false)
        if (!updated.ok) {
          showError(updated.error)
          return
        }
        noteId = existingId
      }
      const now = new Date().toISOString()
      setState((current) =>
        current
          ? {
              ...current,
              highlights: current.highlights.map((entry) =>
                entry.id === highlightId
                  ? { ...entry, note: { id: noteId, text, highlightId, updatedAt: now } }
                  : entry,
              ),
            }
          : current,
      )
      setPanel(null)
      if (isNew) trackEvent(EVENTS.note_created, { kind: 'attached' })
    },
    [subtopicId, showError],
  )

  const saveFreeNote = useCallback(
    async (text: string) => {
      setBusy(true)
      const result = await createNote({ subtopicId, text })
      setBusy(false)
      if (!result.ok) {
        showError(result.error)
        return
      }
      const now = new Date().toISOString()
      setState((current) =>
        current
          ? {
              ...current,
              freeNotes: [
                ...current.freeNotes,
                { id: result.id, text, highlightId: null, updatedAt: now },
              ],
            }
          : current,
      )
      trackEvent(EVENTS.note_created, { kind: 'free' })
    },
    [subtopicId, showError],
  )

  const saveEditedNote = useCallback(
    async (note: StudyNote, text: string) => {
      setBusy(true)
      const result = await updateNote({ noteId: note.id, text })
      setBusy(false)
      if (!result.ok) {
        showError(result.error)
        return
      }
      const now = new Date().toISOString()
      setState((current) =>
        current
          ? {
              ...current,
              freeNotes: current.freeNotes.map((entry) =>
                entry.id === note.id ? { ...entry, text, updatedAt: now } : entry,
              ),
              highlights: current.highlights.map((entry) =>
                entry.note?.id === note.id
                  ? { ...entry, note: { ...entry.note, text, updatedAt: now } }
                  : entry,
              ),
            }
          : current,
      )
    },
    [showError],
  )

  const removeNote = useCallback(
    async (note: StudyNote) => {
      setBusy(true)
      const result = await deleteNote(note.id)
      setBusy(false)
      if (!result.ok) {
        showError(result.error)
        return
      }
      setState((current) =>
        current
          ? {
              ...current,
              freeNotes: current.freeNotes.filter((entry) => entry.id !== note.id),
              highlights: current.highlights.map((entry) =>
                entry.note?.id === note.id ? { ...entry, note: null } : entry,
              ),
            }
          : current,
      )
      setPanel(null)
    },
    [showError],
  )

  const applyRestore = useCallback(
    async (anchor: StudyAnchor) => {
      const highlightId = restoreRef.current
      if (!highlightId) return
      setBusy(true)
      const result = await restoreOrphan({ highlightId, anchor })
      setBusy(false)
      if (!result.ok) {
        showError(result.error)
        return
      }
      setState((current) =>
        current
          ? {
              ...current,
              highlights: current.highlights.map((entry) =>
                entry.id === highlightId
                  ? {
                      ...entry,
                      anchor,
                      textSnapshot: anchor.snapshot,
                      orphaned: false,
                      moved: false,
                    }
                  : entry,
              ),
            }
          : current,
      )
      setRestoreId(null)
      setPanel(null)
      document.getSelection()?.removeAllRanges()
    },
    [showError],
  )

  const onBookmark = useCallback(async () => {
    setBusy(true)
    const result = await toggleBookmark({ targetType: 'subtopic', targetId: subtopicId })
    setBusy(false)
    if (!result.ok) {
      showError(result.error)
      return
    }
    setState((current) => (current ? { ...current, bookmarked: result.bookmarked } : current))
    trackEvent(EVENTS.bookmark_toggled, { target: 'subtopic' })
  }, [subtopicId, showError])

  const onComplete = useCallback(async () => {
    const completed = Boolean(stateRef.current?.completedAt)
    setBusy(true)
    const result = await setProgress({ subtopicId, completed: !completed })
    setBusy(false)
    if (!result.ok) {
      showError(result.error)
      return
    }
    setState((current) => (current ? { ...current, completedAt: result.completedAt } : current))
    setJustCompleted(!completed)
    trackEvent(completed ? EVENTS.subtopic_uncompleted : EVENTS.subtopic_completed)
  }, [subtopicId, showError])

  const jumpToHighlight = useCallback(
    (highlightId: string) => {
      const highlight = stateRef.current?.highlights.find((entry) => entry.id === highlightId)
      if (!scope || !highlight?.anchor) return
      const range = rangeForAnchor(scope, highlight.anchor)
      if (!range) return
      const rect = range.getBoundingClientRect()
      window.scrollBy({ top: rect.top - window.innerHeight / 3, behavior: 'smooth' })
      setDrawerOpen(false)
    },
    [scope],
  )

  /* --------------------------------------------------------- rendering */

  if (!state) return null

  const activeHighlight =
    panel &&
    (panel.kind === 'hl-menu' || panel.kind === 'hl-note-edit' || panel.kind === 'note-view')
      ? (state.highlights.find((entry) => entry.id === panel.id) ?? null)
      : null

  const completed = Boolean(state.completedAt)

  const noteView =
    panel?.kind === 'note-view' && activeHighlight?.note ? (
      <div className="w-[280px] border border-ink bg-surface p-3 shadow-overlay">
        <MonographLabel as="div" size="sm" className="mb-2">
          {t('note.label')}
        </MonographLabel>
        <p className="mb-2.5 whitespace-pre-wrap text-[13.5px] leading-[1.55]">
          {activeHighlight.note.text}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              setPanel({ kind: 'hl-note-edit', id: activeHighlight.id, pos: panel.pos })
            }
            className="h-8 border border-ink bg-transparent px-3 text-[12.5px] font-medium text-ink hover:bg-primary-tint [@media(pointer:coarse)]:h-11"
          >
            {t('note.edit')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const note = activeHighlight.note
              if (note) void removeNote(note)
            }}
            className="h-8 border border-line bg-transparent px-3 text-[12.5px] font-medium text-ink-2 hover:border-danger hover:text-danger [@media(pointer:coarse)]:h-11"
          >
            {t('note.delete')}
          </button>
        </div>
      </div>
    ) : null

  const tooLongStrip = (
    <div className="flex h-11 items-center border border-ink bg-surface px-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 shadow-overlay">
      {t('popover.tooLong')}
    </div>
  )

  const restoreConfirm =
    panel?.kind === 'restore-confirm' ? (
      <div className="flex border border-ink bg-surface shadow-overlay">
        <button
          type="button"
          disabled={busy}
          onClick={() => void applyRestore(panel.anchor)}
          className="flex h-11 cursor-pointer items-center gap-2 border-e border-line px-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-primary hover:bg-primary-tint"
        >
          {t('restoreFlow.confirm')}
        </button>
        <button
          type="button"
          onClick={() => setPanel(null)}
          className="flex h-11 cursor-pointer items-center px-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink hover:bg-primary-tint"
        >
          {t('restoreFlow.cancel')}
        </button>
      </div>
    ) : null

  /** Caret-anchored panels live in the scope overlay (desktop); docked
   * variants render as fixed sheets in the normal tree (touch, §6.8). */
  const anchored = (pos: Pos, place: 'above' | 'below', children: ReactNode) => (
    <div
      data-study-ui
      className="pointer-events-auto absolute z-[var(--z-overlay)]"
      style={{
        left: pos.x,
        top: place === 'above' ? pos.yTop : pos.yBottom,
        transform:
          place === 'above' ? 'translate(-50%, calc(-100% - 8px))' : 'translate(-50%, 8px)',
      }}
    >
      {children}
    </div>
  )

  const overlay =
    scope &&
    createPortal(
      <div ref={overlayRef} className="pointer-events-none absolute inset-0" data-study-ui>
        {/* Note glyphs — 12px squares at anchor ends, zero layout impact */}
        {glyphs.map((glyph) => (
          <button
            key={glyph.id}
            type="button"
            aria-label={t('glyphAria')}
            onClick={() => {
              setPanel({
                kind: 'note-view',
                id: glyph.id,
                pos: { x: glyph.x, yTop: glyph.y, yBottom: glyph.y + 14 },
              })
            }}
            className="eph-note-glyph pointer-events-auto absolute"
            style={{ left: glyph.x, top: glyph.y }}
          />
        ))}

        {!coarse && panel?.kind === 'selection-actions'
          ? anchored(
              panel.pos,
              'above',
              <SelectionPopover
                open
                docked={false}
                onHighlight={(color) => void applyHighlight(panel.anchor, color)}
                onNote={() =>
                  setPanel({ kind: 'selection-note', anchor: panel.anchor, pos: panel.pos })
                }
                onDismiss={() => setPanel(null)}
              />,
            )
          : null}
        {!coarse && panel?.kind === 'selection-note'
          ? anchored(
              panel.pos,
              'below',
              <div className="w-[300px]">
                <NoteEditor
                  busy={busy}
                  onSave={(text) => void applyHighlight(panel.anchor, loadLastColor(), text)}
                  onCancel={() => setPanel(null)}
                />
              </div>,
            )
          : null}
        {!coarse && panel?.kind === 'selection-too-long'
          ? anchored(panel.pos, 'above', tooLongStrip)
          : null}
        {!coarse && panel?.kind === 'restore-confirm'
          ? anchored(panel.pos, 'above', restoreConfirm)
          : null}
        {!coarse && panel?.kind === 'hl-menu' && activeHighlight
          ? anchored(
              panel.pos,
              'above',
              <HighlightPopover
                highlight={activeHighlight}
                busy={busy}
                onColor={(color) => void changeColor(activeHighlight.id, color)}
                onNote={() => {
                  if (activeHighlight.note) {
                    setPanel({ kind: 'note-view', id: activeHighlight.id, pos: panel.pos })
                  } else {
                    setPanel({ kind: 'hl-note-edit', id: activeHighlight.id, pos: panel.pos })
                  }
                }}
                onDelete={() => void removeHighlight(activeHighlight.id)}
              />,
            )
          : null}
        {!coarse && panel?.kind === 'hl-note-edit' && activeHighlight
          ? anchored(
              panel.pos,
              'below',
              <div className="w-[300px]">
                <NoteEditor
                  initialText={activeHighlight.note?.text ?? ''}
                  busy={busy}
                  onSave={(text) => void saveHighlightNote(activeHighlight.id, text)}
                  onCancel={() => setPanel(null)}
                />
              </div>,
            )
          : null}
        {!coarse && panel?.kind === 'note-view' && noteView
          ? anchored(panel.pos, 'below', noteView)
          : null}
      </div>,
      scope,
    )

  // Touch: every panel docks as a bottom sheet above the action bar (§6.8).
  const dockedSheet = (children: ReactNode) => (
    <div
      data-study-ui
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] z-[var(--z-overlay)] p-2"
    >
      {children}
    </div>
  )

  const dockedPanels = coarse ? (
    <>
      {panel?.kind === 'selection-actions' ? (
        <SelectionPopover
          open
          docked
          onHighlight={(color) => void applyHighlight(panel.anchor, color)}
          onNote={() => setPanel({ kind: 'selection-note', anchor: panel.anchor, pos: panel.pos })}
          onDismiss={() => setPanel(null)}
        />
      ) : null}
      {panel?.kind === 'selection-note'
        ? dockedSheet(
            <NoteEditor
              busy={busy}
              onSave={(text) => void applyHighlight(panel.anchor, loadLastColor(), text)}
              onCancel={() => setPanel(null)}
            />,
          )
        : null}
      {panel?.kind === 'selection-too-long' ? dockedSheet(tooLongStrip) : null}
      {panel?.kind === 'restore-confirm' ? dockedSheet(restoreConfirm) : null}
      {panel?.kind === 'hl-menu' && activeHighlight
        ? dockedSheet(
            <HighlightPopover
              highlight={activeHighlight}
              busy={busy}
              docked
              onColor={(color) => void changeColor(activeHighlight.id, color)}
              onNote={() => {
                if (activeHighlight.note) {
                  setPanel({ kind: 'note-view', id: activeHighlight.id, pos: panel.pos })
                } else {
                  setPanel({ kind: 'hl-note-edit', id: activeHighlight.id, pos: panel.pos })
                }
              }}
              onDelete={() => void removeHighlight(activeHighlight.id)}
            />,
          )
        : null}
      {panel?.kind === 'hl-note-edit' && activeHighlight
        ? dockedSheet(
            <NoteEditor
              initialText={activeHighlight.note?.text ?? ''}
              busy={busy}
              onSave={(text) => void saveHighlightNote(activeHighlight.id, text)}
              onCancel={() => setPanel(null)}
            />,
          )
        : null}
      {panel?.kind === 'note-view' && noteView ? dockedSheet(noteView) : null}
    </>
  ) : null

  const railPanel =
    rail &&
    createPortal(
      <div data-study-ui className="border-b border-line p-[20px_24px]">
        <MonographLabel as="div" size="sm" rule="hard" className="mb-3">
          {t('actions.label')}
        </MonographLabel>
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onComplete()}
            aria-pressed={completed}
            className={`flex h-9 w-full items-center gap-2 border px-3 text-[13px] font-medium ${
              completed
                ? 'border-primary bg-primary-tint text-primary hover:bg-transparent'
                : 'border-ink bg-transparent text-ink hover:bg-primary-tint'
            }`}
          >
            {completed ? (
              <CheckSquare size={16} strokeWidth={1.5} aria-hidden />
            ) : (
              <Square size={16} strokeWidth={1.5} aria-hidden />
            )}
            {completed ? t('actions.completed') : t('actions.complete')}
          </button>
          {state.completedAt ? (
            <Stamp animate={justCompleted}>
              {t('stamp', { date: stampDate(state.completedAt) })}
            </Stamp>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void onBookmark()}
            aria-pressed={state.bookmarked}
            className={`flex h-9 w-full items-center gap-2 border px-3 text-[13px] font-medium ${
              state.bookmarked
                ? 'border-primary bg-primary-tint text-primary hover:bg-transparent'
                : 'border-ink bg-transparent text-ink hover:bg-primary-tint'
            }`}
          >
            {state.bookmarked ? (
              <BookmarkCheck size={16} strokeWidth={1.5} aria-hidden />
            ) : (
              <Bookmark size={16} strokeWidth={1.5} aria-hidden />
            )}
            {state.bookmarked ? t('actions.bookmarked') : t('actions.bookmark')}
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-full items-center gap-2 border border-ink bg-transparent px-3 text-[13px] font-medium text-ink hover:bg-primary-tint"
          >
            <StickyNote size={16} strokeWidth={1.5} aria-hidden />
            {t('actions.notes')}
          </button>
        </div>
      </div>,
      rail,
    )

  return (
    <>
      {overlay}
      {railPanel}
      {dockedPanels}

      {/* Restore mode banner — under the sticky header (STYLE §11 strip) */}
      {restoreId ? (
        <div
          data-study-ui
          className="fixed inset-x-0 top-14 z-[var(--z-sticky)] flex items-center gap-3 border-b border-warn/40 bg-warn/10 px-5 py-2.5 md:top-16"
        >
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink">
            {t('restoreFlow.label')}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
            {t('restoreFlow.hint')}
          </span>
          <button
            type="button"
            onClick={() => {
              setRestoreId(null)
              setPanel(null)
            }}
            className="h-8 border border-ink bg-transparent px-3 text-[12.5px] font-medium text-ink hover:bg-primary-tint"
          >
            {t('restoreFlow.cancel')}
          </button>
        </div>
      ) : null}

      {/* Mobile action bar (STYLE §6.4) + flow spacer so content clears it */}
      <div data-study-ui>
        <ActionBar
          actions={[
            {
              id: 'bookmark',
              icon: state.bookmarked ? BookmarkCheck : Bookmark,
              label: state.bookmarked ? t('actions.bookmarked') : t('actions.bookmark'),
              onSelect: () => void onBookmark(),
            },
            {
              id: 'complete',
              icon: completed ? CheckSquare : Square,
              label: completed ? t('actions.completed') : t('actions.complete'),
              emphasized: completed,
              onSelect: () => void onComplete(),
            },
            {
              id: 'notes',
              icon: StickyNote,
              label: t('actions.notes'),
              onSelect: () => setDrawerOpen(true),
            },
          ]}
        />
      </div>
      <div aria-hidden className="h-14 md:hidden" />

      <NotesDrawer
        key={drawerOpen ? 'open' : 'closed'}
        open={drawerOpen}
        highlights={state.highlights}
        freeNotes={state.freeNotes}
        busy={busy}
        onClose={() => setDrawerOpen(false)}
        onJump={(highlight) => jumpToHighlight(highlight.id)}
        onRestore={(highlight) => {
          setRestoreId(highlight.id)
          setDrawerOpen(false)
        }}
        onSaveFree={(text) => void saveFreeNote(text)}
        onSaveEdit={(note, text) => void saveEditedNote(note, text)}
        onDeleteNote={(note) => void removeNote(note)}
      />

      {/* Error strip (toast rules, STYLE §11): errors persist 5s */}
      {errorText ? (
        <div
          data-study-ui
          role="alert"
          className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-1/2 z-[var(--z-toast)] -translate-x-1/2 border border-danger bg-surface px-4 py-2.5 text-[13px] text-ink shadow-overlay md:bottom-6"
        >
          {errorText}
        </div>
      ) : null}
    </>
  )
}
