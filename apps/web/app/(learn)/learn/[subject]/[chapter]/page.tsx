import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BlisterCell, BlisterGrid, StateGlyph } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { Crumbs } from '@/app/(learn)/_components/crumbs'
import { semesterCode } from '@/app/(learn)/_lib/format'
import { findChapter, getPublishedTree, resolveLearn301 } from '@/features/content/public-queries'

/*
 * /learn/[subject]/[chapter] — topic grid (M1 §4 · reader spec) plus, since
 * flexible leaves (020), the chapter's direct content pages as a blister
 * list (the topic-overview row treatment) linking the 3-segment reader.
 * ISR anon shell; misses consult slug_history for a permanent redirect
 * before 404ing.
 */
export const revalidate = 3600
export const dynamic = 'force-static'

type Params = Promise<{ subject: string; chapter: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject: subjectSlug, chapter: chapterSlug } = await params
  const tree = await getPublishedTree()
  const found = findChapter(tree, subjectSlug, chapterSlug)
  if (!found) return {}
  const t = await getTranslations('learn.meta')
  return {
    title: { absolute: t('entityTitle', { name: found.chapter.name }) },
    robots: { index: true, follow: true },
    alternates: { canonical: `/learn/${found.subject.slug}/${found.chapter.slug}` },
  }
}

export default async function ChapterPage({ params }: { params: Params }) {
  const { subject: subjectSlug, chapter: chapterSlug } = await params
  const t = await getTranslations('learn')
  // TODO(1.C-3): cacheTag wiring ("use cache" + chapter:{id} tag replaces
  // the time-based revalidate net).
  const tree = await getPublishedTree()
  const found = findChapter(tree, subjectSlug, chapterSlug)
  if (!found) {
    const moved = await resolveLearn301([subjectSlug, chapterSlug])
    if (moved) permanentRedirect(moved)
    notFound()
  }
  const { subject, chapter } = found

  return (
    <div className="mx-auto w-full max-w-content px-5 py-8 sm:px-6 md:px-8 md:py-10">
      <Crumbs
        ariaLabel={t('crumbs.aria')}
        className="mb-4"
        items={[
          { label: t('crumbs.root'), href: '/learn' },
          { label: subject.name, href: `/learn/${subject.slug}` },
          { label: chapter.name },
        ]}
      />

      <h1 className="mb-6 font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">
        {chapter.name}
      </h1>

      {chapter.topics.length > 0 ? (
        <BlisterGrid minCell={320}>
          {chapter.topics.map((topic) => {
            const hasVideo = topic.subtopics.some((subtopic) => subtopic.primary_video_url !== null)
            return (
              <BlisterCell
                key={topic.id}
                href={`/learn/${subject.slug}/${chapter.slug}/${topic.slug}`}
              >
                <span className="flex items-start gap-2.5">
                  {/* Anon: the structural empty glyph — state data lands in 1.D. */}
                  <StateGlyph state="not-started" className="mt-[3px]" />
                  <span className="min-w-0 font-display text-[15px] font-semibold leading-[1.3]">
                    {topic.name}
                  </span>
                </span>
                <span className="mt-3.5 flex flex-wrap items-center gap-1.5">
                  <Chip>{t('units', { count: topic.subtopics.length })}</Chip>
                  {topic.semester != null ? (
                    <Chip>{t('semesterChip', { semester: semesterCode(topic.semester) })}</Chip>
                  ) : null}
                  {hasVideo ? <Chip>{t('chapter.videoChip')}</Chip> : null}
                </span>
              </BlisterCell>
            )
          })}
        </BlisterGrid>
      ) : null}

      {/* Direct content pages (flexible leaves, 020) — the topic-overview
          row treatment, linking the 3-segment reader. */}
      {chapter.leaves.length > 0 ? (
        <section className={chapter.topics.length > 0 ? 'mt-8' : undefined}>
          <h2 className="mb-3 font-display text-[19px] font-bold leading-[1.2]">
            {t('chapter.pagesHeading')}
          </h2>
          <ol className="border border-line bg-surface">
            {chapter.leaves.map((page) => (
              <li key={page.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/learn/${subject.slug}/${chapter.slug}/${page.slug}`}
                  className="grid min-h-12 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-[13px] hover:bg-primary-tint active:bg-primary-tint"
                >
                  {/* Anon: empty glyph; per-user state + stamp land in 1.D. */}
                  <StateGlyph state="not-started" />
                  <span className="truncate text-[14.5px] font-medium">{page.title}</span>
                  <span className="flex items-center gap-1.5">
                    <Chip>{t('topic.minutesChip', { minutes: page.reading_minutes })}</Chip>
                    {page.primary_video_url !== null ? (
                      <Chip>
                        <span aria-hidden>{t('topic.videoChip')}</span>
                        <span className="sr-only">{t('topic.videoChipAria')}</span>
                      </Chip>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
