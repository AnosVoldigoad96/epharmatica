import type { Metadata } from 'next'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { BlisterCell, BlisterGrid } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { semesterCode } from '@/app/(learn)/_lib/format'
import { SITEMAP_TAG, chapterTag, subjectTag, topicTag } from '@/features/content/cache'
import { getPublishedTree } from '@/features/content/public-queries'
import type { PublishedTree } from '@/features/content/public-queries'

/*
 * /learn — subject index (M1 §4 · reader spec). Static anon shell: the page
 * renders the published tree for everyone; nothing here reads cookies.
 * force-static keeps the route a build-time shell; freshness is tag-driven
 * (M1 §8) — publish/unpublish/move/rename fire the tags below and purge it.
 */
export const dynamic = 'force-static'

/**
 * Cached published tree for the index (1.C-3): tagged with every rendered
 * node — any mutation beneath any subject fires one of these (tags.ts) —
 * plus the sitemap tag, which every publish fires, so brand-new subjects
 * (whose tags can't be known in advance) still appear without a time net.
 */
async function loadTree(): Promise<PublishedTree> {
  'use cache'
  cacheLife('max')
  const tree = await getPublishedTree()
  cacheTag(
    SITEMAP_TAG,
    ...tree.map((subject) => subjectTag(subject.slug)),
    ...tree.flatMap((subject) => subject.chapters.map((chapter) => chapterTag(chapter.id))),
    ...tree.flatMap((subject) =>
      subject.chapters.flatMap((chapter) => chapter.topics.map((topic) => topicTag(topic.id))),
    ),
  )
  return tree
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('learn.meta')
  return {
    title: { absolute: t('indexTitle') },
    robots: { index: true, follow: true },
    alternates: { canonical: '/learn' },
    openGraph: { title: t('indexTitle'), type: 'website', url: '/learn' },
    twitter: { card: 'summary', title: t('indexTitle') },
  }
}

export default async function LearnIndexPage() {
  const t = await getTranslations('learn')
  const tree = await loadTree()

  // Units = topic subtopics + chapters' direct pages (flexible leaves, 020).
  const unitCount = tree.reduce(
    (sum, subject) =>
      sum +
      subject.chapters.reduce(
        (chapterSum, chapter) =>
          chapterSum +
          chapter.leaves.length +
          chapter.topics.reduce((topicSum, topic) => topicSum + topic.subtopics.length, 0),
        0,
      ),
    0,
  )

  return (
    <div className="mx-auto w-full max-w-content px-5 py-8 sm:px-6 md:px-8 md:py-10">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 md:mb-8">
        <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">
          {t('index.title')}
        </h1>
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-2 tabular-nums">
          {t('index.counter', { subjects: tree.length, units: unitCount })}
        </span>
        <span className="flex-1" />
        {/* Plain link so the hub stays static — /search is the dynamic route. */}
        <Link
          href="/search"
          className="inline-block whitespace-nowrap border border-ink bg-surface px-[9px] py-1 font-mono text-[11px] uppercase leading-[14px] tracking-[.05em] text-ink hover:bg-primary-tint active:bg-primary-tint"
        >
          {t('index.searchCta')} <span aria-hidden>⌕</span>
        </Link>
        {/* Non-functional in this slice — semester filtering wires up in 1.C-2. */}
        <Chip variant="ink">
          {t('index.semesterFilter')} <span aria-hidden>▾</span>
        </Chip>
      </div>

      {tree.length > 0 ? (
        <BlisterGrid minCell={460}>
          {tree.map((subject) => (
            <BlisterCell key={subject.id} href={`/learn/${subject.slug}`} className="p-[22px]!">
              <span className="flex items-start gap-3.5">
                <span
                  aria-hidden
                  className="flex size-[38px] flex-none items-center justify-center border border-primary bg-primary-tint font-mono text-[13px] font-medium uppercase tracking-[0.05em] text-primary-strong"
                >
                  {subject.icon ?? subject.name.slice(0, 2)}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[17px] font-semibold leading-[1.25]">
                    {subject.name}
                  </span>
                  {subject.description ? (
                    <span className="mt-1 block truncate text-[12.5px] leading-[1.5] text-ink-2">
                      {subject.description}
                    </span>
                  ) : null}
                </span>
              </span>
              {/* Row 2 — progress strip + % are signed-in only (1.D); anon
                  shows the semester chip alone. */}
              {subject.default_semester != null ? (
                <span className="mt-4 flex items-center justify-end">
                  <Chip>
                    {t('semesterChip', { semester: semesterCode(subject.default_semester) })}
                  </Chip>
                </span>
              ) : null}
            </BlisterCell>
          ))}
        </BlisterGrid>
      ) : null}
    </div>
  )
}
