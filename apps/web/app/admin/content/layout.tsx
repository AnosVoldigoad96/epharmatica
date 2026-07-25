import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { getContentTree, getContentTrashCount, getReviewQueue } from '@/features/content/queries'
import { requireSection } from '@/features/admin/queries'
import { ContentTabs } from './_components/content-tabs'
import { TreeRail } from './_components/tree-rail'

/*
 * Content section shell (M4 §5.1 · wireframe 1ar / hi-fi 3aj): the section
 * tab row (Tree · Review queue with its depth badge), then the persistent
 * read-only tree rail (270px) beside the current surface. Rail and pages
 * share one tree fetch per request (React cache in queries.ts).
 */
export default async function AdminContentLayout({ children }: { children: ReactNode }) {
  const profile = await requireSection('content')
  const t = await getTranslations('admin.content.tabs')

  // Trash is admin+ only (DELETING_ROLES) — other staff never see the rail
  // link, so the open-event count isn't even fetched for them.
  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'
  const [tree, queue, trashCount] = await Promise.all([
    getContentTree(),
    getReviewQueue(),
    isAdmin ? getContentTrashCount() : Promise.resolve(null),
  ])

  return (
    <div>
      <ContentTabs labels={{ tree: t('tree'), review: t('review') }} queueDepth={queue.length} />
      <div className="grid min-w-0 grid-cols-1 gap-0 md:grid-cols-[270px_1fr]">
        <TreeRail tree={tree} trashCount={trashCount} />
        <div className="min-w-0 pt-6 md:ps-6">{children}</div>
      </div>
    </div>
  )
}
