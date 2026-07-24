import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MonographLabel, StackedRecord } from '@epharmatica/ui'
import { canAccessSection } from '@/features/admin/permissions'
import { getAuditTail, getDashboardSnapshot, requireSection } from '@/features/admin/queries'

/*
 * Admin dashboard (M4 §4). This PR ships the v0 skeleton every staff role
 * lands on: content status counters, review-queue depth, active preview
 * links, and the audit tail (admin+ — RLS returns nothing for others, so
 * the tile renders only when the role can read it). The full Dashboard v1
 * (per-subject counts vs the Phase-1 content gate, queue age, quick
 * actions) completes with 1.B-5 once its surfaces exist.
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

  const snapshot = await getDashboardSnapshot()
  const showAudit = canAccessSection(profile.role, 'audit')
  const auditTail = showAudit ? await getAuditTail() : []

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>

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
          <p className="text-[13px] text-ink-2">{t('queueDepthLabel')}</p>
        </div>
        <div>
          <MonographLabel as="h2" rule="hard">
            {t('previewHeading')}
          </MonographLabel>
          <p className="mt-3 font-mono text-3xl tabular-nums">{snapshot.activePreviewLinks}</p>
          <p className="text-[13px] text-ink-2">{t('previewLinksLabel')}</p>
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
