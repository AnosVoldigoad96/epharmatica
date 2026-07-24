/**
 * Users-administration reads (M4 §7 · dev-plan 1.B). RSC-only, on the staff
 * member's cookie-bound client — profiles RLS is select-own, so all admin
 * reads go through the admin_search_users SECURITY DEFINER RPC (016),
 * which enforces admin+ itself.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { AdminUserRow } from './actions'

/**
 * The deletion-grace list (M4 §7, read-only — purge cannot be expedited):
 * an empty-query directory search filtered to deletion_requested_at. The
 * RPC caps at the 30 newest accounts — plenty at current scale; a
 * dedicated RPC replaces this if the cap ever bites.
 */
export async function getDeletionGraceUsers(): Promise<AdminUserRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_search_users', { p_query: '' })
  return (data ?? []).filter((row) => row.deletion_requested_at !== null)
}
