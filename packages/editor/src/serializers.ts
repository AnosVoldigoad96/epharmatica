import type {
  Block,
  Content,
  HeadingBlock,
  InlineNode,
  NestedParagraph,
  TextNode,
} from './schema/types'
import { isTextNode } from './schema/types'

/**
 * Block-walk serializers — the text extraction the rest of the platform
 * builds on: plain_text / headings_text refresh on every save (FTS, 009),
 * reading time + primary_video_url derive at publish (M1 §5.2/§5.3), and
 * the anonymous preview default rule (M1 §5.4) counts blocks here.
 */

export function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => (isTextNode(node) ? node.text : inlineText(node.children))).join('')
}

function captionText(caption: TextNode[] | undefined): string {
  return caption ? caption.map((node) => node.text).join('') : ''
}

export function paragraphsText(paragraphs: NestedParagraph[]): string {
  return paragraphs.map((paragraph) => inlineText(paragraph.children)).join('\n')
}

/**
 * Plain text of one block, including table cells, Drug Card field values,
 * and captions (M1 §5.9 requires all three searchable). Static chrome
 * (callout eyebrows, Drug Card field labels) is excluded — it would make
 * every document match its own furniture.
 */
export function blockPlainText(block: Block): string {
  switch (block.type) {
    case 'p':
    case 'h2':
    case 'h3':
    case 'blockquote':
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
    case 'toc':
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
 */
export function defaultPreviewBlockCount(content: Content): number {
  const headingIndex = content.findIndex(
    (block, index) => index > 0 && (block.type === 'h2' || block.type === 'h3'),
  )
  const count = headingIndex === -1 ? content.length : headingIndex
  return Math.max(1, Math.min(count, 5))
}
