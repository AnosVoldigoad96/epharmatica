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
 *  - Lists are CONTAINERS (schema v2): a whole ul/ol is ONE block with li
 *    children (li = lic content + optional nested list), matching Plate's
 *    classic list model. The v1 FLAT spelling (paragraphs carrying
 *    `listStyleType`/`indent`) is still READ everywhere (legacy-lists.ts
 *    upgrades it on load/render); it is never written again.
 *  - Toggles use the indent model: a `toggle` block's contents are the
 *    following TOP-LEVEL blocks whose `indent` is greater than the
 *    toggle's. Every enclosed block keeps its own id — so toggle contents
 *    stay ordinary anchor targets.
 *  - Void blocks (img, video, toc, drug_card, hr, equation) keep the
 *    Slate-compatible `children: [{ text: '' }]` so the editing surface can
 *    host them unchanged; their real payload lives in props.
 */

/** Storage schema version: 1 = flat lists, 2 = container lists + styling
 * props. Informational only — rows carry no version column; readers
 * dual-read v1, writers emit v2 (rows upgrade as they are re-saved). */
export const CONTENT_SCHEMA_VERSION = 2

/** Block-level text alignment (Plate convention: literal values, no RTL
 * remapping in storage; `start` is the unset default and never stored). */
export type Alignment = 'left' | 'center' | 'right' | 'justify'

/** Inline text run with optional marks. Color/size marks store bounded CSS
 * values (validated); they render as inline styles. */
export type TextNode = {
  text: string
  bold?: true
  italic?: true
  underline?: true
  strikethrough?: true
  code?: true
  sub?: true
  sup?: true
  highlight?: true
  kbd?: true
  /** CSS color (hex/named/rgb) — text color. */
  color?: string
  /** CSS color (hex/named/rgb) — text background. */
  backgroundColor?: string
  /** CSS length (px/em/rem/%) — font size. */
  fontSize?: string
}

/** Inline link — content links are always underlined (STYLE S6). */
export type LinkNode = {
  type: 'a'
  url: string
  children: TextNode[]
}

/** Inline date chip — canonical YYYY-MM-DD; renders as a <time> element. */
export type DateNode = {
  type: 'date'
  date: string
  children: VoidChildren
}

/**
 * Inline KaTeX equation — a void chip whose payload is the TeX source
 * (`texExpression`, the official Plate math prop). Renderers turn it into
 * KaTeX HTML; the raw TeX is what search/plain-text extraction sees.
 */
export type InlineEquationNode = {
  type: 'inline_equation'
  texExpression: string
  children: VoidChildren
}

export type InlineNode = TextNode | LinkNode | DateNode | InlineEquationNode

export function isTextNode(node: InlineNode): node is TextNode {
  return !('type' in node)
}

export function isDateNode(node: InlineNode): node is DateNode {
  return 'type' in node && node.type === 'date'
}

export function isInlineEquationNode(node: InlineNode): node is InlineEquationNode {
  return 'type' in node && node.type === 'inline_equation'
}

/** Paragraph nested inside a structural block (no id — the parent anchors). */
export type NestedParagraph = {
  type: 'p'
  children: InlineNode[]
  align?: Alignment
  lineHeight?: number
}

/** Children of a void block — Slate requires exactly one empty text. */
export type VoidChildren = [{ text: '' }]

/** v1 legacy flat-list marker (read-only; see legacy-lists.ts). */
export type ListStyleType = 'disc' | 'decimal'

/**
 * Shared optional block-level indent (≥ 1): visual indentation AND toggle
 * containment (a block with indent > a preceding toggle's indent lives
 * inside that toggle). Top-level blocks only.
 */
export type BlockIndent = { indent?: number }

export type ParagraphBlock = {
  id: string
  type: 'p'
  children: InlineNode[]
  align?: Alignment
  lineHeight?: number
  /** v1 LEGACY flat-list marker — read, never written (schema v2). */
  listStyleType?: ListStyleType
  indent?: number
}

export type HeadingBlock = {
  id: string
  /** h1 is reserved for the page title (M1 §5.2) — content starts at h2. */
  type: 'h2' | 'h3'
  children: InlineNode[]
  align?: Alignment
  lineHeight?: number
  indent?: number
}

export type BlockquoteBlock = {
  id: string
  type: 'blockquote'
  children: InlineNode[]
  align?: Alignment
  lineHeight?: number
  indent?: number
}

/* ------------------------------------------------------------------ lists */

/** List item text line (Plate's classic `lic` node). */
export type ListItemContentNode = {
  type: 'lic'
  children: InlineNode[]
}

/**
 * List item: one lic line + optionally ONE nested list. `id` is NEVER
 * stored (strict validation rejects it) — it exists on the type only for
 * the in-memory legacy upgrade, which tags upgraded items with their v1
 * block ids so published highlight anchors keep resolving in the DOM.
 */
export type ListItemNode = {
  id?: string
  type: 'li'
  children: [ListItemContentNode] | [ListItemContentNode, NestedListNode]
}

/** A list nested inside an li (no id — the top-level container anchors). */
export type NestedListNode = {
  type: 'ul' | 'ol'
  children: ListItemNode[]
}

/** Top-level list container — ONE block, ONE drag handle, ONE anchor id. */
export type ListBlock = {
  id: string
  type: 'ul' | 'ol'
  children: ListItemNode[]
  indent?: number
}

/* ------------------------------------------------------------ collapsible */

/**
 * Toggle (collapsible) block: `children` is the summary line; the contents
 * are the following top-level blocks with a deeper `indent`. Open/closed is
 * editor UI state, never stored — the reader renders a native <details>.
 */
export type ToggleBlock = {
  id: string
  type: 'toggle'
  children: InlineNode[]
  indent?: number
}

/* ---------------------------------------------------------------- columns */

/**
 * Blocks allowed inside a column: everything except headings (h2/h3 anchor
 * the document outline/TOC), toc, toggle (indent model is top-level-only),
 * and column_group (no nesting). Ids never nest — the group anchors.
 */
export type ColumnChildBlock =
  | Omit<ParagraphBlock, 'id'>
  | Omit<BlockquoteBlock, 'id'>
  | Omit<CalloutBlock, 'id'>
  | Omit<TableBlock, 'id'>
  | Omit<ImageBlock, 'id'>
  | Omit<VideoBlock, 'id'>
  | Omit<CodeBlock, 'id'>
  | Omit<DrugCardBlock, 'id'>
  | Omit<ListBlock, 'id'>
  | Omit<HrBlock, 'id'>

export type ColumnNode = {
  type: 'column'
  /** Percentage width, e.g. "50%" — omitted columns share space equally. */
  width?: string
  children: ColumnChildBlock[]
}

export type ColumnGroupBlock = {
  id: string
  type: 'column_group'
  children: ColumnNode[]
  indent?: number
}

/* ------------------------------------------------------------------ voids */

/** Horizontal rule — a themed <hr> section divider. */
export type HrBlock = {
  id: string
  type: 'hr'
  children: VoidChildren
  indent?: number
}

/**
 * Block KaTeX equation (display math) — a void block; `texExpression` is
 * the TeX source (official Plate math prop). The public reader renders it
 * server-side with katex.renderToString, so anonymous clients receive HTML
 * + CSS only, never the KaTeX engine.
 */
export type EquationBlock = {
  id: string
  type: 'equation'
  texExpression: string
  children: VoidChildren
  indent?: number
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
  indent?: number
}

export type TableCell = {
  type: 'td' | 'th'
  children: NestedParagraph[]
  /** Cell merging (schema v2): spans ≥ 2 only; absent = 1. */
  colSpan?: number
  rowSpan?: number
}

export type TableRow = {
  type: 'tr'
  children: TableCell[]
}

export type TableBlock = {
  id: string
  type: 'table'
  children: TableRow[]
  indent?: number
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
  indent?: number
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
  indent?: number
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
  indent?: number
}

/** Renders the document's h2/h3 outline; carries no content of its own. */
export type TocBlock = {
  id: string
  type: 'toc'
  children: VoidChildren
  indent?: number
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
  indent?: number
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
  | ListBlock
  | ToggleBlock
  | HrBlock
  | EquationBlock
  | ColumnGroupBlock

export type BlockType = Block['type']

/** A document: what subtopics.content (and every other rich field) stores. */
export type Content = Block[]
