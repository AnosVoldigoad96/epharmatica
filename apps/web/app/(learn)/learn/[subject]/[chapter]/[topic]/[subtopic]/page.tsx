import type { Metadata } from 'next'
import { cacheLife, cacheTag } from 'next/cache'
import { notFound, permanentRedirect } from 'next/navigation'
import { Reader, readerPageMetadata } from '@/app/(learn)/_components/reader'
import { SITEMAP_TAG, subtopicTag, topicTag } from '@/features/content/cache'
import { getReaderPayload, resolveLearn301 } from '@/features/content/public-queries'
import type { ReaderPayload } from '@/features/content/public-queries'

/*
 * READER — /learn/[subject]/[chapter]/[topic]/[subtopic] (M1 §5.2 · reader
 * spec). Static anon shell, tag-revalidated (M1 §8): the server renders
 * exactly the anonymous preview (D8/I3 — truncation happens in the data
 * layer, gated JSON is never serialized here) plus the gate. The render
 * itself is the shared <Reader/> (also behind the 3-segment chapter-page
 * route — flexible leaves, 020).
 */
export const dynamic = 'force-static'

type Params = Promise<{ subject: string; chapter: string; topic: string; subtopic: string }>

/**
 * Cached reader payload (1.C-3): subtopic:{id} fires on the unit's own
 * publish cycle; topic:{id} on any sibling publish (chip nav) and on
 * ancestor renames (tags.ts) — the M1 §8 pair. The sitemap tag covers
 * cached misses; every publish fires it. Cached ANON payload only — the
 * preview truncation already happened in the data layer (D8/I3), so gated
 * blocks are never stored either.
 */
async function loadPayload(
  subject: string,
  chapter: string,
  topic: string,
  subtopic: string,
): Promise<ReaderPayload | null> {
  'use cache'
  cacheLife('max')
  cacheTag(SITEMAP_TAG)
  const payload = await getReaderPayload(subject, chapter, topic, subtopic, 'anon')
  if (payload) {
    cacheTag(
      subtopicTag(payload.subtopicId),
      ...(payload.path.topic ? [topicTag(payload.path.topic.id)] : []),
    )
  }
  return payload
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject, chapter, topic, subtopic } = await params
  const payload = await loadPayload(subject, chapter, topic, subtopic)
  return readerPageMetadata(payload, `/learn/${subject}/${chapter}/${topic}/${subtopic}`)
}

export default async function ReaderPage({ params }: { params: Params }) {
  const { subject, chapter, topic, subtopic } = await params
  const payload = await loadPayload(subject, chapter, topic, subtopic)
  if (!payload) {
    const moved = await resolveLearn301([subject, chapter, topic, subtopic])
    if (moved) permanentRedirect(moved)
    notFound()
  }

  return <Reader payload={payload} />
}
