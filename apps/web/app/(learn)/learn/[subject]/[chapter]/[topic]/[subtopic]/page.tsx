import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { Reader, readerPageMetadata } from '@/app/(learn)/_components/reader'
import { getReaderPayload, resolveLearn301 } from '@/features/content/public-queries'

/*
 * READER — /learn/[subject]/[chapter]/[topic]/[subtopic] (M1 §5.2 · reader
 * spec). ISR anon shell: the server renders exactly the anonymous preview
 * (D8/I3 — truncation happens in the data layer, gated JSON is never
 * serialized here) plus the gate. The render itself is the shared <Reader/>
 * (also behind the 3-segment chapter-page route — flexible leaves, 020).
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
