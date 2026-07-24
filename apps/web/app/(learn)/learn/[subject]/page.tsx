import type { Metadata } from 'next'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { notFound, permanentRedirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Chip } from '@/app/(marketing)/_components/chip'
import { Crumbs } from '@/app/(learn)/_components/crumbs'
import { semesterCode } from '@/app/(learn)/_lib/format'
import { SITEMAP_TAG, subjectTag } from '@/features/content/cache'
import { findSubject, getPublishedTree, resolveLearn301 } from '@/features/content/public-queries'
import type { PublishedSubject } from '@/features/content/public-queries'

/*
 * /learn/[subject] — chapter list (M1 §4 · reader spec). Static anon shell,
 * tag-revalidated (M1 §8); misses consult slug_history for a permanent
 * redirect before 404ing.
 */
export const dynamic = 'force-static'

type Params = Promise<{ subject: string }>

/**
 * Cached subject subtree (1.C-3): every mutation beneath a subject fires
 * its slug tag, and renames fire the OLD slug from the pre-mutation tree
 * (tags.ts), so the slug tag is a complete net for this shell. The sitemap
 * tag covers cached misses — a slug that resolves to nothing gains content
 * only through a publish, and every publish fires the sitemap tag.
 */
async function loadSubject(subjectSlug: string): Promise<PublishedSubject | null> {
  'use cache'
  cacheLife('max')
  cacheTag(SITEMAP_TAG, subjectTag(subjectSlug))
  const tree = await getPublishedTree()
  return findSubject(tree, subjectSlug)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject: subjectSlug } = await params
  const subject = await loadSubject(subjectSlug)
  if (!subject) return {}
  const t = await getTranslations('learn.meta')
  const title = t('entityTitle', { name: subject.name })
  return {
    title: { absolute: title },
    description: subject.description ?? undefined,
    robots: { index: true, follow: true },
    alternates: { canonical: `/learn/${subject.slug}` },
    openGraph: {
      title,
      description: subject.description ?? undefined,
      type: 'website',
      url: `/learn/${subject.slug}`,
    },
    twitter: { card: 'summary', title, description: subject.description ?? undefined },
  }
}

export default async function SubjectPage({ params }: { params: Params }) {
  const { subject: subjectSlug } = await params
  const t = await getTranslations('learn')
  const subject = await loadSubject(subjectSlug)
  if (!subject) {
    const moved = await resolveLearn301([subjectSlug])
    if (moved) permanentRedirect(moved)
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-content px-5 py-8 sm:px-6 md:px-8 md:py-10">
      <Crumbs
        ariaLabel={t('crumbs.aria')}
        className="mb-4"
        items={[{ label: t('crumbs.root'), href: '/learn' }, { label: subject.name }]}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">
          {subject.name}
        </h1>
        {subject.default_semester != null ? (
          <Chip>
            {t('subject.defaultSemesterChip', {
              semester: semesterCode(subject.default_semester),
            })}
          </Chip>
        ) : null}
      </div>

      {subject.description ? (
        <p className="mb-7 max-w-[58ch] text-[14.5px] leading-[1.6] text-ink-2">
          {subject.description}
        </p>
      ) : null}

      <ol className="border border-line bg-surface">
        {subject.chapters.map((chapter, index) => {
          // Units = topic subtopics + the chapter's direct pages (020).
          const units =
            chapter.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0) +
            chapter.leaves.length
          return (
            <li key={chapter.id} className="border-b border-line last:border-b-0">
              <Link
                href={`/learn/${subject.slug}/${chapter.slug}`}
                className="group grid grid-cols-[44px_minmax(0,1fr)_auto_24px] items-center gap-x-2 px-[18px] py-3.5 hover:bg-primary-tint active:bg-primary-tint"
              >
                <span className="font-mono text-[11px] font-medium text-ink-2 tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="truncate font-display text-[15px] font-semibold">
                  {chapter.name}
                </span>
                {/* Progress strip is signed-in only (1.D) — anon shows the
                    published unit count alone. */}
                <span className="font-mono text-[11px] text-ink-2 tabular-nums">
                  {t('units', { count: units })}
                </span>
                <span
                  aria-hidden
                  className="text-end text-ink-2 group-hover:text-primary rtl:-scale-x-100"
                >
                  →
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
