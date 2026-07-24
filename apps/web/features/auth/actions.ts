'use server'

import { redirect } from 'next/navigation'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import {
  forgotPasswordSchema,
  oauthCompleteSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  usernameSchema,
} from '@epharmatica/database'
import {
  deleteAuthUser,
  insertProfileAsService,
  setEmailVerifiedMirror,
} from '@/lib/auth/admin-ops'
import { sanitizeNextPath } from '@/lib/auth/redirect'
import { sendEmail } from '@/lib/integrations/email'
import { AUDIT_ACTIONS, writeAudit } from '@/lib/observability/audit'
import { getClientIpHash, hmacHash, identifierHash } from '@/lib/security/hash'
import {
  MIN_PASSWORD_SCORE,
  STAFF_MIN_PASSWORD_LENGTH,
  STAFF_MIN_PASSWORD_SCORE,
  passwordStrength,
} from '@/lib/security/password-strength'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { verifyTurnstile } from '@/lib/security/turnstile'
import { createClient } from '@/lib/supabase/server'

/*
 * Auth server actions (M2 §4.1–§4.3 · securities.md §6/§10 · dev-plan 1.A).
 * The waitlist conventions apply throughout: discriminated-union results,
 * NEVER throw to the client (except redirect(), which is framework control
 * flow), error copy via getTranslations('auth.errors'), Zod schemas shared
 * with the forms from @epharmatica/database.
 *
 * Service-role work happens ONLY through lib/auth/admin-ops.ts (invariant
 * I2); everything else runs on the user's own cookie-bound server client or
 * the plain anon client (username availability — no session needed).
 */

export type AvailabilityResult = { ok: true; available: boolean } | { ok: false; error: string }

export type SignUpResult = { ok: true; signedIn: boolean } | { ok: false; error: string }

export type SignInResult =
  { ok: true; mfaRequired?: boolean } | { ok: false; error: string; canResend?: boolean }

export type ActionResult = { ok: true } | { ok: false; error: string }

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://epharmatica.com'
}

function supabaseEnvConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/** Rate-limit identifier: hashed client IP, or a keyed constant when no IP header exists (dev). */
async function ipIdentifier(): Promise<string> {
  return (await getClientIpHash()) ?? hmacHash('unknown-client')
}

/** Whole minutes for the tooManyAttempts copy — never "0 min". */
function retryMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60))
}

/**
 * The caller's OWN profiles.role read under RLS (`profiles_select_own`) —
 * the staff detector for the §13 compensating controls (password floor,
 * sign-in notification). Null on any failure: the staff branches degrade to
 * plain-user behavior rather than blocking auth.
 */
async function ownProfileRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    return data?.role ?? null
  } catch {
    return null
  }
}

/** Any role above plain `user` (M4 §13 — mirrors features/admin/permissions). */
function isStaff(role: string | null): boolean {
  return role !== null && role !== 'user'
}

/**
 * Anonymous availability probe against the `username_available` RPC
 * (format + reserved + quarantine + uniqueness — migration 002). Untyped
 * anon client like the waitlist action: no cookie plumbing needed, and the
 * generated Database type is still the placeholder.
 */
async function usernameAvailableRpc(candidate: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return null
  }
  const supabase = createAnonClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('username_available', { candidate })
  if (error) {
    return null
  }
  return data === true
}

/**
 * Live availability check for the sign-up/completion forms (M2 §4.4).
 * Rate-limited per IP (username_check, 30/min); the mutation paths re-check
 * server-side regardless, so a stale answer here can never mint a duplicate.
 */
export async function checkUsernameAvailability(username: string): Promise<AvailabilityResult> {
  const t = await getTranslations('auth.errors')

  try {
    const parsed = usernameSchema.safeParse(username)
    if (!parsed.success) {
      // Bad format is simply "not available" — mirrors the RPC contract.
      return { ok: true, available: false }
    }

    const limit = await enforceRateLimit('username_check', await ipIdentifier())
    if (!limit.allowed) {
      return {
        ok: false,
        error: t('tooManyAttempts', { minutes: retryMinutes(limit.retryAfterSeconds) }),
      }
    }

    if (!supabaseEnvConfigured()) {
      return { ok: false, error: t('notConfigured') }
    }

    const available = await usernameAvailableRpc(parsed.data)
    if (available === null) {
      return { ok: false, error: t('generic') }
    }
    return { ok: true, available }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Email sign-up (M2 §4.1): validate → strength (email/username/display name
 * weighted as guessable) → rate limit → Turnstile → availability →
 * auth.signUp → profile row via service role (no session exists
 * pre-verification). GoTrue's enumeration protection returns an obfuscated
 * user (empty identities) for existing emails — that case returns the same
 * `signedIn: false` success so nothing is enumerable.
 */
export async function signUpWithEmail(data: {
  email: string
  password: string
  username: string
  displayName: string
  ageConfirm: boolean
  turnstileToken?: string
  next?: string
}): Promise<SignUpResult> {
  const t = await getTranslations('auth.errors')

  try {
    const parsed = signUpSchema.safeParse({
      email: data.email,
      password: data.password,
      username: data.username,
      displayName: data.displayName,
      ageConfirm: data.ageConfirm,
    })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t('generic') }
    }
    const { email, password, username, displayName } = parsed.data

    const { score } = await passwordStrength(password, [email, username, displayName])
    if (score < MIN_PASSWORD_SCORE) {
      return { ok: false, error: t('passwordTooWeak') }
    }

    const limit = await enforceRateLimit('signup', await ipIdentifier())
    if (!limit.allowed) {
      return {
        ok: false,
        error: t('tooManyAttempts', { minutes: retryMinutes(limit.retryAfterSeconds) }),
      }
    }

    if (!(await verifyTurnstile(data.turnstileToken))) {
      return { ok: false, error: t('turnstile') }
    }

    if (!supabaseEnvConfigured()) {
      return { ok: false, error: t('notConfigured') }
    }

    // Pre-flight availability (reserved/quarantined handles have no DB
    // constraint — the RPC is the enforcement point, M2 §4.4). Fail CLOSED on
    // a null (unknown) result: a transient RPC error must not let a reserved
    // handle like `admin` through. The unique constraint still backstops
    // format/uniqueness races below.
    const availability = await usernameAvailableRpc(username)
    if (availability !== true) {
      return { ok: false, error: availability === false ? t('usernameUnavailable') : t('generic') }
    }

    const next = sanitizeNextPath(data.next)
    const supabase = await createClient()
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
        data: { username, display_name: displayName },
      },
    })
    if (error || !signUpData.user) {
      return { ok: false, error: t('generic') }
    }

    // Enumeration protection: an existing CONFIRMED email yields an obfuscated
    // user with NO identities — report the same "check your email" success.
    if ((signUpData.user.identities ?? []).length === 0) {
      return { ok: true, signedIn: false }
    }

    const inserted = await insertProfileAsService({
      id: signUpData.user.id,
      username,
      displayName,
    })
    if (inserted.error) {
      // A pre-existing UNCONFIRMED account signing up again returns the REAL
      // user (populated identities) whose profile row already exists → a
      // profiles_pkey collision. This is NOT a fresh user: rolling it back
      // would delete a real account by email (the resend path is the same as
      // a legitimate verification resend). Report the non-enumerating success.
      if (inserted.error === 'profile_exists') {
        return { ok: true, signedIn: false }
      }
      // A lost username race only rolls back a demonstrably fresh user — never
      // an older account that happened to collide on the handle.
      if (inserted.error === 'username_taken') {
        const createdAgoMs = Date.now() - Date.parse(signUpData.user.created_at)
        if (Number.isFinite(createdAgoMs) && createdAgoMs < 10_000) {
          await deleteAuthUser(signUpData.user.id)
        }
        return { ok: false, error: t('usernameTaken') }
      }
      // Unknown: never delete (could be a pre-existing user). A genuinely
      // orphaned fresh auth user with no profile is the resumable pending
      // state — a retry self-heals, and the 7-day unverified cron reaps it.
      return { ok: false, error: t('generic') }
    }

    await writeAudit({
      action: AUDIT_ACTIONS.signup_completed,
      actorId: signUpData.user.id,
      entity: 'auth',
      entityId: signUpData.user.id,
    })

    return { ok: true, signedIn: signUpData.session !== null }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Email sign-in (M2 §4.3): rate-limited per IP with backoff (securities.md
 * §10); errors map to non-enumerating copy. On success the
 * `profiles.email_verified_at` mirror is caught up if GoTrue confirmed the
 * email while the mirror was still null (e.g. verification link opened on
 * another device), and staff accounts get a best-effort sign-in
 * notification email (M4 §13).
 */
export async function signInWithEmail(data: {
  email: string
  password: string
  next?: string
}): Promise<SignInResult> {
  const t = await getTranslations('auth.errors')

  try {
    const parsed = signInSchema.safeParse({ email: data.email, password: data.password })
    if (!parsed.success) {
      return { ok: false, error: t('badCredentials') }
    }

    const limit = await enforceRateLimit('signin', await ipIdentifier())
    if (!limit.allowed) {
      return {
        ok: false,
        error: t('tooManyAttempts', { minutes: retryMinutes(limit.retryAfterSeconds) }),
      }
    }

    if (!supabaseEnvConfigured()) {
      return { ok: false, error: t('notConfigured') }
    }

    const supabase = await createClient()
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    })
    if (error || !signInData.user) {
      if (error?.code === 'email_not_confirmed') {
        return { ok: false, error: t('emailNotConfirmed'), canResend: true }
      }
      if (error?.code === 'invalid_credentials' || error?.status === 400) {
        return { ok: false, error: t('badCredentials') }
      }
      return { ok: false, error: t('generic') }
    }
    const user = signInData.user

    if (user.email_confirmed_at) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email_verified_at')
        .eq('id', user.id)
        .maybeSingle()
      const profile = profileData as { id: string; email_verified_at: string | null } | null
      if (profile && profile.email_verified_at === null) {
        await setEmailVerifiedMirror(user.id, user.email_confirmed_at)
      }
    }

    await writeAudit({
      action: AUDIT_ACTIONS.signin,
      actorId: user.id,
      entity: 'auth',
      entityId: user.id,
    })

    // Staff sign-in notification (M4 §13, compensating control for optional
    // 2FA) — best-effort, NEVER blocks a successful sign-in. Privacy posture:
    // coarse timestamp only, no IP/UA in the body (hashed-only elsewhere).
    try {
      if (user.email && isStaff(await ownProfileRole(supabase, user.id))) {
        const tEmails = await getTranslations('emails')
        const timestamp = `${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`
        await sendEmail({
          to: user.email,
          subject: tEmails('staffSignIn.subject'),
          text: `${tEmails('staffSignIn.body', { timestamp })}\n\n${tEmails('footer')}`,
        })
      }
    } catch {
      // RESEND_API_KEY unset degrades silently inside sendEmail; anything
      // else lands here — the sign-in already succeeded either way.
    }

    // AAL step-up (M4-5): enrolling a factor does not make GoTrue block
    // sign-ins — the app must check the assurance level and demand the
    // code. Anyone WITH a verified factor gets challenged; enforcement of
    // enrollment itself stays off (R-M4a).
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        return { ok: true, mfaRequired: true }
      }
    } catch {
      // AAL probe failure never blocks a successful sign-in.
    }

    return { ok: true }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Google OAuth kickoff — the redirect to accounts.google.com happens
 * server-side (`redirect()` after signInWithOAuth returns the provider URL).
 * Only failures return: env unset, provider misconfigured.
 */
export async function signInWithGoogle(
  next?: string | null,
): Promise<{ ok: false; error: string }> {
  const t = await getTranslations('auth.errors')

  if (!supabaseEnvConfigured()) {
    return { ok: false, error: t('notConfigured') }
  }

  let oauthUrl: string | null = null
  try {
    const supabase = await createClient()
    const safeNext = sanitizeNextPath(next)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    })
    if (!error && data.url) {
      oauthUrl = data.url
    }
  } catch {
    // Fall through to the friendly failure below — never throw to the client.
  }

  if (!oauthUrl) {
    return { ok: false, error: t('generic') }
  }
  redirect(oauthUrl)
}

/**
 * OAuth first-time completion (M2 §4.2): the profile row is created HERE,
 * with the user's own session under RLS `profiles_insert_own` — a Google
 * user who abandons this step keeps a resumable pending state (auth user, no
 * profile). Display name comes from Google metadata (full_name → name),
 * falling back to the chosen username; the completion screen itself asks
 * only username + user type + 13+ (PRD contract).
 */
export async function completeOauthProfile(data: {
  username: string
  userType: string
  ageConfirm: boolean
}): Promise<ActionResult> {
  const t = await getTranslations('auth.errors')

  try {
    const parsed = oauthCompleteSchema.safeParse({
      username: data.username,
      userType: data.userType,
      ageConfirm: data.ageConfirm,
    })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t('generic') }
    }

    if (!supabaseEnvConfigured()) {
      return { ok: false, error: t('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return { ok: false, error: t('sessionExpired') }
    }
    const user = userData.user

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()
    if (existing) {
      return { ok: false, error: t('profileExists') }
    }

    // Reserved/quarantined handles have no DB constraint — the RPC is the
    // enforcement point (M2 §4.4); fail CLOSED on a null (unknown) result so a
    // transient error can't leak `admin`/`staff`. 23505 below backstops races.
    const availability = await usernameAvailableRpc(parsed.data.username)
    if (availability !== true) {
      return { ok: false, error: availability === false ? t('usernameUnavailable') : t('generic') }
    }

    const metadata = user.user_metadata as { full_name?: unknown; name?: unknown }
    const metaName =
      typeof metadata.full_name === 'string' && metadata.full_name.trim()
        ? metadata.full_name
        : typeof metadata.name === 'string' && metadata.name.trim()
          ? metadata.name
          : parsed.data.username
    const trimmedName = metaName.trim().slice(0, 50)
    const displayName = trimmedName.length >= 2 ? trimmedName : parsed.data.username

    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      username: parsed.data.username,
      display_name: displayName,
      user_type: parsed.data.userType,
    } as never)
    if (insertError) {
      if (insertError.code === '23505') {
        return { ok: false, error: t('usernameTaken') }
      }
      return { ok: false, error: t('generic') }
    }

    // Google emails count as verified (M2 §4.2) — catch the mirror up.
    if (user.email_confirmed_at) {
      await setEmailVerifiedMirror(user.id, user.email_confirmed_at)
    }

    await writeAudit({
      action: AUDIT_ACTIONS.oauth_completion_completed,
      actorId: user.id,
      entity: 'auth',
      entityId: user.id,
    })

    return { ok: true }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Password-reset request — ALWAYS returns success after the guards pass
 * (non-enumeration, securities.md §10); the page renders the verbatim "If
 * that account exists…" line. Rate-limited by hashed email (not IP) so one
 * address can't be hammered from many hosts. Audit meta stays empty — no
 * email in the log.
 */
export async function requestPasswordReset(data: {
  email: string
  turnstileToken?: string
}): Promise<ActionResult> {
  const t = await getTranslations('auth.errors')

  try {
    const parsed = forgotPasswordSchema.safeParse({ email: data.email })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t('generic') }
    }

    // Turnstile BEFORE the identifier-keyed limit: the reset budget is keyed
    // by the (victim's) hashed email, so consuming it pre-challenge would let
    // an unsolved attacker burn a victim's 3/hr reset allowance and lock them
    // out of recovery. An unsolved challenge must spend nothing.
    if (!(await verifyTurnstile(data.turnstileToken))) {
      return { ok: false, error: t('turnstile') }
    }

    const limit = await enforceRateLimit('reset', identifierHash(parsed.data.email))
    if (!limit.allowed) {
      return {
        ok: false,
        error: t('tooManyAttempts', { minutes: retryMinutes(limit.retryAfterSeconds) }),
      }
    }

    if (!supabaseEnvConfigured()) {
      return { ok: false, error: t('notConfigured') }
    }

    const supabase = await createClient()
    // Result deliberately ignored: "no such account" must look identical.
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${siteUrl()}/auth/callback?type=recovery`,
    })

    await writeAudit({
      action: AUDIT_ACTIONS.password_reset_requested,
      entity: 'auth',
      meta: {},
    })

    return { ok: true }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Set the new password from the reset-password page — requires the recovery
 * session minted by the callback route. Strength is re-checked server-side
 * (the form gates client-side too); staff accounts additionally clear the
 * M4 §13 floor (≥ 12 chars, zxcvbn ≥ 3).
 */
export async function updatePassword(data: { password: string }): Promise<ActionResult> {
  const t = await getTranslations('auth.errors')

  try {
    const parsed = resetPasswordSchema.safeParse({ password: data.password })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t('generic') }
    }

    if (!supabaseEnvConfigured()) {
      return { ok: false, error: t('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return { ok: false, error: t('resetLinkRequired') }
    }
    const user = userData.user

    const { score } = await passwordStrength(parsed.data.password, [user.email ?? ''])
    if (score < MIN_PASSWORD_SCORE) {
      return { ok: false, error: t('passwordTooWeak') }
    }

    // Staff floor (M4 §13, compensating control for optional 2FA): any role
    // above `user` needs ≥ 12 chars AND zxcvbn ≥ 3 on every set/reset path.
    if (isStaff(await ownProfileRole(supabase, user.id))) {
      if (
        parsed.data.password.length < STAFF_MIN_PASSWORD_LENGTH ||
        score < STAFF_MIN_PASSWORD_SCORE
      ) {
        return { ok: false, error: t('staffPasswordTooWeak') }
      }
    }

    // Distinguish a Google-first user setting their FIRST password (no email
    // identity yet) from a genuine reset — the audit trail must not label a
    // first-time set as a reset. `user` was fetched pre-update.
    const hadPassword = (user.identities ?? []).some((identity) => identity.provider === 'email')

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) {
      return { ok: false, error: t('generic') }
    }

    await writeAudit({
      action: hadPassword ? AUDIT_ACTIONS.password_reset_completed : AUDIT_ACTIONS.password_set,
      actorId: user.id,
      entity: 'auth',
      entityId: user.id,
    })

    return { ok: true }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Resend the verification email. Prefers the session user's email; accepts
 * an explicit email for the signed-out sign-in-page case (GoTrue rejected
 * `email_not_confirmed`, so no session exists — a deviation from the
 * session-only plan signature). Still bounded by the reset rate limit per
 * hashed email, and non-enumerating: the resend result is ignored.
 */
export async function resendVerification(emailFallback?: string): Promise<ActionResult> {
  const t = await getTranslations('auth.errors')

  try {
    if (!supabaseEnvConfigured()) {
      return { ok: false, error: t('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()

    let email = userData.user?.email ?? null
    if (!email && emailFallback) {
      const parsed = forgotPasswordSchema.safeParse({ email: emailFallback })
      if (parsed.success) {
        email = parsed.data.email
      }
    }
    if (!email) {
      return { ok: false, error: t('generic') }
    }

    const limit = await enforceRateLimit('reset', identifierHash(email))
    if (!limit.allowed) {
      return {
        ok: false,
        error: t('tooManyAttempts', { minutes: retryMinutes(limit.retryAfterSeconds) }),
      }
    }

    // Result ignored on purpose — non-enumerating.
    await supabase.auth.resend({ type: 'signup', email })

    return { ok: true }
  } catch {
    return { ok: false, error: t('generic') }
  }
}
