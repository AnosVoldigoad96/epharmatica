'use server'

import { redirect } from 'next/navigation'
import { createClient as createThrowawayClient } from '@supabase/supabase-js'
import type { SupabaseClient, User, UserIdentity } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import { prefsSchema, profileUpdateSchema, toStoredPrefs } from '@epharmatica/database'
import { sendEmail } from '@/lib/integrations/email'
import { AUDIT_ACTIONS, writeAudit } from '@/lib/observability/audit'
import { getClientIpHash, hmacHash, identifierHash } from '@/lib/security/hash'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { createClient } from '@/lib/supabase/server'

/*
 * Settings server actions (M2 §4.3/§4.5/§4.6 · securities.md §6 · dev-plan
 * 1.A). Waitlist/auth conventions throughout: discriminated-union results,
 * NEVER throw to the client (except redirect(), which is framework control
 * flow), copy via getTranslations, Zod schemas from @epharmatica/database.
 *
 * Everything writes with the user's OWN cookie-bound server client under the
 * RLS owner policies — username and privileged columns are never sent (the
 * profiles trigger guards them anyway). Service-role work happens ONLY inside
 * lib/observability/audit.ts and lib/security/rate-limit.ts (invariant I2).
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

export type AvatarUploadResult = { ok: true; avatarUrl: string } | { ok: false; error: string }

export type RemovableProvider = 'google' | 'email'

const AVATAR_MAX_BYTES = 1_048_576

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
 * WebP magic sniff (securities.md §8: the extension is not trust): `RIFF` at
 * bytes 0–3 and `WEBP` at 8–11.
 */
function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  )
}

/**
 * Storage path of a previous avatar, parsed from its public URL
 * (`…/storage/v1/object/public/avatars/{userId}/avatar-*.webp`). Returns null
 * unless the path sits inside the user's own folder — never delete outside it.
 */
function avatarPathFromUrl(url: string, userId: string): string | null {
  const marker = '/avatars/'
  const index = url.indexOf(marker)
  if (index === -1) {
    return null
  }
  const path = decodeURIComponent(url.slice(index + marker.length).split('?')[0] ?? '')
  return path.startsWith(`${userId}/`) ? path : null
}

/**
 * The authoritative identity list: `auth.getUserIdentities()`, falling back
 * to the identities embedded on the user when the endpoint errors (manual
 * linking may be disabled on a dev stack).
 */
async function listIdentities(
  supabase: Pick<SupabaseClient['auth'], 'getUserIdentities'>,
  user: User,
): Promise<ReadonlyArray<UserIdentity>> {
  try {
    const { data, error } = await supabase.getUserIdentities()
    if (!error && data) {
      return data.identities
    }
  } catch {
    // Fall through to the embedded identities below.
  }
  return user.identities ?? []
}

/**
 * Profile fields update (M2 §4.5): own-session write under
 * `profiles_update_own` — username and privileged columns are never sent.
 */
export async function updateProfile(data: {
  displayName: string
  userType: string
  country?: string | null
  institution?: string | null
  bio?: string | null
}): Promise<ActionResult> {
  const t = await getTranslations('auth.errors')

  try {
    const parsed = profileUpdateSchema.safeParse({
      displayName: data.displayName,
      userType: data.userType,
      country: data.country ?? null,
      institution: data.institution ?? null,
      bio: data.bio ?? null,
    })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? t('generic') }
    }

    if (!supabaseEnvConfigured()) {
      return { ok: false, error: t('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      return { ok: false, error: t('sessionExpired') }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: parsed.data.displayName,
        user_type: parsed.data.userType,
        country: parsed.data.country ?? null,
        institution: parsed.data.institution ?? null,
        bio: parsed.data.bio ?? null,
      } as never)
      .eq('id', userData.user.id)
    if (error) {
      return { ok: false, error: t('generic') }
    }

    await writeAudit({
      action: AUDIT_ACTIONS.profile_updated,
      actorId: userData.user.id,
      entity: 'profiles',
      entityId: userData.user.id,
    })

    return { ok: true }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Theme + reader text size (M2 §4.6): the whole prefs object is validated
 * and written to `profiles.prefs` in its stored snake_case shape.
 */
export async function updatePrefs(data: {
  theme: string
  textSize: number
}): Promise<ActionResult> {
  const t = await getTranslations('settings.appearance')
  const tAuth = await getTranslations('auth.errors')

  try {
    const parsed = prefsSchema.safeParse({ theme: data.theme, textSize: data.textSize })
    if (!parsed.success) {
      return { ok: false, error: t('saveError') }
    }

    if (!supabaseEnvConfigured()) {
      return { ok: false, error: tAuth('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      return { ok: false, error: tAuth('sessionExpired') }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ prefs: toStoredPrefs(parsed.data) } as never)
      .eq('id', userData.user.id)
    if (error) {
      return { ok: false, error: t('saveError') }
    }

    await writeAudit({
      action: AUDIT_ACTIONS.prefs_updated,
      actorId: userData.user.id,
      entity: 'profiles',
      entityId: userData.user.id,
    })

    return { ok: true }
  } catch {
    return { ok: false, error: t('saveError') }
  }
}

/**
 * Avatar upload (M2 §4.5): the client crops to a 512×512 WebP ≤ 1 MiB; the
 * server re-checks size and magic bytes, uploads to the owner-scoped path,
 * points `profiles.avatar_url` at the new public URL, and only THEN removes
 * the previous object (write-then-swap — a failure anywhere leaves the old
 * avatar untouched).
 */
export async function uploadAvatar(formData: FormData): Promise<AvatarUploadResult> {
  const t = await getTranslations('settings.profile.avatar.errors')
  const tAuth = await getTranslations('auth.errors')

  try {
    if (!supabaseEnvConfigured()) {
      return { ok: false, error: tAuth('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      return { ok: false, error: tAuth('sessionExpired') }
    }
    const user = userData.user

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return { ok: false, error: t('badType') }
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return { ok: false, error: t('tooLarge') }
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isWebp(bytes)) {
      return { ok: false, error: t('badType') }
    }

    // The previous URL is read up front — it is only removed after the new
    // write AND the profile update both succeed.
    const { data: profileData } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
    const previousUrl = (profileData as { avatar_url: string | null } | null)?.avatar_url ?? null

    const path = `${user.id}/avatar-${Date.now()}.webp`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: 'image/webp' })
    if (uploadError) {
      return { ok: false, error: t('generic') }
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatarUrl = urlData.publicUrl

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl } as never)
      .eq('id', user.id)
    if (updateError) {
      // Roll the orphaned upload back (best-effort); the previous avatar
      // stays live and referenced.
      await supabase.storage.from('avatars').remove([path])
      return { ok: false, error: t('generic') }
    }

    if (previousUrl) {
      const previousPath = avatarPathFromUrl(previousUrl, user.id)
      if (previousPath && previousPath !== path) {
        // Removal errors are ignored — an orphaned object is harmless; a
        // deleted-too-early one is not.
        await supabase.storage.from('avatars').remove([previousPath])
      }
    }

    await writeAudit({
      action: AUDIT_ACTIONS.avatar_updated,
      actorId: user.id,
      entity: 'profiles',
      entityId: user.id,
    })

    return { ok: true, avatarUrl }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Remove a sign-in method (M2 §4.3). Both guards are enforced HERE, not just
 * in the UI: a method can be removed only while another remains, and the
 * re-auth password is verified on a THROWAWAY non-cookie client so a failed
 * attempt can never disturb the real session cookies. Every removal is
 * confirmed by email and audited.
 */
export async function removeSignInMethod(data: {
  provider: RemovableProvider
  password: string
}): Promise<ActionResult> {
  const t = await getTranslations('settings.sessions.errors')
  const tAuth = await getTranslations('auth.errors')

  try {
    if (data.provider !== 'google' && data.provider !== 'email') {
      return { ok: false, error: t('generic') }
    }
    if (!data.password) {
      return { ok: false, error: t('badPassword') }
    }
    if (!supabaseEnvConfigured()) {
      return { ok: false, error: tAuth('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    const email = user?.email
    if (!user || !email) {
      return { ok: false, error: tAuth('sessionExpired') }
    }

    const identities = await listIdentities(supabase.auth, user)
    const hasPassword = identities.some((identity) => identity.provider === 'email')
    const googleLinked = identities.some((identity) => identity.provider === 'google')

    // Guard 1 — never strand the account: a method is removable only while
    // another remains (lastMethod / needPassword / needGoogle).
    if (identities.length <= 1) {
      return { ok: false, error: t('lastMethod') }
    }
    if (data.provider === 'google' && !hasPassword) {
      return { ok: false, error: t('needPassword') }
    }
    if (data.provider === 'email' && !googleLinked) {
      return { ok: false, error: t('needGoogle') }
    }

    const target = identities.find((identity) => identity.provider === data.provider)
    if (!target) {
      return { ok: false, error: t('generic') }
    }

    // The re-auth check is a password oracle — bound it with the signin
    // bucket (10 / 15 min per IP, with backoff) like the sign-in form.
    const limit = await enforceRateLimit('signin', await ipIdentifier())
    if (!limit.allowed) {
      return {
        ok: false,
        error: tAuth('tooManyAttempts', { minutes: retryMinutes(limit.retryAfterSeconds) }),
      }
    }

    // Guard 2 — re-auth. Throwaway non-cookie client (the waitlist pattern):
    // the verification session is never persisted anywhere.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      return { ok: false, error: tAuth('notConfigured') }
    }
    const throwaway = createThrowawayClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: reauthError } = await throwaway.auth.signInWithPassword({
      email,
      password: data.password,
    })
    if (reauthError) {
      return { ok: false, error: t('badPassword') }
    }

    const { error: unlinkError } = await supabase.auth.unlinkIdentity(target)
    if (unlinkError) {
      return { ok: false, error: t('generic') }
    }

    // "Every change is confirmed by email" — best-effort, never blocks.
    const tSessions = await getTranslations('settings.sessions')
    const tEmails = await getTranslations('emails')
    const methodLabel = data.provider === 'google' ? tSessions('google') : tSessions('password')
    await sendEmail({
      to: email,
      subject: tEmails('methodRemoved.subject', { method: methodLabel }),
      text: `${tEmails('methodRemoved.body', { method: methodLabel })}\n\n${tEmails('footer')}`,
    })

    await writeAudit({
      action: AUDIT_ACTIONS.identity_unlinked,
      actorId: user.id,
      entity: 'auth',
      entityId: user.id,
      meta: { provider: data.provider },
    })

    return { ok: true }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Set-password email for Google-only accounts (M2 §4.3): a recovery link via
 * `resetPasswordForEmail` — the reset-password page sets the password and
 * audits it there. Rate-limited on the reset bucket per hashed email.
 */
export async function sendSetPasswordEmail(): Promise<ActionResult> {
  const t = await getTranslations('settings.sessions.errors')
  const tAuth = await getTranslations('auth.errors')

  try {
    if (!supabaseEnvConfigured()) {
      return { ok: false, error: tAuth('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    const email = user?.email
    if (!user || !email) {
      return { ok: false, error: tAuth('sessionExpired') }
    }

    // Google-only accounts only — with a password set, this is the wrong
    // flow (the UI never offers it; the guard holds server-side regardless).
    const identities = await listIdentities(supabase.auth, user)
    if (identities.some((identity) => identity.provider === 'email')) {
      return { ok: false, error: t('generic') }
    }

    const limit = await enforceRateLimit('reset', identifierHash(email))
    if (!limit.allowed) {
      return {
        ok: false,
        error: tAuth('tooManyAttempts', { minutes: retryMinutes(limit.retryAfterSeconds) }),
      }
    }

    // Result deliberately ignored — non-enumerating, like the reset flow.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?type=recovery`,
    })

    return { ok: true }
  } catch {
    return { ok: false, error: t('generic') }
  }
}

/**
 * Global sign-out (M2 §4.3): audit FIRST (after `signOut({ scope: 'global' })`
 * there is no actor session left to attribute), then revoke everywhere, then
 * redirect to the sign-in page with the verbatim signed-out notice.
 * redirect() throws NEXT_REDIRECT — it stays OUTSIDE the try/catch.
 */
export async function signOutEverywhere(): Promise<ActionResult> {
  const t = await getTranslations('settings.sessions.errors')
  const tAuth = await getTranslations('auth.errors')

  try {
    if (!supabaseEnvConfigured()) {
      return { ok: false, error: tAuth('notConfigured') }
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      return { ok: false, error: tAuth('sessionExpired') }
    }

    await writeAudit({
      action: AUDIT_ACTIONS.signout_everywhere,
      actorId: userData.user.id,
      entity: 'auth',
      entityId: userData.user.id,
    })

    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      return { ok: false, error: t('generic') }
    }
  } catch {
    return { ok: false, error: t('generic') }
  }

  redirect('/auth/sign-in?notice=signed-out')
}
