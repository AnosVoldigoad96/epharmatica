/**
 * The ePharmatica block schema — the ONE rich-text serialization (I9).
 *
 * Study content, blog posts, forum posts, job descriptions, and notes all
 * store an array of these blocks as jsonb. Renderers vary by surface; the
 * format does not. Product code never sees Slate/Plate node types — this
 * module is the public shape (I4).
 *
 * Structural decisions (locked here, consumed by M1 anchors + M4 editor):
 *  - Every top-level block carries a stable `id` — highlight anchors
 *    (M1 §5.5) address blocks by it, so ids must survive edits.
 *  - Lists are FLAT: a list item is a paragraph block with `listStyleType`
 *    (+ `indent` ≥ 1). This matches Plate's current list plugin, keeps every
 *    list item an ordinary prose anchor target (path []), and lets the
 *    renderer group consecutive items into <ul>/<ol> at render time.
 *  - Void blocks (img, video, toc, drug_card) keep the Slate-compatible
 *    `children: [{ text: '' }]` so the editing surface can host them
 *    unchanged; their real payload lives in props.
 */

/** Inline text run with optional marks. */
export type TextNode = {
  text: string
  bold?: true
  italic?: true
  underline?: true
  strikethrough?: true
  code?: true
  sub?: true
  sup?: true
}

/** Inline link — content links are always underlined (STYLE S6). */
export type LinkNode = {
  type: 'a'
  url: string
  children: TextNode[]
}

export type InlineNode = TextNode | LinkNode

export function isTextNode(node: InlineNode): node is TextNode {
  return !('type' in node)
}

/** Paragraph nested inside a structural block (no id — the parent anchors). */
export type NestedParagraph = {
  type: 'p'
  children: InlineNode[]
}

/** Children of a void block — Slate requires exactly one empty text. */
export type VoidChildren = [{ text: '' }]

export type ListStyleType = 'disc' | 'decimal'

export type ParagraphBlock = {
  id: string
  type: 'p'
  children: InlineNode[]
  /** Present on flat list items only. */
  listStyleType?: ListStyleType
  /** List nesting level, ≥ 1; only meaningful with listStyleType. */
  indent?: number
}

export type HeadingBlock = {
  id: string
  /** h1 is reserved for the page title (M1 §5.2) — content starts at h2. */
  type: 'h2' | 'h3'
  children: InlineNode[]
}

export type BlockquoteBlock = {
  id: string
  type: 'blockquote'
  children: InlineNode[]
}

export const CALLOUT_VARIANTS = [
  'definition',
  'clinical_pearl',
  'mnemonic',
  'exam_alert',
  'warning',
] as const

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number]

/**
 * One callout = ONE anchor block: highlight offsets run over its
 * concatenated paragraph text (M1 §5.5 "callout bodies").
 */
export type CalloutBlock = {
  id: string
  type: 'callout'
  variant: CalloutVariant
  children: NestedParagraph[]
}

export type TableCell = {
  type: 'td' | 'th'
  children: NestedParagraph[]
}

export type TableRow = {
  type: 'tr'
  children: TableCell[]
}

export type TableBlock = {
  id: string
  type: 'table'
  children: TableRow[]
}

/**
 * Image via the media library ONLY (M4 §6) — asset_id ties the block to
 * media_assets; url/alt/dimensions are snapshots refreshed at publish.
 * Width/height are mandatory: every media block declares aspect-ratio
 * (STYLE zero-CLS budget).
 */
export type ImageBlock = {
  id: string
  type: 'img'
  url: string
  alt: string
  asset_id: string
  width: number
  height: number
  caption?: TextNode[]
  children: VoidChildren
}

/**
 * YouTube embed, author-placed anywhere (M1-2). URL validated at save;
 * caption is MANDATORY (M1 §5.3 — a legal obligation, not just style).
 */
export type VideoBlock = {
  id: string
  type: 'video'
  url: string
  caption: TextNode[]
  children: VoidChildren
}

export type CodeLine = {
  type: 'code_line'
  children: TextNode[]
}

export type CodeBlock = {
  id: string
  type: 'code_block'
  lang?: string
  children: CodeLine[]
}

/** Renders the document's h2/h3 outline; carries no content of its own. */
export type TocBlock = {
  id: string
  type: 'toc'
  children: VoidChildren
}

/**
 * Drug Card field roster (ordered). generic_name is the card title and the
 * only required field. Keys are the anchor paths for kind 'drugcard'
 * (M1 §5.5, e.g. path: ["adverse_effects"]).
 *
 * NOTE for review: this roster is the code-side half of the Drug Card
 * conventions in the content style guide (0.F) — change both together.
 */
export const DRUG_CARD_FIELD_KEYS = [
  'generic_name',
  'brand_names',
  'drug_class',
  'mechanism',
  'indications',
  'contraindications',
  'adverse_effects',
  'interactions',
  'dosing',
  'monitoring',
  'pregnancy_lactation',
  'notes',
] as const

export type DrugCardFieldKey = (typeof DRUG_CARD_FIELD_KEYS)[number]

export type DrugCardFields = Partial<Record<DrugCardFieldKey, string>> & {
  generic_name: string
}

export type DrugCardBlock = {
  id: string
  type: 'drug_card'
  fields: DrugCardFields
  children: VoidChildren
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | BlockquoteBlock
  | CalloutBlock
  | TableBlock
  | ImageBlock
  | VideoBlock
  | CodeBlock
  | TocBlock
  | DrugCardBlock

export type BlockType = Block['type']

/** A document: what subtopics.content (and every other rich field) stores. */
export type Content = Block[]
