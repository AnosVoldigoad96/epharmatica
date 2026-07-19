import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@epharmatica/database'

/**
 * Browser Supabase client (anon key) — for client components only.
 * User-owned reads/writes under RLS (highlights, votes, notes).
 * One of exactly three clients, never mixed (ARCHITECTURE §3.3).
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase env not configured')
  }

  return createBrowserClient<Database>(url, anonKey)
}
