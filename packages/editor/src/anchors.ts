import type { Block, ListItemNode } from './schema/types'
import { inlineText, paragraphsText } from './serializers'

/**
 * The universal typed-anchor text-run contract (M1 §5.5, M1-4).
 *
 * Every highlight anchor addresses a block by id, a kind, and a
 * kind-specific path; offsets index into the string this module returns.
 * Highlight logic NEVER walks node trees itself (I4) — this is the single
 * text-access API, shared by anchor creation, re-anchoring, and rendering.
 */

export type AnchorKind = 'prose' | 'table' | 'drugcard' | 'code' | 'caption' | 'list'

export type AnchorPath = (string | number)[]

/** One anchorable text run: a kind-specific path and the exact string
 * highlight offsets index into (see getTextRuns). */
export type TextRun = { path: AnchorPath; text: string }

/**
 * The anchorable kind of a block — null for blocks with no selectable text
 * of their own (toc, hr, equation — rendered KaTeX output has no
 * offset-addressable text run; the block is still ONE unit with a stable
 * data-block-id in the DOM) and for column groups (their nested blocks
 * carry no ids; column text is searchable but not highlight-anchorable).
 * Note img/video anchor via their captions only; a toggle's SUMMARY line is
 * prose (its contents are ordinary top-level blocks with their own ids).
 */
export function getAnchorKind(block: Block): AnchorKind | null {
  switch (block.type) {
    case 'p':
    case 'h2':
    case 'h3':
    case 'blockquote':
    case 'callout':
    case 'toggle':
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
    case 'ul':
    case 'ol':
      return 'list'
    case 'toc':
    case 'hr':
    case 'equation':
    case 'column_group':
    // Carousel v1: not a highlight target (like columns) — slide captions
    // are searchable via plain text but not offset-anchorable.
    case 'carousel':
      return null
  }
}

/** Descend a list by li indexes: [i] → i-th item; [i, j] → j-th item of
 * the list nested inside the i-th item; and so on. */
function findListItem(items: ListItemNode[], path: AnchorPath): ListItemNode | null {
  let current: ListItemNode | null = null
  let level = items
  for (const segment of path) {
    if (typeof segment !== 'number') return null
    const item: ListItemNode | undefined = level[segment]
    if (!item) return null
    current = item
    const nested = item.children[1]
    level = nested ? nested.children : []
  }
  return current
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
 *   list     [i, j, …]          the li line at that nesting chain
 */
export function getTextRuns(block: Block, path: AnchorPath): string | null {
  switch (block.type) {
    case 'p':
    case 'h2':
    case 'h3':
    case 'blockquote':
    case 'toggle':
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

    case 'ul':
    case 'ol': {
      if (path.length === 0) return null
      const item = findListItem(block.children, path)
      if (!item) return null
      const [lic] = item.children
      return inlineText(lic.children)
    }

    case 'toc':
    case 'hr':
    case 'equation':
    case 'column_group':
    case 'carousel':
      return null
  }
}

/** Preorder li paths of a (possibly nested) list — the order the items
 * render in, matching findListItem's addressing. */
function listItemPaths(items: ListItemNode[], prefix: AnchorPath): AnchorPath[] {
  const paths: AnchorPath[] = []
  items.forEach((item, index) => {
    const path = [...prefix, index]
    paths.push(path)
    const nested = item.children[1]
    if (nested) paths.push(...listItemPaths(nested.children, path))
  })
  return paths
}

/** Candidate anchor paths of a block, in document order. Enumeration lives
 * in this module (the one place allowed to see node shapes, I4); the text
 * itself still flows through getTextRuns, so the pair cannot disagree. */
function candidatePaths(block: Block): AnchorPath[] {
  switch (block.type) {
    case 'p':
    case 'h2':
    case 'h3':
    case 'blockquote':
    case 'toggle':
    case 'callout':
      return [[]]
    case 'table':
      return block.children.flatMap((row, rowIndex) =>
        row.children.map((_, colIndex) => [rowIndex, colIndex]),
      )
    case 'drug_card':
      return Object.keys(block.fields).map((fieldKey) => [fieldKey])
    case 'code_block':
      return block.children.map((_, lineIndex) => [lineIndex])
    case 'img':
    case 'video':
      return [['caption']]
    case 'ul':
    case 'ol':
      return listItemPaths(block.children, [])
    case 'toc':
    case 'hr':
    case 'equation':
    case 'column_group':
    case 'carousel':
      return []
  }
}

/**
 * Every anchorable text run of a block, in document order — the
 * enumeration half of the run contract (getTextRuns is the lookup half).
 * Re-anchoring (M1 §5.5 steps 2–3) scans these runs for a highlight's
 * snapshot; each entry's text is EXACTLY getTextRuns(block, path), so
 * offsets derived here resolve identically at render time. Blocks with no
 * anchorable text (getAnchorKind null) and absent runs (no caption, empty
 * Drug Card field) yield nothing.
 */
export function getAllTextRuns(block: Block): TextRun[] {
  const runs: TextRun[] = []
  for (const path of candidatePaths(block)) {
    const text = getTextRuns(block, path)
    if (text !== null) runs.push({ path, text })
  }
  return runs
}
