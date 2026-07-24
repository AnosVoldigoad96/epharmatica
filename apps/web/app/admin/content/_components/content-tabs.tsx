'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Content-section tab row: Tree · Review queue (with live depth badge). */
export function ContentTabs({
  labels,
  queueDepth,
}: {
  labels: { tree: string; review: string }
  queueDepth: number
}) {
  const pathname = usePathname()
  const onReview = pathname.startsWith('/admin/content/review')

  const tabClass = (active: boolean) =>
    `flex min-h-8 items-center gap-2 border-b-2 px-3 text-[13px] ${
      active
        ? 'border-primary font-medium text-primary'
        : 'border-transparent text-ink-2 hover:text-ink'
    }`

  return (
    <div className="flex gap-1 border-b border-line pt-4">
      <Link href="/admin/content" className={tabClass(!onReview)}>
        {labels.tree}
      </Link>
      <Link href="/admin/content/review" className={tabClass(onReview)}>
        {labels.review}
        <span className="border border-line px-1 font-mono text-[10px] tabular-nums text-ink-2">
          {queueDepth}
        </span>
      </Link>
    </div>
  )
}
