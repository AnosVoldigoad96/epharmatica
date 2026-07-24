import type { Database } from '@epharmatica/database'

/**
 * The /admin permission map — layer 2 of the three-layer gate (M4 §4:
 * proxy role gate + per-page permission map + RLS). Pure module: imported
 * by proxy.ts (edge), layouts, pages, and the nav — no server deps.
 */

export type AppRole = Database['public']['Enums']['app_role']

/** Every application role above plain `user` may enter the shell. */
export const STAFF_ROLES = [
  'author',
  'reviewer',
  'content_manager',
  'blog_editor',
  'moderator',
  'jobs_manager',
  'support',
  'admin',
  'super_admin',
] as const satisfies readonly AppRole[]

export type StaffRole = (typeof STAFF_ROLES)[number]

export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role)
}

export type AdminSectionKey = 'dashboard' | 'content' | 'media' | 'users' | 'settings' | 'audit'

export type AdminSection = {
  key: AdminSectionKey
  href: string
  roles: readonly StaffRole[]
}

const CONTENT_STAFF = ['author', 'reviewer', 'content_manager', 'admin', 'super_admin'] as const
const AUTHORING_STAFF = ['author', 'content_manager', 'admin', 'super_admin'] as const
const ADMINS = ['admin', 'super_admin'] as const

/**
 * Phase-1 sections, in nav order (M4 §4). Later-phase groups — Blog,
 * Community, Jobs, Verifications, WhatsApp — plug in behind their module
 * feature flags per the §10 shell contracts; their entries are added by
 * the module PRs (M5/M6/M8), so nothing here renders before its phase.
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { key: 'dashboard', href: '/admin', roles: STAFF_ROLES },
  { key: 'content', href: '/admin/content', roles: CONTENT_STAFF },
  { key: 'media', href: '/admin/media', roles: AUTHORING_STAFF },
  { key: 'users', href: '/admin/users', roles: ADMINS },
  { key: 'settings', href: '/admin/settings', roles: ADMINS },
  { key: 'audit', href: '/admin/audit', roles: ADMINS },
]

export function canAccessSection(role: StaffRole, key: AdminSectionKey): boolean {
  const section = ADMIN_SECTIONS.find((candidate) => candidate.key === key)
  return section !== undefined && section.roles.includes(role)
}

/** Sections the given role may see — drives the left nav. */
export function sectionsForRole(role: StaffRole): readonly AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => section.roles.includes(role))
}
