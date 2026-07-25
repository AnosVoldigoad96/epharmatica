import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import { getContentTrash } from '@/features/content/queries'
import { Crumbs } from '../_components/crumbs'
import { TrashList } from '../_components/trash-list'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.content.trash')
  return { title: t('title'), robots: { index: false, follow: false } }
}

/*
 * Trash (migration 024 · soft-delete amendment to 023): every OPEN deletion
 * event, newest first, with the 14-day purge countdown computed server-side
 * at read time. Restore puts the subtree back exactly where it was; Delete
 * forever is the typed-name hard purge. Admin+ only — other content staff
 * get the section's forbidden treatment (back to the dashboard), matching
 * requireSection; content_trash RLS backs this up with an empty read.
 */
export default async function AdminContentTrashPage() {
  const profile = await requireSection('content')
  if (profile.role !== 'admin' && profile.role !== 'super_admin') redirect('/admin')

  const t = await getTranslations('admin.content.trash')
  const events = await getContentTrash()

  return (
    <div className="max-w-4xl">
      <Crumbs segments={[t('title')]} />
      <div className="mb-4 flex items-baseline gap-4">
        <h1 className="flex-1 font-display text-[19px] font-bold">{t('title')}</h1>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
          {t('subline', { count: events.length })}
        </p>
      </div>
      <TrashList events={events} />
      <p className="mt-3 text-[12px] text-ink-2">{t('footer')}</p>
    </div>
  )
}
