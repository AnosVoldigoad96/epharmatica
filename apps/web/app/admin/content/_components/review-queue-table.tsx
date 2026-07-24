'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, MonographLabel, useToast } from '@epharmatica/ui'
import { claimReview, releaseReview } from '@/features/content/workflow-actions'
import type { ReviewQueueEntry } from '@/features/content/queries'

/**
 * Review queue table (hi-fi 2f): SUBTOPIC · SUBJECT · WAITING · CLAIM ·
 * ACTIONS. Claim is the weighted action (primary sm button); Open and
 * Release are text links. Age chips go amber past 7 days (the master
 * review-cycle metric). Reviewers claim/release; content_manager+ can
 * release anyone's claim.
 */
export function ReviewQueueTable({
  entries,
  viewer,
}: {
  entries: ReviewQueueEntry[]
  viewer: { id: string; role: string }
}) {
  const t = useTranslations('admin.content.queue')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [subjectFilter, setSubjectFilter] = useState<string>('')

  const canReview = ['reviewer', 'content_manager', 'admin', 'super_admin'].includes(viewer.role)
  const canManage = ['content_manager', 'admin', 'super_admin'].includes(viewer.role)

  const subjects = useMemo(
    () => [...new Set(entries.map((entry) => entry.subjectName))].sort(),
    [entries],
  )
  const visible = subjectFilter
    ? entries.filter((entry) => entry.subjectName === subjectFilter)
    : entries

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      const result = await work()
      if (!result.ok && result.error) toast({ title: result.error, variant: 'error' })
      router.refresh()
    })
  }

  if (entries.length === 0) {
    return (
      <div className="border border-line bg-surface p-8 text-center">
        <MonographLabel as="div" size="sm" className="mb-2">
          {t('emptyLabel')}
        </MonographLabel>
        <p className="text-[13px] text-ink-2">{t('emptyBody')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3">
        <label className="flex items-center gap-2 text-[12px] text-ink-2">
          <MonographLabel as="span" size="sm">
            {t('subjectFilter')}
          </MonographLabel>
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="h-8 border border-line bg-surface px-2 text-[13px] text-ink"
          >
            <option value="">{t('allSubjects')}</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border border-line bg-surface">
        <div className="grid grid-cols-[1fr_140px_90px_110px_150px] items-center gap-3 border-b border-ink px-4 py-2">
          {(['subtopic', 'subject', 'waiting', 'claim', 'actions'] as const).map((key) => (
            <MonographLabel key={key} as="span" size="sm">
              {t(`columns.${key}`)}
            </MonographLabel>
          ))}
        </div>
        <ul>
          {visible.map((entry) => {
            const waitingDays = entry.waitingDays
            const mine = entry.claimedBy?.id === viewer.id
            return (
              <li
                key={entry.subtopicId}
                className="grid grid-cols-[1fr_140px_90px_110px_150px] items-center gap-3 border-b border-line px-4 py-[11px] last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold">{entry.title}</span>
                  <span className="block truncate text-[11px] text-ink-2">{entry.topicName}</span>
                </span>
                <span className="truncate text-[12.5px] text-ink-2">{entry.subjectName}</span>
                <span>
                  <span
                    className={`inline-block border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                      waitingDays > 7
                        ? 'border-warn/60 bg-warn/10 text-warn'
                        : 'border-line text-ink-2'
                    }`}
                  >
                    {t('waitingDays', { days: waitingDays })}
                  </span>
                </span>
                <span>
                  {entry.claimedBy ? (
                    <span className="inline-block border border-primary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
                      {mine ? t('claimedByYou') : entry.claimedBy.username}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
                      {t('unclaimed')}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2.5 text-[12.5px]">
                  <Link
                    href={`/admin/content/subtopic/${entry.subtopicId}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {t('open')}
                  </Link>
                  {canReview && !entry.claimedBy ? (
                    <Button
                      size="sm"
                      pending={pending}
                      onClick={() => run(() => claimReview(entry.subtopicId))}
                    >
                      {t('claim')}
                    </Button>
                  ) : null}
                  {entry.claimedBy && (mine || canManage) ? (
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => run(() => releaseReview(entry.subtopicId))}
                    >
                      {t('release')}
                    </button>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
