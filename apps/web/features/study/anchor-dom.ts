import type { AnchorKind, AnchorPath } from '@epharmatica/editor'
import type { StudyAnchor } from './anchor-schema'
import { MAX_SNAPSHOT_LENGTH } from './anchor-schema'

/**
 * DOM ↔ typed-anchor mapping (1.D · M1 §5.5 · R-M1). The canonical text a
 * highlight's offsets index into is defined by @epharmatica/editor's
 * `getTextRuns(block, path)`; this module rebuilds EXACTLY that string
 * from the DOM <RichText/> emits (data-block-id roots + stable rt-*
 * hooks), piece-by-piece, so DOM offsets and run offsets convert both
 * ways without ever touching stored JSON:
 *
 *   prose    p/h2/h3/blockquote → text nodes in order; details → summary
 *            only; callout → direct <p>s minus the label, '\n'-joined
 *   table    [row, col] → the cell's <p>s, '\n'-joined
 *   drugcard [field]    → the title (generic_name) or the row's <dd>
 *   code     [line]     → the .rt-code__line minus its trailing '\n'
 *   caption  ['caption']→ the <figcaption>
 *   list     [i, j, …]  → the li's own line, nested lists excluded
 *
 * Inline equations render as KaTeX HTML whose textContent differs from the
 * canonical TeX source; the wrapper carries the source as the [role=math]
 * aria-label, so equations become ATOMIC pieces — selections snap to whole
 * equations, offsets stay canonical. Pure DOM module (no React): the unit
 * tests run it under jsdom against markup mirroring the renderer.
 */

export type BlockRoot = { el: Element; blockId: string; kind: AnchorKind }

export type RunPiece =
  | { kind: 'text'; start: number; end: number; node: Text }
  | { kind: 'atomic'; start: number; end: number; el: Element }
  | { kind: 'separator'; start: number; end: number }

export type RunMap = {
  text: string
  pieces: RunPiece[]
  /** Elements a selection boundary must sit inside to be anchorable. */
  regions: Element[]
}

export type AnchorFromRangeResult =
  | { ok: true; anchor: StudyAnchor; root: BlockRoot }
  | {
      ok: false
      reason: 'collapsed' | 'outside' | 'multi-block' | 'unanchorable' | 'empty' | 'too-long'
    }

/* ------------------------------------------------------------------ roots */

/** Anchor kind for a data-block-id element; 'skip' = list-item ids (walk
 * on to the list block); null = unanchorable (toc/hr/equation/columns). */
function kindForElement(el: Element): AnchorKind | 'skip' | null {
  switch (el.tagName) {
    case 'LI':
      return 'skip'
    case 'P':
    case 'H2':
    case 'H3':
    case 'BLOCKQUOTE':
    case 'DETAILS':
    case 'ASIDE':
      return 'prose'
    case 'UL':
    case 'OL':
      return 'list'
    case 'DIV':
      return el.classList.contains('rt-table-wrap') ? 'table' : null
    case 'SECTION':
      return el.classList.contains('rt-drugcard') ? 'drugcard' : null
    case 'PRE':
      return 'code'
    case 'FIGURE':
      return 'caption'
    default:
      return null
  }
}

/**
 * Walk up from a node to its anchorable block root inside `scope`.
 * Returns 'unanchorable' when the containing block exists but has no
 * offset-addressable text (toc, hr, equation, column group).
 */
export function resolveBlockRoot(node: Node, scope: Element): BlockRoot | 'unanchorable' | null {
  let el: Element | null = node instanceof Element ? node : node.parentElement
  while (el && el !== scope && scope.contains(el)) {
    const blockId = el.getAttribute('data-block-id')
    if (blockId) {
      const kind = kindForElement(el)
      if (kind === 'skip') {
        el = el.parentElement
        continue
      }
      return kind ? { el, blockId, kind } : 'unanchorable'
    }
    el = el.parentElement
  }
  return null
}

/* ------------------------------------------------------------------ paths */

function closestWithin(node: Node, selector: string, root: Element): Element | null {
  const el = node instanceof Element ? node : node.parentElement
  const found = el?.closest(selector) ?? null
  return found && root.contains(found) && found !== root ? found : null
}

function directParagraphs(parent: Element): Element[] {
  return Array.from(parent.children).filter(
    (child) => child.tagName === 'P' && !child.classList.contains('rt-callout__label'),
  )
}

function listItems(listEl: Element): Element[] {
  return Array.from(listEl.children).filter((child) => child.tagName === 'LI')
}

/** The kind-specific path for a DOM position — null when the position sits
 * in chrome (callout label, drug-card <dt>, media area, between list items). */
export function pathForPosition(root: BlockRoot, node: Node): AnchorPath | null {
  const el = root.el
  switch (root.kind) {
    case 'prose': {
      if (el.tagName === 'DETAILS') {
        const summary = el.querySelector(':scope > summary')
        return summary && summary.contains(node) ? [] : null
      }
      if (el.tagName === 'ASIDE') {
        const p = closestWithin(node, 'p', el)
        return p && p.parentElement === el && !p.classList.contains('rt-callout__label') ? [] : null
      }
      return []
    }
    case 'table': {
      const cell = closestWithin(node, 'td, th', el)
      if (!cell) return null
      const row = cell.parentElement
      if (!row) return null
      const rows = Array.from(el.querySelectorAll('tr'))
      const rowIndex = rows.indexOf(row as HTMLTableRowElement)
      const colIndex = Array.from(row.children).indexOf(cell)
      return rowIndex >= 0 && colIndex >= 0 ? [rowIndex, colIndex] : null
    }
    case 'drugcard': {
      if (closestWithin(node, '.rt-drugcard__title', el)) return ['generic_name']
      const dd = closestWithin(node, 'dd', el)
      const field = dd?.closest('.rt-drugcard__row')?.getAttribute('data-field')
      return field ? [field] : null
    }
    case 'code': {
      const line = closestWithin(node, '.rt-code__line', el)
      const index = line ? Number(line.getAttribute('data-line')) : NaN
      return Number.isInteger(index) && index >= 0 ? [index] : null
    }
    case 'caption': {
      const caption = el.querySelector(':scope > figcaption')
      return caption && caption.contains(node) ? ['caption'] : null
    }
    case 'list': {
      const li = closestWithin(node, 'li', el)
      if (!li) return null
      const indices: number[] = []
      let current: Element | null = li
      while (current) {
        const parent: Element | null = current.parentElement
        if (!parent || (parent.tagName !== 'UL' && parent.tagName !== 'OL')) return null
        const index = listItems(parent).indexOf(current)
        if (index < 0) return null
        indices.unshift(index)
        if (parent === el) return indices
        current = parent.parentElement
        if (!current || current.tagName !== 'LI') return null
      }
      return null
    }
  }
}

/* -------------------------------------------------------------- run maps */

/** The canonical TeX source of a rendered inline equation (the wrapper's
 * [role=math] aria-label; the lazy fallback renders the source as text). */
function equationTex(el: Element): string {
  const label = el.querySelector('[role="math"]')?.getAttribute('aria-label')
  return label ?? el.textContent ?? ''
}

class RunBuilder {
  text = ''
  pieces: RunPiece[] = []

  addTextNode(node: Text): void {
    const length = node.data.length
    if (length === 0) return
    this.pieces.push({
      kind: 'text',
      start: this.text.length,
      end: this.text.length + length,
      node,
    })
    this.text += node.data
  }

  addAtomic(el: Element, canonical: string): void {
    if (canonical.length === 0) return
    this.pieces.push({
      kind: 'atomic',
      start: this.text.length,
      end: this.text.length + canonical.length,
      el,
    })
    this.text += canonical
  }

  addSeparator(): void {
    this.pieces.push({ kind: 'separator', start: this.text.length, end: this.text.length + 1 })
    this.text += '\n'
  }

  /** Drop ONE trailing '\n' (the code line's literal newline). */
  stripTrailingNewline(): void {
    if (!this.text.endsWith('\n')) return
    const last = this.pieces[this.pieces.length - 1]
    if (!last) return
    if (last.end - last.start === 1) this.pieces.pop()
    else last.end -= 1
    this.text = this.text.slice(0, -1)
  }
}

function collectInline(
  builder: RunBuilder,
  container: Element,
  skip?: (el: Element) => boolean,
): void {
  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === 3) {
      builder.addTextNode(child as Text)
      continue
    }
    if (child.nodeType !== 1) continue
    const el = child as Element
    if (el.classList.contains('rt-inline-equation')) {
      builder.addAtomic(el, equationTex(el))
      continue
    }
    if (skip?.(el)) continue
    collectInline(builder, el, skip)
  }
}

function joinParagraphs(builder: RunBuilder, paragraphs: Element[]): void {
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) builder.addSeparator()
    collectInline(builder, paragraph)
  })
}

/**
 * Build the run map for (block root, path) — the exact `getTextRuns`
 * string with every character mapped back to its DOM source. Null when the
 * path doesn't locate text in this block (mirrors the run-API contract).
 */
export function collectRunMap(root: BlockRoot, path: AnchorPath): RunMap | null {
  const el = root.el
  const builder = new RunBuilder()

  switch (root.kind) {
    case 'prose': {
      if (path.length !== 0) return null
      if (el.tagName === 'DETAILS') {
        const summary = el.querySelector(':scope > summary')
        if (!summary) return null
        collectInline(builder, summary)
        return { text: builder.text, pieces: builder.pieces, regions: [summary] }
      }
      if (el.tagName === 'ASIDE') {
        const paragraphs = directParagraphs(el)
        joinParagraphs(builder, paragraphs)
        return { text: builder.text, pieces: builder.pieces, regions: paragraphs }
      }
      collectInline(builder, el)
      return { text: builder.text, pieces: builder.pieces, regions: [el] }
    }
    case 'table': {
      const [rowIndex, colIndex] = path
      if (path.length !== 2 || typeof rowIndex !== 'number' || typeof colIndex !== 'number') {
        return null
      }
      const row = Array.from(el.querySelectorAll('tr'))[rowIndex]
      const cell = row ? Array.from(row.children)[colIndex] : undefined
      if (!cell) return null
      joinParagraphs(
        builder,
        Array.from(cell.children).filter((c) => c.tagName === 'P'),
      )
      return { text: builder.text, pieces: builder.pieces, regions: [cell] }
    }
    case 'drugcard': {
      const [field] = path
      if (path.length !== 1 || typeof field !== 'string') return null
      const target =
        field === 'generic_name'
          ? el.querySelector(':scope > .rt-drugcard__title')
          : (el.querySelector(`.rt-drugcard__row[data-field="${field}"] dd`) ?? null)
      if (!target) return null
      collectInline(builder, target)
      return { text: builder.text, pieces: builder.pieces, regions: [target] }
    }
    case 'code': {
      const [lineIndex] = path
      if (path.length !== 1 || typeof lineIndex !== 'number') return null
      const line = el.querySelector(`.rt-code__line[data-line="${lineIndex}"]`)
      if (!line) return null
      collectInline(builder, line)
      builder.stripTrailingNewline()
      return { text: builder.text, pieces: builder.pieces, regions: [line] }
    }
    case 'caption': {
      if (path.length !== 1 || path[0] !== 'caption') return null
      const caption = el.querySelector(':scope > figcaption')
      if (!caption) return null
      collectInline(builder, caption)
      return { text: builder.text, pieces: builder.pieces, regions: [caption] }
    }
    case 'list': {
      if (path.length === 0) return null
      let listEl: Element | null = el
      let li: Element | null = null
      for (const segment of path) {
        if (typeof segment !== 'number' || !listEl) return null
        li = listItems(listEl)[segment] ?? null
        if (!li) return null
        listEl =
          Array.from(li.children).find(
            (child) => child.tagName === 'UL' || child.tagName === 'OL',
          ) ?? null
      }
      if (!li) return null
      collectInline(builder, li, (child) => child.tagName === 'UL' || child.tagName === 'OL')
      return { text: builder.text, pieces: builder.pieces, regions: [li] }
    }
  }
}

/* ------------------------------------------------------- offset mapping */

/** Map a DOM boundary point into run-text offsets. Atomic pieces snap
 * outward (`bias`), so equations are always covered whole. */
export function runOffsetForPoint(
  map: RunMap,
  container: Node,
  offset: number,
  bias: 'start' | 'end',
): number | null {
  for (const piece of map.pieces) {
    if (piece.kind === 'text' && piece.node === container) {
      return piece.start + Math.min(offset, piece.end - piece.start)
    }
  }
  const doc = container.ownerDocument
  if (!doc) return null
  const point = doc.createRange()
  try {
    point.setStart(container, offset)
  } catch {
    return null
  }
  point.collapse(true)
  for (const piece of map.pieces) {
    if (piece.kind === 'separator') continue
    const pieceRange = doc.createRange()
    if (piece.kind === 'text') {
      pieceRange.setStart(piece.node, 0)
      pieceRange.setEnd(piece.node, piece.node.data.length)
    } else {
      pieceRange.selectNode(piece.el)
    }
    // Collapsed point: START_TO_START/END_TO_END both compare the point
    // itself against the piece's edges.
    if (point.compareBoundaryPoints(Range.START_TO_START, pieceRange) <= 0) {
      return piece.start
    }
    if (point.compareBoundaryPoints(Range.END_TO_END, pieceRange) < 0) {
      if (piece.kind === 'atomic') return bias === 'start' ? piece.start : piece.end
      return piece.start
    }
  }
  return map.text.length
}

/** Run offsets → a DOM Range (for painting and glyph placement). */
export function rangeForRunOffsets(map: RunMap, start: number, end: number): Range | null {
  if (start < 0 || end > map.text.length || start >= end) return null
  const firstPiece = map.pieces.find((piece) => piece.kind !== 'separator')
  const doc =
    firstPiece?.kind === 'text'
      ? firstPiece.node.ownerDocument
      : firstPiece?.kind === 'atomic'
        ? firstPiece.el.ownerDocument
        : null
  if (!doc) return null

  const range = doc.createRange()
  let startSet = false
  let endSet = false

  for (const piece of map.pieces) {
    if (!startSet && start < piece.end) {
      if (piece.kind === 'text') {
        range.setStart(piece.node, Math.max(0, start - piece.start))
        startSet = true
      } else if (piece.kind === 'atomic') {
        range.setStartBefore(piece.el)
        startSet = true
      }
      // separator: fall through to the next piece
    }
    if (piece.start < end) {
      if (piece.kind === 'text') {
        range.setEnd(piece.node, Math.min(piece.end, end) - piece.start)
        endSet = true
      } else if (piece.kind === 'atomic') {
        range.setEndAfter(piece.el)
        endSet = true
      }
    }
  }
  return startSet && endSet ? range : null
}

/* ------------------------------------------------------------ high level */

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** The block root for a stored block id — resolves through `scope` so both
 * the server preview and the client-unlocked blocks are covered. */
export function findBlockRoot(scope: Element, blockId: string): BlockRoot | null {
  const el = scope.querySelector(`[data-block-id="${escapeAttributeValue(blockId)}"]`)
  if (!el) return null
  const kind = kindForElement(el)
  return kind && kind !== 'skip' ? { el, blockId, kind } : null
}

/**
 * A stored anchor → live DOM Range. Null when the block/path is missing OR
 * the text at the offsets no longer matches the snapshot (stale shell —
 * the post-publish re-anchor job owns migrations; the client never guesses).
 */
export function rangeForAnchor(
  scope: Element,
  anchor: Pick<StudyAnchor, 'block_id' | 'kind' | 'path' | 'start' | 'end' | 'snapshot'>,
): Range | null {
  const root = findBlockRoot(scope, anchor.block_id)
  if (!root || root.kind !== anchor.kind) return null
  const map = collectRunMap(root, anchor.path)
  if (!map) return null
  if (map.text.slice(anchor.start, anchor.end) !== anchor.snapshot) return null
  return rangeForRunOffsets(map, anchor.start, anchor.end)
}

function samePath(a: AnchorPath, b: AnchorPath): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index])
}

function withinRegions(map: RunMap, node: Node): boolean {
  return map.regions.some((region) => region === node || region.contains(node))
}

/**
 * A live selection Range → a v:1 anchor (M1 §5.5). The selection must sit
 * fully inside ONE block's ONE text run; equations snap to whole units;
 * >1000 characters reports 'too-long' (the popover shows a disabled hint).
 */
export function anchorFromRange(range: Range, scope: Element): AnchorFromRangeResult {
  if (range.collapsed) return { ok: false, reason: 'collapsed' }

  const startRoot = resolveBlockRoot(range.startContainer, scope)
  const endRoot = resolveBlockRoot(range.endContainer, scope)
  if (startRoot === null && endRoot === null) return { ok: false, reason: 'outside' }
  if (startRoot === 'unanchorable' || endRoot === 'unanchorable') {
    return { ok: false, reason: 'unanchorable' }
  }
  if (!startRoot || !endRoot) return { ok: false, reason: 'multi-block' }
  if (startRoot.blockId !== endRoot.blockId) return { ok: false, reason: 'multi-block' }

  const startPath = pathForPosition(startRoot, range.startContainer)
  const endPath = pathForPosition(startRoot, range.endContainer)
  if (!startPath || !endPath) return { ok: false, reason: 'unanchorable' }
  if (!samePath(startPath, endPath)) return { ok: false, reason: 'multi-block' }

  const map = collectRunMap(startRoot, startPath)
  if (!map) return { ok: false, reason: 'unanchorable' }
  if (!withinRegions(map, range.startContainer) || !withinRegions(map, range.endContainer)) {
    return { ok: false, reason: 'unanchorable' }
  }

  const start = runOffsetForPoint(map, range.startContainer, range.startOffset, 'start')
  const end = runOffsetForPoint(map, range.endContainer, range.endOffset, 'end')
  if (start === null || end === null || end <= start) return { ok: false, reason: 'empty' }

  const snapshot = map.text.slice(start, end)
  if (snapshot.trim().length === 0) return { ok: false, reason: 'empty' }
  if (snapshot.length > MAX_SNAPSHOT_LENGTH) return { ok: false, reason: 'too-long' }

  return {
    ok: true,
    root: startRoot,
    anchor: {
      v: 1,
      block_id: startRoot.blockId,
      kind: startRoot.kind,
      path: startPath,
      start,
      end,
      snapshot,
    },
  }
}

export type RunPosition = {
  blockId: string
  kind: AnchorKind
  path: AnchorPath
  offset: number
}

/** Hit-testing support: a DOM point → its run position (click-on-highlight). */
export function runPositionForDomPoint(
  scope: Element,
  container: Node,
  offset: number,
): RunPosition | null {
  const root = resolveBlockRoot(container, scope)
  if (!root || root === 'unanchorable') return null
  const path = pathForPosition(root, container)
  if (!path) return null
  const map = collectRunMap(root, path)
  if (!map) return null
  const runOffset = runOffsetForPoint(map, container, offset, 'start')
  if (runOffset === null) return null
  return { blockId: root.blockId, kind: root.kind, path, offset: runOffset }
}

/** Stable grouping key for one text run. */
export function runKey(blockId: string, path: AnchorPath): string {
  return `${blockId}::${JSON.stringify(path)}`
}
