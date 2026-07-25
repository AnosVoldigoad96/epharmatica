import { describe, expect, it } from 'vitest'
import { winningSegments } from './overlap'

const item = (id: string, start: number, end: number, color: string, createdAt: string) => ({
  id,
  start,
  end,
  color,
  createdAt,
})

describe('winningSegments (M1 §5.5 — overlaps split, newest wins)', () => {
  it('returns non-overlapping items unchanged', () => {
    expect(
      winningSegments([
        item('a', 0, 5, 'amber', '2026-07-01'),
        item('b', 10, 15, 'mint', '2026-07-02'),
      ]),
    ).toEqual([
      { start: 0, end: 5, color: 'amber', id: 'a' },
      { start: 10, end: 15, color: 'mint', id: 'b' },
    ])
  })

  it('gives the overlap to the newest highlight', () => {
    expect(
      winningSegments([
        item('old', 0, 10, 'amber', '2026-07-01'),
        item('new', 5, 15, 'rose', '2026-07-02'),
      ]),
    ).toEqual([
      { start: 0, end: 5, color: 'amber', id: 'old' },
      { start: 5, end: 15, color: 'rose', id: 'new' },
    ])
  })

  it('splits an older highlight around a newer one nested inside it', () => {
    expect(
      winningSegments([
        item('outer', 0, 20, 'mint', '2026-07-01'),
        item('inner', 5, 10, 'lilac', '2026-07-03'),
      ]),
    ).toEqual([
      { start: 0, end: 5, color: 'mint', id: 'outer' },
      { start: 5, end: 10, color: 'lilac', id: 'inner' },
      { start: 10, end: 20, color: 'mint', id: 'outer' },
    ])
  })

  it('an older highlight fully covered by a newer one disappears', () => {
    expect(
      winningSegments([
        item('under', 3, 6, 'amber', '2026-07-01'),
        item('over', 0, 10, 'rose', '2026-07-05'),
      ]),
    ).toEqual([{ start: 0, end: 10, color: 'rose', id: 'over' }])
  })

  it('breaks createdAt ties deterministically by id', () => {
    const segments = winningSegments([
      item('a', 0, 10, 'amber', '2026-07-01T00:00:00Z'),
      item('b', 0, 10, 'mint', '2026-07-01T00:00:00Z'),
    ])
    expect(segments).toEqual([{ start: 0, end: 10, color: 'mint', id: 'b' }])
  })

  it('merges adjacent elementary intervals with the same winner', () => {
    // Boundary at 5 introduced by the loser must not split the winner.
    const segments = winningSegments([
      item('win', 0, 10, 'rose', '2026-07-09'),
      item('lose', 5, 10, 'amber', '2026-07-01'),
    ])
    expect(segments).toEqual([{ start: 0, end: 10, color: 'rose', id: 'win' }])
  })

  it('drops zero/negative-length inputs and handles empty input', () => {
    expect(winningSegments([])).toEqual([])
    expect(winningSegments([item('z', 5, 5, 'amber', '2026-07-01')])).toEqual([])
  })
})
