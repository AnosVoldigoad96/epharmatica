import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * proxy.ts — Next 16's rename of middleware.ts (ARCHITECTURE §5, Auth flow).
 *
 * Phase 1.A: refresh the Supabase session on every matched request — the
 * canonical @supabase/ssr pattern: a response created with `{ request }`,
 * `setAll` writing refreshed cookies to BOTH request (for this render) and
 * response (for the browser), then `auth.getUser()` to trigger the refresh.
 * Server components read cookies but cannot write them, so this is the one
 * place httpOnly session cookies stay fresh (ARCHITECTURE §5 "Auth").
 * No redirects here — the completion gate lives in the authed layouts.
 *
 * TODO(Phase 1 · 1.B): hard-block /admin/** without a staff role — the proxy
 *   layer of the three-layer gate (proxy role gate + per-page permission map
 *   + RLS), defense-in-depth on top of RLS (M4; ARCHITECTURE §5).
 */
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Env unset (dev without a stack): pass through untouched.
  if (!url || !anonKey) {
    return response
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Refreshes the session when the access token has expired; do not run code
  // between client creation and getUser() (canonical pattern — subtle bugs).
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Run on everything except:
     * - _next/static, _next/image (build assets)
     * - favicon and common static files
     * - api routes keep their own guards (health, cron secret, webhook signature)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
