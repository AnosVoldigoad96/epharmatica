/**
 * Audit writer for auth/account events (securities.md §6, §13: auth events
 * append `audit_log` entries with HASHED IP, never raw; the table is
 * append-only — inserts happen app-side on the service role, migration 008).
 *
 * Never breaks a flow: insert failures are swallowed here — an auth action
 * must not fail because the audit write did.
 *
 * Trusted service-role surface — on the ESLint I2 allowlist in
 * eslint.config.mjs.
 */
import 'server-only'

import type { Json } from '@epharmatica/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIpHash } from '@/lib/security/hash'

/**
 * Audit action taxonomy — constants only, `entity.action` style.
 * M2 entities: `auth` (auth events), `profiles` (profile/prefs/avatar) —
 * `entity_id` is the user id. M4 entities land with their surfaces
 * (1.B-2…1.B-5): `content` (tree + workflow, entity_id = node id),
 * `media`, `preview_link`, `review`, `users` (admin-on-user actions),
 * `settings` (flags/registry/site metadata, entity_id = natural key).
 */
export const AUDIT_ACTIONS = {
  signup_completed: 'auth.signup_completed',
  signin: 'auth.signin',
  oauth_completion_completed: 'auth.oauth_completion_completed',
  identity_linked: 'auth.identity_linked',
  identity_link_blocked: 'auth.identity_link_blocked',
  identity_unlinked: 'auth.identity_unlinked',
  password_reset_requested: 'auth.password_reset_requested',
  password_reset_completed: 'auth.password_reset_completed',
  password_set: 'auth.password_set',
  signout_everywhere: 'auth.signout_everywhere',
  email_verified: 'auth.email_verified',
  profile_updated: 'profiles.profile_updated',
  avatar_updated: 'profiles.avatar_updated',
  prefs_updated: 'profiles.prefs_updated',
  node_created: 'content.node_created',
  node_updated: 'content.node_updated',
  node_renamed: 'content.node_renamed',
  node_moved: 'content.node_moved',
  nodes_reordered: 'content.nodes_reordered',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

export type AuditEntity =
  'auth' | 'profiles' | 'content' | 'media' | 'preview_link' | 'review' | 'users' | 'settings'

export type AuditEntry = {
  action: AuditAction
  actorId?: string | null
  entity: AuditEntity
  entityId?: string | null
  meta?: Record<string, Json | undefined>
}

/**
 * Append an audit_log row (service role — API roles have no insert policy).
 * `meta` must stay PII-free: no emails, no raw IPs (securities.md §13).
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const ipHash = await getClientIpHash()
    const supabase = createAdminClient()

    await supabase.from('audit_log').insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      meta: entry.meta ?? {},
      ip_hash: ipHash,
    })
  } catch {
    // TODO(pino): route audit-write failures to the logger once observability
    // lands — never break an auth flow on an audit insert failure.
  }
}

/**
 * withAudit() — the I8 wrapper every mutating /admin action flows through.
 *
 * Runs the mutation, then writes the audit row (actor, action, entity/id,
 * before/after meta where cheap — pass them in `meta`, hashed IP added
 * here). A failed mutation writes nothing; audit-write failures never fail
 * a succeeded mutation (same posture as writeAudit — the swallow keeps
 * content ops alive, the TODO above routes failures to pino when it lands).
 * `entry` may be a function of the mutation result for ids only known
 * after insert.
 */
export async function withAudit<T>(
  entry: AuditEntry | ((result: T) => AuditEntry),
  mutate: () => Promise<T>,
): Promise<T> {
  const result = await mutate()
  await writeAudit(typeof entry === 'function' ? entry(result) : entry)
  return result
}
