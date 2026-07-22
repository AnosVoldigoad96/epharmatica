import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { deleteAuthUser, findAuthUserByEmail, setEmailVerifiedMirror } from '@/lib/auth/admin-ops'
import { sanitizeNextPath } from '@/lib/auth/redirect'
import { sendEmail } from '@/lib/integrations/email'
import { AUDIT_ACTIONS, writeAudit } from '@/lib/observability/audit'
import { createClient } from '@/lib/supabase/server'

/*
 * Auth callback (M2 §4.1–§4.3 · securities.md §6, R-M2a): every emailed link
 * and OAuth return lands here. Exchanges the code (or verifies the
 * token_hash), then runs the post-auth bookkeeping in contract order:
 *
 *   a. Blocked auto-link — a Google arrival whose email matches a DIFFERENT,
 *      unverified auth user means GoTrue minted a duplicate instead of
 *      linking ("auto-links only when both sides verified"). The duplicate
 *      is deleted only when every guard proves it fresh; otherwise just sign
 *      out. Either way the verbatim notice shows on sign-in.
 *   b. Fresh-link detection — email + google identities with a seconds-old
 *      google identity ⇒ notification email + audit (M2 §4.3: every sign-in
 *      method change is confirmed by email).
 *   c. Mirror sync — profiles.email_verified_at catches up to GoTrue.
 *   d. Recovery arrivals continue to the reset-password form.
 *   e. Completion gate — no profile row ⇒ /auth/complete (resumable pending
 *      state); else the sanitized `next`.
 *
 * Redirects build on the request URL's origin — never env — so the handler
 * behaves identically on preview hosts.
 */

const FIVE_MINUTES_MS = 5 * 60 * 1000
const SIXTY_SECONDS_MS = 60 * 1000

type ProfileRow = { id: string; email_verified_at: string | null }

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const next = sanitizeNextPath(url.searchParams.get('next'))
  // Build redirects from the CONFIGURED public origin, never `request.url` — the
  // app sits behind the Cloudflare tunnel + Traefik, which hand Next an internal
  // origin (http://0.0.0.0:3000), so url.origin would send users to a dead host.
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://epharmatica.com'
  const to = (path: string) => NextResponse.redirect(new URL(path, base))
  // Auth-callback failures are ops-relevant (broken sign-in) and non-sensitive
  // (no tokens/emails logged) — surface the reason instead of a silent redirect.
  const fail = (reason: string, detail?: string) => {
    console.error(`[auth/callback] ${reason}${detail ? `: ${detail}` : ''}`)
    return to('/auth/sign-in?error=link')
  }

  try {
    // Throws when Supabase env is unset — caught below as an expired-link
    // redirect (the only honest signed-out destination).
    const supabase = await createClient()

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        return fail('exchangeCodeForSession failed', error.message)
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash: tokenHash,
      })
      if (error) {
        return fail('verifyOtp failed', error.message)
      }
    } else {
      return fail('no code or token_hash in callback')
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return fail('getUser after exchange failed', userError?.message)
    }
    const user = userData.user
    const identities = user.identities ?? []
    const googleIdentity = identities.find((identity) => identity.provider === 'google')
    const emailIdentity = identities.find((identity) => identity.provider === 'email')

    // Own profile row (RLS profiles_select_own) — reused by (a), (c), (e).
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, email_verified_at')
      .eq('id', user.id)
      .maybeSingle()
    const profile = (profileData as ProfileRow | null) ?? null

    // (a) Blocked auto-link check — OAuth arrivals only. Exclude the current
    // user: it shares the arriving email with the pre-existing local account,
    // so an unfiltered scan can surface THIS user and silently skip the check.
    if (googleIdentity && user.email) {
      const existing = await findAuthUserByEmail(user.email, { excludeId: user.id })
      if (existing && existing.id !== user.id && existing.emailConfirmedAt === null) {
        const createdAgoMs = Date.now() - Date.parse(user.created_at)
        // ALL guards must hold before deleting: the current user is a
        // fresh, google-only, profile-less duplicate — nothing of value.
        const isFreshDuplicate =
          Number.isFinite(createdAgoMs) &&
          createdAgoMs < FIVE_MINUTES_MS &&
          identities.length === 1 &&
          profile === null

        await supabase.auth.signOut({ scope: 'local' })
        if (isFreshDuplicate) {
          await writeAudit({
            action: AUDIT_ACTIONS.identity_link_blocked,
            actorId: user.id,
            entity: 'auth',
            entityId: user.id,
          })
          await deleteAuthUser(user.id)
        }
        return to('/auth/sign-in?notice=link-blocked')
      }
    }

    // (b) Fresh-link detection: both providers present and the google
    // identity is seconds old ⇒ GoTrue just auto-linked it.
    if (googleIdentity && emailIdentity && googleIdentity.created_at && user.email) {
      const linkedAgoMs = Date.now() - Date.parse(googleIdentity.created_at)
      if (Number.isFinite(linkedAgoMs) && linkedAgoMs < SIXTY_SECONDS_MS) {
        const t = await getTranslations('emails')
        await sendEmail({
          to: user.email,
          subject: t('identityLinked.subject'),
          text: `${t('identityLinked.body')}\n\n${t('footer')}`,
        })
        await writeAudit({
          action: AUDIT_ACTIONS.identity_linked,
          actorId: user.id,
          entity: 'auth',
          entityId: user.id,
        })
      }
    }

    // (c) Mirror sync: GoTrue confirmed, mirror still null.
    if (user.email_confirmed_at && profile && profile.email_verified_at === null) {
      await setEmailVerifiedMirror(user.id, user.email_confirmed_at)
      await writeAudit({
        action: AUDIT_ACTIONS.email_verified,
        actorId: user.id,
        entity: 'auth',
        entityId: user.id,
      })
    }

    // (d) Recovery sessions continue to the new-password form.
    if (type === 'recovery') {
      return to('/auth/reset-password')
    }

    // (d2) Returning Google sign-in audit — the email+password path audits in
    // its own action and the first-time Google path audits on completion, so
    // this closes the "all auth events are audited" contract for the Google
    // arrival of an already-completed account.
    if (googleIdentity && profile) {
      await writeAudit({
        action: AUDIT_ACTIONS.signin,
        actorId: user.id,
        entity: 'auth',
        entityId: user.id,
        meta: { method: 'google' },
      })
    }

    // (e) Completion gate: no profile row ⇒ resumable pending state.
    if (!profile) {
      return to(`/auth/complete?next=${encodeURIComponent(next)}`)
    }
    return to(next)
  } catch (err) {
    return fail('unexpected error', err instanceof Error ? err.message : String(err))
  }
}
