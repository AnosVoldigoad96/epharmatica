import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import { getContentTree } from '@/features/content/queries'
import { findTopic } from '@/features/content/tree'
import { Crumbs } from '../../_components/crumbs'
import { ListEditor } from '../../_components/list-editor'
import { subtopicListData } from '../../_lib/list-data'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } }
}

export default async function AdminTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireSection('content')
  const t = await getTranslations('admin.content')
  const tree = await getContentTree()

  const data = subtopicListData(tree, id, profile.role)
  const found = findTopic(tree, id)
  if (!data || !found) notFound()

  return (
    <div>
      <Crumbs segments={[found.subject.name, found.chapter.name, found.topic.name]} />
      <ListEditor data={data} heading={t('headings.subtopicsIn', { name: found.topic.name })} />
    </div>
  )
}
