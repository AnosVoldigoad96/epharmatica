'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import { purgeNode, restoreNode } from '@/features/content/actions'
import type { TrashEventSummary } from '@/features/content/queries'
import { AdminSheet } from './admin-sheet'

/**
 * Trash list (migration 024): one bordered row per open deletion event —
 * level chip, name/slug, page + published counts, deleted-when and the
 * purge countdown (both computed server-side at read time). Restore is a
 * single click; Delete forever reuses the delete-dialog chrome with the
 * typed-name confirm, danger styling and all — this one really cannot be
 * undone.
 */
export function TrashList({ events }: { events: TrashEventSummary[] }) {
  const t = useTranslations('admin.content')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [purgeEvent, setPurgeEvent] = useState<TrashEventSummary | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  if (events.length === 0) {
    return (
      <div className="border border-line bg-surface p-8 text-center">
        <MonographLabel as="div" size="sm" className="mb-2">
          {t('trash.emptyLabel')}
        </MonographLabel>
        <p className="text-[13px] text-ink-2">{t('trash.emptyBody')}</p>
      </div>
    )
  }

  const restore = (event: TrashEventSummary) => {
    setRowError(null)
    startTransition(async () => {
      const result = await restoreNode(event.id)
      if (!result.ok) return setRowError({ id: event.id, message: result.error })
      toast({ title: t('trash.toasts.restored') })
      router.refresh()
    })
  }

  return (
    <div className="border border-line bg-surface">
      <ul>
        {events.map((event, index) => (
          <li
            key={event.id}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${
              index > 0 ? 'border-t border-line' : ''
            }`}
          >
            <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
              {t(`levelNames.${event.level}`)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{event.name}</span>
              <span className="block truncate font-mono text-[10.5px] text-ink-2">
                {event.slug}
              </span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-ink-2">
              {t('trash.counts', { pages: event.pages, published: event.published })}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-ink-2">
              {t('trash.deletedAgo', { days: event.deletedDaysAgo })}
            </span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                event.purgeInDays <= 3 ? 'text-warn' : 'text-ink-2'
              }`}
            >
              {t('trash.purgesIn', { days: event.purgeInDays })}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" pending={pending} onClick={() => restore(event)}>
                {t('trash.restore')}
              </Button>
              <Button size="sm" variant="danger" onClick={() => setPurgeEvent(event)}>
                {t('trash.purgeButton')}
              </Button>
            </span>
            {rowError?.id === event.id ? (
              <p role="alert" className="w-full text-[13px] text-danger">
                {rowError.message}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {purgeEvent ? <PurgeDialog event={purgeEvent} onClose={() => setPurgeEvent(null)} /> : null}
    </div>
  )
}

/**
 * "Delete forever" confirm — the DeleteDialog chrome (danger panel, typed
 * exact name arms the confirm; the server re-validates the typed name
 * against the open trash event).
 */
function PurgeDialog({ event, onClose }: { event: TrashEventSummary; onClose: () => void }) {
  const t = useTranslations('admin.content')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const levelName = t(`levelNames.${event.level}`)
  const armed = typed.trim() === event.name

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await purgeNode(event.id, typed)
      if (!result.ok) return setError(result.error)
      toast({ title: t('trash.toasts.purged') })
      onClose()
      router.refresh()
    })
  }

  return (
    <AdminSheet
      open
      title={t('trash.purge.title', { name: event.name, levelName })}
      onClose={onClose}
    >
      <div className="bg-danger/10 p-5">
        <MonographLabel as="div" size="sm" className="mb-3 text-danger">
          {t('trash.purge.heading')}
        </MonographLabel>
        <div className="flex flex-col gap-2.5 text-[13px] leading-relaxed">
          <p>{t('trash.purge.nodeLine', { levelName, name: event.name })}</p>
          <p className="font-mono text-[11px] text-ink-2">
            {t('trash.counts', { pages: event.pages, published: event.published })}
          </p>
          <p>{t('trash.purge.dependentsLine')}</p>
          <p>{t('trash.purge.slugLine')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 border-t border-line px-5 py-4">
        <div>
          <MonographLabel as="label" size="sm" htmlFor="purge-confirm" className="mb-2">
            {t('delete.typeToConfirm')}
          </MonographLabel>
          <p className="mb-1.5 font-mono text-[11px] text-ink-2">{event.name}</p>
          <input
            id="purge-confirm"
            className={`${fieldClass} w-[240px] font-mono`}
            value={typed}
            onChange={(changeEvent) => setTyped(changeEvent.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex gap-3">
          <Button size="sm" variant="danger" pending={pending} disabled={!armed} onClick={submit}>
            {t('trash.purge.confirm')}
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
