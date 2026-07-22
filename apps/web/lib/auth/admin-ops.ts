/**
 * Service-role operations for auth flows — the ONLY admin-client surface the
 * auth feature may touch (invariant I2; on the ESLint allowlist in
 * eslint.config.mjs). Everything here exists because no session (or no
 * sufficient session) is available at the call site:
 *
 * - Email sign-up inserts the profile row pre-verification (no session
 *   exists yet — M2 §4.1; the OAuth path uses the user's own session + RLS).
 * - The callback route deletes a duplicate GoTrue user on a blocked
 *   auto-link (securities.md §6, R-M2a).
 * - `email_verified_at` on profiles is a service-maintained mirror guarded
 *   against API roles by trigger (migration 002).
 *
 * Callers never see throws: errors map to coarse result values; the auth
 * actions translate them to friendly copy.
 */
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type ServiceOpError = 'unknown' | null

export type InsertProfileError = 'username_taken' | 'profile_exists' | 'unknown' | null

/**
 * Insert the profile row for the email sign-up path. The 23505 unique
 * violation is classified by constraint — the distinction is security-load-
 * bearing (the caller only rolls back a fresh user; see signUpWithEmail):
 *
 * - `profiles_pkey` (the row's `id` already exists) → `'profile_exists'`:
 *   the auth user is NOT fresh — it's an existing (unconfirmed) account whose
 *   profile was written at its original signup. Rolling it back would delete a
 *   real user by email. The caller returns a non-enumerating success instead.
 * - `profiles_username_unique` → `'username_taken'`: the handle lost a race;
 *   the caller rolls back the just-minted user and asks for another.
 * - anything else → `'unknown'`: the caller never deletes on this.
 */
export async function insertProfileAsService(profile: {
  id: string
  username: string
  displayName: string
}): Promise<{ error: InsertProfileError }> {
  try {
    const supabase = createAdminClient()
    // Placeholder Database type — cast payloads until gen:types runs.
    const { error } = await supabase.from('profiles').insert({
      id: profile.id,
      username: profile.username,
      display_name: profile.displayName,
    } as never)

    if (!error) {
      return { error: null }
    }
    if (error.code === '23505') {
      // supabase-js surfaces the constraint name in message/details.
      const haystack = `${error.message} ${error.details ?? ''}`
      if (haystack.includes('profiles_pkey') || haystack.includes('_pkey')) {
        return { error: 'profile_exists' }
      }
      if (haystack.includes('username')) {
        return { error: 'username_taken' }
      }
    }
    return { error: 'unknown' }
  } catch {
    return { error: 'unknown' }
  }
}

/** Delete a GoTrue user (blocked auto-link cleanup, failed sign-up rollback). */
export async function deleteAuthUser(userId: string): Promise<{ error: ServiceOpError }> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.auth.admin.deleteUser(userId)
    return { error: error ? 'unknown' : null }
  } catch {
    return { error: 'unknown' }
  }
}

/**
 * Maintain the `profiles.email_verified_at` mirror of GoTrue's
 * `email_confirmed_at` (privileged column — API roles are trigger-blocked).
 */
export async function setEmailVerifiedMirror(
  userId: string,
  verifiedAt: string,
): Promise<{ error: ServiceOpError }> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('profiles')
      .update({ email_verified_at: verifiedAt } as never)
      .eq('id', userId)
    return { error: error ? 'unknown' : null }
  } catch {
    return { error: 'unknown' }
  }
}

/**
 * Find a GoTrue user by exact email (case-insensitive), optionally excluding
 * one id. `listUsers` has no server-side email filter, so pages are scanned
 * defensively (bounded). Returns null when not found OR when the stack is
 * unreachable — callers must treat null as "no evidence", never as proof of
 * absence.
 *
 * `excludeId` is load-bearing for the blocked-auto-link check: a Google
 * arrival and the pre-existing local account share the same email, so without
 * excluding the current (duplicate) user, `listUsers` order can surface the
 * duplicate itself and the check dies silently.
 */
export async function findAuthUserByEmail(
  email: string,
  options?: { excludeId?: string },
): Promise<{ id: string; emailConfirmedAt: string | null; createdAt: string } | null> {
  const needle = email.trim().toLowerCase()
  const excludeId = options?.excludeId
  const perPage = 200
  const maxPages = 10

  try {
    const supabase = createAdminClient()

    for (let page = 1; page <= maxPages; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) {
        return null
      }

      const match = data.users.find(
        (user) => user.email?.toLowerCase() === needle && user.id !== excludeId,
      )
      if (match) {
        return {
          id: match.id,
          emailConfirmedAt: match.email_confirmed_at ?? null,
          createdAt: match.created_at,
        }
      }

      if (data.users.length < perPage) {
        return null
      }
    }
    return null
  } catch {
    return null
  }
}
