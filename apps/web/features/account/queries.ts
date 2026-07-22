/**
 * Read-side helpers for the settings surfaces (M2 §4.5/§4.6 · dev-plan 1.A).
 * RSC-only (server-only): everything runs on the user's own cookie-bound
 * server client under RLS (`profiles_select_own`). The placeholder Database
 * type means reads are cast to explicit local types (gen:types later).
 */
import 'server-only'

import type { SupabaseClient, User, UserIdentity } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/** The own-profile columns the settings pages read (migration 002). */
export type OwnProfile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  user_type: 'student' | 'pharmacist' | 'other'
  country: string | null
  institution: string | null
  bio: string | null
  email_verified_at: string | null
  prefs: unknown
}

const PROFILE_COLUMNS =
  'id, username, display_name, avatar_url, user_type, country, institution, bio, email_verified_at, prefs'

/** Session user, or null — including when Supabase env is unset (dev). */
export async function getSessionUser(): Promise<User | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    return data.user ?? null
  } catch {
    return null
  }
}

/** The signed-in user's own profile row, or null (no session / no row). */
export async function getOwnProfile(): Promise<OwnProfile | null> {
  try {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      return null
    }
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userData.user.id)
      .maybeSingle()
    if (error || !data) {
      return null
    }
    return data as unknown as OwnProfile
  } catch {
    return null
  }
}

/** Derived sign-in methods for the sessions page (M2 §4.3). */
export type SignInMethods = {
  hasPassword: boolean
  google: { linked: boolean; email: string | null }
}

function deriveMethods(
  identities: ReadonlyArray<UserIdentity>,
  providers: ReadonlyArray<string>,
): SignInMethods {
  const google = identities.find((identity) => identity.provider === 'google')
  const googleEmail =
    google && typeof google.identity_data?.email === 'string' ? google.identity_data.email : null
  // Password presence: an `email` identity, OR `email` in app_metadata.providers.
  // Some GoTrue versions surface a set password only via providers (no distinct
  // email identity), so both are consulted — the unlink guard depends on this.
  const hasPassword =
    identities.some((identity) => identity.provider === 'email') || providers.includes('email')
  return {
    hasPassword,
    google: { linked: Boolean(google), email: googleEmail },
  }
}

/** app_metadata.providers as a string[] — defensive against the untyped shape. */
function readProviders(user: User): string[] {
  const raw = (user.app_metadata as { providers?: unknown } | null)?.providers
  return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : []
}

/**
 * Sign-in methods from `auth.getUserIdentities()` — the authoritative list —
 * falling back to `user.identities` when the endpoint errors (manual linking
 * may be disabled on a dev stack). The client parameter is structural
 * (auth-only) so any Database generic fits.
 */
export async function getSignInMethods(
  supabase: { auth: Pick<SupabaseClient['auth'], 'getUserIdentities'> },
  user: User,
): Promise<SignInMethods> {
  const providers = readProviders(user)
  try {
    const { data, error } = await supabase.auth.getUserIdentities()
    if (!error && data) {
      return deriveMethods(data.identities, providers)
    }
  } catch {
    // Fall through to the embedded identities below.
  }
  return deriveMethods(user.identities ?? [], providers)
}
