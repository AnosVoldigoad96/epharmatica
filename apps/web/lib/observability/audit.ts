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

import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIpHash } from '@/lib/security/hash'

/**
 * M2 audit action taxonomy — constants only, `entity.action` style.
 * Entities: `auth` for auth events, `profiles` for profile/prefs/avatar;
 * `entity_id` is the user id in both cases.
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
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

export type AuditEntity = 'auth' | 'profiles'

/**
 * Append an audit_log row (service role — API roles have no insert policy).
 * `meta` must stay PII-free: no emails, no raw IPs (securities.md §13).
 */
export async function writeAudit(entry: {
  action: AuditAction
  actorId?: string | null
  entity: AuditEntity
  entityId?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    const ipHash = await getClientIpHash()
    const supabase = createAdminClient()

    // Placeholder Database type — cast payloads until gen:types runs.
    await supabase.from('audit_log').insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      meta: entry.meta ?? {},
      ip_hash: ipHash,
    } as never)
  } catch {
    // TODO(pino): route audit-write failures to the logger once observability
    // lands — never break an auth flow on an audit insert failure.
  }
}
