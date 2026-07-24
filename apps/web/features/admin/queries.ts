/**
 * Read-side helpers for the /admin shell (M4 §4 · dev-plan 1.B). RSC-only:
 * everything runs on the signed-in staff member's cookie-bound server
 * client, so RLS stays the authority (layer 3) — the shell never reads
 * through the service role.
 */
import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AdminSectionKey, StaffRole } from './permissions'
import { canAccessSection, isStaffRole } from './permissions'

export type AdminProfile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  role: StaffRole
  prefs: unknown
}

const ADMIN_PROFILE_COLUMNS = 'id, username, display_name, avatar_url, role, prefs'

/** The signed-in STAFF member's profile, or null for everyone else. */
export async function getAdminProfile(): Promise<AdminProfile | null> {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return null

    const { data, error } = await supabase
      .from('profiles')
      .select(ADMIN_PROFILE_COLUMNS)
      .eq('id', userData.user.id)
      .maybeSingle()

    if (error || !data || !isStaffRole(data.role)) return null
    return { ...data, role: data.role }
  } catch {
    return null
  }
}

/**
 * Per-page permission gate (layer 2). Every /admin page opens with this;
 * staff without the section role land back on the dashboard, non-staff
 * (defense in depth under the proxy gate) are sent home.
 */
export async function requireSection(section: AdminSectionKey): Promise<AdminProfile> {
  const profile = await getAdminProfile()
  if (!profile) redirect('/')
  if (!canAccessSection(profile.role, section)) redirect('/admin')
  return profile
}

export type DashboardSnapshot = {
  statusCounts: Record<string, number>
  reviewQueueDepth: number
  activePreviewLinks: number
}

/** Dashboard v1 counters — read under RLS with the caller's own role. */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const supabase = await createClient()

  const [statusesResult, previewResult] = await Promise.all([
    supabase.from('subtopics').select('status'),
    supabase
      .from('preview_links')
      .select('id', { count: 'exact', head: true })
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
  ])

  const statusCounts: Record<string, number> = {}
  for (const row of statusesResult.data ?? []) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
  }

  return {
    statusCounts,
    reviewQueueDepth: statusCounts['in_review'] ?? 0,
    activePreviewLinks: previewResult.count ?? 0,
  }
}

export type AuditTailEntry = {
  id: string
  action: string
  entity: string
  entity_id: string | null
  actor_id: string | null
  created_at: string
}

/** Last 20 audit entries — RLS returns rows for admin+ only (M4 §9). */
export async function getAuditTail(): Promise<AuditTailEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('audit_log')
    .select('id, action, entity, entity_id, actor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}
