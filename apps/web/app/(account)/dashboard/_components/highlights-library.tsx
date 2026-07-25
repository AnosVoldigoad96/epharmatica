'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { MonographLabel, useToast } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { deleteHighlight } from '@/features/study/actions'
import { HIGHLIGHT_COLORS } from '@/features/study/anchor-schema'
import type { StudyHighlightColor } from '@/features/study/anchor-schema'
import type { MyHighlightRow, MyHighlightsData } from '@/features/study/dashboard-queries'
import { ColorDot } from './color-dot'

/**
 * My Highlights library (M1 §5.5): the ORPHANED section pins first when
 * any exist (orphan chip + snapshot + attached note + a link to the unit —
 * restore itself happens in-reader via the drawer's re-selection flow),
 * then subject › unit groups in tree order. Color filter is client-side
 * over the server-shaped data; delete reuses the deleteHighlight action
 * and asks once (its note cascades — M1 §5.6).
 */

type ColorFilter = 'all' | StudyHighlightColor

export function HighlightsLibrary({ data }: { data: MyHighlightsData }) {
  const t = useTranslations('account.highlights')
  const { toast } = useToast()
  const [filter, setFilter] = useState<ColorFilter>('all')
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set())
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const visible = (row: MyHighlightRow) =>
    !deletedIds.has(row.id) && (filter === 'all' || row.color === filter)

  const onDelete = async (row: MyHighlightRow) => {
    setBusy(true)
    const result = await deleteHighlight(row.id)
    setBusy(false)
    setConfirmingId(null)
    if (!result.ok) {
      toast({ title: t('deleteFailed'), variant: 'error' })
      return
    }
    setDeletedIds((current) => new Set(current).add(row.id))
  }

  const deleteControls = (row: MyHighlightRow) =>
    confirmingId === row.id ? (
      <span className="flex items-center gap-3">
        {row.noteText !== null ? (
          <span className="text-[12px] text-ink-2">{t('deleteWithNote')}</span>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete(row)}
          className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-danger underline underline-offset-2"
        >
          {t('deleteConfirm')}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingId(null)}
          className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 underline underline-offset-2"
        >
          {t('cancel')}
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setConfirmingId(row.id)}
        className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 underline underline-offset-2 hover:text-danger"
      >
        {t('delete')}
      </button>
    )

  const row = (highlight: MyHighlightRow, showTarget: boolean) => (
    <li key={highlight.id} className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <ColorDot color={highlight.color} />
        {highlight.orphaned ? <Chip variant="warn">{t('orphanedLabel')}</Chip> : null}
        {highlight.moved ? <Chip>{t('movedChip')}</Chip> : null}
        <span className="ms-auto font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2">
          {t('daysAgo', { days: highlight.daysAgo })}
        </span>
      </div>
      <p className="mb-1.5 text-[13px] italic leading-[1.5] text-ink-2">“{highlight.snapshot}”</p>
      {highlight.orphaned && highlight.noteText !== null ? (
        <div className="mb-1.5 border border-line bg-paper p-2.5">
          <MonographLabel as="div" size="sm" className="mb-1">
            {t('noteLabel')}
          </MonographLabel>
          <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55]">{highlight.noteText}</p>
        </div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {showTarget ? (
          highlight.target ? (
            <Link
              href={highlight.target.href}
              className="text-[12.5px] font-medium text-ink underline decoration-line underline-offset-2 hover:text-primary"
            >
              {highlight.orphaned ? t('openUnit') : highlight.target.title}
            </Link>
          ) : (
            <span className="text-[12.5px] italic text-ink-2">{t('unavailable')}</span>
          )
        ) : null}
        {deleteControls(highlight)}
      </div>
    </li>
  )

  const orphanedVisible = data.orphaned.filter(visible)
  const groupsVisible = data.groups
    .map((group) => ({
      ...group,
      subtopics: group.subtopics
        .map((subtopic) => ({ ...subtopic, rows: subtopic.rows.filter(visible) }))
        .filter((subtopic) => subtopic.rows.length > 0),
    }))
    .filter((group) => group.subtopics.length > 0)

  const nothingVisible = orphanedVisible.length === 0 && groupsVisible.length === 0

  return (
    <div className="flex flex-col gap-8">
      {/* ── Color filter chips (client-side) ──────────────────────── */}
      <div role="group" aria-label={t('filterLabel')} className="flex flex-wrap gap-2">
        {(['all', ...HIGHLIGHT_COLORS] as const).map((value) => {
          const active = filter === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(value)}
              className={`inline-flex h-8 items-center gap-2 border px-3 font-mono text-[11px] uppercase tracking-[.05em] [@media(pointer:coarse)]:h-11 ${
                active
                  ? 'border-primary bg-primary-tint text-primary'
                  : 'border-line bg-surface text-ink-2 hover:border-ink hover:text-ink'
              }`}
            >
              {value === 'all' ? null : <ColorDot color={value} />}
              {value === 'all' ? t('filterAll') : t(`colors.${value}`)}
            </button>
          )
        })}
      </div>

      {nothingVisible ? (
        <p className="text-[13px] leading-[1.5] text-ink-2">
          {data.total === 0 ? t('empty') : t('emptyFiltered')}
        </p>
      ) : null}

      {/* ── Orphaned — pinned first (M1 §5.5, never silent) ───────── */}
      {orphanedVisible.length > 0 ? (
        <section>
          <MonographLabel as="h2" rule="hard" className="mb-2">
            {t('orphanedLabel')}
          </MonographLabel>
          <p className="mb-4 text-[13px] leading-[1.5] text-ink-2">{t('orphanedHint')}</p>
          <ul className="border border-line bg-surface">
            {orphanedVisible.map((highlight) => row(highlight, true))}
          </ul>
        </section>
      ) : null}

      {/* ── Subject › unit groups (tree order) ────────────────────── */}
      {groupsVisible.map((group) => (
        <section key={group.subjectId ?? 'unavailable'}>
          <MonographLabel as="h2" rule="hard" className="mb-4">
            {group.subjectName ?? t('unavailableGroup')}
          </MonographLabel>
          <div className="flex flex-col gap-5">
            {group.subtopics.map((subtopic) => (
              <div key={subtopic.id}>
                {subtopic.href && subtopic.title ? (
                  <Link
                    href={subtopic.href}
                    className="mb-2 inline-block text-[14.5px] font-medium text-ink hover:text-primary"
                  >
                    {subtopic.title}
                  </Link>
                ) : (
                  <span className="mb-2 inline-block text-[14.5px] italic text-ink-2">
                    {t('unavailable')}
                  </span>
                )}
                <ul className="border border-line bg-surface">
                  {subtopic.rows.map((highlight) => row(highlight, false))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
