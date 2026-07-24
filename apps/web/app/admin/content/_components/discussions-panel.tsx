'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import {
  openDiscussion,
  replyToDiscussion,
  setDiscussionStatus,
} from '@/features/content/discussion-actions'
import type { DiscussionThread } from '@/features/content/queries'
import { BlockSelect } from './block-select'
import type { BlockSelection } from './block-select'

/**
 * Review discussions rail panel + the selection lift (M4 §5.4/§5.5 ·
 * 1.B-3c). DiscussionsWorkspace owns the block-selection state and renders
 * the subtopic page's two-column grid: BlockSelect around the (server-
 * rendered) preview on the left, the panel after the rail sections on the
 * right — the page itself stays a server component. On the EDITOR canvas
 * (authors) block picking is off by design (the canvas DOM is Plate's, not
 * the renderer's); the panel still replies/resolves and shows the hint.
 */

const FLASH_CLASSES = ['outline', 'outline-2', 'outline-warn', 'outline-offset-2']
const FLASH_MS = 1600

export function DiscussionsWorkspace({
  subtopicId,
  threads,
  knownBlockIds,
  selectable,
  preview,
  rail,
}: {
  subtopicId: string
  threads: DiscussionThread[]
  /** Block ids present in the CURRENT document — anything else is MISSING. */
  knownBlockIds: string[]
  /** True when the left pane is the read-only preview (picking works). */
  selectable: boolean
  preview: ReactNode
  rail: ReactNode
}) {
  const [selection, setSelection] = useState<BlockSelection | null>(null)

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        {selectable ? (
          <BlockSelect selectedId={selection?.blockId ?? null} onSelect={setSelection}>
            {preview}
          </BlockSelect>
        ) : (
          preview
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        {rail}
        <DiscussionsPanel
          subtopicId={subtopicId}
          threads={threads}
          knownBlockIds={knownBlockIds}
          selectable={selectable}
          selection={selectable ? selection : null}
          onClearSelection={() => setSelection(null)}
        />
      </div>
    </div>
  )
}

export function DiscussionsPanel({
  subtopicId,
  threads,
  knownBlockIds,
  selectable,
  selection,
  onClearSelection,
}: {
  subtopicId: string
  threads: DiscussionThread[]
  knownBlockIds: string[]
  selectable: boolean
  selection: BlockSelection | null
  onClearSelection: () => void
}) {
  const t = useTranslations('admin.content.discussions')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [kind, setKind] = useState<'comment' | 'suggestion'>('comment')
  const [body, setBody] = useState('')
  const [suggestedText, setSuggestedText] = useState('')

  const known = useMemo(() => new Set(knownBlockIds), [knownBlockIds])
  const openThreads = threads.filter((thread) => thread.status === 'open')
  const resolvedThreads = threads.filter((thread) => thread.status === 'resolved')

  const submit = () => {
    if (!selection) return
    startTransition(async () => {
      const result = await openDiscussion(
        subtopicId,
        selection.blockId,
        selection.snapshot,
        kind,
        body,
        kind === 'suggestion' ? suggestedText : undefined,
      )
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
      } else {
        toast({ title: t('toasts.opened') })
        setBody('')
        setSuggestedText('')
        setKind('comment')
        onClearSelection()
      }
      router.refresh()
    })
  }

  const kindToggleClass = (active: boolean) =>
    `border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
      active ? 'border-primary text-primary' : 'border-line text-ink-2 hover:border-ink'
    }`

  return (
    <section className="border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <MonographLabel as="h2" size="sm" className="text-ink">
          {t('heading')}
        </MonographLabel>
        <span className="border border-primary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] tabular-nums text-primary">
          {t('openCount', { count: openThreads.length })}
        </span>
      </div>

      {selection ? (
        <div className="mb-4 border border-primary p-3">
          <MonographLabel as="div" size="sm" className="mb-1.5">
            {t('selectedBlock')}
          </MonographLabel>
          <blockquote className="mb-2 border-s-2 border-line ps-2 font-mono text-[11px] leading-relaxed text-ink-2">
            {selection.snapshot || '—'}
          </blockquote>
          <div className="mb-2 flex gap-1.5" role="radiogroup" aria-label={t('kindLabel')}>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'comment'}
              className={kindToggleClass(kind === 'comment')}
              onClick={() => setKind('comment')}
            >
              {t('kindComment')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'suggestion'}
              className={kindToggleClass(kind === 'suggestion')}
              onClick={() => setKind('suggestion')}
            >
              {t('kindSuggestion')}
            </button>
          </div>
          {kind === 'suggestion' ? (
            <textarea
              className={`${fieldClass} mb-2 h-auto min-h-14 py-2 font-mono text-[12px]`}
              placeholder={t('suggestionPlaceholder')}
              value={suggestedText}
              maxLength={2000}
              onChange={(event) => setSuggestedText(event.target.value)}
            />
          ) : null}
          <textarea
            className={`${fieldClass} mb-2 h-auto min-h-14 py-2 text-[13px]`}
            placeholder={t('bodyPlaceholder')}
            value={body}
            maxLength={2000}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              pending={pending}
              disabled={!body.trim() || (kind === 'suggestion' && !suggestedText.trim())}
              onClick={submit}
            >
              {kind === 'comment' ? t('openComment') : t('suggestChange')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClearSelection}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-[11px] text-ink-2">{t('selectHint')}</p>
      )}

      {threads.length === 0 ? (
        <p className="text-[12.5px] text-ink-2">{t('empty')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {openThreads.map((thread) => (
              <ThreadCard
                key={thread.id}
                subtopicId={subtopicId}
                thread={thread}
                missing={!known.has(thread.blockId)}
                canJump={selectable && known.has(thread.blockId)}
              />
            ))}
          </div>
          {resolvedThreads.length > 0 ? (
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
                {t('resolvedHeading', { count: resolvedThreads.length })}
              </summary>
              <div className="mt-3 flex flex-col gap-4 opacity-70">
                {resolvedThreads.map((thread) => (
                  <ThreadCard
                    key={thread.id}
                    subtopicId={subtopicId}
                    thread={thread}
                    missing={!known.has(thread.blockId)}
                    canJump={selectable && known.has(thread.blockId)}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
      <p className="mt-3 text-[11px] text-ink-2">{t('helper')}</p>
    </section>
  )
}

function ThreadCard({
  subtopicId,
  thread,
  missing,
  canJump,
}: {
  subtopicId: string
  thread: DiscussionThread
  missing: boolean
  canJump: boolean
}) {
  const t = useTranslations('admin.content.discussions')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState('')

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await work()
      if (!result.ok) {
        toast({ title: result.error ?? '', variant: 'error' })
      } else {
        toast({ title: success })
        setDraft('')
      }
      router.refresh()
    })
  }

  const jump = () => {
    const el = document.querySelector(`[data-block-id="${CSS.escape(thread.blockId)}"]`)
    if (!(el instanceof HTMLElement)) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add(...FLASH_CLASSES)
    window.setTimeout(() => el.classList.remove(...FLASH_CLASSES), FLASH_MS)
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()

  return (
    <article className="border-b border-line pb-3 text-[12.5px] last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
            thread.kind === 'suggestion'
              ? 'border-warn/60 bg-warn/10 text-ink'
              : 'border-line text-ink-2'
          }`}
        >
          {thread.kind === 'suggestion' ? t('kindSuggestion') : t('kindComment')}
        </span>
        <span className="min-w-0 flex-1 truncate text-ink-2">{thread.createdBy ?? '—'}</span>
        <span className="font-mono text-[10px] text-ink-2">{fmt(thread.createdAt)}</span>
      </div>

      <div className="mt-2 flex items-start gap-2">
        <blockquote className="min-w-0 flex-1 border-s-2 border-line ps-2 font-mono text-[11px] leading-relaxed text-ink-2">
          {thread.snapshot ?? '—'}
        </blockquote>
        {missing ? (
          <span className="border border-danger/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-danger">
            {t('missing')}
          </span>
        ) : canJump ? (
          <button
            type="button"
            className="text-[11.5px] text-primary underline-offset-2 hover:underline"
            onClick={jump}
          >
            {t('jump')}
          </button>
        ) : null}
      </div>

      {thread.suggestedText ? (
        <div className="mt-2 border border-warn/60 bg-warn/10 p-2">
          <p className="break-words font-mono text-[12px] leading-relaxed">
            {thread.suggestedText}
          </p>
          <button
            type="button"
            className="mt-1.5 text-[11.5px] text-primary underline-offset-2 hover:underline"
            onClick={() => {
              void navigator.clipboard.writeText(thread.suggestedText ?? '')
              toast({ title: t('copied') })
            }}
          >
            {t('copy')}
          </button>
        </div>
      ) : null}

      {thread.replies.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {thread.replies.map((reply) => (
            <li key={reply.id}>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
                {reply.author ?? '—'} · {fmt(reply.createdAt)}
              </span>
              <p className="whitespace-pre-wrap text-[12.5px]">{reply.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-col gap-2">
        <textarea
          className={`${fieldClass} h-auto min-h-12 py-1.5 text-[12.5px]`}
          placeholder={t('replyPlaceholder')}
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            pending={pending}
            disabled={!draft.trim()}
            onClick={() =>
              run(() => replyToDiscussion(thread.id, subtopicId, draft), t('toasts.replied'))
            }
          >
            {t('reply')}
          </Button>
          {thread.status === 'open' ? (
            <Button
              size="sm"
              variant="ghost"
              pending={pending}
              onClick={() =>
                run(
                  () => setDiscussionStatus(thread.id, subtopicId, 'resolved'),
                  t('toasts.resolved'),
                )
              }
            >
              {t('resolve')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              pending={pending}
              onClick={() =>
                run(() => setDiscussionStatus(thread.id, subtopicId, 'open'), t('toasts.reopened'))
              }
            >
              {t('reopen')}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
