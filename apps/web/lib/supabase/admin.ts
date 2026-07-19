/**
 * Admin Supabase client (service-role key) — trusted server modules ONLY.
 *
 * Invariant I2 (docs/rules.md §2): SUPABASE_SERVICE_ROLE_KEY is imported in
 * exactly this one module. It is server-only (`server-only` package) and the
 * import of this module is restricted everywhere else by the shared ESLint
 * `no-restricted-imports` rule — the app config lifts that rule only for this
 * file. The key never appears in packages/*.
 *
 * Use for: publish pipeline, cron jobs, webhook handlers, moderation
 * (ARCHITECTURE §3.3).
 */
import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@epharmatica/database'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase env not configured')
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
