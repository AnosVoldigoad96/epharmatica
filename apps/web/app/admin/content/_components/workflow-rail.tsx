'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { RichText, validateContent } from '@epharmatica/editor'
import type { Content } from '@epharmatica/editor'
import { Button, MonographLabel, useToast, fieldClass } from '@epharmatica/ui'
import type { RevisionSummary, ReviewEventSummary } from '@/features/content/queries'
import {
  approveSubtopic,
  archiveSubtopic,
  claimReview,
  getRevisionContent,
  publishSubtopic,
  releaseReview,
  requestChanges,
  restoreRevision,
  submitForReview,
  unpublishSubtopic,
} from '@/features/content/workflow-actions'
import { AdminSheet } from './admin-sheet'

/**
 * Workflow rail (hi-fi 2e right rail): status transitions by role+state
 * (the RPC matrix is authoritative — these buttons are affordances),
 * claim panel, derived-at-publish read-outs, review history, and the
 * revision list with the never-destructive restore + side-by-side diff.
 */

type RailDetail = {
  id: string
  status: string
  readingMinutes: number
  primaryVideoUrl: string | null
  semester: number | null
  claimedBy: { id: string; username: string } | null
  revisions: RevisionSummary[]
  events: ReviewEventSummary[]
}

const AUTHORING = ['author', 'content_manager', 'admin', 'super_admin']
const REVIEWING = ['reviewer', 'content_manager', 'admin', 'super_admin']
const MANAGING = ['content_manager', 'admin', 'super_admin']

export function WorkflowRail({
  detail,
  currentContent,
  viewer,
}: {
  detail: RailDetail
  currentContent: Content | null
  viewer: { id: string; role: string }
}) {
  const t = useTranslations('admin.content.workflow')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [comment, setComment] = useState('')
  const [diff, setDiff] = useState<{ revision: RevisionSummary; content: Content } | null>(null)

  const canAuthor = AUTHORING.includes(viewer.role)
  const canReview = REVIEWING.includes(viewer.role)
  const canManage = MANAGING.includes(viewer.role)
  const mineClaim = detail.claimedBy?.id === viewer.id

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await work()
      if (!result.ok) {
        toast({ title: result.error ?? '', variant: 'error' })
      } else {
        toast({ title: success })
        setComment('')
      }
      router.refresh()
    })
  }

  const openDiff = (revision: RevisionSummary) => {
    startTransition(async () => {
      const result = await getRevisionContent(revision.id)
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        return
      }
      const validated = validateContent(result.content)
      if (!validated.ok) {
        toast({ title: t('invalidContent'), variant: 'error' })
        return
      }
      setDiff({ revision, content: validated.content })
    })
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()

  return (
    <aside className="flex flex-col gap-6">
      <section className="border border-t-ink border-line bg-surface p-4">
        <MonographLabel as="h2" size="sm" className="mb-3 text-ink">
          {t('workflowHeading')}
        </MonographLabel>
        <div className="flex flex-col gap-2">
          {(detail.status === 'draft' || detail.status === 'changes_requested') && canAuthor ? (
            <Button
              size="sm"
              pending={pending}
              onClick={() => run(() => submitForReview(detail.id), t('toasts.submitted'))}
            >
              {t('submit')}
            </Button>
          ) : null}

          {detail.status === 'in_review' && canReview ? (
            <>
              <textarea
                className={`${fieldClass} h-auto min-h-16 py-2 text-[13px]`}
                placeholder={t('commentPlaceholder')}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="border-primary text-primary-strong"
                  pending={pending}
                  onClick={() =>
                    run(() => approveSubtopic(detail.id, comment), t('toasts.approved'))
                  }
                >
                  {t('approve')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  pending={pending}
                  disabled={!comment.trim()}
                  onClick={() =>
                    run(() => requestChanges(detail.id, comment), t('toasts.changesRequested'))
                  }
                >
                  {t('requestChanges')}
                </Button>
              </div>
            </>
          ) : null}

          {detail.status === 'approved' && canManage ? (
            <Button
              size="sm"
              pending={pending}
              onClick={() => run(() => publishSubtopic(detail.id), t('toasts.published'))}
            >
              {t('publish')}
            </Button>
          ) : null}

          {detail.status === 'published' && canManage ? (
            <Button
              size="sm"
              variant="ghost"
              pending={pending}
              onClick={() => run(() => unpublishSubtopic(detail.id), t('toasts.unpublished'))}
            >
              {t('unpublish')}
            </Button>
          ) : null}

          {detail.status !== 'archived' && canManage ? (
            <Button
              size="sm"
              variant="danger"
              pending={pending}
              onClick={() => run(() => archiveSubtopic(detail.id), t('toasts.archived'))}
            >
              {t('archive')}
            </Button>
          ) : null}
        </div>

        {detail.status === 'in_review' ? (
          <div className="mt-4 border-t border-line pt-3">
            <MonographLabel as="div" size="sm" className="mb-2">
              {t('claimHeading')}
            </MonographLabel>
            {detail.claimedBy ? (
              <div className="flex items-center gap-2">
                <span className="border border-primary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
                  {mineClaim ? t('claimedByYou') : detail.claimedBy.username}
                </span>
                {mineClaim || canManage ? (
                  <button
                    type="button"
                    className="text-[12.5px] text-primary underline-offset-2 hover:underline"
                    onClick={() => run(() => releaseReview(detail.id), t('toasts.released'))}
                  >
                    {t('release')}
                  </button>
                ) : null}
              </div>
            ) : canReview ? (
              <Button
                size="sm"
                pending={pending}
                onClick={() => run(() => claimReview(detail.id), t('toasts.claimed'))}
              >
                {t('claim')}
              </Button>
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
                {t('unclaimed')}
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="border border-line bg-surface p-4">
        <MonographLabel as="h2" size="sm" className="mb-3 text-ink">
          {t('derivedHeading')}
        </MonographLabel>
        <dl className="flex flex-col gap-1.5 text-[12.5px]">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-2">{t('readingTime')}</dt>
            <dd className="font-mono tabular-nums">{detail.readingMinutes} MIN</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-2">{t('primaryVideo')}</dt>
            <dd className="max-w-[150px] truncate font-mono text-[11px]">
              {detail.primaryVideoUrl ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-2">{t('semester')}</dt>
            <dd className="font-mono tabular-nums">
              {detail.semester ? t('semesterInherited', { semester: detail.semester }) : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="border border-line bg-surface p-4">
        <MonographLabel as="h2" size="sm" className="mb-3 text-ink">
          {t('revisionsHeading', { count: detail.revisions.length })}
        </MonographLabel>
        {detail.revisions.length === 0 ? (
          <p className="text-[12.5px] text-ink-2">{t('noRevisions')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.revisions.map((revision, index) => (
              <li
                key={revision.id}
                className="flex items-center gap-2 border-b border-line pb-2 text-[12.5px] last:border-b-0"
              >
                <span className="font-mono text-[10px] text-ink-2">
                  {detail.revisions.length - index}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {revision.note ?? '—'}
                  {revision.editorUsername ? (
                    <span className="text-ink-2"> · {revision.editorUsername}</span>
                  ) : null}
                </span>
                <span className="font-mono text-[10px] text-ink-2">{fmt(revision.created_at)}</span>
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => openDiff(revision)}
                >
                  {t('viewDiff')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {canManage && detail.revisions.length > 0 ? (
          <p className="mt-3 text-[11px] text-ink-2">{t('restoreHelper')}</p>
        ) : null}
      </section>

      <section className="border border-line bg-surface p-4">
        <MonographLabel as="h2" size="sm" className="mb-3 text-ink">
          {t('historyHeading')}
        </MonographLabel>
        {detail.events.length === 0 ? (
          <p className="text-[12.5px] text-ink-2">{t('noHistory')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-[12px]">
            {detail.events.map((event) => (
              <li key={event.id} className="text-ink-2">
                <span className="font-mono text-[10px] uppercase">{fmt(event.created_at)}</span>{' '}
                <span className="text-ink">{t(`status.${event.to_status}`)}</span>
                {event.actorUsername ? ` · ${event.actorUsername}` : ''}
                {event.comment ? (
                  <span className="block border-s-2 border-line ps-2 text-[11.5px]">
                    {event.comment}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {diff ? (
        <AdminSheet
          open
          wide
          title={t('diffTitle', { date: fmt(diff.revision.created_at) })}
          onClose={() => setDiff(null)}
        >
          <div className="grid max-h-[70vh] gap-0 overflow-y-auto sm:grid-cols-2">
            <div className="border-e border-line p-4">
              <MonographLabel as="div" size="sm" className="mb-3">
                {t('diffRevision')}
              </MonographLabel>
              <RichText content={diff.content} />
            </div>
            <div className="p-4">
              <MonographLabel as="div" size="sm" className="mb-3">
                {t('diffCurrent')}
              </MonographLabel>
              {currentContent ? (
                <RichText content={currentContent} />
              ) : (
                <p className="text-[12px] text-ink-2">{t('invalidContent')}</p>
              )}
            </div>
          </div>
          {canManage ? (
            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <Button
                size="sm"
                pending={pending}
                onClick={() => {
                  run(() => restoreRevision(diff.revision.id), t('toasts.restored'))
                  setDiff(null)
                }}
              >
                {t('restore')}
              </Button>
              <p className="text-[11px] text-ink-2">{t('restoreHelper')}</p>
            </div>
          ) : null}
        </AdminSheet>
      ) : null}
    </aside>
  )
}
