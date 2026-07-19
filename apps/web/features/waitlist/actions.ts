'use server'

import { createClient } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import { waitlistSignupSchema } from '@epharmatica/database'

/*
 * Waitlist signup server action (dev-plan 0.E · S12). Wired as the `action`
 * prop of @epharmatica/ui's <WaitlistForm> from the (static) landing page —
 * passing a server action from a server component to the client leaf is the
 * React 19 pattern; nothing here touches cookies/headers, so the page stays
 * prerendered.
 *
 * The insert uses a plain @supabase/supabase-js anon client created here —
 * NOT lib/supabase/server.ts, whose cookie plumbing is unnecessary for an
 * anonymous insert. The client is untyped on purpose: the generated Database
 * type is still the placeholder; switch to createClient<Database> once
 * `gen:types` runs against the real stack.
 */

/**
 * Result contract shared with @epharmatica/ui's WaitlistForm
 * (ui-contract.md §13) — declared structurally so this file compiles
 * independently of the ui package landing.
 */
export type WaitlistResult = { ok: true; dateLabel: string } | { ok: false; error: string }

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** "18 JUL" — the stamp language (ON THE LIST · 18 JUL), en-GB uppercase. */
function stampDateLabel(date: Date): string {
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()
  return `${date.getDate()} ${month}`
}

export async function joinWaitlist(data: {
  email: string
  module: string
  role: string
  turnstileToken?: string
}): Promise<WaitlistResult> {
  const t = await getTranslations('waitlist.errors')

  try {
    const parsed = waitlistSignupSchema.safeParse({
      email: data.email,
      module: data.module,
      role: data.role,
    })
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? t('generic'),
      }
    }

    // Turnstile: verify when configured, fail closed; skip when unset (dev).
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
    if (turnstileSecret) {
      if (!data.turnstileToken) {
        return { ok: false, error: t('turnstile') }
      }
      try {
        const response = await fetch(TURNSTILE_VERIFY_URL, {
          method: 'POST',
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: data.turnstileToken,
          }),
        })
        const outcome = (await response.json()) as { success?: boolean }
        if (!outcome.success) {
          return { ok: false, error: t('turnstile') }
        }
      } catch {
        return { ok: false, error: t('turnstile') }
      }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      return { ok: false, error: t('notConfigured') }
    }

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // No .select(): select is revoked on waitlist_signups for anon (migration
    // 008), so the insert must go out with Prefer: return=minimal.
    const { error } = await supabase.from('waitlist_signups').insert({
      email: parsed.data.email,
      module: parsed.data.module,
      role: parsed.data.role,
    })

    // 23505 = unique (email, module) violation — "already on the list" IS on
    // the list, so it counts as success.
    if (error && error.code !== '23505') {
      return { ok: false, error: t('generic') }
    }

    // TODO(observability): fire EVENTS.waitlist_joined — lib/observability/
    // events.ts defines the constant taxonomy only; wire this up when the
    // Umami send helper lands (rules.md §11).

    return { ok: true, dateLabel: stampDateLabel(new Date()) }
  } catch {
    // Never throw to the client (rules: friendly failures only).
    return { ok: false, error: t('generic') }
  }
}
