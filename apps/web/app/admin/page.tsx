import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { MonographLabel, StackedRecord } from '@epharmatica/ui'
import { canAccessSection } from '@/features/admin/permissions'
import { getAuditTail, getDashboardSnapshot, requireSection } from '@/features/admin/queries'
import { getContentTree, getReviewQueue } from '@/features/content/queries'

/*
 * Dashboard v1 (M4 §4): per-subject published / in-review / draft counts
 * vs the Phase-1 content gate (≥2 subjects with ≥25 published subtopics),
 * review-queue depth + oldest age, active preview links, last 20 audit
 * entries (admin+ — RLS returns nothing for others), quick actions.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.dashboard')
  return { title: t('title'), robots: { index: false, follow: false } }
}

const STATUS_KEYS = [
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'published',
  'archived',
] as const

export default async function AdminDashboardPage() {
  const profile = await requireSection('dashboard')
  const t = await getTranslations('admin.dashboard')

  const [snapshot, tree, queue] = await Promise.all([
    getDashboardSnapshot(),
    getContentTree(),
    getReviewQueue(),
  ])
  const showAudit = canAccessSection(profile.role, 'audit')
  const auditTail = showAudit ? await getAuditTail() : []

  const subjectLines = tree.map((subject) => {
    const statuses = subject.chapters
      .flatMap((chapter) => chapter.topics)
      .flatMap((topic) => topic.subtopics)
      .map((subtopic) => subtopic.status)
    return {
      id: subject.id,
      name: subject.name,
      published: statuses.filter((status) => status === 'published').length,
      inReview: statuses.filter((status) => status === 'in_review').length,
      draft: statuses.filter((status) => status === 'draft' || status === 'changes_requested')
        .length,
    }
  })
  const gateMet = subjectLines.filter((line) => line.published >= 25).length >= 2

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>

      <section className="mt-6">
        <MonographLabel as="h2" rule="hard">
          {t('gateHeading')}
        </MonographLabel>
        <div className="mt-3 flex flex-col gap-1.5">
          {subjectLines.map((line) => (
            <p key={line.id} className="text-[13px]">
              {t('gateSubjectLine', {
                name: line.name,
                published: line.published,
                inReview: line.inReview,
                draft: line.draft,
              })}
            </p>
          ))}
          <p className="text-[12px] text-ink-2">{t('gateTarget')}</p>
          {gateMet ? (
            <p className="mt-1">
              <span className="inline-block border border-primary px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
                {t('gateMet')}
              </span>
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        <MonographLabel as="h2" rule="hard">
          {t('contentHeading')}
        </MonographLabel>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {STATUS_KEYS.map((status) => (
            <div
              key={status}
              className="flex items-baseline justify-between border-b border-line pb-1"
            >
              <dt className="text-[13px] text-ink-2">{t(`status.${status}`)}</dt>
              <dd className="font-mono text-[15px] tabular-nums">
                {snapshot.statusCounts[status] ?? 0}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <MonographLabel as="h2" rule="hard">
            {t('queueHeading')}
          </MonographLabel>
          <p className="mt-3 font-mono text-3xl tabular-nums">{snapshot.reviewQueueDepth}</p>
          <p className="text-[13px] text-ink-2">
            {t('queueDepthLabel')}
            {queue.length > 0 ? ` · ${t('queueOldest', { days: queue[0]?.waitingDays ?? 0 })}` : ''}
          </p>
        </div>
        <div>
          <MonographLabel as="h2" rule="hard">
            {t('previewHeading')}
          </MonographLabel>
          <p className="mt-3 font-mono text-3xl tabular-nums">{snapshot.activePreviewLinks}</p>
          <p className="text-[13px] text-ink-2">{t('previewLinksLabel')}</p>
        </div>
      </section>

      <section className="mt-8">
        <MonographLabel as="h2" rule="hard">
          {t('quickHeading')}
        </MonographLabel>
        <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
          <Link href="/admin/content" className="text-primary underline-offset-2 hover:underline">
            {t('quickContent')}
          </Link>
          <Link
            href="/admin/content/review"
            className="text-primary underline-offset-2 hover:underline"
          >
            {t('quickReview')}
          </Link>
          <Link href="/admin/media" className="text-primary underline-offset-2 hover:underline">
            {t('quickMedia')}
          </Link>
        </div>
      </section>

      {showAudit ? (
        <section className="mt-8">
          <MonographLabel as="h2" rule="hard">
            {t('auditHeading')}
          </MonographLabel>
          {auditTail.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-2">{t('auditEmpty')}</p>
          ) : (
            <StackedRecord
              className="mt-3"
              rows={auditTail.map((entry) => ({
                label: entry.action.split('.')[1] ?? entry.action,
                value: `${entry.action} · ${entry.entity}${entry.entity_id ? ` · ${entry.entity_id}` : ''} · ${entry.created_at.slice(0, 16).replace('T', ' ')}`,
              }))}
            />
          )}
        </section>
      ) : null}
    </div>
  )
}
