import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Database } from '@epharmatica/database'
import { EVENTS } from '@/lib/observability/events'
import { splitSnippet } from '@/lib/search/snippet'
import { createClient } from '@/lib/supabase/server'

/*
 * /search — published-content search (M1 §5.9 · 1.C-3), inside the (learn)
 * chrome. Naturally dynamic: reading searchParams opts the route out of
 * static rendering (M1 §8 — "/search: dynamic"), no force flags needed.
 * Server-only GET form for now — the 300ms debounced live search and the
 * subject/semester filters are 1.D scope. The RPC is SECURITY INVOKER and
 * published-only (I3): draft text is structurally absent from its
 * search_vector, so nothing gated can surface here.
 */

const MIN_QUERY_LENGTH = 2
const RESULT_LIMIT = 20

/**
 * The RPC row, with the type-generator quirk corrected: nullability is
 * dropped on function-return fields, but topic_slug/topic_name ARE null at
 * runtime for chapter-attached pages (flexible leaves, 020). The generated
 * `string` fields assign into `string | null` losslessly.
 */
type SearchHit = Omit<
  Database['public']['Functions']['search_published']['Returns'][number],
  'topic_slug' | 'topic_name'
> & {
  topic_slug: string | null
  topic_name: string | null
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('learn.search')
  return {
    title: { absolute: t('metaTitle') },
    robots: { index: false },
  }
}

type SearchParams = Promise<{ q?: string | string[] }>

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const raw = Array.isArray(params.q) ? params.q[0] : params.q
  const query = (raw ?? '').trim()
  const t = await getTranslations('learn.search')

  let hits: SearchHit[] = []
  if (query.length >= MIN_QUERY_LENGTH) {
    const supabase = await createClient()
    const { data } = await supabase.rpc('search_published', {
      p_query: query,
      p_limit: RESULT_LIMIT,
    })
    hits = data ?? []
  }

  return (
    <div className="mx-auto w-full max-w-content px-5 py-8 sm:px-6 md:px-8 md:py-10">
      <h1 className="mb-6 font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">
        {t('title')}
      </h1>

      <form action="/search" method="get" className="mb-8 flex max-w-[640px] gap-2">
        <label htmlFor="search-q" className="sr-only">
          {t('inputLabel')}
        </label>
        <input
          id="search-q"
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t('placeholder')}
          minLength={MIN_QUERY_LENGTH}
          className="h-10 w-full min-w-0 flex-1 border border-ink bg-surface px-3 text-[14.5px] outline-offset-2 placeholder:text-ink-2 [@media(pointer:coarse)]:h-11"
        />
        <button
          type="submit"
          data-umami-event={EVENTS.search_performed}
          className="inline-flex h-10 flex-none items-center justify-center whitespace-nowrap border border-primary bg-primary px-[18px] text-[14px] font-medium text-on-primary hover:border-primary-strong hover:bg-primary-strong active:border-primary-strong active:bg-primary-strong [@media(pointer:coarse)]:h-11"
        >
          {t('submit')}
        </button>
      </form>

      {query.length === 0 ? (
        /* Empty query — the centered search prompt state. */
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span aria-hidden className="font-display text-[32px] leading-none text-ink-2">
            ⌕
          </span>
          <p className="max-w-[44ch] text-[14.5px] leading-[1.6] text-ink-2">{t('prompt')}</p>
        </div>
      ) : query.length < MIN_QUERY_LENGTH ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="max-w-[44ch] text-[14.5px] leading-[1.6] text-ink-2">
            {t('minLengthHint')}
          </p>
        </div>
      ) : hits.length === 0 ? (
        /* No results — M1 §5.9 empty state, query echoed. */
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="max-w-[44ch] text-[14.5px] leading-[1.6] text-ink-2">
            {t('noResults', { query })}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-2 tabular-nums">
            {t('resultsCount', { count: hits.length, query })}
          </p>
          <ol className="max-w-[720px] border border-line bg-surface" aria-label={t('resultsAria')}>
            {hits.map((hit) => {
              // Rank order as returned by the RPC. Chapter-attached pages
              // (topic_slug null at runtime) use the 3-segment reader URL.
              const href = hit.topic_slug
                ? `/learn/${hit.subject_slug}/${hit.chapter_slug}/${hit.topic_slug}/${hit.slug}`
                : `/learn/${hit.subject_slug}/${hit.chapter_slug}/${hit.slug}`
              const path =
                hit.topic_name !== null
                  ? t('pathWithTopic', {
                      subject: hit.subject_name,
                      chapter: hit.chapter_name,
                      topic: hit.topic_name,
                    })
                  : t('pathChapter', { subject: hit.subject_name, chapter: hit.chapter_name })
              return (
                <li key={hit.subtopic_id} className="border-b border-line last:border-b-0">
                  <Link
                    href={href}
                    data-umami-event={EVENTS.search_result_clicked}
                    className="block px-4 py-3.5 hover:bg-primary-tint active:bg-primary-tint"
                  >
                    <span className="block font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-2">
                      {path}
                    </span>
                    <span className="mt-1 block font-display text-[15px] font-semibold leading-[1.3]">
                      {hit.title}
                    </span>
                    <span className="mt-1.5 block text-[13px] leading-[1.55] text-ink-2">
                      {/* Sentinel-split highlighting — never raw HTML (I3-adjacent
                          posture: DB output is text, <mark> is ours). */}
                      {splitSnippet(hit.snippet).map((part, index) =>
                        part.hit ? (
                          <mark key={index} className="bg-hl-mint px-0.5 py-px text-ink">
                            {part.text}
                          </mark>
                        ) : (
                          <span key={index}>{part.text}</span>
                        ),
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}
