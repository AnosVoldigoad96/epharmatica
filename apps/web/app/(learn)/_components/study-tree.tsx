'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { Stamp, StateGlyph } from '@epharmatica/ui'
import { ButtonLink } from '@/app/(marketing)/_components/button-link'
import { toggleBookmark } from '@/features/study/actions'
import { getTreeProgress } from '@/features/study/queries'
import { EVENTS, trackEvent } from '@/lib/observability/events'
import { createClient } from '@/lib/supabase/client'

/*
 * Tree-shell personalization (1.D · M1 §5.1). The /learn pages stay STATIC
 * anonymous shells: these client islands render the exact anon markup at
 * build time (empty glyphs, first-unit Continue) and, after mount, fetch
 * the signed-in user's progress ONCE per page via the provider, then paint
 * state glyphs, stamp chips, the topic bookmark toggle, and retarget
 * Continue at the first incomplete published subtopic. Signed-out visitors
 * see zero delta — the provider never fetches without a session.
 */

type TreeProgress = {
  /** subtopic id → completed_at; null until loaded / when anonymous. */
  completed: Record<string, string> | null
  topicBookmarked: boolean
  setTopicBookmarked: (value: boolean) => void
}

const TreeProgressContext = createContext<TreeProgress>({
  completed: null,
  topicBookmarked: false,
  setTopicBookmarked: () => undefined,
})

export function TreeProgressProvider({
  topicId = null,
  children,
}: {
  topicId?: string | null
  children: ReactNode
}) {
  const [completed, setCompleted] = useState<Record<string, string> | null>(null)
  const [topicBookmarked, setTopicBookmarked] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getSession()
        if (!data.session || cancelled) return
        const result = await getTreeProgress(topicId ?? undefined)
        if (cancelled || !result.ok) return
        setCompleted(result.completed)
        setTopicBookmarked(result.topicBookmarked)
      } catch {
        // Env unset / network hiccup: the anon shell stands.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [topicId])

  return (
    <TreeProgressContext.Provider value={{ completed, topicBookmarked, setTopicBookmarked }}>
      {children}
    </TreeProgressContext.Provider>
  )
}

/**
 * Per-cell state glyph: one id = a unit (complete / not started); several
 * ids = an aggregate cell (all → complete, some → in-progress). Renders
 * the anon empty glyph until progress arrives — zero hydration delta.
 */
export function CellGlyph({ ids, className }: { ids: string[]; className?: string }) {
  const { completed } = useContext(TreeProgressContext)
  let state: 'not-started' | 'in-progress' | 'complete' = 'not-started'
  if (completed && ids.length > 0) {
    const done = ids.filter((id) => completed[id] !== undefined).length
    state = done === ids.length ? 'complete' : done > 0 ? 'in-progress' : 'not-started'
  }
  return <StateGlyph state={state} className={className} />
}

/** `COMPLETED · 24 JUL` chip on completed unit cells (M1 §5.1 · STYLE §7.3). */
export function CellStamp({ id }: { id: string }) {
  const t = useTranslations('learn.study')
  const { completed } = useContext(TreeProgressContext)
  const completedAt = completed?.[id]
  if (!completedAt) return null
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(
    new Date(completedAt),
  )
  return <Stamp>{t('stamp', { date })}</Stamp>
}

/**
 * The topic overview's primary action (M1 §5.1): Continue → first
 * incomplete published subtopic, falling back to the first (the anon
 * build-time target). Fires continue_clicked declaratively.
 */
export function ContinueButton({
  units,
  className,
}: {
  units: { id: string; href: string; title: string }[]
  className?: string
}) {
  const t = useTranslations('learn')
  const { completed } = useContext(TreeProgressContext)
  const first = units[0]
  if (!first) return null
  const target = completed
    ? (units.find((unit) => completed[unit.id] === undefined) ?? first)
    : first
  return (
    <ButtonLink href={target.href} umamiEvent={EVENTS.continue_clicked} className={className}>
      {t('topic.continue', { title: target.title })}
    </ButtonLink>
  )
}

/** Topic-level bookmark toggle (M1 §5.7) — topic overview header only;
 * renders nothing for signed-out visitors (no study affordances). */
export function TopicBookmark({ topicId }: { topicId: string }) {
  const t = useTranslations('learn.study')
  const { completed, topicBookmarked, setTopicBookmarked } = useContext(TreeProgressContext)
  const [busy, setBusy] = useState(false)

  const onToggle = useCallback(async () => {
    setBusy(true)
    const result = await toggleBookmark({ targetType: 'topic', targetId: topicId })
    setBusy(false)
    if (!result.ok) return
    setTopicBookmarked(result.bookmarked)
    trackEvent(EVENTS.bookmark_toggled, { target: 'topic' })
  }, [topicId, setTopicBookmarked])

  // completed === null → anonymous or not yet loaded: no affordance.
  if (completed === null) return null

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onToggle()}
      aria-pressed={topicBookmarked}
      className={`inline-flex h-8 items-center gap-1.5 border px-2.5 text-[12.5px] font-medium [@media(pointer:coarse)]:h-11 ${
        topicBookmarked
          ? 'border-primary bg-primary-tint text-primary hover:bg-transparent'
          : 'border-ink bg-transparent text-ink hover:bg-primary-tint'
      }`}
    >
      {topicBookmarked ? (
        <BookmarkCheck size={14} strokeWidth={1.5} aria-hidden />
      ) : (
        <Bookmark size={14} strokeWidth={1.5} aria-hidden />
      )}
      {topicBookmarked ? t('actions.bookmarked') : t('actions.bookmark')}
    </button>
  )
}
