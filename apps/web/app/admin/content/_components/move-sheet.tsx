'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ContentLevel } from '@epharmatica/database'
import { Button, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import { getNodeConsequences, moveNode } from '@/features/content/actions'
import { AdminSheet } from './admin-sheet'
import type { ListRow, MoveTarget } from './list-types'

/**
 * Move… sheet (M4-1/§5.3 · hi-fi 3al): destination picker (legal targets
 * only) beside the amber consequences panel — 301 line with old→new URL,
 * highlight re-anchor count (fetched staff-side), cache scope — and the
 * typed `move` confirmation for published nodes. Draft nodes move without
 * ceremony: no consequences, no typed word.
 */
export function MoveSheet({
  level,
  row,
  targets,
  open,
  onClose,
}: {
  level: ContentLevel
  row: ListRow
  targets: MoveTarget[]
  open: boolean
  onClose: () => void
}) {
  const t = useTranslations('admin.content')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [selected, setSelected] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [highlightCount, setHighlightCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const published = row.publishedBeneath > 0
  const levelName = t(`levelNames.${level}`)

  useEffect(() => {
    if (!open || !published) return
    let cancelled = false
    getNodeConsequences(level, row.id).then((result) => {
      if (!cancelled && result.ok) setHighlightCount(result.highlightCount)
    })
    return () => {
      cancelled = true
    }
  }, [open, published, level, row.id])

  const target = targets.find((candidate) => candidate.id === selected) ?? null
  const oldPath = `/learn/${row.pathSegments.join('/')}`
  const newPath = useMemo(
    () => (target ? `/learn/${[...target.pathSegments, row.slug].join('/')}` : '…'),
    [target, row.slug],
  )

  const groups = useMemo(() => {
    const map = new Map<string, MoveTarget[]>()
    for (const candidate of targets) {
      const list = map.get(candidate.group) ?? []
      list.push(candidate)
      map.set(candidate.group, list)
    }
    return [...map.entries()]
  }, [targets])

  const submit = () => {
    if (!target) return
    setError(null)
    startTransition(async () => {
      const result = await moveNode(level, row.id, target.id, typed)
      if (!result.ok) return setError(result.error)
      toast({ title: t('toasts.moved') })
      onClose()
      router.refresh()
    })
  }

  const title = published
    ? t('move.titlePublished', { name: row.name, levelName })
    : t('move.title', { name: row.name })

  return (
    <AdminSheet open={open} title={title} onClose={onClose} wide>
      <div className={`grid ${published ? 'sm:grid-cols-[1fr_1.2fr]' : ''}`}>
        <div className="p-5 sm:border-e sm:border-line">
          <MonographLabel as="div" size="sm" className="mb-3">
            {t('move.destination')}
          </MonographLabel>
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {groups.map(([group, members]) => (
              <li key={group}>
                <p className="px-2 pb-1 pt-2 text-[13px] font-semibold">{group}</p>
                <ul>
                  {members.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        disabled={candidate.current}
                        onClick={() => setSelected(candidate.id)}
                        aria-pressed={selected === candidate.id}
                        className={`flex w-full items-center gap-2 border-s-2 px-3 py-1.5 text-start text-[13px] ${
                          selected === candidate.id
                            ? 'border-primary bg-primary-tint font-semibold text-primary-strong'
                            : candidate.current
                              ? 'border-transparent text-ink-2/60'
                              : 'border-transparent text-ink-2 hover:bg-primary-tint/50 hover:text-ink'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">› {candidate.label}</span>
                        {selected === candidate.id ? <span aria-hidden>✓</span> : null}
                        {candidate.current ? (
                          <span className="font-mono text-[9px] uppercase tracking-[0.08em]">
                            {t('move.currentTag')}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        {published ? (
          <div className="bg-warn/10 p-5">
            <MonographLabel as="div" size="sm" className="mb-3 text-warn">
              {t('consequences.heading')}
            </MonographLabel>
            <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed">
              <p>{t('consequences.urlLine')}</p>
              <p className="font-mono text-[11px] text-ink-2">
                {oldPath} → {newPath}
              </p>
              <p>
                {highlightCount === null
                  ? t('consequences.highlightsPending')
                  : t('consequences.highlightsLine', { count: highlightCount })}
              </p>
              <p>{t('consequences.cacheLineMove', { levelName })}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-line px-5 py-4">
        {published ? (
          <div>
            <MonographLabel as="label" size="sm" htmlFor="move-confirm" className="mb-2">
              {t('move.typeToConfirm')}
            </MonographLabel>
            <input
              id="move-confirm"
              className={`${fieldClass} w-[140px] font-mono`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
        <div className="flex gap-3">
          <Button
            size="sm"
            pending={pending}
            disabled={!target || (published && typed.trim() !== 'move')}
            onClick={submit}
          >
            {t('move.confirm', { levelName })}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('sheet.cancel')}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="w-full text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </AdminSheet>
  )
}
