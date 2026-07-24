import type {
  Block,
  CodeBlock,
  CodeLine,
  Content,
  InlineNode,
  NestedParagraph,
  ParagraphBlock,
  TableCell,
  TableRow,
  TextNode,
} from '../schema/types'
import { DRUG_CARD_FIELD_KEYS } from '../schema/types'
import { validateContent } from '../schema/validate'

/**
 * The ONE save path (rules.md §6.5): the editor never writes unvalidated
 * JSON. `fromEditorValue` is a WHITELIST mapper — it walks the live editor
 * value and emits ONLY schema-allowed props per node type, then runs the
 * strict Zod validator:
 *
 *  - `id` survives at the top level only; ids NodeIdPlugin stamped on
 *    nested elements (tr/td/nested p/code_line) are dropped.
 *  - Editor-internal props are dropped: `listStart` (list normalizer),
 *    `colSizes`/`marginLeft` (table), `colSpan`/`rowSpan` (never produced —
 *    merging is disabled — but stripped defensively), selection artifacts.
 *  - `indent: 1` is dropped (the schema's canonical spelling omits it, see
 *    fixtures) and `indent` without `listStyleType` is meaningless → dropped.
 *  - Leaf props `subscript`/`superscript` translate to `sub`/`sup` — the kit
 *    renames the mark types so these should never occur; this is defense.
 *  - Mark props survive only as literal `true` (empty-string/false leftovers
 *    are dropped).
 *  - Void children are coerced to `[{ text: '' }]`.
 *  - Unknown TOP-LEVEL block types are rejected (never silently dropped —
 *    a save must not lose content); unknown inline wrappers are flattened
 *    to their text runs. Editor-time inline elements (the slash-command
 *    `slash_input` combobox) are exactly such wrappers: their query text is
 *    unwrapped, the element itself never reaches storage.
 *  - Stray EMPTY text runs left behind by flattened editor-time elements
 *    are dropped from inline children (a lone empty run survives — that is
 *    the canonical empty paragraph).
 */

export type FromEditorValueResult = { ok: true; content: Content } | { ok: false; errors: string[] }

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const MARK_KEYS = ['bold', 'italic', 'underline', 'strikethrough', 'code', 'sub', 'sup'] as const

/** Plate default mark keys → our schema props (kit renames; this is backup). */
const MARK_ALIASES: Record<string, (typeof MARK_KEYS)[number]> = {
  subscript: 'sub',
  superscript: 'sup',
}

function toTextNode(node: UnknownRecord): TextNode | null {
  if (typeof node.text !== 'string') return null
  const out: TextNode = { text: node.text }
  for (const [key, value] of Object.entries(node)) {
    if (value !== true) continue
    const mark = (MARK_KEYS as readonly string[]).includes(key)
      ? (key as (typeof MARK_KEYS)[number])
      : MARK_ALIASES[key]
    if (mark) out[mark] = true
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
    // Unknown inline wrapper — keep its text, drop the wrapper.
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

function toNestedParagraphs(children: unknown): NestedParagraph[] {
  const out: NestedParagraph[] = []
  if (Array.isArray(children)) {
    for (const child of children) {
      if (!isRecord(child)) continue
      if (child.type === 'p') {
        out.push({ type: 'p', children: ensureInline(child.children) })
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

function toTableRows(children: unknown): TableRow[] {
  const rows: TableRow[] = []
  if (!Array.isArray(children)) return rows
  for (const row of children) {
    if (!isRecord(row) || row.type !== 'tr') continue
    const cells: TableCell[] = []
    if (Array.isArray(row.children)) {
      for (const cell of row.children) {
        if (!isRecord(cell) || (cell.type !== 'td' && cell.type !== 'th')) continue
        cells.push({ type: cell.type, children: toNestedParagraphs(cell.children) })
      }
    }
    if (cells.length > 0) rows.push({ type: 'tr', children: cells })
  }
  return rows
}

const VOID_CHILDREN: [{ text: '' }] = [{ text: '' }]

/** The id prop survives at the top level only. */
const blockId = (node: UnknownRecord): { id: string } => ({
  id: typeof node.id === 'string' ? node.id : '',
})

function toBlock(node: UnknownRecord, index: number, errors: string[]): Block | null {
  const type = node.type
  switch (type) {
    case 'p': {
      const block: ParagraphBlock = {
        ...blockId(node),
        type: 'p',
        children: ensureInline(node.children),
      }
      if (node.listStyleType === 'disc' || node.listStyleType === 'decimal') {
        block.listStyleType = node.listStyleType
        // indent 1 is the canonical "omitted" level; keep 2+ only.
        if (typeof node.indent === 'number' && Number.isInteger(node.indent) && node.indent >= 2) {
          block.indent = node.indent
        }
      }
      return block
    }
    case 'h2':
    case 'h3':
      return { ...blockId(node), type, children: ensureInline(node.children) }
    case 'blockquote':
      return { ...blockId(node), type: 'blockquote', children: ensureInline(node.children) }
    case 'callout':
      return {
        ...blockId(node),
        type: 'callout',
        // Passed through as-is: an out-of-roster variant is a validation
        // error, not something to silently rewrite.
        variant: node.variant,
        children: toNestedParagraphs(node.children),
      } as unknown as Block
    case 'table':
      return { ...blockId(node), type: 'table', children: toTableRows(node.children) }
    case 'img': {
      const block = {
        ...blockId(node),
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
    case 'video':
      return {
        ...blockId(node),
        type: 'video',
        url: node.url,
        caption: collectTextNodes(node.caption),
        children: VOID_CHILDREN,
      } as unknown as Block
    case 'code_block': {
      const block: CodeBlock = {
        ...blockId(node),
        type: 'code_block',
        children: toCodeLines(node.children),
      }
      if (typeof node.lang === 'string' && node.lang !== '') block.lang = node.lang
      return block
    }
    case 'toc':
      return { ...blockId(node), type: 'toc', children: VOID_CHILDREN }
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
        ...blockId(node),
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
    if (block) blocks.push(block)
  })
  if (errors.length > 0) return { ok: false, errors }
  return validateContent(blocks)
}

/**
 * Stored content → editor-mountable value. The flat-list plugin normalizes
 * `listStyleType` away when `indent` is missing, and the schema's canonical
 * spelling omits `indent: 1` — so seed it back before mounting. (The
 * serializer re-omits it on save.)
 */
export function toEditorValue(content: Content): Content {
  return content.map((block) => {
    const clone = structuredClone(block)
    if (clone.type === 'p' && clone.listStyleType !== undefined && clone.indent === undefined) {
      clone.indent = 1
    }
    return clone
  })
}
