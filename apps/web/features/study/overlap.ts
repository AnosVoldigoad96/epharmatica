/**
 * Overlap resolution for highlight painting (1.D · M1 §5.5): overlapping
 * highlights are permitted; the renderer splits ranges into DISJOINT
 * segments and the NEWEST highlight's color wins wherever they overlap.
 * Pure offset arithmetic over one text run — the caller groups highlights
 * by (block_id, path) first; DOM mapping happens elsewhere (anchor-dom.ts).
 */

export type OverlapInput = {
  id: string
  start: number
  end: number
  color: string
  /** ISO timestamp — newest (greatest) wins on overlaps. */
  createdAt: string
}

export type PaintSegment = {
  start: number
  end: number
  color: string
  /** The highlight that owns this segment's paint (the visual winner). */
  id: string
}

/** True when `a` is newer than `b` (createdAt, id as a stable tiebreak). */
function newer(a: OverlapInput, b: OverlapInput): boolean {
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt
  return a.id > b.id
}

/**
 * Split a run's highlights into disjoint paint segments, newest-on-top.
 * Zero/negative-length inputs are dropped; adjacent segments with the same
 * winner merge back together.
 */
export function winningSegments(items: OverlapInput[]): PaintSegment[] {
  const valid = items.filter((item) => item.end > item.start)
  if (valid.length === 0) return []

  // Elementary intervals between every distinct boundary.
  const bounds = [...new Set(valid.flatMap((item) => [item.start, item.end]))].sort((a, b) => a - b)

  const segments: PaintSegment[] = []
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const start = bounds[i] as number
    const end = bounds[i + 1] as number
    let winner: OverlapInput | null = null
    for (const item of valid) {
      if (item.start <= start && item.end >= end && (winner === null || newer(item, winner))) {
        winner = item
      }
    }
    if (!winner) continue
    const previous = segments[segments.length - 1]
    if (previous && previous.id === winner.id && previous.end === start) {
      previous.end = end
    } else {
      segments.push({ start, end, color: winner.color, id: winner.id })
    }
  }
  return segments
}
