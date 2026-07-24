import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import { getContentTree } from '@/features/content/queries'
import { findSubject } from '@/features/content/tree'
import { Crumbs } from '../../_components/crumbs'
import { ListEditor } from '../../_components/list-editor'
import { chapterListData } from '../../_lib/list-data'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } }
}

export default async function AdminSubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireSection('content')
  const t = await getTranslations('admin.content')
  const tree = await getContentTree()

  const data = chapterListData(tree, id, profile.role)
  const subject = findSubject(tree, id)
  if (!data || !subject) notFound()

  return (
    <div>
      <Crumbs segments={[subject.name]} />
      <ListEditor data={data} heading={t('headings.chaptersIn', { name: subject.name })} />
    </div>
  )
}
