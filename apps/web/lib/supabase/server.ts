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

/**
 * Cookie-less variant of the server client — the SAME anon key and RLS
 * posture, but with an empty cookie jar, so it is safe inside `use cache`
 * scopes and static rendering where `cookies()` is forbidden (1.C-3).
 * Under `force-static` the cookie-bound client's jar was already empty, so
 * for the published-only public data layer this is behaviorally identical.
 * Not a fourth data-access layer (ARCHITECTURE §3.3): it is the server
 * client with no session — never use it for anything user-scoped.
 */
export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase env not configured')
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {
        // No cookie jar by construction — anonymous, session-free reads only.
      },
    },
  })
}
