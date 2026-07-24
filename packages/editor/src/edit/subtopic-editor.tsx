'use client'

import { unwrapLink, upsertLink } from '@platejs/link'
import { indentList, outdentList, someList, toggleList } from '@platejs/list'
import { insertTable } from '@platejs/table'
import type { TElement } from 'platejs'
import { nanoid, PathApi } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { Plate, PlateContent, useEditorRef, useEditorSelector, usePlateEditor } from 'platejs/react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CALLOUT_LABELS } from '../schema/labels'
import type { CalloutVariant, Content } from '../schema/types'
import { CALLOUT_VARIANTS } from '../schema/types'
import { parseYouTubeUrl } from '../schema/youtube'
import { EditorLabelsProvider, editorComponents } from './components'
import { editorKit } from './editor-kit'
import type { SubtopicEditorLabels } from './labels'
import { DEFAULT_EDITOR_LABELS } from './labels'
import { fromEditorValue, toEditorValue } from './serialize'

/**
 * <SubtopicEditor/> — the admin editing surface (M4). Autosaves every
 * `autosaveMs` (default 30s, M4 §5.4) and on editor blur; every save goes
 * through fromEditorValue → validateContent, so unvalidated JSON never
 * reaches `onSave`.
 */

export type EditorSaveResult = { ok: boolean; error?: string }

export type EditorStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error'

export type SubtopicEditorProps = {
  /** `[]` allowed — the editor seeds one empty paragraph. */
  initialContent: Content
  /** Autosave interval in ms (default 30_000). */
  autosaveMs?: number
  onSave: (content: Content) => Promise<EditorSaveResult>
  onStatusChange?: (status: EditorStatus) => void
  /** Merged over DEFAULT_EDITOR_LABELS. */
  labels?: Partial<SubtopicEditorLabels>
}

/* ---------------------------------------------------------------- chrome */

const controlClass =
  'h-8 border border-line bg-surface px-1.5 font-mono text-xs text-ink focus:border-ink focus:outline-none'

const buttonClass = (pressed: boolean) =>
  `flex h-8 min-w-8 items-center justify-center border px-1.5 font-mono text-xs disabled:opacity-40 ${
    pressed
      ? 'border-ink bg-primary-tint text-primary'
      : 'border-transparent text-ink-2 hover:border-line'
  }`

function ToolbarButton({
  label,
  pressed = false,
  disabled = false,
  title,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      // Keep the editor selection: focus must not move to the button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={buttonClass(pressed)}
    >
      {children}
    </button>
  )
}

function BlockTypeSelect({ labels }: { labels: SubtopicEditorLabels }) {
  const editor = useEditorRef()
  const value = useEditorSelector((ed) => {
    const type = ed.api.block({ highest: true })?.[0]?.type
    return type === 'h2' || type === 'h3' || type === 'blockquote' ? type : 'p'
  }, [])
  return (
    <select
      aria-label={labels.blockTypeLabel}
      value={value}
      onChange={(event) => {
        const next = event.target.value
        const entry = editor.api.block({ highest: true })
        if (entry && (entry[0].listStyleType !== undefined || entry[0].indent !== undefined)) {
          editor.tf.unsetNodes(['listStyleType', 'indent', 'listStart'], { at: entry[1] })
        }
        editor.tf.toggleBlock(next)
        editor.tf.focus()
      }}
      className={controlClass}
    >
      <option value="p">{labels.blockParagraph}</option>
      <option value="h2">{labels.blockHeading2}</option>
      <option value="h3">{labels.blockHeading3}</option>
      <option value="blockquote">{labels.blockQuote}</option>
    </select>
  )
}

function MarkButton({
  mark,
  clears,
  label,
  children,
}: {
  mark: string
  /** Mutually exclusive mark to remove (sub ↔ sup). */
  clears?: string
  label: string
  children: ReactNode
}) {
  const editor = useEditorRef()
  const pressed = useEditorSelector(
    (ed) => {
      try {
        const marks = ed.api.marks()
        return marks ? marks[mark as keyof typeof marks] === true : false
      } catch {
        return false
      }
    },
    [mark],
  )
  return (
    <ToolbarButton
      label={label}
      pressed={pressed}
      onClick={() => {
        editor.tf.toggleMark(mark, clears ? { remove: clears } : undefined)
        editor.tf.focus()
      }}
    >
      {children}
    </ToolbarButton>
  )
}

function ListControls({ labels }: { labels: SubtopicEditorLabels }) {
  const editor = useEditorRef()
  const bulleted = useEditorSelector((ed) => someList(ed, 'disc'), [])
  const numbered = useEditorSelector((ed) => someList(ed, 'decimal'), [])
  const inList = bulleted || numbered
  return (
    <>
      <ToolbarButton
        label={labels.listBulleted}
        pressed={bulleted}
        onClick={() => {
          toggleList(editor, { listStyleType: 'disc' })
          editor.tf.focus()
        }}
      >
        •≡
      </ToolbarButton>
      <ToolbarButton
        label={labels.listNumbered}
        pressed={numbered}
        onClick={() => {
          toggleList(editor, { listStyleType: 'decimal' })
          editor.tf.focus()
        }}
      >
        1≡
      </ToolbarButton>
      <ToolbarButton
        label={labels.listIndent}
        disabled={!inList}
        onClick={() => {
          indentList(editor)
          editor.tf.focus()
        }}
      >
        →
      </ToolbarButton>
      <ToolbarButton
        label={labels.listOutdent}
        disabled={!inList}
        onClick={() => {
          outdentList(editor)
          editor.tf.focus()
        }}
      >
        ←
      </ToolbarButton>
    </>
  )
}

/** Inserts a block after the current top-level block (or at the end). */
function insertBlockBelow(editor: PlateEditor, node: TElement) {
  const entry = editor.api.block({ highest: true })
  if (entry) {
    editor.tf.insertNodes(node, { at: PathApi.next(entry[1]), select: true })
  } else {
    editor.tf.insertNodes(node, { select: true })
  }
}

function InsertMenu({
  labels,
  onOpenVideoForm,
}: {
  labels: SubtopicEditorLabels
  onOpenVideoForm: () => void
}) {
  const editor = useEditorRef()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const item = (label: string, onPick: () => void, disabled = false, title?: string) => (
    <button
      type="button"
      disabled={disabled}
      title={title ?? label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        setOpen(false)
        onPick()
      }}
      className="block w-full whitespace-nowrap px-3 py-1.5 text-left font-mono text-xs text-ink hover:bg-paper disabled:opacity-40"
    >
      {label}
    </button>
  )

  return (
    <div ref={rootRef} className="relative">
      <ToolbarButton label={labels.insertMenu} pressed={open} onClick={() => setOpen(!open)}>
        + {labels.insertMenu}
      </ToolbarButton>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-px min-w-48 border border-ink bg-surface py-1 shadow-none">
          {item(labels.insertTable, () => {
            insertTable(editor, { colCount: 3, rowCount: 3, header: true })
            editor.tf.focus()
          })}
          <p className="select-none px-3 pb-0.5 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-2">
            {labels.insertCallout}
          </p>
          {CALLOUT_VARIANTS.map((variant: CalloutVariant) => (
            <button
              key={variant}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false)
                insertBlockBelow(editor, {
                  type: 'callout',
                  variant,
                  children: [{ type: 'p', children: [{ text: '' }] }],
                })
                editor.tf.focus()
              }}
              className="block w-full whitespace-nowrap px-3 py-1 pl-6 text-left font-mono text-xs text-ink hover:bg-paper"
            >
              {CALLOUT_LABELS[variant]}
            </button>
          ))}
          {item(labels.insertCodeBlock, () => {
            insertBlockBelow(editor, {
              type: 'code_block',
              children: [{ type: 'code_line', children: [{ text: '' }] }],
            })
            editor.tf.focus()
          })}
          {item(labels.insertToc, () => {
            insertBlockBelow(editor, { type: 'toc', children: [{ text: '' }] })
            editor.tf.focus()
          })}
          {item(labels.insertDrugCard, () => {
            insertBlockBelow(editor, {
              type: 'drug_card',
              fields: { generic_name: '' },
              children: [{ text: '' }],
            })
          })}
          {item(labels.insertVideo, onOpenVideoForm)}
          {/* Media-library picker arrives next slice — rendered disabled. */}
          {item(labels.insertImage, () => undefined, true, labels.imageDisabledNote)}
        </div>
      ) : null}
    </div>
  )
}

function LinkRow({ labels, onClose }: { labels: SubtopicEditorLabels; onClose: () => void }) {
  const editor = useEditorRef()
  const [url, setUrl] = useState('')
  return (
    <div className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1">
      <input
        autoFocus
        placeholder={labels.linkUrlPlaceholder}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (url.trim() !== '') upsertLink(editor, { url: url.trim() })
            onClose()
            editor.tf.focus()
          }
          if (event.key === 'Escape') onClose()
        }}
        className={`${controlClass} h-7 w-72 bg-paper placeholder:text-ink-2`}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (url.trim() !== '') upsertLink(editor, { url: url.trim() })
          onClose()
          editor.tf.focus()
        }}
        className="h-7 border border-ink bg-surface px-2 font-mono text-[11px] uppercase text-ink hover:bg-paper"
      >
        {labels.linkApply}
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
        className="h-7 border border-line bg-surface px-2 font-mono text-[11px] uppercase text-ink-2 hover:bg-paper"
      >
        {labels.linkCancel}
      </button>
    </div>
  )
}

function VideoRow({ labels, onClose }: { labels: SubtopicEditorLabels; onClose: () => void }) {
  const editor = useEditorRef()
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [invalid, setInvalid] = useState(false)
  const inputClass = `${controlClass} h-7 bg-paper placeholder:text-ink-2`
  const submit = () => {
    if (parseYouTubeUrl(url.trim()) === null) {
      setInvalid(true)
      return
    }
    insertBlockBelow(editor, {
      type: 'video',
      url: url.trim(),
      caption: [{ text: caption }],
      children: [{ text: '' }],
    })
    onClose()
  }
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1">
      <input
        autoFocus
        placeholder={labels.videoUrlPlaceholder}
        aria-label={labels.videoUrlPlaceholder}
        value={url}
        onChange={(event) => {
          setUrl(event.target.value)
          setInvalid(false)
        }}
        className={`${inputClass} w-72`}
      />
      <input
        placeholder={labels.videoCaptionPlaceholder}
        aria-label={labels.videoCaptionPlaceholder}
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        className={`${inputClass} w-72`}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={submit}
        className="h-7 border border-ink bg-surface px-2 font-mono text-[11px] uppercase text-ink hover:bg-paper"
      >
        {labels.videoInsert}
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
        className="h-7 border border-line bg-surface px-2 font-mono text-[11px] uppercase text-ink-2 hover:bg-paper"
      >
        {labels.videoCancel}
      </button>
      {invalid ? (
        <span className="font-mono text-[11px] text-danger">{labels.videoInvalidUrl}</span>
      ) : null}
    </div>
  )
}

const STATUS_TONE: Record<EditorStatus, string> = {
  clean: 'text-ink-2',
  dirty: 'text-ink-2',
  saving: 'text-ink-2',
  saved: 'text-primary',
  error: 'text-danger',
}

function Toolbar({ labels, status }: { labels: SubtopicEditorLabels; status: EditorStatus }) {
  const editor = useEditorRef()
  const hasLink = useEditorSelector((ed) => !!ed.api.some({ match: { type: 'a' } }), [])
  const [panel, setPanel] = useState<'link' | 'video' | null>(null)

  const statusLabel: Record<EditorStatus, string> = {
    clean: labels.statusClean,
    dirty: labels.statusDirty,
    saving: labels.statusSaving,
    saved: labels.statusSaved,
    error: labels.statusError,
  }

  return (
    <div className="sticky top-0 z-10 border-b border-ink bg-surface">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        <BlockTypeSelect labels={labels} />
        <MarkButton mark="bold" label={labels.markBold}>
          <span className="font-bold">B</span>
        </MarkButton>
        <MarkButton mark="italic" label={labels.markItalic}>
          <span className="italic">I</span>
        </MarkButton>
        <MarkButton mark="underline" label={labels.markUnderline}>
          <span className="underline">U</span>
        </MarkButton>
        <MarkButton mark="strikethrough" label={labels.markStrikethrough}>
          <span className="line-through">S</span>
        </MarkButton>
        <MarkButton mark="code" label={labels.markCode}>
          {'</>'}
        </MarkButton>
        <MarkButton mark="sub" clears="sup" label={labels.markSubscript}>
          x₂
        </MarkButton>
        <MarkButton mark="sup" clears="sub" label={labels.markSuperscript}>
          x²
        </MarkButton>
        <ListControls labels={labels} />
        <ToolbarButton
          label={labels.linkAdd}
          pressed={panel === 'link'}
          onClick={() => setPanel(panel === 'link' ? null : 'link')}
        >
          ⌁
        </ToolbarButton>
        <ToolbarButton
          label={labels.linkRemove}
          disabled={!hasLink}
          onClick={() => {
            unwrapLink(editor)
            editor.tf.focus()
          }}
        >
          ⌀
        </ToolbarButton>
        <InsertMenu labels={labels} onOpenVideoForm={() => setPanel('video')} />
        <span
          className={`ml-auto select-none font-mono text-[10px] uppercase tracking-widest ${STATUS_TONE[status]}`}
        >
          {statusLabel[status]}
        </span>
      </div>
      {panel === 'link' ? <LinkRow labels={labels} onClose={() => setPanel(null)} /> : null}
      {panel === 'video' ? <VideoRow labels={labels} onClose={() => setPanel(null)} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------ the editor */

export function SubtopicEditor({
  initialContent,
  autosaveMs = 30_000,
  onSave,
  onStatusChange,
  labels: labelOverrides,
}: SubtopicEditorProps) {
  const labels = useMemo(() => ({ ...DEFAULT_EDITOR_LABELS, ...labelOverrides }), [labelOverrides])

  // Mount-time snapshot: the editor owns the value after mount.
  const [initialValue] = useState(() =>
    toEditorValue(
      initialContent.length > 0
        ? initialContent
        : [{ id: nanoid(10), type: 'p' as const, children: [{ text: '' }] }],
    ),
  )

  const editor = usePlateEditor({
    plugins: editorKit,
    components: editorComponents,
    value: initialValue,
  })

  const [status, setStatusState] = useState<EditorStatus>('clean')
  const [errorText, setErrorText] = useState<string | null>(null)

  const statusRef = useRef<EditorStatus>('clean')
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange
  // Latest-save/schedule refs so timers and DOM handlers never go stale.
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const setStatus = useCallback((next: EditorStatus) => {
    if (statusRef.current === next) return
    statusRef.current = next
    setStatusState(next)
    onStatusChangeRef.current?.(next)
  }, [])

  const schedule = useCallback(() => {
    if (timerRef.current !== null) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void saveRef.current()
    }, autosaveMs)
  }, [autosaveMs])

  saveRef.current = async () => {
    if (!dirtyRef.current || savingRef.current) return
    const result = fromEditorValue(editor.children)
    if (!result.ok) {
      // Validation failure: stay dirty, surface the first error, retry later.
      setErrorText(result.errors[0] ?? null)
      setStatus('error')
      schedule()
      return
    }
    savingRef.current = true
    dirtyRef.current = false
    setErrorText(null)
    setStatus('saving')
    try {
      const saved = await onSaveRef.current(result.content)
      if (saved.ok) {
        if (dirtyRef.current) {
          setStatus('dirty')
          schedule()
        } else {
          setStatus('saved')
        }
      } else {
        dirtyRef.current = true
        setErrorText(saved.error ?? null)
        setStatus('error')
        schedule()
      }
    } catch (error) {
      dirtyRef.current = true
      setErrorText(error instanceof Error ? error.message : null)
      setStatus('error')
      schedule()
    } finally {
      savingRef.current = false
    }
  }

  const markDirty = useCallback(() => {
    dirtyRef.current = true
    if (statusRef.current !== 'saving' && statusRef.current !== 'error') setStatus('dirty')
    schedule()
  }, [schedule, setStatus])

  // Clear the pending autosave timer on unmount.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )

  return (
    <EditorLabelsProvider value={labels}>
      <Plate editor={editor} onValueChange={markDirty}>
        <div className="border border-ink bg-surface">
          <Toolbar labels={labels} status={status} />
          {status === 'error' ? (
            <p className="border-b border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-danger">
              {labels.validationErrorPrefix}
              {errorText ? `: ${errorText}` : ''}
            </p>
          ) : null}
          <PlateContent
            aria-label={labels.editorAriaLabel}
            className="min-h-[320px] w-full max-w-none bg-surface p-5 text-ink focus:outline-none"
            onBlur={() => void saveRef.current()}
          />
        </div>
      </Plate>
    </EditorLabelsProvider>
  )
}
