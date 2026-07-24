'use client'

import type { TElement } from 'platejs'
import { NodeApi } from 'platejs'
import type { PlateElementProps, PlateLeafProps } from 'platejs/react'
import { PlateElement, PlateLeaf } from 'platejs/react'

import { CALLOUT_LABELS, DRUG_CARD_FIELD_LABELS } from '../schema/labels'
import type { CalloutVariant, DrugCardFieldKey } from '../schema/types'
import { CALLOUT_VARIANTS, DRUG_CARD_FIELD_KEYS } from '../schema/types'
import { parseYouTubeUrl, youTubeThumbnailUrl } from '../schema/youtube'
import { useEditorLabels } from './context'
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
  const element = props.element as TElement & { indent?: unknown; listStyleType?: unknown }
  const indent = typeof element.indent === 'number' ? element.indent : 0
  // Notion-style hint on the empty FIRST paragraph only ("Type / for
  // commands…"). Space is not reserved — the hint is absolutely positioned,
  // so its appearance never shifts the text (zero CLS).
  const showPlaceholder =
    props.path.length === 1 &&
    props.path[0] === 0 &&
    element.listStyleType === undefined &&
    element.children.length === 1 &&
    NodeApi.string(element) === ''
  return (
    <PlateElement
      {...props}
      // div, not p: flat list items render their <ul>/<ol>/<li> wrapper
      // (ListPlugin belowNodes) inside the block — invalid inside a <p>.
      as="div"
      className="relative my-2 text-ink"
      style={indent > 1 ? { marginInlineStart: `${(indent - 1) * 1.5}rem` } : undefined}
    >
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
  return (
    <PlateElement
      {...props}
      as="pre"
      className="my-4 overflow-x-auto border border-line bg-paper p-4 font-mono text-sm text-ink"
    >
      <code>{props.children}</code>
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
  return (
    <PlateElement {...props} as="figure" className="my-4">
      {/* No iframe in the editor — a static thumbnail facade only. */}
      <div contentEditable={false} className="border border-line bg-paper p-2">
        {videoId ? (
          <img
            src={youTubeThumbnailUrl(videoId)}
            alt=""
            className="aspect-video w-full max-w-full border border-line object-cover"
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
  video: VideoElement,
  toc: TocElement,
  drug_card: DrugCardElement,
  slash_input: SlashInputElement,
}
