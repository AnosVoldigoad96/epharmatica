import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import { getContentTree } from '@/features/content/queries'
import { findChapter } from '@/features/content/tree'
import { Crumbs } from '../../_components/crumbs'
import { ListEditor } from '../../_components/list-editor'
import { topicListData } from '../../_lib/list-data'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } }
}

export default async function AdminChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireSection('content')
  const t = await getTranslations('admin.content')
  const tree = await getContentTree()

  const data = topicListData(tree, id, profile.role)
  const found = findChapter(tree, id)
  if (!data || !found) notFound()

  return (
    <div>
      <Crumbs segments={[found.subject.name, found.chapter.name]} />
      <ListEditor data={data} heading={t('headings.topicsIn', { name: found.chapter.name })} />
    </div>
  )
}
