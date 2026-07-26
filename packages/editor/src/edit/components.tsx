'use client'

import { useToggleButton, useToggleButtonState } from '@platejs/toggle/react'
import { ChevronRight } from 'lucide-react'
import type { TElement } from 'platejs'
import { NodeApi, PathApi } from 'platejs'
import type { PlateElementProps, PlateLeafProps } from 'platejs/react'
import { PlateElement, PlateLeaf, useEditorRef, useReadOnly, useSelected } from 'platejs/react'
import { useRef, useState } from 'react'

import { formatDateDisplay } from '../schema/date'
import { CALLOUT_LABELS, DRUG_CARD_FIELD_LABELS } from '../schema/labels'
import type { CalloutVariant, DrugCardFieldKey } from '../schema/types'
import { CALLOUT_VARIANTS, DRUG_CARD_FIELD_KEYS } from '../schema/types'
import {
  isYouTubeShortsUrl,
  parseYouTubeUrl,
  youTubeShortsThumbnailUrl,
  youTubeThumbnailUrl,
} from '../schema/youtube'
import { CarouselElement } from './carousel-node'
import { useEditorLabels } from './context'
import { EmojiInputElement } from './emoji-input'
import { EquationElement, InlineEquationElement } from './equation-node'
import { SlashInputElement } from './slash-input'

/**
 * Editing-surface node components. Styling uses the app's semantic tokens
 * only (bg-paper/bg-surface/text-ink/…, 0px radius design system) — the
 * consuming app's Tailwind build owns the actual CSS.
 *
 * Chrome strings come from EditorLabelsContext (provided by
 * <SubtopicEditor/> with the merged labels); schema-owned names (callout
 * variants, Drug Card fields) reuse CALLOUT_LABELS / DRUG_CARD_FIELD_LABELS.
 */

export { EditorLabelsProvider, useEditorLabels } from './context'

/* ----------------------------------------------------------------- utils */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Plain text of a caption prop (TextNode[]). */
const captionText = (value: unknown): string =>
  Array.isArray(value)
    ? value
        .map((node) => (isRecord(node) && typeof node.text === 'string' ? node.text : ''))
        .join('')
    : ''

const eyebrowClass = 'select-none font-mono text-[10px] uppercase tracking-widest text-primary'

const chromeInputClass =
  'w-full border border-line bg-paper px-2 py-1 font-mono text-xs text-ink placeholder:text-ink-2 focus:border-ink focus:outline-none'

/* ---------------------------------------------------------------- blocks */

export function ParagraphElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  const element = props.element as TElement
  // Notion-style hint on the empty FIRST paragraph only ("Type / for
  // commands…"). Space is not reserved — the hint is absolutely positioned,
  // so its appearance never shifts the text (zero CLS).
  // Block styling (align/lineHeight/indent margin) arrives via the plugin
  // nodeProps injection — no manual style plumbing here.
  const showPlaceholder =
    props.path.length === 1 &&
    props.path[0] === 0 &&
    element.children.length === 1 &&
    NodeApi.string(element) === ''
  return (
    <PlateElement {...props} as="div" className="relative my-2 text-ink">
      {showPlaceholder ? (
        <span
          contentEditable={false}
          aria-hidden
          className="pointer-events-none absolute start-0 top-0 select-none text-ink-2 opacity-60"
        >
          {labels.emptyPlaceholder}
        </span>
      ) : null}
      {props.children}
    </PlateElement>
  )
}

/* ------------------------------------------------------- classic lists */

export function BulletedListElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="ul"
      className="my-2 list-disc ps-6 text-ink [&_ul]:list-[circle] [&_ul_ul]:list-[square]"
    >
      {props.children}
    </PlateElement>
  )
}

export function NumberedListElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="ol" className="my-2 list-decimal ps-6 text-ink">
      {props.children}
    </PlateElement>
  )
}

export function ListItemElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="li" className="my-0.5">
      {props.children}
    </PlateElement>
  )
}

export function ListItemContentElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="div">
      {props.children}
    </PlateElement>
  )
}

/* --------------------------------------------------------------- toggle */

export function ToggleElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  const element = props.element
  const state = useToggleButtonState(element.id as string)
  const { buttonProps, open } = useToggleButton(state)
  return (
    <PlateElement {...props} className="relative my-2 ps-6 text-ink">
      <button
        type="button"
        aria-label={labels.toggleButtonLabel}
        title={labels.toggleButtonLabel}
        contentEditable={false}
        className="absolute -start-0.5 top-0 flex size-6 select-none items-center justify-center text-ink-2 hover:bg-paper hover:text-ink"
        {...buttonProps}
      >
        <ChevronRight
          className={`size-4 transition-transform duration-75 ${open ? 'rotate-90' : 'rotate-0'}`}
          aria-hidden
        />
      </button>
      {props.children}
    </PlateElement>
  )
}

/* -------------------------------------------------------------- columns */

export function ColumnGroupElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className="my-3">
      <div className="flex w-full gap-3">{props.children}</div>
    </PlateElement>
  )
}

/** Snap stops for the column divider, as the first column's share of the
 * PAIR it is splitting: 1:2, 1:1, 2:1 (the founder's fixed-ratio scheme). */
const COLUMN_RATIO_STOPS = [1 / 3, 1 / 2, 2 / 3]

export function ColumnElement(props: PlateElementProps) {
  const width = typeof props.element.width === 'string' ? props.element.width : undefined
  const readOnly = useReadOnly()
  const editor = useEditorRef()
  const labels = useEditorLabels()
  const outerRef = useRef<HTMLDivElement>(null)

  // A divider renders after every column except the last. Dragging re-splits
  // the PAIR's stored percentage sum, snapped to the fixed ratio stops, so
  // the group total is always preserved exactly.
  const path = editor.api.findPath(props.element)
  const parentNode = path ? (editor.api.parent(path)?.[0] as TElement | undefined) : undefined
  const hasNext =
    !!path && !!parentNode && (path[path.length - 1] ?? 0) < parentNode.children.length - 1

  const onDividerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const outer = outerRef.current
    const next = outer?.nextElementSibling as HTMLElement | null
    const at = editor.api.findPath(props.element)
    if (!outer || !next || !at) return
    event.preventDefault()
    const nextPath = PathApi.next(at)
    const nextEntry = editor.api.node<TElement>(nextPath)
    const group = outer.parentElement
    if (!nextEntry || !group) return

    const rtl = getComputedStyle(group).direction === 'rtl'
    const startX = event.clientX
    const leftStartPx = outer.getBoundingClientRect().width
    const pairPx = leftStartPx + next.getBoundingClientRect().width
    const fallback = 100 / Math.max(parentNode?.children.length ?? 2, 1)
    const pctOf = (value: unknown) => {
      const parsed = typeof value === 'string' ? Number.parseFloat(value) : NaN
      return Number.isFinite(parsed) ? parsed : fallback
    }
    const pairPct = pctOf(props.element.width) + pctOf(nextEntry[0].width)
    let leftPct = pctOf(props.element.width)

    const onMove = (move: PointerEvent) => {
      const dx = (move.clientX - startX) * (rtl ? -1 : 1)
      const ratio = Math.min(Math.max((leftStartPx + dx) / pairPx, 0), 1)
      const snapped = COLUMN_RATIO_STOPS.reduce((best, stop) =>
        Math.abs(stop - ratio) < Math.abs(best - ratio) ? stop : best,
      )
      leftPct = snapped * pairPct
      outer.style.width = `${leftPct}%`
      next.style.width = `${pairPct - leftPct}%`
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      editor.tf.withoutNormalizing(() => {
        editor.tf.setNodes({ width: `${leftPct.toFixed(2)}%` }, { at })
        editor.tf.setNodes({ width: `${(pairPct - leftPct).toFixed(2)}%` }, { at: nextPath })
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div ref={outerRef} style={{ width: width ?? '100%' }} className="relative min-w-0">
      {!readOnly && hasNext ? (
        <div
          contentEditable={false}
          role="separator"
          aria-orientation="vertical"
          aria-label={labels.columnResizeLabel}
          title={labels.columnResizeLabel}
          onPointerDown={onDividerPointerDown}
          className="group/colresize absolute inset-y-0 -end-3 z-10 flex w-3 cursor-col-resize touch-none select-none items-center justify-center"
        >
          <div className="h-full w-px bg-line transition-all group-hover/colresize:w-0.5 group-hover/colresize:bg-primary" />
        </div>
      ) : null}
      <PlateElement {...props} className="h-full">
        <div className={`h-full p-1.5 ${readOnly ? '' : 'border border-dashed border-line'}`}>
          {props.children}
        </div>
      </PlateElement>
    </div>
  )
}

/* ------------------------------------------------------ horizontal rule */

export function HrElement(props: PlateElementProps) {
  const selected = useSelected()
  return (
    <PlateElement {...props} className="my-4">
      <div contentEditable={false} className={selected ? 'bg-primary-tint py-2' : 'py-2'}>
        <hr className="border-t border-ink" />
      </div>
      {props.children}
    </PlateElement>
  )
}

/* ----------------------------------------------------------- inline date */

export function DateElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  const { editor, element } = props
  const [open, setOpen] = useState(false)
  const value = typeof element.date === 'string' ? element.date : ''
  const readOnly = useReadOnly()
  return (
    <PlateElement {...props} as="span" className="relative inline-block">
      <span contentEditable={false}>
        <button
          type="button"
          aria-label={labels.dateEditLabel}
          title={labels.dateEditLabel}
          disabled={readOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
          className="border border-line bg-paper px-1 font-mono text-[0.85em] text-ink hover:border-ink"
        >
          {value ? formatDateDisplay(value) : labels.datePlaceholder}
        </button>
        {open && !readOnly ? (
          <span className="absolute start-0 top-full z-30 mt-px block border border-ink bg-surface p-1">
            <input
              type="date"
              autoFocus
              aria-label={labels.dateEditLabel}
              value={value}
              onChange={(event) => {
                const next = event.target.value
                if (next !== '') {
                  editor.tf.setNodes({ date: next }, { at: props.path })
                }
              }}
              onBlur={() => setOpen(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault()
                  setOpen(false)
                  editor.tf.focus()
                }
              }}
              className={chromeInputClass}
            />
          </span>
        ) : null}
      </span>
      {props.children}
    </PlateElement>
  )
}

/* ----------------------------------------------------------- mark leafs */

export function HighlightLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="mark" className="bg-primary-tint text-inherit">
      {props.children}
    </PlateLeaf>
  )
}

export function KbdLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf
      {...props}
      as="kbd"
      className="border border-line bg-paper px-1 font-mono text-[0.85em] shadow-none"
    >
      {props.children}
    </PlateLeaf>
  )
}

export function H2Element(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="h2" className="mb-3 mt-8 font-display text-2xl text-ink">
      {props.children}
    </PlateElement>
  )
}

export function H3Element(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="h3" className="mb-2 mt-6 font-display text-xl text-ink">
      {props.children}
    </PlateElement>
  )
}

export function BlockquoteElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="blockquote"
      className="my-4 border-l-2 border-ink pl-4 italic text-ink-2"
    >
      {props.children}
    </PlateElement>
  )
}

export function LinkElement(props: PlateElementProps) {
  const url = typeof props.element.url === 'string' ? props.element.url : ''
  return (
    <PlateElement
      {...props}
      as="a"
      className="text-primary underline underline-offset-2"
      attributes={{ ...props.attributes, href: url }}
    >
      {props.children}
    </PlateElement>
  )
}

/* --------------------------------------------------------------- callout */

export function CalloutElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  const { editor, element } = props
  const rawVariant = element.variant
  const variant: CalloutVariant = CALLOUT_VARIANTS.includes(rawVariant as CalloutVariant)
    ? (rawVariant as CalloutVariant)
    : 'definition'
  return (
    <PlateElement {...props} as="aside" className="my-4 border border-ink bg-primary-tint p-4">
      <div contentEditable={false} className="mb-2 flex items-center justify-between gap-2">
        <span className={eyebrowClass}>{CALLOUT_LABELS[variant]}</span>
        <select
          aria-label={labels.calloutVariantLabel}
          value={variant}
          onChange={(event) =>
            editor.tf.setNodes(
              { variant: event.target.value as CalloutVariant },
              { at: props.path },
            )
          }
          className="h-6 border border-line bg-surface px-1 font-mono text-[10px] uppercase text-ink focus:border-ink focus:outline-none"
        >
          {CALLOUT_VARIANTS.map((option) => (
            <option key={option} value={option}>
              {CALLOUT_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
      {props.children}
    </PlateElement>
  )
}

/* ----------------------------------------------------------------- table */

export function TableElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="table" className="my-4 w-full border-collapse border border-line">
      <tbody>{props.children}</tbody>
    </PlateElement>
  )
}

export function TableRowElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="tr">
      {props.children}
    </PlateElement>
  )
}

export function TableCellElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="td" className="border border-line p-2 align-top text-ink">
      {props.children}
    </PlateElement>
  )
}

export function TableHeaderCellElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="th"
      className="border border-line bg-paper p-2 text-left align-top font-semibold text-ink"
    >
      {props.children}
    </PlateElement>
  )
}

/* ------------------------------------------------------------ code block */

export function CodeBlockElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  const { editor, element } = props
  const lang = typeof element.lang === 'string' ? element.lang : ''
  return (
    <PlateElement {...props} className="relative my-4 border border-line bg-paper">
      <div contentEditable={false} className="absolute end-1 top-1 z-10">
        <input
          aria-label={labels.codeLangLabel}
          placeholder={labels.codeLangLabel}
          value={lang}
          onChange={(event) => {
            const next = event.target.value
            if (next === '') editor.tf.unsetNodes(['lang'], { at: props.path })
            else editor.tf.setNodes({ lang: next }, { at: props.path })
          }}
          className="w-24 border border-line bg-surface px-1 py-0.5 font-mono text-[10px] text-ink-2 placeholder:text-ink-2 focus:border-ink focus:outline-none"
        />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm text-ink">
        <code>{props.children}</code>
      </pre>
    </PlateElement>
  )
}

export function CodeLineElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="div">
      {props.children}
    </PlateElement>
  )
}

export function CodeLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf
      {...props}
      as="code"
      className="border border-line bg-paper px-1 font-mono text-[0.85em]"
    >
      {props.children}
    </PlateLeaf>
  )
}

/* ----------------------------------------------------------------- voids */

/** Caption input shared by img/video voids — writes via setNodes. */
function CaptionInput({ props, required }: { props: PlateElementProps; required?: boolean }) {
  const labels = useEditorLabels()
  const { editor, element } = props
  const value = captionText(element.caption)
  return (
    <input
      aria-label={labels.captionPlaceholder}
      placeholder={labels.captionPlaceholder}
      value={value}
      onChange={(event) => {
        const text = event.target.value
        if (text === '' && !required) {
          editor.tf.unsetNodes(['caption'], { at: props.path })
        } else {
          editor.tf.setNodes({ caption: [{ text }] }, { at: props.path })
        }
      }}
      className={`mt-2 ${chromeInputClass}`}
    />
  )
}

export function ImageElement(props: PlateElementProps) {
  const { element } = props
  const url = typeof element.url === 'string' ? element.url : ''
  const alt = typeof element.alt === 'string' ? element.alt : ''
  return (
    <PlateElement {...props} as="figure" className="my-4">
      <div contentEditable={false}>
        <img src={url} alt={alt} className="max-w-full border border-line" />
        <CaptionInput props={props} />
      </div>
      {props.children}
    </PlateElement>
  )
}

export function VideoElement(props: PlateElementProps) {
  const { element } = props
  const url = typeof element.url === 'string' ? element.url : ''
  const videoId = parseYouTubeUrl(url)
  // Shorts links render vertical (9:16), width-capped — derived from the
  // URL form; the vertical poster falls back to the landscape one when
  // YouTube has no oardefault for the video.
  const shorts = isYouTubeShortsUrl(url)
  return (
    <PlateElement {...props} as="figure" className="my-4">
      {/* No iframe in the editor — a static thumbnail facade only. */}
      <div contentEditable={false} className="border border-line bg-paper p-2">
        {videoId ? (
          <img
            src={shorts ? youTubeShortsThumbnailUrl(videoId) : youTubeThumbnailUrl(videoId)}
            alt=""
            onError={(event) => {
              if (shorts) event.currentTarget.src = youTubeThumbnailUrl(videoId)
            }}
            className={
              shorts
                ? 'mx-auto aspect-[9/16] w-full max-w-60 border border-line object-cover'
                : 'aspect-video w-full max-w-full border border-line object-cover'
            }
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center border border-line">
            <span className={eyebrowClass}>?</span>
          </div>
        )}
        <p className="mt-2 select-all font-mono text-[11px] text-ink-2">{url}</p>
        <CaptionInput props={props} required />
      </div>
      {props.children}
    </PlateElement>
  )
}

export function TocElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  return (
    <PlateElement {...props} as="div" className="my-4">
      <div
        contentEditable={false}
        className="flex items-center justify-center border border-line bg-paper p-4"
      >
        <span className="select-none font-mono text-[10px] uppercase tracking-widest text-ink-2">
          {labels.tocPlaceholder}
        </span>
      </div>
      {props.children}
    </PlateElement>
  )
}

/* ------------------------------------------------------------- drug card */

const MULTILINE_FIELDS: ReadonlySet<DrugCardFieldKey> = new Set<DrugCardFieldKey>([
  'mechanism',
  'indications',
  'contraindications',
  'adverse_effects',
  'interactions',
  'dosing',
  'monitoring',
  'pregnancy_lactation',
  'notes',
])

export function DrugCardElement(props: PlateElementProps) {
  const { editor, element } = props
  const fields = isRecord(element.fields) ? element.fields : {}

  const setField = (key: DrugCardFieldKey, value: string) => {
    const next: Record<string, unknown> = { ...fields }
    if (value === '' && key !== 'generic_name') {
      delete next[key]
    } else {
      next[key] = value
    }
    editor.tf.setNodes({ fields: next }, { at: props.path })
  }

  return (
    <PlateElement {...props} as="section" className="my-4 border border-ink bg-surface">
      <div contentEditable={false} className="grid gap-3 p-4">
        {DRUG_CARD_FIELD_KEYS.map((key) => {
          const value = typeof fields[key] === 'string' ? (fields[key] as string) : ''
          const emphasized = key === 'generic_name'
          return (
            <label key={key} className="grid gap-1">
              <span className={eyebrowClass}>{DRUG_CARD_FIELD_LABELS[key]}</span>
              {MULTILINE_FIELDS.has(key) ? (
                <textarea
                  rows={2}
                  value={value}
                  onChange={(event) => setField(key, event.target.value)}
                  className={chromeInputClass}
                />
              ) : (
                <input
                  value={value}
                  onChange={(event) => setField(key, event.target.value)}
                  className={
                    emphasized
                      ? 'w-full border border-line bg-paper px-2 py-1 font-display text-lg text-ink placeholder:text-ink-2 focus:border-ink focus:outline-none'
                      : chromeInputClass
                  }
                />
              )}
            </label>
          )
        })}
      </div>
      {props.children}
    </PlateElement>
  )
}

/* ------------------------------------------------------------------- map */

/**
 * Components keyed by PLUGIN KEY (marks keep their original plugin keys —
 * 'subscript'/'superscript' render sub/sup tags by default, no override
 * needed). Passed to usePlateEditor({ components }).
 */
export const editorComponents = {
  p: ParagraphElement,
  h2: H2Element,
  h3: H3Element,
  blockquote: BlockquoteElement,
  a: LinkElement,
  callout: CalloutElement,
  table: TableElement,
  tr: TableRowElement,
  td: TableCellElement,
  th: TableHeaderCellElement,
  code_block: CodeBlockElement,
  code_line: CodeLineElement,
  code: CodeLeaf,
  img: ImageElement,
  carousel: CarouselElement,
  video: VideoElement,
  toc: TocElement,
  drug_card: DrugCardElement,
  // Schema v2 blocks.
  ul: BulletedListElement,
  ol: NumberedListElement,
  li: ListItemElement,
  lic: ListItemContentElement,
  toggle: ToggleElement,
  column_group: ColumnGroupElement,
  column: ColumnElement,
  hr: HrElement,
  date: DateElement,
  // KaTeX equations (vendored official node components, equation-node.tsx).
  equation: EquationElement,
  inline_equation: InlineEquationElement,
  // Marks.
  highlight: HighlightLeaf,
  kbd: KbdLeaf,
  // Editor-time inline comboboxes (never stored).
  slash_input: SlashInputElement,
  emoji_input: EmojiInputElement,
}
