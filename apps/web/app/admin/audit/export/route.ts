import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { canAccessSection } from '@/features/admin/permissions'
import { getAdminProfile } from '@/features/admin/queries'
import { auditRowsToCsv, getAuditEntries } from '@/features/admin/audit-queries'

/**
 * CSV export of the current audit filter (M4 §9). Same three-layer gate as
 * the page: proxy (layer 1) + this per-route check (layer 2) + RLS (the
 * query runs on the admin's own client).
 */
export async function GET(request: NextRequest) {
  const profile = await getAdminProfile()
  if (!profile || !canAccessSection(profile.role, 'audit')) {
    return new NextResponse(null, { status: 404 })
  }

  const params = request.nextUrl.searchParams
  const page = await getAuditEntries({
    actor: params.get('actor') ?? undefined,
    action: params.get('action') ?? undefined,
    entity: params.get('entity') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  })

  return new NextResponse(auditRowsToCsv(page.rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="epharmatica-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      'x-robots-tag': 'noindex',
    },
  })
}
