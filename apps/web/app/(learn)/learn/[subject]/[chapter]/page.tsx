import type { Metadata } from 'next'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { notFound, permanentRedirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BlisterCell, BlisterGrid } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { Crumbs } from '@/app/(learn)/_components/crumbs'
import { CellGlyph, CellStamp, TreeProgressProvider } from '@/app/(learn)/_components/study-tree'
import { semesterCode } from '@/app/(learn)/_lib/format'
import { SITEMAP_TAG, chapterTag } from '@/features/content/cache'
import { findChapter, getPublishedTree, resolveLearn301 } from '@/features/content/public-queries'
import type { PublishedChapter, PublishedSubject } from '@/features/content/public-queries'

/*
 * /learn/[subject]/[chapter] — topic grid (M1 §4 · reader spec) plus, since
 * flexible leaves (020), the chapter's direct content pages as a blister
 * list (the topic-overview row treatment) linking the 3-segment reader.
 * Static anon shell, tag-revalidated (M1 §8); misses consult slug_history
 * for a permanent redirect before 404ing.
 */
export const dynamic = 'force-static'

type Params = Promise<{ subject: string; chapter: string }>

/**
 * Cached chapter subtree (1.C-3): chapter:{id} fires on every mutation of
 * or beneath the chapter, and ancestor renames fire all chapter ids
 * (tags.ts). The sitemap tag covers cached misses — content appears only
 * through a publish, and every publish fires it.
 */
async function loadChapter(
  subjectSlug: string,
  chapterSlug: string,
): Promise<{ subject: PublishedSubject; chapter: PublishedChapter } | null> {
  'use cache'
  cacheLife('max')
  cacheTag(SITEMAP_TAG)
  const tree = await getPublishedTree()
  const found = findChapter(tree, subjectSlug, chapterSlug)
  if (found) cacheTag(chapterTag(found.chapter.id))
  return found
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject: subjectSlug, chapter: chapterSlug } = await params
  const found = await loadChapter(subjectSlug, chapterSlug)
  if (!found) return {}
  const t = await getTranslations('learn.meta')
  const title = t('entityTitle', { name: found.chapter.name })
  const url = `/learn/${found.subject.slug}/${found.chapter.slug}`
  return {
    title: { absolute: title },
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: { title, type: 'website', url },
    twitter: { card: 'summary', title },
  }
}

export default async function ChapterPage({ params }: { params: Params }) {
  const { subject: subjectSlug, chapter: chapterSlug } = await params
  const t = await getTranslations('learn')
  const found = await loadChapter(subjectSlug, chapterSlug)
  if (!found) {
    const moved = await resolveLearn301([subjectSlug, chapterSlug])
    if (moved) permanentRedirect(moved)
    notFound()
  }
  const { subject, chapter } = found

  return (
    <TreeProgressProvider>
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
              const hasVideo = topic.subtopics.some(
                (subtopic) => subtopic.primary_video_url !== null,
              )
              return (
                <BlisterCell
                  key={topic.id}
                  href={`/learn/${subject.slug}/${chapter.slug}/${topic.slug}`}
                >
                  <span className="flex items-start gap-2.5">
                    {/* Anon shell: empty glyph; the aggregate per-user state
                        paints client-side after mount (1.D). */}
                    <CellGlyph
                      ids={topic.subtopics.map((subtopic) => subtopic.id)}
                      className="mt-[3px]"
                    />
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
                    {/* Anon shell: empty glyph; per-user state + stamp paint
                        client-side after mount (1.D). */}
                    <CellGlyph ids={[page.id]} />
                    <span className="truncate text-[14.5px] font-medium">{page.title}</span>
                    <span className="flex items-center gap-1.5">
                      <CellStamp id={page.id} />
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
    </TreeProgressProvider>
  )
}
