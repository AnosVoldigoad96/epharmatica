'use server'

import { getTranslations } from 'next-intl/server'
import type { Database } from '@epharmatica/database'
import { usernameSchema } from '@epharmatica/database'
import { DbActionError, failureFrom, requireRoles } from '@/features/content/gate'
import { sendEmail } from '@/lib/integrations/email'
import { AUDIT_ACTIONS, withAudit } from '@/lib/observability/audit'
import { createClient } from '@/lib/supabase/server'

/*
 * Users-administration server actions (M4 §7 · dev-plan 1.B). Content-action
 * conventions throughout: discriminated-union results, never throw to the
 * client, copy via getTranslations, every call behind requireRoles (admin+,
 * rate-limited in the gate) and every mutation INSIDE withAudit() (I8).
 *
 * The RANK RULES live inside the SECURITY DEFINER RPCs (migration 016) —
 * admin_set_role rejects self-changes, peers/above, and grants at or above
 * the actor's own rank with 42501; admin_force_rename applies the 90-day
 * quarantine atomically. The gate here is friendly copy + rate limit; the
 * RPC is the authority. No password paths exist anywhere, by construction.
 */

export type AppRole = Database['public']['Enums']['app_role']

/** One admin_search_users row — usernames/emails are admin-visible (M4 §7). */
export type AdminUserRow = {
  id: string
  username: string
  display_name: string
  role: AppRole
  email: string
  email_confirmed_at: string | null
  created_at: string
  deletion_requested_at: string | null
}

export type UsersActionResult = { ok: true } | { ok: false; error: string }
export type SearchUsersResult = { ok: true; users: AdminUserRow[] } | { ok: false; error: string }

const ADMIN_ROLES = ['admin', 'super_admin'] as const

/**
 * Search by username / display name / email (M4 §7). The RPC re-checks
 * admin+ itself; the gate here adds friendly copy and the admin rate limit.
 */
export async function searchUsers(query: string): Promise<SearchUsersResult> {
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_search_users', { p_query: query.trim() })
  if (error) return failureFrom(new DbActionError(error))
  return { ok: true, users: data ?? [] }
}

/**
 * Assign a role (M4 §7). Granting super_admin REQUIRES a typed confirmation
 * of the target's username — verified server-side against the directory,
 * never against client-supplied row data. Rank rules run inside the RPC;
 * its 42501 surfaces as the friendly rank-rules message.
 */
export async function assignRole(
  targetId: string,
  newRole: AppRole,
  typedConfirmation?: string,
): Promise<UsersActionResult> {
  const t = await getTranslations('admin.users.errors')
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()

  if (newRole === 'super_admin') {
    const confirmation = typedConfirmation?.trim().toLowerCase() ?? ''
    if (!confirmation) return { ok: false, error: t('confirmationRequired') }
    const { data: matches, error } = await supabase.rpc('admin_search_users', {
      p_query: confirmation,
    })
    if (error) return failureFrom(new DbActionError(error))
    const target = (matches ?? []).find((row) => row.id === targetId)
    if (!target || target.username !== confirmation) {
      return { ok: false, error: t('confirmationMismatch') }
    }
  }

  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.users_role_assigned,
        actorId: gate.profile.id,
        entity: 'users',
        entityId: targetId,
        meta: { new_role: newRole },
      },
      async () => {
        const { error } = await supabase.rpc('admin_set_role', {
          p_target: targetId,
          p_new_role: newRole,
        })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    const dbError = err instanceof DbActionError ? err.dbError : null
    if (dbError?.code === '42501') return { ok: false, error: t('rankRules') }
    return failureFrom(err)
  }
  return { ok: true }
}

/**
 * Force-rename (M2 §4.4 surface): reason REQUIRED, quarantine applied
 * in-RPC (90 days on the vacated handle), user notified by email — the
 * notification is best-effort and never fails a landed rename. The old
 * username goes in the audit meta (usernames are public identifiers); the
 * free-text reason stays out — only its length is recorded.
 */
export async function forceRename(
  targetId: string,
  newUsername: string,
  reason: string,
): Promise<UsersActionResult> {
  const t = await getTranslations('admin.users.errors')
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { ok: false, error: t('reasonRequired') }

  const parsed = usernameSchema.safeParse(newUsername)
  if (!parsed.success) return { ok: false, error: t('usernameInvalid') }
  const nextUsername = parsed.data

  const supabase = await createClient()
  let oldUsername: string
  try {
    oldUsername = await withAudit<string>(
      (previous) => ({
        action: AUDIT_ACTIONS.users_force_renamed,
        actorId: gate.profile.id,
        entity: 'users',
        entityId: targetId,
        meta: {
          old_username: previous,
          new_username: nextUsername,
          reason_length: trimmedReason.length,
        },
      }),
      async () => {
        const { data, error } = await supabase.rpc('admin_force_rename', {
          p_target: targetId,
          p_new_username: nextUsername,
        })
        if (error || data === null) throw new DbActionError(error)
        return data
      },
    )
  } catch (err) {
    // The RPC raises reserved/quarantined/invalid without a SQLSTATE of its
    // own — map by message; the unique index rejects taken names with 23505.
    const dbError = err instanceof DbActionError ? err.dbError : null
    if (dbError?.code === '23505') return { ok: false, error: t('usernameTaken') }
    if (dbError?.message?.includes('reserved')) return { ok: false, error: t('usernameReserved') }
    if (dbError?.message?.includes('quarantined')) {
      return { ok: false, error: t('usernameQuarantined') }
    }
    if (dbError?.message?.includes('invalid username')) {
      return { ok: false, error: t('usernameInvalid') }
    }
    return failureFrom(err)
  }

  // Notify the user (M2 §4.4) — the address comes from a FRESH directory
  // search (the rename already landed, so the new username matches), never
  // from client-supplied data. Email failure must not fail the rename.
  try {
    const { data: matches } = await supabase.rpc('admin_search_users', { p_query: nextUsername })
    const target = (matches ?? []).find((row) => row.id === targetId)
    if (target?.email) {
      const tEmail = await getTranslations('admin.users.rename.email')
      await sendEmail({
        to: target.email,
        subject: tEmail('subject'),
        text: tEmail('body', {
          oldUsername,
          newUsername: nextUsername,
          reason: trimmedReason,
        }),
      })
    }
  } catch {
    // Best-effort only — the rename and its audit row stand.
  }

  return { ok: true }
}
