import type { Metadata } from 'next'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { notFound, permanentRedirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { StateGlyph } from '@epharmatica/ui'
import { ButtonLink } from '@/app/(marketing)/_components/button-link'
import { Chip } from '@/app/(marketing)/_components/chip'
import { Crumbs } from '@/app/(learn)/_components/crumbs'
import { Reader, readerPageMetadata } from '@/app/(learn)/_components/reader'
import { semesterCode } from '@/app/(learn)/_lib/format'
import { SITEMAP_TAG, chapterTag, subtopicTag, topicTag } from '@/features/content/cache'
import {
  findTopic,
  getChapterPageReaderPayload,
  getPublishedTree,
  resolveLearn301,
} from '@/features/content/public-queries'
import type {
  PublishedChapter,
  PublishedSubject,
  PublishedTopic,
  ReaderPayload,
} from '@/features/content/public-queries'

/*
 * /learn/[subject]/[chapter]/[topic] — the 3rd segment resolves as a topic
 * OVERVIEW (M1-1: always exists, even for single-subtopic topics; M1 §5.1)
 * OR, since flexible leaves (020), as a chapter-attached content page —
 * rendered through the shared <Reader/>. Topic and page slugs share one
 * chapter namespace (DB-enforced), so the resolution order is safe. Static
 * anon shell, tag-revalidated (M1 §8): progress strip, glyph states, stamps
 * and the bookmark button are signed-in surfaces (1.D) and are omitted
 * here; anon sees the same list with empty glyphs.
 */
export const dynamic = 'force-static'

type Params = Promise<{ subject: string; chapter: string; topic: string }>

/**
 * Cached topic overview (1.C-3): topic:{id} fires on the topic's own
 * mutations, on any subtopic publish/unpublish beneath it, and on ancestor
 * renames (tags.ts). The sitemap tag covers cached misses — every publish
 * fires it.
 */
async function loadTopic(
  subjectSlug: string,
  chapterSlug: string,
  topicSlug: string,
): Promise<{
  subject: PublishedSubject
  chapter: PublishedChapter
  topic: PublishedTopic
} | null> {
  'use cache'
  cacheLife('max')
  cacheTag(SITEMAP_TAG)
  const tree = await getPublishedTree()
  const found = findTopic(tree, subjectSlug, chapterSlug, topicSlug)
  if (found) cacheTag(topicTag(found.topic.id))
  return found
}

/**
 * Cached chapter-page reader payload (1.C-3, flexible leaves 020):
 * subtopic:{id} fires on the page's own publish cycle, chapter:{id} on
 * sibling-page publishes and ancestor renames. Cached ANON payload only —
 * the preview truncation already happened in the data layer (D8/I3), so
 * gated blocks are never stored either.
 */
async function loadChapterPage(
  subject: string,
  chapter: string,
  page: string,
): Promise<ReaderPayload | null> {
  'use cache'
  cacheLife('max')
  cacheTag(SITEMAP_TAG)
  const payload = await getChapterPageReaderPayload(subject, chapter, page, 'anon')
  if (payload) cacheTag(subtopicTag(payload.subtopicId), chapterTag(payload.path.chapter.id))
  return payload
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject: subjectSlug, chapter: chapterSlug, topic: topicSlug } = await params
  const found = await loadTopic(subjectSlug, chapterSlug, topicSlug)
  if (!found) {
    // Chapter-attached page (020): reader metadata over the 3-segment URL.
    const payload = await loadChapterPage(subjectSlug, chapterSlug, topicSlug)
    return readerPageMetadata(payload, `/learn/${subjectSlug}/${chapterSlug}/${topicSlug}`)
  }
  const t = await getTranslations('learn.meta')
  const title = t('entityTitle', { name: found.topic.name })
  const url = `/learn/${found.subject.slug}/${found.chapter.slug}/${found.topic.slug}`
  return {
    title: { absolute: title },
    description: found.topic.description ?? undefined,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: {
      title,
      description: found.topic.description ?? undefined,
      type: 'website',
      url,
    },
    twitter: { card: 'summary', title, description: found.topic.description ?? undefined },
  }
}

export default async function TopicPage({ params }: { params: Params }) {
  const { subject: subjectSlug, chapter: chapterSlug, topic: topicSlug } = await params
  const t = await getTranslations('learn')
  const found = await loadTopic(subjectSlug, chapterSlug, topicSlug)
  if (!found) {
    // Not a topic — try the segment as a chapter-attached page (020).
    const payload = await loadChapterPage(subjectSlug, chapterSlug, topicSlug)
    if (payload) return <Reader payload={payload} />
    const moved = await resolveLearn301([subjectSlug, chapterSlug, topicSlug])
    if (moved) permanentRedirect(moved)
    notFound()
  }
  const { subject, chapter, topic } = found
  const basePath = `/learn/${subject.slug}/${chapter.slug}/${topic.slug}`
  // Continue = first incomplete for the signed-in learner (1.D); anon falls
  // back to the first published subtopic (M1 §5.1).
  const first = topic.subtopics[0]
  const semester = topic.semester ?? subject.default_semester

  return (
    <div className="mx-auto w-full max-w-content px-5 py-8 sm:px-6 md:px-8 md:py-10">
      <Crumbs
        ariaLabel={t('crumbs.aria')}
        className="mb-4"
        items={[
          { label: t('crumbs.root'), href: '/learn' },
          { label: subject.name, href: `/learn/${subject.slug}` },
          { label: chapter.name, href: `/learn/${subject.slug}/${chapter.slug}` },
          { label: topic.name },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">
          {topic.name}
        </h1>
        {semester != null ? (
          <Chip>{t('semesterChip', { semester: semesterCode(semester) })}</Chip>
        ) : null}
      </div>

      {/* Absent description → no paragraph, no placeholder (M1 §9). */}
      {topic.description ? (
        <p className="mb-6 max-w-[56ch] text-[15px] leading-[1.65] text-ink-2">
          {topic.description}
        </p>
      ) : null}

      {first ? (
        <div className="mb-7">
          <ButtonLink href={`${basePath}/${first.slug}`} className="w-full sm:w-auto">
            {t('topic.continue', { title: first.title })}
          </ButtonLink>
        </div>
      ) : null}

      <ol className="border border-line bg-surface" aria-label={t('topic.unitsAria')}>
        {topic.subtopics.map((subtopic) => (
          <li key={subtopic.id} className="border-b border-line last:border-b-0">
            <Link
              href={`${basePath}/${subtopic.slug}`}
              className="grid min-h-12 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-[13px] hover:bg-primary-tint active:bg-primary-tint"
            >
              {/* Anon: empty glyph; per-user state + stamp land in 1.D. */}
              <StateGlyph state="not-started" />
              <span className="truncate text-[14.5px] font-medium">{subtopic.title}</span>
              <span className="flex items-center gap-1.5">
                <Chip>{t('topic.minutesChip', { minutes: subtopic.reading_minutes })}</Chip>
                {subtopic.primary_video_url !== null ? (
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
    </div>
  )
}
