import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@epharmatica/database'

/**
 * Server Supabase client (anon key + user cookie JWT via @supabase/ssr) —
 * for RSC and server actions, anything on behalf of the signed-in user.
 * Still RLS-bound. One of exactly three clients, never mixed
 * (ARCHITECTURE §3.3).
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase env not configured')
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // setAll was called from a Server Component, where cookies are
          // read-only. Safe to ignore: session refresh happens in proxy.ts
          // (Phase 1), which runs with writable cookies.
        }
      },
    },
  })
}
