import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { putR2Object, r2Configured } from '@/lib/integrations/r2'
import { AUDIT_ACTIONS, writeAudit } from '@/lib/observability/audit'
import { createAdminClient } from '@/lib/supabase/admin'

/*
 * Yearly audit-log export cron (M4 §9 D-b): 12 months hot in Postgres →
 * aged calendar years export to R2 as immutable NDJSON objects → prune.
 *
 * Guard: CRON_SECRET must be set AND match (Bearer header or ?token=),
 * timing-safe; anything else is a 404 (the endpoint does not exist for the
 * unauthenticated). Idempotent: the object key is per-year, re-uploads
 * overwrite identically, and a run with no aged rows returns {exported: []}.
 * Export-before-prune is the invariant — an upload failure STOPS the run
 * with nothing deleted; `prune_audit_log` (service_role-only, migration 017)
 * additionally refuses any range inside the trailing 12 months.
 *
 * Service-role surface (audit_log read + prune RPC) — reviewed addition to
 * the ESLint I2 allowlist in eslint.config.mjs.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000

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

type ExportedYear = { year: number; rows: number; bytes: number; deleted: number }

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return new NextResponse(null, { status: 404 })
  }

  // Env-gated no-op (dev / R2 not provisioned yet) — no audit row for no-ops.
  if (!r2Configured()) {
    return NextResponse.json({ skipped: 'r2-unconfigured' })
  }

  const supabase = createAdminClient()

  // Aged = the whole calendar year is older than the trailing-12-months
  // hot window (prune_audit_log refuses anything newer anyway).
  const cutoff = new Date()
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 12)

  const { data: oldestRows, error: oldestError } = await supabase
    .from('audit_log')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1)
  if (oldestError) {
    return NextResponse.json(
      { exported: [], failed: { step: 'read-oldest', error: oldestError.message } },
      { status: 500 },
    )
  }

  const exported: ExportedYear[] = []
  const oldest = oldestRows?.[0]?.created_at
  if (!oldest) {
    return NextResponse.json({ exported })
  }

  const firstYear = new Date(oldest).getUTCFullYear()
  for (let year = firstYear; Date.UTC(year + 1, 0, 1) <= cutoff.getTime(); year++) {
    const from = new Date(Date.UTC(year, 0, 1)).toISOString()
    const to = new Date(Date.UTC(year + 1, 0, 1)).toISOString()

    // Page through the year in stable order — full row fidelity (actor_id,
    // ip_hash, meta included): the R2 object IS the record after the prune.
    const rows: unknown[] = []
    for (let page = 0; ; page++) {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .gte('created_at', from)
        .lt('created_at', to)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (error) {
        return NextResponse.json(
          { exported, failed: { year, step: 'read', error: error.message } },
          { status: 500 },
        )
      }
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break
    }
    if (rows.length === 0) continue

    const ndjson = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    const bytes = Buffer.byteLength(ndjson, 'utf8')
    const put = await putR2Object(`audit/audit-${year}.ndjson`, ndjson, 'application/x-ndjson')
    if (!put.ok) {
      // Export-before-prune: an upload failure stops the run, nothing pruned.
      return NextResponse.json(
        { exported, failed: { year, step: 'upload', status: put.status, error: put.error } },
        { status: 502 },
      )
    }

    const { data: deleted, error: pruneError } = await supabase.rpc('prune_audit_log', {
      p_from: from,
      p_to: to,
    })
    if (pruneError) {
      // The object landed (idempotent re-upload next run); stop and report.
      return NextResponse.json(
        { exported, failed: { year, step: 'prune', error: pruneError.message } },
        { status: 500 },
      )
    }

    await writeAudit({
      action: AUDIT_ACTIONS.settings_audit_exported,
      entity: 'settings',
      entityId: `audit-${year}`,
      meta: { year, rows: rows.length, bytes, deleted: deleted ?? 0 },
    })
    exported.push({ year, rows: rows.length, bytes, deleted: deleted ?? 0 })
  }

  return NextResponse.json({ exported })
}
