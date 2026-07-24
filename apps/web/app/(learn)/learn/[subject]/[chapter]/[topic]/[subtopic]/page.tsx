import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { getTranslations } from 'next-intl/server'
import {
  CALLOUT_VARIANTS,
  DRUG_CARD_FIELD_KEYS,
  RichText,
  getPlainText,
  inlineText,
} from '@epharmatica/editor'
import type {
  CalloutVariant,
  DrugCardFieldKey,
  HeadingBlock,
  RichTextLabels,
  VideoBlock,
} from '@epharmatica/editor'
import { MonographLabel, ReadingBar } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { Crumbs } from '@/app/(learn)/_components/crumbs'
import { semesterCode, updatedDate } from '@/app/(learn)/_lib/format'
import { LiteYouTube } from '@/features/content/components/lite-youtube'
import { MemberUnlock } from '@/features/content/components/member-unlock'
import { getReaderPayload, resolveLearn301 } from '@/features/content/public-queries'

/*
 * READER — /learn/[subject]/[chapter]/[topic]/[subtopic] (M1 §5.2 · reader
 * spec). ISR anon shell: the server renders exactly the anonymous preview
 * (D8/I3 — truncation happens in the data layer, gated JSON is never
 * serialized here) plus the gate. <MemberUnlock/> swaps the gate for the
 * remaining blocks client-side after the server action re-verifies the
 * session. Study tools / action bars are 1.D.
 */
export const revalidate = 3600
export const dynamic = 'force-static'

type Params = Promise<{ subject: string; chapter: string; topic: string; subtopic: string }>

// Request-scoped dedupe: generateMetadata and the page share one payload.
const loadPayload = cache(
  async (subject: string, chapter: string, topic: string, subtopic: string) =>
    // TODO(1.C-3): cacheTag wiring ("use cache" + subtopic:{id} + topic:{id}
    // tags replaces the time-based revalidate net).
    getReaderPayload(subject, chapter, topic, subtopic, 'anon'),
)

const chipLinkBase =
  'inline-flex flex-none items-center whitespace-nowrap border px-[9px] py-1 font-mono text-[11px] uppercase leading-[14px] tracking-[.05em] [@media(pointer:coarse)]:py-3.5'

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject, chapter, topic, subtopic } = await params
  const payload = await loadPayload(subject, chapter, topic, subtopic)
  if (!payload) return {}
  const t = await getTranslations('learn.meta')
  // SEO derives from title + preview text ONLY (M1 §5.4) — payload.blocks is
  // already the anonymous preview.
  const previewText = getPlainText(payload.blocks).replace(/\s+/g, ' ').trim()
  const description =
    previewText.length > 160 ? `${previewText.slice(0, 157).trimEnd()}…` : previewText
  return {
    title: { absolute: t('entityTitle', { name: payload.title }) },
    description: description || undefined,
    robots: { index: true, follow: true },
    alternates: { canonical: `/learn/${subject}/${chapter}/${topic}/${subtopic}` },
  }
}

export default async function ReaderPage({ params }: { params: Params }) {
  const { subject, chapter, topic, subtopic } = await params
  const t = await getTranslations('learn')
  const payload = await loadPayload(subject, chapter, topic, subtopic)
  if (!payload) {
    const moved = await resolveLearn301([subject, chapter, topic, subtopic])
    if (moved) permanentRedirect(moved)
    notFound()
  }

  const path = payload.path
  const currentPath = `/learn/${path.subject.slug}/${path.chapter.slug}/${path.topic.slug}/${payload.slug}`
  const unitIndex = payload.siblings.findIndex((sibling) => sibling.current) + 1

  const headings = payload.blocks
    .filter((block): block is HeadingBlock => block.type === 'h2' || block.type === 'h3')
    .map((block) => ({
      id: `h-${block.id}`,
      text: inlineText(block.children),
      sub: block.type === 'h3',
    }))

  const richTextLabels: RichTextLabels = {
    callouts: Object.fromEntries(
      CALLOUT_VARIANTS.map((variant) => [variant, t(`reader.callouts.${variant}`)]),
    ) as Record<CalloutVariant, string>,
    drugCardFields: Object.fromEntries(
      DRUG_CARD_FIELD_KEYS.map((key) => [key, t(`reader.drugCardFields.${key}`)]),
    ) as Record<DrugCardFieldKey, string>,
    toc: t('reader.tocAria'),
  }

  const playLabel = t('reader.playVideo')
  const ReaderVideo = ({ block }: { block: VideoBlock }) => (
    <LiteYouTube url={block.url} title={inlineText(block.caption)} playLabel={playLabel} />
  )

  const reportHref = `mailto:support@epharmatica.com?subject=${encodeURIComponent(
    t('reader.reportIssueSubject', { title: payload.title }),
  )}`

  const tocLinks = (
    <ul className="space-y-2">
      {headings.map((heading) => (
        <li key={heading.id} className={heading.sub ? 'ps-3' : undefined}>
          <a
            href={`#${heading.id}`}
            className="block text-[13px] leading-[1.4] text-ink-2 hover:text-primary hover:underline"
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <>
      <ReadingBar />

      {/* Breadcrumb strip: crumbs + spacer + unit-position chip */}
      <div className="border-b border-line">
        <div className="mx-auto flex w-full max-w-content items-center gap-3 px-5 py-3 sm:px-6 md:px-8">
          <Crumbs
            ariaLabel={t('crumbs.aria')}
            className="min-w-0"
            items={[
              { label: t('crumbs.root'), href: '/learn' },
              { label: path.subject.name, href: `/learn/${path.subject.slug}` },
              {
                label: path.chapter.name,
                href: `/learn/${path.subject.slug}/${path.chapter.slug}`,
              },
              {
                label: path.topic.name,
                href: `/learn/${path.subject.slug}/${path.chapter.slug}/${path.topic.slug}`,
              },
            ]}
          />
          <span className="flex-1" />
          <Chip className="max-sm:hidden">
            {t('reader.unitChip', { index: unitIndex, total: payload.siblings.length })}
          </Chip>
        </div>
      </div>

      {/* Mobile: collapsible ON THIS PAGE bar (the rail carries it ≥md) */}
      {headings.length > 0 ? (
        <details className="border-b border-line md:hidden">
          <summary className="mx-auto flex min-h-11 w-full max-w-content cursor-pointer list-none items-center gap-2 px-5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-2 sm:px-6 [&::-webkit-details-marker]:hidden">
            {t('reader.onThisPage')} <span aria-hidden>▾</span>
          </summary>
          <div className="mx-auto w-full max-w-content px-5 pb-4 sm:px-6">{tocLinks}</div>
        </details>
      ) : null}

      <div className="mx-auto w-full max-w-content md:grid md:grid-cols-[minmax(0,1fr)_264px]">
        {/* ── Content column ─────────────────────────────────────────── */}
        <div className="px-5 pb-12 pt-6 sm:px-6 md:pb-10 md:pe-12 md:ps-8 md:pt-8">
          {/* Chip sub-nav of published siblings (current = primary) */}
          <nav aria-label={t('reader.siblingsAria')} className="-mx-5 mb-7 sm:-mx-6 md:mx-0">
            <ul className="flex gap-1.5 overflow-x-auto px-5 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] sm:px-6 md:flex-wrap md:px-0 md:[mask-image:none]">
              {payload.siblings.map((sibling) => (
                <li key={sibling.slug} className="flex-none">
                  <Link
                    href={sibling.href}
                    aria-current={sibling.current ? 'page' : undefined}
                    className={`${chipLinkBase} ${
                      sibling.current
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-line bg-surface text-ink-2 hover:border-ink hover:text-ink active:border-ink active:text-ink'
                    }`}
                  >
                    {sibling.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-[640px]">
            {/* Monograph title block */}
            <MonographLabel as="div" rule="hard" className="mb-4">
              {t('reader.topicLabel', { name: path.topic.name })}
            </MonographLabel>
            <h1 className="mb-4 font-display text-[23px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[32px]">
              {payload.title}
            </h1>
            <div className="mb-8 flex flex-wrap items-center gap-1.5">
              <Chip>{t('reader.minutesChip', { minutes: payload.readingMinutes })}</Chip>
              {payload.publishedAt ? (
                <Chip>{t('reader.updatedChip', { date: updatedDate(payload.publishedAt) })}</Chip>
              ) : null}
              {payload.semester != null ? (
                <Chip>{t('semesterChip', { semester: semesterCode(payload.semester) })}</Chip>
              ) : null}
            </div>

            {/* The anonymous preview (server-truncated, D8/I3) */}
            <div className="text-[16px] leading-[1.65]">
              <RichText
                content={payload.blocks}
                components={{ video: ReaderVideo }}
                labels={richTextLabels}
              />
            </div>

            {/* Gate + member unlock — only when the shell is truncated */}
            {payload.gated ? (
              <MemberUnlock
                subtopicId={payload.subtopicId}
                previewCount={payload.blocks.length}
                nextPath={currentPath}
                labels={{
                  gateLabel: t('gate.label'),
                  benefits: [
                    t('gate.benefitFullContent'),
                    t('gate.benefitStudyTools'),
                    t('gate.benefitProgress'),
                  ],
                  createAccount: t('gate.createAccount'),
                  signIn: t('gate.signIn'),
                  playVideo: playLabel,
                }}
                richTextLabels={richTextLabels}
              />
            ) : null}

            {/* Medical-disclaimer obligation (M1): minimal mailto for 1.C */}
            <p className="mt-8">
              <a
                href={reportHref}
                className="font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-2 underline underline-offset-2 hover:text-primary"
              >
                {t('reader.reportIssue')}
              </a>
            </p>

            {/* Prev/next pair — published-only traversal (M1 §5.2) */}
            {payload.prev || payload.next ? (
              <nav
                aria-label={t('reader.pagerAria')}
                className="mt-8 grid border border-ink sm:grid-cols-2"
              >
                {payload.prev ? (
                  <Link
                    href={payload.prev.href}
                    className="group block p-4 hover:bg-primary-tint active:bg-primary-tint"
                  >
                    <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-2">
                      {t('reader.previous')}
                    </span>
                    <span className="mt-1 block font-display text-[14px] font-semibold group-hover:text-primary">
                      {payload.prev.title}
                    </span>
                  </Link>
                ) : (
                  <span aria-hidden className="hidden sm:block" />
                )}
                {payload.next ? (
                  <Link
                    href={payload.next.href}
                    className={`group block p-4 text-end hover:bg-primary-tint active:bg-primary-tint ${
                      payload.prev ? 'border-t border-line sm:border-s sm:border-t-0' : ''
                    }`}
                  >
                    <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-2">
                      {t('reader.next')}
                    </span>
                    <span className="mt-1 block font-display text-[14px] font-semibold group-hover:text-primary">
                      {payload.next.title}
                    </span>
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>

        {/* ── Right rail: ON THIS PAGE (study-tool actions land in 1.D) ── */}
        <aside className="hidden border-s border-line md:block">
          {headings.length > 0 ? (
            <nav aria-label={t('reader.onThisPage')} className="sticky top-20 p-[28px_24px]">
              <MonographLabel as="div" size="sm" rule="hard" className="mb-3">
                {t('reader.onThisPage')}
              </MonographLabel>
              {tocLinks}
            </nav>
          ) : null}
        </aside>
      </div>
    </>
  )
}
