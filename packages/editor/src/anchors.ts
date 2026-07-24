import type { Block } from './schema/types'
import { inlineText, paragraphsText } from './serializers'

/**
 * The universal typed-anchor text-run contract (M1 §5.5, M1-4).
 *
 * Every highlight anchor addresses a block by id, a kind, and a
 * kind-specific path; offsets index into the string this module returns.
 * Highlight logic NEVER walks node trees itself (I4) — this is the single
 * text-access API, shared by anchor creation, re-anchoring, and rendering.
 */

export type AnchorKind = 'prose' | 'table' | 'drugcard' | 'code' | 'caption'

export type AnchorPath = (string | number)[]

/**
 * The anchorable kind of a block — null for blocks with no selectable text
 * of their own (toc). Note img/video anchor via their captions only.
 */
export function getAnchorKind(block: Block): AnchorKind | null {
  switch (block.type) {
    case 'p':
    case 'h2':
    case 'h3':
    case 'blockquote':
    case 'callout':
      return 'prose'
    case 'table':
      return 'table'
    case 'drug_card':
      return 'drugcard'
    case 'code_block':
      return 'code'
    case 'img':
    case 'video':
      return 'caption'
    case 'toc':
      return null
  }
}

/**
 * Resolve an anchor path to its text run — the string highlight offsets
 * index into. Returns null when the path does not locate text in this
 * block (re-anchoring treats that as path drift, M1 §5.5).
 *
 *   prose    path []            concatenated block text
 *   table    [rowIdx, colIdx]   concatenated cell text
 *   drugcard [field_key]        that field's value
 *   code     [lineIdx]          that line's text
 *   caption  ['caption']        the figure/video caption text
 */
export function getTextRuns(block: Block, path: AnchorPath): string | null {
  switch (block.type) {
    case 'p':
    case 'h2':
    case 'h3':
    case 'blockquote':
      return path.length === 0 ? inlineText(block.children) : null

    case 'callout':
      return path.length === 0 ? paragraphsText(block.children) : null

    case 'table': {
      const [rowIndex, colIndex] = path
      if (path.length !== 2 || typeof rowIndex !== 'number' || typeof colIndex !== 'number') {
        return null
      }
      const cell = block.children[rowIndex]?.children[colIndex]
      return cell ? paragraphsText(cell.children) : null
    }

    case 'drug_card': {
      const [fieldKey] = path
      if (path.length !== 1 || typeof fieldKey !== 'string') return null
      const value = (block.fields as Record<string, string | undefined>)[fieldKey]
      return typeof value === 'string' && value.length > 0 ? value : null
    }

    case 'code_block': {
      const [lineIndex] = path
      if (path.length !== 1 || typeof lineIndex !== 'number') return null
      const line = block.children[lineIndex]
      return line ? inlineText(line.children) : null
    }

    case 'img':
    case 'video': {
      if (path.length !== 1 || path[0] !== 'caption') return null
      const caption = block.caption
      return caption && caption.length > 0 ? caption.map((node) => node.text).join('') : null
    }

    case 'toc':
      return null
  }
}
