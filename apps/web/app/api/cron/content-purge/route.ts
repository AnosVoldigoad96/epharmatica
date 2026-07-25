import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { AUDIT_ACTIONS, writeAudit } from '@/lib/observability/audit'
import { createAdminClient } from '@/lib/supabase/admin'

/*
 * Daily content-trash purge cron (migration 024 — the founder's 14-day
 * soft-delete amendment to 023): calls `purge_content_trash()` with no
 * target on the service role, which hard-deletes every trash event whose
 * purge_after has passed (nested later-trashed events settle with their
 * ancestor inside the RPC).
 *
 * Guard: CRON_SECRET must be set AND match (Bearer header or ?token=),
 * timing-safe; anything else is a 404 (the endpoint does not exist for the
 * unauthenticated) — the audit-export pattern verbatim. Idempotent: a run
 * with nothing due returns { purged: 0 } and writes no audit row (the
 * audit-export no-op precedent); a productive run writes one node_purged
 * row with the count. No cache tags fire here — trashed content is already
 * invisible on every public surface.
 *
 * Service-role surface (purge RPC) — reviewed addition to the ESLint I2
 * allowlist in eslint.config.mjs. Runs on the Node.js runtime — the
 * route-handler DEFAULT (node:crypto above would fail edge).
 */

export const dynamic = 'force-dynamic'

/** Constant-time equality via digest comparison (length-independent). */
function secretMatches(candidate: string | null, secret: string): boolean {
  if (!candidate) return false
  const a = createHash('sha256').update(candidate, 'utf8').digest()
  const b = createHash('sha256').update(secret, 'utf8').digest()
  return timingSafeEqual(a, b)
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization')
  const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  const token = request.nextUrl.searchParams.get('token')
  return secretMatches(bearer, secret) || secretMatches(token, secret)
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return new NextResponse(null, { status: 404 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('purge_content_trash', {})
  if (error) {
    return NextResponse.json(
      { purged: 0, failed: { step: 'purge', error: error.message } },
      { status: 500 },
    )
  }

  const purged = data ?? 0
  if (purged > 0) {
    await writeAudit({
      action: AUDIT_ACTIONS.node_purged,
      entity: 'content',
      meta: { purged, source: 'cron' },
    })
  }

  return NextResponse.json({ purged })
}
