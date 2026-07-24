import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import { getReviewQueue } from '@/features/content/queries'
import { Crumbs } from '../_components/crumbs'
import { ReviewQueueTable } from '../_components/review-queue-table'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.content.queue')
  return { title: t('title'), robots: { index: false, follow: false } }
}

/*
 * Review queue (M4-2 §5.6 · wireframe 1au / hi-fi 2f): ONE open queue,
 * all in_review subtopics oldest first, subject filter, age chip amber
 * past 7 days. A claim prevents collisions — it doesn't grant permission.
 */
export default async function AdminReviewQueuePage() {
  const profile = await requireSection('content')
  const t = await getTranslations('admin.content.queue')
  const queue = await getReviewQueue()

  const oldestDays = queue[0]?.waitingDays ?? 0

  return (
    <div className="max-w-4xl">
      <Crumbs segments={[t('title')]} />
      <div className="mb-4 flex items-baseline gap-4">
        <h1 className="flex-1 font-display text-[19px] font-bold">{t('title')}</h1>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
          {t('subline', { count: queue.length, oldest: oldestDays })}
        </p>
      </div>
      <ReviewQueueTable entries={queue} viewer={{ id: profile.id, role: profile.role }} />
      <p className="mt-3 text-[12px] text-ink-2">{t('footer')}</p>
    </div>
  )
}
