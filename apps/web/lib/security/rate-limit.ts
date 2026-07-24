/**
 * Table-backed auth rate limiter over `public.auth_rate_limits` (migration
 * 011) — securities.md §10 catalog, rules.md §4.8: sliding windows in
 * Postgres, no Redis; Cloudflare rules are only the coarse outer layer.
 * Increments go through the atomic `auth_rate_limit_hit` RPC (011), never a
 * read-then-upsert.
 *
 * Identifiers are ALWAYS keyed hashes from lib/security/hash.ts (hashed IP
 * for signup/signin/username_check, hashed lowercased email for reset) —
 * never raw values (securities.md §13). Window math lives in
 * rate-limit-window.ts (pure, unit-tested); this module owns the storage.
 *
 * Failure policy: fail-open ONLY when Supabase env is unconfigured (dev
 * without a stack); fail-closed on any query error.
 *
 * Trusted service-role surface — on the ESLint I2 allowlist in
 * eslint.config.mjs.
 */
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateWindow, windowStartMs } from './rate-limit-window'

/** Contractual limits (securities.md §10 — numbers are contractual). */
export const AUTH_RATE_LIMITS = {
  signup: { limit: 5, windowSeconds: 3600 },
  signin: { limit: 10, windowSeconds: 900 },
  reset: { limit: 3, windowSeconds: 3600 },
  username_check: { limit: 30, windowSeconds: 60 },
  // M4 §4: admin mutations, keyed by hashed staff user id — generous enough
  // for editing with 30s autosave, tight enough to stop runaway scripts.
  admin_mutation: { limit: 60, windowSeconds: 300 },
} as const

export type AuthRateLimitBucket = keyof typeof AUTH_RATE_LIMITS

export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number }

/**
 * Record this attempt and decide. Every attempt is counted — denied ones
 * too — which is what makes the sign-in backoff grow under hammering.
 * The increment is a single atomic Postgres statement (`auth_rate_limit_hit`
 * RPC): each attempt bumps its window row exactly once and the decision uses
 * the RETURNED post-increment count, so N concurrent attempts can never all
 * observe a pre-increment value, and the counter can never regress.
 */
export async function enforceRateLimit(
  bucket: AuthRateLimitBucket,
  identifier: string,
): Promise<RateLimitDecision> {
  const { limit, windowSeconds } = AUTH_RATE_LIMITS[bucket]

  // Fail-open ONLY when the stack is unconfigured (dev) — mirrors the
  // waitlist action's graceful degradation.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: true, retryAfterSeconds: 0 }
  }

  try {
    const supabase = createAdminClient()
    const nowMs = Date.now()
    const currentStart = new Date(windowStartMs(nowMs, windowSeconds)).toISOString()
    const previousStart = new Date(
      windowStartMs(nowMs, windowSeconds) - windowSeconds * 1000,
    ).toISOString()

    // Atomic insert-or-increment for the current window; the returned count
    // is authoritative and INCLUDES this attempt.
    // Placeholder Database type — cast the args and validate the result
    // instead of trusting it (gen:types later).
    const { data: hitCount, error: hitError } = await supabase.rpc('auth_rate_limit_hit', {
      p_identifier: identifier,
      p_bucket: bucket,
      p_window_start: currentStart,
    } as never)

    const currentCount = typeof hitCount === 'number' ? hitCount : Number.NaN
    if (hitError || !Number.isFinite(currentCount)) {
      return { allowed: false, retryAfterSeconds: windowSeconds }
    }

    // The sliding-window weighting still needs the previous window's count —
    // a plain read is fine here, it is never written on this path.
    const { data: previousRow, error: readError } = await supabase
      .from('auth_rate_limits')
      .select('request_count')
      .eq('identifier', identifier)
      .eq('bucket', bucket)
      .eq('window_start', previousStart)
      .maybeSingle()

    if (readError) {
      return { allowed: false, retryAfterSeconds: windowSeconds }
    }

    const previousCount = (previousRow as { request_count: number } | null)?.request_count ?? 0

    // Opportunistic prune: expired windows for this bucket (best-effort — a
    // failure here must not affect the decision).
    const pruneBefore = new Date(nowMs - 2 * windowSeconds * 1000).toISOString()
    await supabase
      .from('auth_rate_limits')
      .delete()
      .eq('bucket', bucket)
      .lt('window_start', pruneBefore)

    return evaluateWindow({
      nowMs,
      limit,
      windowSeconds,
      currentCount,
      previousCount,
      backoff: bucket === 'signin',
    })
  } catch {
    // Fail-closed on anything unexpected (never fail-open past env checks).
    return { allowed: false, retryAfterSeconds: windowSeconds }
  }
}
