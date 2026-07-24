import type { ReactNode } from 'react'
import { getContentTree } from '@/features/content/queries'
import { requireSection } from '@/features/admin/queries'
import { TreeRail } from './_components/tree-rail'

/*
 * Content section shell (M4 §5.1 · wireframe 1ar / hi-fi 3aj): persistent
 * read-only tree rail (270px) beside the level's list editor. The rail and
 * the pages share one tree fetch per request (React cache in queries.ts).
 */
export default async function AdminContentLayout({ children }: { children: ReactNode }) {
  await requireSection('content')
  const tree = await getContentTree()

  return (
    <div className="grid min-w-0 grid-cols-1 gap-0 md:grid-cols-[270px_1fr]">
      <TreeRail tree={tree} />
      <div className="min-w-0 pt-6 md:ps-6">{children}</div>
    </div>
  )
}
