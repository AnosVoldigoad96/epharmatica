import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { BlisterCell, BlisterGrid } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { semesterCode } from '@/app/(learn)/_lib/format'
import { getPublishedTree } from '@/features/content/public-queries'

/*
 * /learn — subject index (M1 §4 · reader spec). ISR anon shell: the page
 * renders the published tree for everyone; nothing here reads cookies.
 * force-static keeps the shared server client's cookie jar empty (the anon
 * client) instead of tipping the route dynamic.
 */
export const revalidate = 3600
export const dynamic = 'force-static'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('learn.meta')
  return {
    title: { absolute: t('indexTitle') },
    robots: { index: true, follow: true },
    alternates: { canonical: '/learn' },
  }
}

export default async function LearnIndexPage() {
  const t = await getTranslations('learn')
  // TODO(1.C-3): cacheTag wiring ("use cache" + subject/chapter/topic tags
  // replaces the time-based revalidate net).
  const tree = await getPublishedTree()

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
