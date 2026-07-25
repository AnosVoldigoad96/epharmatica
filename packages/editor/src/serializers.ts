import { formatDateDisplay } from './schema/date'
import type {
  Block,
  ColumnChildBlock,
  Content,
  HeadingBlock,
  InlineNode,
  ListItemNode,
  NestedParagraph,
  TextNode,
} from './schema/types'
import { isTextNode } from './schema/types'

/**
 * Block-walk serializers — the text extraction the rest of the platform
 * builds on: plain_text / headings_text refresh on every save (FTS, 009),
 * reading time + primary_video_url derive at publish (M1 §5.2/§5.3), and
 * the anonymous preview default rule (M1 §5.4) counts blocks here.
 *
 * Container lists, toggles, and columns (schema v2) contribute ALL their
 * nested text — search must reach inside every structural block.
 */

export function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      if (isTextNode(node)) return node.text
      if (node.type === 'date') return formatDateDisplay(node.date)
      // Raw TeX — searchable ("Michaelis", "\\frac") even though the reader
      // shows rendered math.
      if (node.type === 'inline_equation') return node.texExpression
      return inlineText(node.children)
    })
    .join('')
}

function captionText(caption: TextNode[] | undefined): string {
  return caption ? caption.map((node) => node.text).join('') : ''
}

export function paragraphsText(paragraphs: NestedParagraph[]): string {
  return paragraphs.map((paragraph) => inlineText(paragraph.children)).join('\n')
}

/** Every li line of a (possibly nested) list, depth-first. */
export function listItemsText(items: ListItemNode[]): string[] {
  const lines: string[] = []
  for (const item of items) {
    const [lic, nested] = item.children
    lines.push(inlineText(lic.children))
    if (nested) lines.push(...listItemsText(nested.children))
  }
  return lines
}

/**
 * Plain text of one block, including table cells, Drug Card field values,
 * captions, list items, toggle summaries, and column contents (M1 §5.9
 * requires searchable text everywhere). Static chrome (callout eyebrows,
 * Drug Card field labels) is excluded — it would make every document match
 * its own furniture.
 */
export function blockPlainText(block: Block | ColumnChildBlock): string {
  switch (block.type) {
    case 'p':
    case 'h2':
    case 'h3':
    case 'blockquote':
    case 'toggle':
      return inlineText(block.children)
    case 'callout':
      return paragraphsText(block.children)
    case 'table':
      return block.children
        .map((row) => row.children.map((cell) => paragraphsText(cell.children)).join('\n'))
        .join('\n')
    case 'img':
      return [block.alt, captionText(block.caption)].filter(Boolean).join('\n')
    case 'video':
      return captionText(block.caption)
    case 'code_block':
      return block.children.map((line) => inlineText(line.children)).join('\n')
    case 'drug_card':
      return Object.values(block.fields)
        .filter((value): value is string => Boolean(value))
        .join('\n')
    case 'ul':
    case 'ol':
      return listItemsText(block.children).join('\n')
    case 'equation':
      // The raw TeX source — keeps formulas searchable (M1 §5.9).
      return block.texExpression
    case 'column_group':
      return block.children
        .map((column) => column.children.map(blockPlainText).filter(Boolean).join('\n'))
        .filter(Boolean)
        .join('\n')
    case 'toc':
    case 'hr':
      return ''
  }
}

/** Body text for FTS weight C — refreshed on every save. */
export function getPlainText(content: Content): string {
  return content
    .map(blockPlainText)
    .filter((text) => text.length > 0)
    .join('\n\n')
}

/** Heading text for FTS weight B — refreshed on every save. */
export function getHeadingsText(content: Content): string {
  return content
    .filter((block): block is HeadingBlock => block.type === 'h2' || block.type === 'h3')
    .map((block) => inlineText(block.children))
    .join('\n')
}

export function countWords(text: string): number {
  return (text.match(/\S+/g) ?? []).length
}

/** Reading time at publish: ceil(words / 200), minimum 1 (M1 §5.2). */
export function deriveReadingMinutes(content: Content): number {
  return Math.max(1, Math.ceil(countWords(getPlainText(content)) / 200))
}

/**
 * First video block's URL — copied to subtopics.primary_video_url at
 * publish (M1-2); null when the document has no video, consumers degrade.
 */
export function derivePrimaryVideoUrl(content: Content): string | null {
  const video = content.find((block) => block.type === 'video')
  return video ? video.url : null
}

/**
 * Anonymous preview default rule (M1 §5.4, D8): blocks up to (exclusive)
 * the first heading appearing after index 0, capped at 5, never below 1.
 * Authors may override per subtopic (preview_block_count, min 1).
 *
 * Schema v2 note: a whole list is ONE block now (v1 counted each item), so
 * documents opening with a list expose the entire list in the free preview.
 */
export function defaultPreviewBlockCount(content: Content): number {
  const headingIndex = content.findIndex(
    (block, index) => index > 0 && (block.type === 'h2' || block.type === 'h3'),
  )
  const count = headingIndex === -1 ? content.length : headingIndex
  return Math.max(1, Math.min(count, 5))
}
