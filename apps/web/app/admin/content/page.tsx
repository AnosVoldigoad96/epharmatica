import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import { getContentTree } from '@/features/content/queries'
import { Crumbs } from './_components/crumbs'
import { ListEditor } from './_components/list-editor'
import { subjectListData } from './_lib/list-data'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.content')
  return { title: t('headings.subjects'), robots: { index: false, follow: false } }
}

export default async function AdminContentSubjectsPage() {
  const profile = await requireSection('content')
  const t = await getTranslations('admin.content')
  const tree = await getContentTree()

  return (
    <div>
      <Crumbs segments={[]} />
      <ListEditor data={subjectListData(tree, profile.role)} heading={t('headings.subjects')} />
    </div>
  )
}
