import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { MonographLabel, ProgressStrip } from '@epharmatica/ui'
import { ButtonLink } from '@/app/(marketing)/_components/button-link'
import { Chip } from '@/app/(marketing)/_components/chip'
import { getDashboard } from '@/features/study/dashboard-queries'
import type { DashboardHighlight, DashboardNote } from '@/features/study/dashboard-queries'
import { EVENTS } from '@/lib/observability/events'
import { BookmarksList } from './_components/bookmarks-list'
import { ColorDot } from './_components/color-dot'

/*
 * /dashboard (dev-plan §1.D · M1 §5.5/§5.7/§5.8): the learner's signed-in
 * home inside the (account) shell — the layout already forced dynamic
 * rendering, the session, the completed profile and the AAL step-up, so
 * this page just fans out ONE read (getDashboard) and renders. Sections:
 * Continue studying (last_visited ⨯ the published tree), Progress by
 * subject (read-time roll-ups — no counters), Recent highlights & notes
 * (jump links are plain reader links — the reader has no block-hash
 * scroll target), Bookmarks (client island for the remove affordance).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account.meta.dashboard')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

const SNAPSHOT_PREVIEW_LENGTH = 140

function preview(text: string): string {
  return text.length > SNAPSHOT_PREVIEW_LENGTH
    ? `${text.slice(0, SNAPSHOT_PREVIEW_LENGTH - 1)}…`
    : text
}

function TargetLink({
  target,
  fallback,
}: {
  target: DashboardHighlight['target']
  fallback: string
}) {
  if (!target) {
    return <span className="text-[12.5px] italic text-ink-2">{fallback}</span>
  }
  return (
    <Link
      href={target.href}
      className="truncate text-[12.5px] font-medium text-ink underline decoration-line underline-offset-2 hover:text-primary"
    >
      {target.title}
    </Link>
  )
}

export default async function DashboardPage() {
  const t = await getTranslations('account.dashboard')
  const data = await getDashboard()
  // The (account) layout redirects signed-out visitors before this renders.
  if (!data) return null

  const highlightRow = (highlight: DashboardHighlight) => (
    <li key={highlight.id} className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="mb-1.5 flex items-center gap-2">
        <ColorDot color={highlight.color} />
        {highlight.orphaned ? <Chip variant="warn">{t('orphanChip')}</Chip> : null}
        <span className="ms-auto font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2">
          {t('daysAgo', { days: highlight.daysAgo })}
        </span>
      </div>
      <p className="mb-1 text-[13px] italic leading-[1.5] text-ink-2">
        “{preview(highlight.snapshot)}”
      </p>
      <TargetLink target={highlight.target} fallback={t('unavailable')} />
    </li>
  )

  const noteRow = (note: DashboardNote) => (
    <li key={note.id} className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="mb-1.5 flex items-center gap-2">
        <Chip>{note.attached ? t('noteAttached') : t('noteFree')}</Chip>
        <span className="ms-auto font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2">
          {t('daysAgo', { days: note.daysAgo })}
        </span>
      </div>
      <p className="mb-1 whitespace-pre-wrap text-[13.5px] leading-[1.55]">{note.excerpt}</p>
      <TargetLink target={note.target} fallback={t('unavailable')} />
    </li>
  )

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-9 px-5 py-8 sm:px-6 md:px-8 md:py-10">
      <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">
        {t('title')}
      </h1>

      {/* ── Continue studying ─────────────────────────────────────── */}
      <section>
        <MonographLabel as="h2" rule="hard" className="mb-4">
          {t('continueLabel')}
        </MonographLabel>
        {data.continueStudying ? (
          <div className="border border-line bg-surface p-5">
            <MonographLabel as="div" size="sm" className="mb-1.5">
              {data.continueStudying.breadcrumb.join(' › ')}
            </MonographLabel>
            <p className="mb-3 text-[17px] font-semibold leading-[1.3]">
              {data.continueStudying.title}
            </p>
            <ProgressStrip units={data.continueStudying.strip} className="mb-4" />
            <ButtonLink
              href={data.continueStudying.href}
              size="sm"
              umamiEvent={EVENTS.continue_clicked}
            >
              {t('resume')}
            </ButtonLink>
          </div>
        ) : (
          <div className="border border-line bg-surface p-5">
            <p className="mb-4 text-[13.5px] leading-[1.6] text-ink-2">{t('emptyContinueBody')}</p>
            <ButtonLink href="/learn" size="sm">
              {t('startStudying')}
            </ButtonLink>
          </div>
        )}
      </section>

      {/* ── Progress by subject (roll-ups at read time — M1 §5.8) ─── */}
      <section>
        <MonographLabel as="h2" rule="hard" className="mb-4">
          {t('progressLabel')}
        </MonographLabel>
        {data.subjects.length === 0 ? (
          <p className="text-[13px] leading-[1.5] text-ink-2">{t('progressEmpty')}</p>
        ) : (
          <ul className="border border-line bg-surface">
            {data.subjects.map((subject) => (
              <li key={subject.id} className="border-b border-line px-4 py-3.5 last:border-b-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Link
                    href={subject.href}
                    className="truncate text-[14.5px] font-medium text-ink hover:text-primary"
                  >
                    {subject.name}
                  </Link>
                  <Chip className="flex-none">
                    {t('progressCounter', {
                      completed: subject.completed,
                      published: subject.published,
                    })}
                  </Chip>
                </div>
                <ProgressStrip
                  units={subject.units}
                  label={t('progressStripAria', {
                    completed: subject.completed,
                    published: subject.published,
                  })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Recent highlights & notes ─────────────────────────────── */}
      <div className="grid gap-9 lg:grid-cols-2 lg:gap-8">
        <section className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
            <MonographLabel as="h2" className="text-ink">
              {t('highlightsLabel')}
            </MonographLabel>
            <Link
              href="/dashboard/highlights"
              className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 underline underline-offset-2 hover:text-primary"
            >
              {t('viewAllHighlights')}
            </Link>
          </div>
          {data.recentHighlights.length === 0 ? (
            <p className="mt-4 text-[13px] leading-[1.5] text-ink-2">{t('highlightsEmpty')}</p>
          ) : (
            <ul className="mt-4 border border-line bg-surface">
              {data.recentHighlights.map(highlightRow)}
            </ul>
          )}
        </section>

        <section className="min-w-0">
          <MonographLabel as="h2" rule="hard" className="mb-4">
            {t('notesLabel')}
          </MonographLabel>
          {data.recentNotes.length === 0 ? (
            <p className="text-[13px] leading-[1.5] text-ink-2">{t('notesEmpty')}</p>
          ) : (
            <ul className="border border-line bg-surface">{data.recentNotes.map(noteRow)}</ul>
          )}
        </section>
      </div>

      {/* ── Bookmarks (M1 §5.7 — grouped by subject, state glyphs) ── */}
      <section>
        <MonographLabel as="h2" rule="hard" className="mb-4">
          {t('bookmarksLabel')}
        </MonographLabel>
        <BookmarksList groups={data.bookmarkGroups} />
      </section>
    </div>
  )
}
