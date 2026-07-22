/**
 * Pure sliding-window math for the table-backed auth rate limiter
 * (securities.md §10, rules.md §4.8: table-backed sliding windows in
 * Postgres, no Redis; Cloudflare is only the coarse outer layer).
 *
 * Model: two adjacent fixed windows, weighted count — the previous window's
 * count decays linearly as the current window fills, approximating a true
 * sliding window. Counts passed in INCLUDE the request being evaluated: the
 * limiter records every attempt (denied ones too), which is what makes the
 * sign-in backoff curve grow on repeated hammering.
 *
 * Sign-in backoff (PRD says "with backoff", curve unspecified — documented
 * choice): once over the limit the deny window grows
 * `min(900, 30 * 2^(overage - 1))` seconds.
 *
 * No `server-only` here on purpose — pure math, unit-tested with Vitest.
 */

export type WindowEvaluation = { allowed: boolean; retryAfterSeconds: number }

/** Epoch-aligned start (ms) of the fixed window containing `nowMs`. */
export function windowStartMs(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000
  return Math.floor(nowMs / windowMs) * windowMs
}

/**
 * Weighted request count across the two adjacent windows: the previous
 * window contributes `(1 - elapsedFraction)` of its count.
 */
export function weightedCount(params: {
  nowMs: number
  windowSeconds: number
  currentCount: number
  previousCount: number
}): number {
  const { nowMs, windowSeconds, currentCount, previousCount } = params
  const windowMs = windowSeconds * 1000
  const elapsedFraction = (nowMs - windowStartMs(nowMs, windowSeconds)) / windowMs
  return previousCount * (1 - elapsedFraction) + currentCount
}

/** Backoff deny window: 30 s doubling per extra attempt, capped at 900 s. */
export function backoffSeconds(overage: number): number {
  if (overage <= 0) {
    return 0
  }
  return Math.min(900, 30 * 2 ** (overage - 1))
}

/**
 * Evaluate one attempt. `currentCount` / `previousCount` are the recorded
 * counts for the two fixed windows, current INCLUDING this attempt.
 * Allowed while the weighted count stays within the limit; when denied,
 * `retryAfterSeconds` is the backoff window (backoff buckets) or a
 * linear-decay estimate bounded by the window end (plain buckets).
 */
export function evaluateWindow(params: {
  nowMs: number
  limit: number
  windowSeconds: number
  currentCount: number
  previousCount: number
  backoff?: boolean
}): WindowEvaluation {
  const { nowMs, limit, windowSeconds, currentCount, previousCount, backoff = false } = params

  const weighted = weightedCount({ nowMs, windowSeconds, currentCount, previousCount })
  if (weighted <= limit) {
    return { allowed: true, retryAfterSeconds: 0 }
  }

  const overage = Math.ceil(weighted - limit)
  if (backoff) {
    return { allowed: false, retryAfterSeconds: backoffSeconds(overage) }
  }

  // Plain buckets: estimate how long until the previous window's linear decay
  // brings the weighted count back under the limit; never past the point the
  // current window rolls over (a fresh evaluation happens on the next attempt).
  const windowMs = windowSeconds * 1000
  const untilWindowEndSeconds = Math.ceil(
    (windowStartMs(nowMs, windowSeconds) + windowMs - nowMs) / 1000,
  )
  const decayPerSecond = previousCount / windowSeconds
  const retryAfterSeconds =
    decayPerSecond > 0
      ? Math.min(untilWindowEndSeconds, Math.ceil((weighted - limit) / decayPerSecond))
      : untilWindowEndSeconds

  return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) }
}
