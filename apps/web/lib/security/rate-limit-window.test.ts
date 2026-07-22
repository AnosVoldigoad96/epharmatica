import { describe, expect, it } from 'vitest'
import { backoffSeconds, evaluateWindow, weightedCount, windowStartMs } from './rate-limit-window'

// Fixed windows are epoch-aligned, so tests build instants from a window
// boundary: boundary + offset seconds.
const WINDOW = 60
const BOUNDARY = windowStartMs(1_752_969_600_000, WINDOW)

const at = (offsetSeconds: number) => BOUNDARY + offsetSeconds * 1000

describe('windowStartMs', () => {
  it('aligns to the containing fixed window', () => {
    expect(windowStartMs(at(0), WINDOW)).toBe(BOUNDARY)
    expect(windowStartMs(at(59), WINDOW)).toBe(BOUNDARY)
    expect(windowStartMs(at(60), WINDOW)).toBe(BOUNDARY + 60_000)
  })
})

describe('weightedCount', () => {
  it('gives the previous window full weight at the window boundary', () => {
    expect(
      weightedCount({ nowMs: at(0), windowSeconds: WINDOW, currentCount: 2, previousCount: 4 }),
    ).toBe(6)
  })

  it('decays the previous window linearly as the current one fills', () => {
    expect(
      weightedCount({ nowMs: at(30), windowSeconds: WINDOW, currentCount: 2, previousCount: 4 }),
    ).toBe(4)
    expect(
      weightedCount({ nowMs: at(45), windowSeconds: WINDOW, currentCount: 2, previousCount: 4 }),
    ).toBe(3)
  })

  it('counts only the current window with no previous traffic', () => {
    expect(
      weightedCount({ nowMs: at(30), windowSeconds: WINDOW, currentCount: 7, previousCount: 0 }),
    ).toBe(7)
  })
})

describe('backoffSeconds', () => {
  it('doubles from 30 s and caps at 900 s', () => {
    expect(backoffSeconds(1)).toBe(30)
    expect(backoffSeconds(2)).toBe(60)
    expect(backoffSeconds(3)).toBe(120)
    expect(backoffSeconds(5)).toBe(480)
    expect(backoffSeconds(6)).toBe(900)
    expect(backoffSeconds(40)).toBe(900)
  })

  it('is zero when not over the limit', () => {
    expect(backoffSeconds(0)).toBe(0)
  })
})

describe('evaluateWindow', () => {
  it('allows at exactly the limit (counts include this attempt)', () => {
    const result = evaluateWindow({
      nowMs: at(30),
      limit: 5,
      windowSeconds: WINDOW,
      currentCount: 5,
      previousCount: 0,
    })
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 })
  })

  it('denies once the weighted count exceeds the limit', () => {
    const result = evaluateWindow({
      nowMs: at(30),
      limit: 5,
      windowSeconds: WINDOW,
      currentCount: 6,
      previousCount: 0,
    })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('lets previous-window traffic push a fresh window over the limit', () => {
    // 15 s in: 10 * 0.75 + 3 = 10.5 > 10
    const denied = evaluateWindow({
      nowMs: at(15),
      limit: 10,
      windowSeconds: WINDOW,
      currentCount: 3,
      previousCount: 10,
    })
    expect(denied.allowed).toBe(false)

    // 45 s in: 10 * 0.25 + 3 = 5.5 <= 10 — decay released it
    const allowed = evaluateWindow({
      nowMs: at(45),
      limit: 10,
      windowSeconds: WINDOW,
      currentCount: 3,
      previousCount: 10,
    })
    expect(allowed.allowed).toBe(true)
  })

  it('bounds a plain bucket retry by the window end', () => {
    const result = evaluateWindow({
      nowMs: at(30),
      limit: 5,
      windowSeconds: WINDOW,
      currentCount: 9,
      previousCount: 0,
    })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(30)
  })

  it('uses linear decay for a plain bucket when previous traffic dominates', () => {
    // At the boundary: weighted = 6, excess 1, decay 6/60 per s → 10 s.
    const result = evaluateWindow({
      nowMs: at(0),
      limit: 5,
      windowSeconds: WINDOW,
      currentCount: 0,
      previousCount: 6,
    })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(10)
  })

  it('grows the backoff deny window with each extra sign-in attempt', () => {
    const base = {
      nowMs: at(0),
      limit: 10,
      windowSeconds: 900,
      previousCount: 0,
      backoff: true,
    }
    expect(evaluateWindow({ ...base, currentCount: 11 }).retryAfterSeconds).toBe(30)
    expect(evaluateWindow({ ...base, currentCount: 12 }).retryAfterSeconds).toBe(60)
    expect(evaluateWindow({ ...base, currentCount: 13 }).retryAfterSeconds).toBe(120)
    expect(evaluateWindow({ ...base, currentCount: 20 }).retryAfterSeconds).toBe(900)
  })
})
