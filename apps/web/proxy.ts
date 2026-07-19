import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * proxy.ts — Next 16's rename of middleware.ts (ARCHITECTURE §5, Auth flow).
 *
 * Phase 0: pass-through.
 *
 * TODO(Phase 1 · 1.A): refresh the Supabase session here via @supabase/ssr —
 *   createServerClient with request/response cookie plumbing, then
 *   supabase.auth.getUser() so httpOnly session cookies stay fresh for
 *   RSC/server actions (ARCHITECTURE §5 "Auth").
 * TODO(Phase 1 · 1.B): hard-block /admin/** without a staff role — the proxy
 *   layer of the three-layer gate (proxy role gate + per-page permission map
 *   + RLS), defense-in-depth on top of RLS (M4; ARCHITECTURE §5).
 */
export default function proxy(_request: NextRequest) {
  return NextResponse.next()
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
