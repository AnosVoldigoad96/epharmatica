/**
 * Shared gate + error plumbing for the content server actions (tree
 * mutations and workflow transitions): staff-role check with friendly
 * copy, the admin_mutation rate limit (M4 §4), and the DbActionError
 * carrier that lets mutations run INSIDE withAudit() and still return
 * discriminated-union results.
 */
import 'server-only'

import { getTranslations } from 'next-intl/server'
import { getAdminProfile } from '@/features/admin/queries'
import type { AdminProfile } from '@/features/admin/queries'
import { identifierHash } from '@/lib/security/hash'
import { enforceRateLimit } from '@/lib/security/rate-limit'

export type DbErrorShape = { code?: string; message?: string } | null

/** Carries the Postgres error out of withAudit's mutate callback. */
export class DbActionError extends Error {
  constructor(public readonly dbError: DbErrorShape) {
    super(dbError?.message ?? 'database error')
  }
}

export type StaffCheck = { ok: true; profile: AdminProfile } | { ok: false; error: string }

export const AUTHORING_ROLES = ['author', 'content_manager', 'admin', 'super_admin'] as const
export const REVIEWING_ROLES = ['reviewer', 'content_manager', 'admin', 'super_admin'] as const
export const MANAGER_ROLES = ['content_manager', 'admin', 'super_admin'] as const
/** Deletion is admin+ only (founder directive; the 023 RPC enforces it again). */
export const DELETING_ROLES = ['admin', 'super_admin'] as const
/** All five content roles — discussions (1.B-3c) are open to every one of them. */
export const CONTENT_ROLES = [
  'author',
  'reviewer',
  'content_manager',
  'admin',
  'super_admin',
] as const

export async function requireRoles(roles: readonly string[]): Promise<StaffCheck> {
  const t = await getTranslations('admin.content.errors')
  const profile = await getAdminProfile()
  if (!profile || !roles.includes(profile.role)) {
    return { ok: false, error: t('forbidden') }
  }
  const decision = await enforceRateLimit('admin_mutation', identifierHash(profile.id))
  if (!decision.allowed) {
    return { ok: false, error: t('rateLimited') }
  }
  return { ok: true, profile }
}

export async function failureFrom(err: unknown): Promise<{ ok: false; error: string }> {
  const t = await getTranslations('admin.content.errors')
  const dbError = err instanceof DbActionError ? err.dbError : null
  if (dbError?.code === '23505') return { ok: false, error: t('slugTaken') }
  if (dbError?.code === '42501') return { ok: false, error: t('forbidden') }
  return { ok: false, error: t('saveFailed') }
}
