'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { MonographLabel, StateGlyph, useToast } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { toggleBookmark } from '@/features/study/actions'
import type { DashboardBookmarkGroup } from '@/features/study/dashboard-queries'
import { EVENTS, trackEvent } from '@/lib/observability/events'

/**
 * Dashboard bookmarks (M1 §5.7): grouped by subject with state glyphs —
 * completed check on units, aggregate fill on topics — plus the remove
 * affordance (toggleBookmark, the same server action as the in-reader
 * toggle). Rows whose target left the published tree render "No longer
 * available" in a trailing group and stay removable.
 */
export function BookmarksList({ groups }: { groups: DashboardBookmarkGroup[] }) {
  const t = useTranslations('account.dashboard')
  const { toast } = useToast()
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const remove = async (id: string, targetType: 'subtopic' | 'topic', targetId: string) => {
    setBusyId(id)
    const result = await toggleBookmark({ targetType, targetId })
    setBusyId(null)
    if (!result.ok) {
      toast({ title: t('removeFailed'), variant: 'error' })
      return
    }
    setRemovedIds((current) => new Set(current).add(id))
    trackEvent(EVENTS.bookmark_toggled, { target: targetType })
  }

  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !removedIds.has(item.id)) }))
    .filter((group) => group.items.length > 0)

  if (visibleGroups.length === 0) {
    return <p className="text-[13px] leading-[1.5] text-ink-2">{t('bookmarksEmpty')}</p>
  }

  return (
    <div className="flex flex-col gap-5">
      {visibleGroups.map((group) => (
        <div key={group.subjectId ?? 'unavailable'}>
          <MonographLabel as="h3" size="sm" className="mb-2">
            {group.subjectName ?? t('unavailable')}
          </MonographLabel>
          <ul className="border border-line bg-surface">
            {group.items.map((item) => (
              <li
                key={item.id}
                className="flex min-h-12 items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <StateGlyph state={item.state} />
                {item.href && item.title ? (
                  <Link
                    href={item.href}
                    className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink hover:text-primary"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[14px] italic text-ink-2">
                    {t('unavailable')}
                  </span>
                )}
                {item.targetType === 'topic' ? <Chip>{t('bookmarkKindTopic')}</Chip> : null}
                <button
                  type="button"
                  disabled={busyId === item.id}
                  aria-label={t('removeAria', { title: item.title ?? t('unavailable') })}
                  onClick={() => void remove(item.id, item.targetType, item.targetId)}
                  className="flex size-8 flex-none items-center justify-center text-ink-2 hover:bg-primary-tint hover:text-danger [@media(pointer:coarse)]:size-11"
                >
                  <X size={14} strokeWidth={1.5} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
