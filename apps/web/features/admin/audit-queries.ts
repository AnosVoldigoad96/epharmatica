/**
 * Audit-log surface reads (M4 §9). RSC-only, on the admin's own client —
 * audit_log RLS is admin+ read; rows are immutable by construction. The
 * yearly R2 export + prune cron is separate later work (D-b retention).
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getStaffDirectory } from '@/features/content/queries'

export type AuditFilters = {
  actor?: string
  action?: string
  entity?: string
  from?: string
  to?: string
}

export type AuditRow = {
  id: string
  action: string
  entity: string
  entity_id: string | null
  actor_id: string | null
  actorUsername: string | null
  meta: unknown
  ip_hash: string | null
  created_at: string
}

export type AuditPage = {
  rows: AuditRow[]
  actions: string[]
  entities: string[]
  actors: { id: string; username: string }[]
}

const PAGE_SIZE = 100

export async function getAuditEntries(filters: AuditFilters): Promise<AuditPage> {
  const supabase = await createClient()
  const staff = await getStaffDirectory()

  let query = supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, actor_id, meta, ip_hash, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (filters.actor) query = query.eq('actor_id', filters.actor)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.entity) query = query.eq('entity', filters.entity)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59.999Z`)

  const { data } = await query

  // Filter vocabularies from a recent unfiltered window (cheap, admin-only).
  const { data: vocab } = await supabase
    .from('audit_log')
    .select('action, entity, actor_id')
    .order('created_at', { ascending: false })
    .limit(500)

  const actions = [...new Set((vocab ?? []).map((row) => row.action))].sort()
  const entities = [...new Set((vocab ?? []).map((row) => row.entity))].sort()
  const actorIds = [
    ...new Set((vocab ?? []).map((row) => row.actor_id).filter((id): id is string => Boolean(id))),
  ]

  return {
    rows: (data ?? []).map((row) => ({
      ...row,
      actorUsername: row.actor_id ? (staff.get(row.actor_id)?.username ?? null) : null,
    })),
    actions,
    entities,
    actors: actorIds.map((id) => ({
      id,
      username: staff.get(id)?.username ?? `…${id.slice(-6)}`,
    })),
  }
}

/** Deep-link target for an audit row's entity (M4 §9), or null. */
export function auditEntityHref(entity: string, entityId: string | null): string | null {
  if (!entityId) return null
  switch (entity) {
    case 'content':
    case 'review':
      return `/admin/content/subtopic/${entityId}`
    case 'media':
      return `/admin/media?asset=${entityId}`
    case 'preview_link':
      return `/admin/content/subtopic/${entityId}`
    case 'users':
    case 'profiles':
    case 'auth':
      return `/admin/users?q=${entityId}`
    default:
      return null
  }
}

/** CSV of the current filter — streamed by the export route handler. */
export function auditRowsToCsv(rows: AuditRow[]): string {
  const header = 'created_at,actor,action,entity,entity_id,meta'
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const lines = rows.map((row) =>
    [
      row.created_at,
      row.actorUsername ?? row.actor_id ?? '',
      row.action,
      row.entity,
      row.entity_id ?? '',
      escape(JSON.stringify(row.meta ?? {})),
    ].join(','),
  )
  return [header, ...lines].join('\n')
}
