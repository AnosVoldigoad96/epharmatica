import type { AnchorKind, AnchorPath } from './anchors'
import { getAllTextRuns, getAnchorKind } from './anchors'
import { upgradeLegacyLists } from './schema/legacy-lists'
import type { Block, Content } from './schema/types'

/**
 * Highlight re-anchoring on republish (M1 §5.5, risk R-M1) — the pure core
 * of the post-publish job. Given the republished document and a batch of
 * highlights, decide per highlight, in normative precedence order:
 *
 *  1. keep   — block_id + path still locate a run in the new content AND
 *              the run's [start, end) slice equals the snapshot exactly
 *              (and the stored kind still matches the block; a stale kind
 *              with matching text re-derives via 2 instead).
 *  2. repath — the snapshot occurs somewhere in the SAME block (found by
 *              block_id): re-derive kind/path/offsets, same block_id.
 *  3. move   — the snapshot occurs EXACTLY ONCE across all runs of the
 *              whole new document: new anchor at that location. Two or
 *              more occurrences are ambiguous — never guess.
 *  4. orphan — otherwise. Orphans keep their row + snapshot (M1 §5.5:
 *              restorable by the user); this module never throws and never
 *              drops data.
 *
 * Determinism (documented tie-breaks):
 *  - Step 2, several occurrences in the block: every occurrence is ranked
 *    by (a) distance in document-run order between its run and the run the
 *    old path occupies — exact old path counts as distance 0; if the old
 *    path no longer exists, its position is where it would sort among the
 *    new runs (lexicographic path order) — then (b) the earlier run, then
 *    (c) |start − old start| within the run, then (d) the earlier start.
 *    So: same path beats sibling runs, nearer runs beat farther ones, and
 *    equidistant offsets resolve to the EARLIER occurrence.
 *  - Step 3 counts every occurrence, overlapping included; a snapshot
 *    appearing twice in one run is just as ambiguous as one appearing in
 *    two blocks.
 *  - Step 2 outranks step 3 by construction: a same-block occurrence wins
 *    even when the snapshot also (even uniquely) appears elsewhere.
 *
 * Offsets are UTF-16 code units over the run string exactly as getTextRuns
 * returns it — identical to the creation side (I4: all text access goes
 * through the run API; this module never reads node internals).
 *
 * The function is pure: no clock, no randomness, inputs never mutated;
 * emitted anchors share no object identity with the inputs. The run index
 * of the new content is built ONCE per call, not per highlight.
 *
 * Legacy lists: content still stored in the v1 flat spelling is upgraded
 * through upgradeLegacyLists first, so blocks are addressed exactly as the
 * renderer and anchor-creation side see them (canonical v2 containers —
 * the container carries the first item's id; items address as list paths).
 */

/** The stored anchor shape — highlights.anchor jsonb, versioned (v: 1). */
export type AnchorV1 = {
  v: 1
  block_id: string
  kind: AnchorKind
  path: AnchorPath
  start: number
  end: number
  snapshot: string
}

/** One highlight row as the job hands it over; `anchor` is raw jsonb. */
export type ReanchorHighlight = { id: string; anchor: unknown }

export type ReanchorResult =
  | { id: string; action: 'keep' }
  | { id: string; action: 'repath' | 'move'; anchor: AnchorV1 }
  | { id: string; action: 'orphan' }

const ANCHOR_KINDS: ReadonlySet<string> = new Set([
  'prose',
  'table',
  'drugcard',
  'code',
  'caption',
  'list',
])

/** M1 §5.5: selections are capped at 1,000 characters. */
const MAX_SNAPSHOT_LENGTH = 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPathSegment(value: unknown): value is string | number {
  if (typeof value === 'string') return true
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Strict parse of a stored anchor. Anything malformed — wrong version,
 * unknown kind, garbage path/offsets, empty or oversized snapshot — yields
 * null (→ orphan). Unknown EXTRA properties are tolerated: rows written by
 * a future minor revision still re-anchor. A stale `end` that disagrees
 * with snapshot.length is NOT rejected — the snapshot is the source of
 * truth and steps 2–3 re-derive clean offsets from it.
 */
function parseAnchor(value: unknown): AnchorV1 | null {
  if (!isRecord(value)) return null
  const { v, block_id, kind, path, start, end, snapshot } = value
  if (v !== 1) return null
  if (typeof block_id !== 'string' || block_id.length === 0) return null
  if (typeof kind !== 'string' || !ANCHOR_KINDS.has(kind)) return null
  if (!Array.isArray(path) || !path.every(isPathSegment)) return null
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 0) return null
  if (typeof end !== 'number' || !Number.isInteger(end) || end < start) return null
  if (typeof snapshot !== 'string' || snapshot.length === 0) return null
  if (snapshot.length > MAX_SNAPSHOT_LENGTH) return null
  return {
    v: 1,
    block_id,
    kind: kind as AnchorKind,
    path: path as AnchorPath,
    start,
    end,
    snapshot,
  }
}

/* ------------------------------------------------------------- run index */

type IndexedRun = {
  blockId: string
  kind: AnchorKind
  path: AnchorPath
  text: string
}

type IndexedBlock = {
  kind: AnchorKind
  /** Document order — the order getAllTextRuns yields. */
  runs: IndexedRun[]
  runByPathKey: Map<string, IndexedRun>
}

type RunIndex = {
  byBlockId: Map<string, IndexedBlock>
  /** Every run of every block, whole-document order (for step 3). */
  allRuns: IndexedRun[]
}

function pathKey(path: AnchorPath): string {
  return JSON.stringify(path)
}

/**
 * Defensive normalization of an unknown content payload: non-arrays become
 * empty documents, non-block entries are dropped, and v1 flat lists are
 * upgraded to canonical v2 containers (same addressing as the renderer).
 */
function normalizeContent(content: unknown): Block[] {
  if (!Array.isArray(content)) return []
  const blocks = content.filter(
    (block): block is Block =>
      isRecord(block) &&
      typeof block.type === 'string' &&
      typeof block.id === 'string' &&
      block.id.length > 0,
  )
  try {
    return upgradeLegacyLists(blocks as Content)
  } catch {
    return blocks
  }
}

/**
 * Index every anchorable run of the new document ONCE. A block whose
 * internals crash the run API contributes no runs instead of failing the
 * batch (orphan-first, never throw). Duplicate block ids are malformed
 * content; the FIRST block wins by-id lookups (document order), while all
 * runs still count toward step-3 ambiguity.
 */
function buildRunIndex(blocks: Block[]): RunIndex {
  const byBlockId = new Map<string, IndexedBlock>()
  const allRuns: IndexedRun[] = []
  for (const block of blocks) {
    const kind = getAnchorKind(block) ?? null
    if (kind === null) continue
    let runs: ReturnType<typeof getAllTextRuns>
    try {
      runs = getAllTextRuns(block)
    } catch {
      continue
    }
    const indexed: IndexedBlock = { kind, runs: [], runByPathKey: new Map() }
    for (const run of runs) {
      const indexedRun: IndexedRun = { blockId: block.id, kind, path: run.path, text: run.text }
      indexed.runs.push(indexedRun)
      indexed.runByPathKey.set(pathKey(run.path), indexedRun)
      allRuns.push(indexedRun)
    }
    if (!byBlockId.has(block.id)) byBlockId.set(block.id, indexed)
  }
  return { byBlockId, allRuns }
}

/* ------------------------------------------------------- occurrence math */

function pathsEqual(a: AnchorPath, b: AnchorPath): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index])
}

/**
 * Lexicographic path order: element-wise; numbers compare numerically,
 * numbers sort before strings, a shorter prefix sorts first. For every
 * index-addressed kind (table cells, code lines, list chains) this equals
 * document order; it is only used to place a VANISHED old path among the
 * new runs for the closest-run tie-break.
 */
function comparePaths(a: AnchorPath, b: AnchorPath): number {
  const length = Math.min(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const left = a[index] as string | number
    const right = b[index] as string | number
    if (left === right) continue
    if (typeof left === 'number' && typeof right === 'number') return left - right
    if (typeof left === 'number') return -1
    if (typeof right === 'number') return 1
    return left < right ? -1 : 1
  }
  return a.length - b.length
}

/** Every start index of `needle` in `haystack`, overlapping included. */
function occurrenceIndexes(haystack: string, needle: string): number[] {
  const indexes: number[] = []
  let from = 0
  while (from + needle.length <= haystack.length) {
    const index = haystack.indexOf(needle, from)
    if (index === -1) break
    indexes.push(index)
    from = index + 1
  }
  return indexes
}

type Occurrence = { run: IndexedRun; start: number }

/** The document-run-order position the old path occupies among the new
 * runs: its exact index when it still exists, else its insertion point. */
function oldRunPosition(runs: IndexedRun[], oldPath: AnchorPath): number {
  const exact = runs.findIndex((run) => pathsEqual(run.path, oldPath))
  if (exact !== -1) return exact
  let position = 0
  for (const run of runs) {
    if (comparePaths(run.path, oldPath) < 0) position += 1
  }
  return position
}

type SortKey = readonly [number, number, number, number]

function compareSortKeys(a: SortKey, b: SortKey): number {
  for (let index = 0; index < a.length; index += 1) {
    const delta = (a[index] as number) - (b[index] as number)
    if (delta !== 0) return delta
  }
  return 0
}

/**
 * Step 2: the occurrence of the snapshot inside this block closest to the
 * old (path, offsets). Total order per occurrence, minimized:
 * [ |runIndex − oldRunPosition|, runIndex, |start − old.start|, start ].
 */
function closestOccurrence(block: IndexedBlock, anchor: AnchorV1): Occurrence | null {
  const oldIndex = oldRunPosition(block.runs, anchor.path)
  let best: Occurrence | null = null
  let bestKey: SortKey | null = null
  for (let runIndex = 0; runIndex < block.runs.length; runIndex += 1) {
    const run = block.runs[runIndex] as IndexedRun
    for (const start of occurrenceIndexes(run.text, anchor.snapshot)) {
      const key: SortKey = [
        Math.abs(runIndex - oldIndex),
        runIndex,
        Math.abs(start - anchor.start),
        start,
      ]
      if (bestKey === null || compareSortKeys(key, bestKey) < 0) {
        best = { run, start }
        bestKey = key
      }
    }
  }
  return best
}

/** Step 3: the single whole-document occurrence — null when absent OR when
 * more than one exists (ambiguous, → orphan). */
function uniqueDocumentOccurrence(index: RunIndex, snapshot: string): Occurrence | null {
  let found: Occurrence | null = null
  for (const run of index.allRuns) {
    for (const start of occurrenceIndexes(run.text, snapshot)) {
      if (found !== null) return null
      found = { run, start }
    }
  }
  return found
}

/* -------------------------------------------------------------- resolve */

/** A fresh v1 anchor at an occurrence — no object identity shared with
 * inputs or with other results (paths are copied). */
function anchorAt(occurrence: Occurrence, snapshot: string): AnchorV1 {
  return {
    v: 1,
    block_id: occurrence.run.blockId,
    kind: occurrence.run.kind,
    path: [...occurrence.run.path],
    start: occurrence.start,
    end: occurrence.start + snapshot.length,
    snapshot,
  }
}

function resolveHighlight(highlight: ReanchorHighlight, index: RunIndex): ReanchorResult {
  const anchor = parseAnchor(highlight.anchor)
  if (anchor === null) return { id: highlight.id, action: 'orphan' }

  const block = index.byBlockId.get(anchor.block_id)

  // (1) keep — id + path still locate a run whose [start, end) slice is the
  // snapshot, and the stored kind still matches the block (a stale kind
  // with matching text falls through to (2) and comes back corrected).
  if (block !== undefined && block.kind === anchor.kind) {
    const run = block.runByPathKey.get(pathKey(anchor.path))
    if (run !== undefined && run.text.slice(anchor.start, anchor.end) === anchor.snapshot) {
      return { id: highlight.id, action: 'keep' }
    }
  }

  // (2) repath — the snapshot survives inside the SAME block.
  if (block !== undefined) {
    const occurrence = closestOccurrence(block, anchor)
    if (occurrence !== null) {
      return { id: highlight.id, action: 'repath', anchor: anchorAt(occurrence, anchor.snapshot) }
    }
  }

  // (3) move — the snapshot occurs exactly once in the whole document.
  const occurrence = uniqueDocumentOccurrence(index, anchor.snapshot)
  if (occurrence !== null) {
    return { id: highlight.id, action: 'move', anchor: anchorAt(occurrence, anchor.snapshot) }
  }

  // (4) orphan — restorable via snapshot, never dropped.
  return { id: highlight.id, action: 'orphan' }
}

/**
 * Re-anchor a batch of highlights against the republished document.
 * Results come back in input order, one per highlight, always.
 *
 * `oldContent` is accepted for the job-side call shape (and future
 * context-aware matching) but the v1 precedence never consults it: the
 * anchor itself is the authoritative record of the old location
 * (block_id/kind/path/offsets) and of the old text (snapshot).
 */
export function reanchorHighlights(
  oldContent: unknown,
  newContent: unknown,
  highlights: ReanchorHighlight[],
): ReanchorResult[] {
  void oldContent
  const index = buildRunIndex(normalizeContent(newContent))
  return highlights.map((highlight) => resolveHighlight(highlight, index))
}
