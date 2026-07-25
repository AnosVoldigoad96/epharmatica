import type { StudyHighlight } from './anchor-schema'
import { HIGHLIGHT_COLORS } from './anchor-schema'
import { collectRunMap, findBlockRoot, rangeForRunOffsets, runKey } from './anchor-dom'
import type { RunMap } from './anchor-dom'
import { winningSegments } from './overlap'

/**
 * Highlight painting via the CSS Custom Highlight API (1.D · M1 §5.5):
 * zero DOM mutation — ranges register under `epharmatica-{color}` names
 * and ::highlight() rules in globals.css do the painting, which makes
 * overlaps trivially safe. Overlapping highlights on one run are split
 * into disjoint segments first (overlap.ts) so the NEWEST color wins
 * visually. Feature-detected: browsers without the API simply don't paint
 * (M1's orphan-first posture — never a broken fallback of wrapper spans).
 */

export const HIGHLIGHT_NAME_PREFIX = 'epharmatica-'

type HighlightRegistryLike = Map<string, unknown>

type HighlightConstructor = new (...ranges: AbstractRange[]) => unknown

function highlightRegistry(): HighlightRegistryLike | null {
  if (typeof CSS === 'undefined') return null
  const registry = (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights
  return registry ?? null
}

function highlightConstructor(): HighlightConstructor | null {
  const ctor = (globalThis as { Highlight?: HighlightConstructor }).Highlight
  return typeof ctor === 'function' ? ctor : null
}

export function supportsHighlightPainting(): boolean {
  return highlightRegistry() !== null && highlightConstructor() !== null
}

/**
 * (Re)paint every non-orphaned highlight inside `scope`. Anchors whose
 * block/path/snapshot no longer match the DOM are skipped silently (the
 * re-anchor job owns migrations; stale paint is worse than no paint).
 * Safe to call repeatedly — each call replaces the four registry entries.
 */
export function paintHighlights(scope: Element, highlights: StudyHighlight[]): void {
  const registry = highlightRegistry()
  const Highlight = highlightConstructor()
  if (!registry || !Highlight) return

  // Group by text run, resolving each run's map once.
  const groups = new Map<
    string,
    {
      map: RunMap
      items: { id: string; start: number; end: number; color: string; createdAt: string }[]
    }
  >()

  for (const highlight of highlights) {
    const anchor = highlight.anchor
    if (!anchor || highlight.orphaned) continue
    const key = runKey(anchor.block_id, anchor.path)
    let group = groups.get(key)
    if (!group) {
      const root = findBlockRoot(scope, anchor.block_id)
      if (!root || root.kind !== anchor.kind) continue
      const map = collectRunMap(root, anchor.path)
      if (!map) continue
      group = { map, items: [] }
      groups.set(key, group)
    }
    if (group.map.text.slice(anchor.start, anchor.end) !== anchor.snapshot) continue
    group.items.push({
      id: highlight.id,
      start: anchor.start,
      end: anchor.end,
      color: highlight.color,
      createdAt: highlight.createdAt,
    })
  }

  const rangesByColor = new Map<string, Range[]>(HIGHLIGHT_COLORS.map((color) => [color, []]))
  for (const { map, items } of groups.values()) {
    for (const segment of winningSegments(items)) {
      const range = rangeForRunOffsets(map, segment.start, segment.end)
      if (range) rangesByColor.get(segment.color)?.push(range)
    }
  }

  for (const color of HIGHLIGHT_COLORS) {
    const name = `${HIGHLIGHT_NAME_PREFIX}${color}`
    const ranges = rangesByColor.get(color) ?? []
    if (ranges.length === 0) registry.delete(name)
    else registry.set(name, new Highlight(...ranges))
  }
}

/** Unregister all four entries (layer unmount). */
export function clearHighlightPaint(): void {
  const registry = highlightRegistry()
  if (!registry) return
  for (const color of HIGHLIGHT_COLORS) registry.delete(`${HIGHLIGHT_NAME_PREFIX}${color}`)
}
