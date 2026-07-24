import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import { getDeletionGraceUsers } from '@/features/users-admin/queries'
import { UsersAdmin } from './_components/users-admin'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.users')
  return { title: t('title'), robots: { index: false, follow: false } }
}

/*
 * Users administration (M4 §7 · dev-plan 1.B): search → user rows with
 * audited actions (assign role with rank rules, force-rename with the
 * M2 §4.4 ceremony) plus the read-only deletion-grace list. The viewer's
 * role rides into the client so the role picker only offers grants the
 * admin_set_role RPC would accept — the RPC stays the authority.
 */
export default async function AdminUsersPage() {
  const profile = await requireSection('users')
  const t = await getTranslations('admin.users')
  const tNav = await getTranslations('admin.nav')
  const graceUsers = await getDeletionGraceUsers()

  return (
    <div className="max-w-5xl">
      <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
        {tNav('users')}
      </p>
      <UsersAdmin
        heading={t('title')}
        viewerId={profile.id}
        viewerRole={profile.role}
        graceUsers={graceUsers}
      />
    </div>
  )
}
