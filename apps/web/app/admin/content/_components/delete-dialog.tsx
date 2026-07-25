'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ContentLevel } from '@epharmatica/database'
import { Button, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import { deleteNode } from '@/features/content/actions'
import { AdminSheet } from './admin-sheet'
import type { RowStatus } from './list-types'

/**
 * Delete… dialog (admin+ only — founder directive, migration 023): the
 * move sheet's typed-confirmation chrome turned danger. Spells out exactly
 * what goes — the node and its subtree with the rollup counts incl.
 * published, every dependent, the student data on those pages — then arms
 * the danger confirm only once the node's EXACT name is typed. The server
 * re-validates the typed name against the pre-delete tree; the cascade
 * cannot be undone.
 */
export function DeleteDialog({
  level,
  id,
  name,
  status,
  open,
  onClose,
  afterDeleteHref,
}: {
  level: ContentLevel
  id: string
  /** Exact display name — the typed confirmation must match it. */
  name: string
  /** Rollup counts (subject/chapter/topic) or the page's own status. */
  status: RowStatus
  open: boolean
  onClose: () => void
  /** Detail pages navigate to the parent list; lists refresh in place. */
  afterDeleteHref?: string
}) {
  const t = useTranslations('admin.content')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const levelName = t(`levelNames.${level}`)
  const armed = typed.trim() === name

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await deleteNode(level, id, typed)
      if (!result.ok) return setError(result.error)
      toast({ title: t('toasts.deleted') })
      onClose()
      if (afterDeleteHref) router.push(afterDeleteHref)
      else router.refresh()
    })
  }

  return (
    <AdminSheet open={open} title={t('delete.title', { name, levelName })} onClose={onClose}>
      <div className="bg-danger/10 p-5">
        <MonographLabel as="div" size="sm" className="mb-3 text-danger">
          {t('delete.heading')}
        </MonographLabel>
        <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed">
          <p>{t('delete.nodeLine', { levelName, name })}</p>
          {status.kind === 'rollup' ? (
            <p className="font-mono text-[11px] text-ink-2">
              {t('delete.countLine', { total: status.total, published: status.published })}
            </p>
          ) : status.status === 'published' ? (
            <p>{t('delete.publishedPage')}</p>
          ) : null}
          <p>{t('delete.dependentsLine')}</p>
          <p>{t('delete.studentDataLine')}</p>
          <p>{t('delete.cacheLine', { levelName })}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-line px-5 py-4">
        <div>
          <MonographLabel as="label" size="sm" htmlFor="delete-confirm" className="mb-2">
            {t('delete.typeToConfirm')}
          </MonographLabel>
          <p className="mb-1.5 font-mono text-[11px] text-ink-2">{name}</p>
          <input
            id="delete-confirm"
            className={`${fieldClass} w-[240px] font-mono`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex gap-3">
          <Button size="sm" variant="danger" pending={pending} disabled={!armed} onClick={submit}>
            {t('delete.confirm', { levelName })}
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
