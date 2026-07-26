import { DATE_VALUE_PATTERN } from '../schema/date'
import { upgradeLegacyLists } from '../schema/legacy-lists'
import type {
  Alignment,
  Block,
  CarouselImage,
  CodeBlock,
  CodeLine,
  ColumnChildBlock,
  ColumnNode,
  Content,
  InlineNode,
  ListItemNode,
  NestedListNode,
  NestedParagraph,
  TableCell,
  TableRow,
  TextNode,
} from '../schema/types'
import { COLUMN_CHILD_TYPES, DRUG_CARD_FIELD_KEYS } from '../schema/types'
import { validateContent } from '../schema/validate'

/**
 * The ONE save path (rules.md §6.5): the editor never writes unvalidated
 * JSON. `fromEditorValue` is a WHITELIST mapper — it walks the live editor
 * value and emits ONLY schema-allowed props per node type, then runs the
 * strict Zod validator:
 *
 *  - `id` survives at the top level only; ids NodeIdPlugin stamped on
 *    nested elements (tr/td/li/lic/column/nested p/code_line) are dropped.
 *  - Editor-internal props are dropped: `listStart` (legacy), `colSizes`/
 *    `marginLeft` (table), toggle open state (never on nodes anyway),
 *    selection artifacts.
 *  - LISTS (schema v2): ul/ol containers with li → [lic, nested list?]
 *    children are the ONLY written list shape. A v1 flat item (`p` +
 *    `listStyleType`) that somehow reaches the save path is upgraded to a
 *    container too (defense in depth — the mount path upgrades first).
 *  - Style props survive bounded: `align` (left/center/right/justify),
 *    `lineHeight` (number), `indent` (int ≥ 1, top level only), text
 *    `color`/`backgroundColor`/`fontSize` (validated CSS strings), table
 *    cell `colSpan`/`rowSpan` (ints ≥ 2).
 *  - Leaf props `subscript`/`superscript` translate to `sub`/`sup`; mark
 *    props survive only as literal `true`.
 *  - Void children are coerced to `[{ text: '' }]`.
 *  - Unknown TOP-LEVEL block types are rejected (never silently dropped —
 *    a save must not lose content); unknown inline wrappers are flattened
 *    to their text runs. Editor-time inline elements (slash_input,
 *    emoji_input) are exactly such wrappers: their query text is unwrapped,
 *    the element itself never reaches storage.
 *  - Stray EMPTY text runs left behind by flattened editor-time elements
 *    are dropped from inline children (a lone empty run survives — that is
 *    the canonical empty paragraph).
 */

export type FromEditorValueResult = { ok: true; content: Content } | { ok: false; errors: string[] }

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const MARK_KEYS = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  'sub',
  'sup',
  'highlight',
  'kbd',
] as const

/** Plate default mark keys → our schema props (kit renames; this is backup). */
const MARK_ALIASES: Record<string, (typeof MARK_KEYS)[number]> = {
  subscript: 'sub',
  superscript: 'sup',
}

/** Bounded CSS values — mirrors validate.ts; non-conforming values DROP
 * (styling is decoration, dropping it never loses content). */
const CSS_COLOR_PATTERN =
  /^(#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?|[a-zA-Z]{2,25}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d{1,4})\s*)?\))$/
const CSS_FONT_SIZE_PATTERN = /^\d{1,3}(\.\d{1,3})?(px|em|rem|%)$/
const COLUMN_WIDTH_PATTERN = /^\d{1,3}(\.\d{1,3})?%$/

const ALIGN_VALUES: readonly Alignment[] = ['left', 'center', 'right', 'justify']

function toTextNode(node: UnknownRecord): TextNode | null {
  if (typeof node.text !== 'string') return null
  const out: TextNode = { text: node.text }
  for (const [key, value] of Object.entries(node)) {
    if (value === true) {
      const mark = (MARK_KEYS as readonly string[]).includes(key)
        ? (key as (typeof MARK_KEYS)[number])
        : MARK_ALIASES[key]
      if (mark) out[mark] = true
    }
  }
  if (typeof node.color === 'string' && CSS_COLOR_PATTERN.test(node.color)) {
    out.color = node.color
  }
  if (typeof node.backgroundColor === 'string' && CSS_COLOR_PATTERN.test(node.backgroundColor)) {
    out.backgroundColor = node.backgroundColor
  }
  if (typeof node.fontSize === 'string' && CSS_FONT_SIZE_PATTERN.test(node.fontSize)) {
    out.fontSize = node.fontSize
  }
  return out
}

/** Text runs only — nested wrappers flattened (used for link/caption children). */
function collectTextNodes(children: unknown): TextNode[] {
  const out: TextNode[] = []
  if (!Array.isArray(children)) return out
  for (const child of children) {
    if (!isRecord(child)) continue
    if (typeof child.text === 'string') {
      const text = toTextNode(child)
      if (text) out.push(text)
    } else {
      out.push(...collectTextNodes(child.children))
    }
  }
  return out
}

function toInlineNodes(children: unknown): InlineNode[] {
  const out: InlineNode[] = []
  if (!Array.isArray(children)) return out
  for (const child of children) {
    if (!isRecord(child)) continue
    if (typeof child.text === 'string') {
      const text = toTextNode(child)
      if (text) out.push(text)
      continue
    }
    if (child.type === 'a' && typeof child.url === 'string') {
      const texts = collectTextNodes(child.children)
      if (texts.length > 0) {
        out.push({ type: 'a', url: child.url, children: texts })
      }
      continue
    }
    if (child.type === 'date') {
      // Canonical YYYY-MM-DD only; an unset/unparseable chip carries no
      // content, so it drops rather than blocking the save.
      if (typeof child.date === 'string' && DATE_VALUE_PATTERN.test(child.date)) {
        out.push({ type: 'date', date: child.date, children: [{ text: '' }] })
      }
      continue
    }
    if (child.type === 'inline_equation') {
      // Inline KaTeX void — the TeX source is the whole payload. An empty
      // chip is an abandoned placeholder (no content), so it drops like an
      // unset date chip.
      if (typeof child.texExpression === 'string' && child.texExpression !== '') {
        out.push({
          type: 'inline_equation',
          texExpression: child.texExpression,
          children: [{ text: '' }],
        })
      }
      continue
    }
    // Unknown inline wrapper (slash_input, emoji_input, …) — keep its
    // text, drop the wrapper.
    out.push(...toInlineNodes(child.children))
  }
  return out
}

const ensureInline = (children: unknown): InlineNode[] => {
  const nodes = toInlineNodes(children)
  // Flattened editor-time inline elements (slash_input & co.) leave stray
  // empty text runs behind — drop them; coerce to the canonical single
  // empty run when nothing meaningful remains.
  const meaningful = nodes.filter((node) => 'type' in node || node.text !== '')
  return meaningful.length > 0 ? meaningful : [{ text: '' }]
}

/* --------------------------------------------------------- styling props */

const readAlign = (node: UnknownRecord): Alignment | undefined =>
  typeof node.align === 'string' && (ALIGN_VALUES as readonly string[]).includes(node.align)
    ? (node.align as Alignment)
    : undefined

const readLineHeight = (node: UnknownRecord): number | undefined => {
  const raw = typeof node.lineHeight === 'string' ? Number(node.lineHeight) : node.lineHeight
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0.8 && raw <= 3 ? raw : undefined
}

const readIndent = (node: UnknownRecord): number | undefined =>
  typeof node.indent === 'number' && Number.isInteger(node.indent) && node.indent >= 1
    ? Math.min(node.indent, 20)
    : undefined

/** align + lineHeight, applied to prose-ish nodes at any depth. */
function proseStyleProps(node: UnknownRecord): { align?: Alignment; lineHeight?: number } {
  const out: { align?: Alignment; lineHeight?: number } = {}
  const align = readAlign(node)
  if (align) out.align = align
  const lineHeight = readLineHeight(node)
  if (lineHeight !== undefined) out.lineHeight = lineHeight
  return out
}

/** indent survives at the top level only (toggle containment + visual). */
function topStyleProps(node: UnknownRecord, nested: boolean): { indent?: number } {
  if (nested) return {}
  const indent = readIndent(node)
  return indent === undefined ? {} : { indent }
}

function toNestedParagraphs(children: unknown): NestedParagraph[] {
  const out: NestedParagraph[] = []
  if (Array.isArray(children)) {
    for (const child of children) {
      if (!isRecord(child)) continue
      if (child.type === 'p') {
        out.push({ type: 'p', children: ensureInline(child.children), ...proseStyleProps(child) })
      } else {
        // Stray non-paragraph content — preserve its inline text.
        const inline =
          typeof child.text === 'string' ? toInlineNodes([child]) : toInlineNodes(child.children)
        if (inline.length > 0) out.push({ type: 'p', children: inline })
      }
    }
  }
  return out.length > 0 ? out : [{ type: 'p', children: [{ text: '' }] }]
}

function toCodeLines(children: unknown): CodeLine[] {
  const out: CodeLine[] = []
  if (Array.isArray(children)) {
    for (const child of children) {
      if (!isRecord(child)) continue
      const texts =
        typeof child.text === 'string'
          ? collectTextNodes([child])
          : collectTextNodes(child.children)
      if (child.type === 'code_line' || texts.length > 0) {
        out.push({ type: 'code_line', children: texts.length > 0 ? texts : [{ text: '' }] })
      }
    }
  }
  return out.length > 0 ? out : [{ type: 'code_line', children: [{ text: '' }] }]
}

const readSpan = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 50
    ? value
    : undefined

function toTableRows(children: unknown): TableRow[] {
  const rows: TableRow[] = []
  if (!Array.isArray(children)) return rows
  for (const row of children) {
    if (!isRecord(row) || row.type !== 'tr') continue
    const cells: TableCell[] = []
    if (Array.isArray(row.children)) {
      for (const cell of row.children) {
        if (!isRecord(cell) || (cell.type !== 'td' && cell.type !== 'th')) continue
        const out: TableCell = { type: cell.type, children: toNestedParagraphs(cell.children) }
        const colSpan = readSpan(cell.colSpan)
        if (colSpan !== undefined) out.colSpan = colSpan
        const rowSpan = readSpan(cell.rowSpan)
        if (rowSpan !== undefined) out.rowSpan = rowSpan
        cells.push(out)
      }
    }
    if (cells.length > 0) rows.push({ type: 'tr', children: cells })
  }
  return rows
}

/* ------------------------------------------------------------------ lists */

function toListItems(children: unknown): ListItemNode[] {
  const items: ListItemNode[] = []
  if (!Array.isArray(children)) return items
  for (const child of children) {
    if (!isRecord(child) || child.type !== 'li') continue
    let lic: { type: 'lic'; children: InlineNode[] } | null = null
    let nested: NestedListNode | null = null
    if (Array.isArray(child.children)) {
      for (const grand of child.children) {
        if (!isRecord(grand)) continue
        if (grand.type === 'lic' && !lic) {
          lic = { type: 'lic', children: ensureInline(grand.children) }
        } else if ((grand.type === 'ul' || grand.type === 'ol') && !nested) {
          const nestedItems = toListItems(grand.children)
          if (nestedItems.length > 0) nested = { type: grand.type, children: nestedItems }
        } else if (typeof grand.text === 'string' && !lic) {
          // Defensive: a bare text child becomes the content line.
          lic = { type: 'lic', children: ensureInline([grand]) }
        }
      }
    }
    if (!lic) lic = { type: 'lic', children: [{ text: '' }] }
    items.push(nested ? { type: 'li', children: [lic, nested] } : { type: 'li', children: [lic] })
  }
  return items
}

/* ---------------------------------------------------------------- columns */

/* Column children admit every block type except toggle and column_group —
 * COLUMN_CHILD_TYPES (schema/types.ts) is the shared roster. */

function toColumns(children: unknown, index: number | string, errors: string[]): ColumnNode[] {
  const columns: ColumnNode[] = []
  if (!Array.isArray(children)) return columns
  for (const child of children) {
    if (!isRecord(child) || child.type !== 'column') continue
    const nested: ColumnChildBlock[] = []
    if (Array.isArray(child.children)) {
      child.children.forEach((grand, grandIndex) => {
        if (!isRecord(grand)) return
        const block = toBlock(grand, `${index}.${grandIndex}`, errors, { nested: true })
        if (block) nested.push(block as ColumnChildBlock)
      })
    }
    const column: ColumnNode = {
      type: 'column',
      children: nested.length > 0 ? nested : [{ type: 'p', children: [{ text: '' }] }],
    }
    if (typeof child.width === 'string' && COLUMN_WIDTH_PATTERN.test(child.width)) {
      column.width = child.width
    }
    columns.push(column)
  }
  return columns
}

/**
 * Whitelist one carousel slide: schema-allowed props only (editor-internal
 * leftovers drop), caption via the text-run whitelist. A slide missing its
 * payload strings is not a slide — it drops (the block itself drops when no
 * slides remain; validation still rejects malformed survivors).
 */
function toCarouselImages(images: unknown): CarouselImage[] {
  const out: CarouselImage[] = []
  if (!Array.isArray(images)) return out
  for (const image of images) {
    if (!isRecord(image)) continue
    if (
      typeof image.asset_id !== 'string' ||
      typeof image.url !== 'string' ||
      typeof image.alt !== 'string'
    ) {
      continue
    }
    const slide = {
      asset_id: image.asset_id,
      url: image.url,
      alt: image.alt,
      width: image.width,
      height: image.height,
    } as unknown as CarouselImage
    const caption = collectTextNodes(image.caption)
    if (caption.length > 0) slide.caption = caption
    out.push(slide)
  }
  return out
}

const VOID_CHILDREN: [{ text: '' }] = [{ text: '' }]

/** The id prop survives at the top level only. */
const blockId = (node: UnknownRecord): { id: string } => ({
  id: typeof node.id === 'string' ? node.id : '',
})

type ToBlockOptions = { nested: boolean }

function toBlock(
  node: UnknownRecord,
  index: number | string,
  errors: string[],
  options: ToBlockOptions = { nested: false },
): Block | ColumnChildBlock | null {
  const { nested } = options
  const ids = nested ? {} : blockId(node)
  const top = topStyleProps(node, nested)
  const type = node.type

  if (nested && typeof type === 'string' && !COLUMN_CHILD_TYPES.has(type)) {
    errors.push(`${index}: block type "${type}" is not allowed inside a column`)
    return null
  }

  switch (type) {
    case 'p': {
      const block = {
        ...ids,
        ...top,
        type: 'p',
        children: ensureInline(node.children),
        ...proseStyleProps(node),
      } as Block
      // v1 legacy flat-list props: preserved here so the post-pass list
      // upgrade (upgradeLegacyLists) can container-ize them — they NEVER
      // reach storage as flat items.
      if (!nested && (node.listStyleType === 'disc' || node.listStyleType === 'decimal')) {
        ;(block as UnknownRecord).listStyleType = node.listStyleType
        const indent = readIndent(node)
        if (indent !== undefined && indent >= 2) (block as UnknownRecord).indent = indent
        else delete (block as UnknownRecord).indent
      }
      return block
    }
    case 'h2':
    case 'h3':
      return {
        ...ids,
        ...top,
        type,
        children: ensureInline(node.children),
        ...proseStyleProps(node),
      } as Block
    case 'blockquote':
      return {
        ...ids,
        ...top,
        type: 'blockquote',
        children: ensureInline(node.children),
        ...proseStyleProps(node),
      } as Block
    case 'callout':
      return {
        ...ids,
        ...top,
        type: 'callout',
        // Passed through as-is: an out-of-roster variant is a validation
        // error, not something to silently rewrite.
        variant: node.variant,
        children: toNestedParagraphs(node.children),
      } as unknown as Block
    case 'table':
      return { ...ids, ...top, type: 'table', children: toTableRows(node.children) } as Block
    case 'img': {
      const block = {
        ...ids,
        ...top,
        type: 'img',
        url: node.url,
        alt: node.alt,
        asset_id: node.asset_id,
        width: node.width,
        height: node.height,
        children: VOID_CHILDREN,
      } as unknown as Block & { caption?: TextNode[] }
      const caption = collectTextNodes(node.caption)
      if (caption.length > 0) block.caption = caption
      return block
    }
    case 'carousel': {
      const images = toCarouselImages(node.images)
      // An empty carousel carries no content (an abandoned insert or a
      // strip the author emptied) — it drops at save rather than blocking
      // it, like unset date chips and empty inline equations.
      if (images.length === 0) return null
      return { ...ids, ...top, type: 'carousel', images, children: VOID_CHILDREN } as Block
    }
    case 'video':
      return {
        ...ids,
        ...top,
        type: 'video',
        url: node.url,
        caption: collectTextNodes(node.caption),
        children: VOID_CHILDREN,
      } as unknown as Block
    case 'code_block': {
      const block = {
        ...ids,
        ...top,
        type: 'code_block',
        children: toCodeLines(node.children),
      } as CodeBlock
      if (typeof node.lang === 'string' && node.lang !== '') block.lang = node.lang
      return block
    }
    case 'toc':
      return { ...ids, ...top, type: 'toc', children: VOID_CHILDREN } as Block
    case 'hr':
      return { ...ids, ...top, type: 'hr', children: VOID_CHILDREN } as Block
    case 'equation':
      // Block KaTeX void — texExpression passes through as-is (an oversized
      // expression is a validation error, never a silent truncation).
      return {
        ...ids,
        ...top,
        type: 'equation',
        texExpression: typeof node.texExpression === 'string' ? node.texExpression : '',
        children: VOID_CHILDREN,
      } as Block
    case 'ul':
    case 'ol': {
      const items = toListItems(node.children)
      return {
        ...ids,
        ...top,
        type,
        children:
          items.length > 0
            ? items
            : [{ type: 'li', children: [{ type: 'lic', children: [{ text: '' }] }] }],
      } as Block
    }
    case 'toggle':
      return { ...ids, ...top, type: 'toggle', children: ensureInline(node.children) } as Block
    case 'column_group': {
      const columns = toColumns(node.children, index, errors)
      if (columns.length < 2) {
        errors.push(`${index}: column group needs at least 2 columns`)
        return null
      }
      return { ...ids, ...top, type: 'column_group', children: columns } as Block
    }
    case 'drug_card': {
      const fields: Record<string, string> = {}
      if (isRecord(node.fields)) {
        for (const key of DRUG_CARD_FIELD_KEYS) {
          const value = node.fields[key]
          if (typeof value !== 'string') continue
          // Empty optional fields carry no content — canonical form omits them.
          if (value === '' && key !== 'generic_name') continue
          fields[key] = value
        }
      }
      return {
        ...ids,
        ...top,
        type: 'drug_card',
        fields,
        children: VOID_CHILDREN,
      } as unknown as Block
    }
    default:
      errors.push(
        typeof type === 'string'
          ? `${index}: unknown block type "${type}"`
          : `${index}: not a block (missing type)`,
      )
      return null
  }
}

/**
 * Whitelist-map the live editor value into schema shape, then validate.
 * This is the single save path — a failed result never reaches onSave.
 */
export function fromEditorValue(value: unknown): FromEditorValueResult {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['(root): expected an array of blocks'] }
  }
  const errors: string[] = []
  const blocks: Block[] = []
  value.forEach((node, index) => {
    if (!isRecord(node)) {
      errors.push(`${index}: not a block`)
      return
    }
    const block = toBlock(node, index, errors)
    if (block) blocks.push(block as Block)
  })
  if (errors.length > 0) return { ok: false, errors }
  // SINGLE-WRITE: any v1 flat-list paragraphs that slipped through become
  // v2 containers here — storage only ever receives the container shape.
  return validateContent(upgradeLegacyLists(blocks))
}

/**
 * Stored content → editor-mountable value. DUAL-READ: v1 flat lists are
 * upgraded to v2 containers before mounting (the classic list plugin only
 * understands containers). `keepItemIds` preserves per-item v1 ids on the
 * editor value — harmless there, and the serializer strips nested ids on
 * save anyway.
 */
export function toEditorValue(content: Content): Content {
  return structuredClone(upgradeLegacyLists(content, { keepItemIds: true }))
}
