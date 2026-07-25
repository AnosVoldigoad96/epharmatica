import type { MetadataRoute } from 'next'
import { cacheLife, cacheTag } from 'next/cache'
import { SITEMAP_TAG } from '@/features/content/cache'
import { getPublishedTree } from '@/features/content/public-queries'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://epharmatica.com'

/** Landing + the six legal/info routes (dev-plan 0.E). */
const ROUTES = [
  '/',
  '/about',
  '/contact',
  '/terms',
  '/privacy',
  '/content-policy',
  '/medical-disclaimer',
] as const

/**
 * Published /learn URLs (1.C-3 · M1 §5.10 — published only, by
 * construction of the pruned tree): /learn, subject, chapter, topic
 * overview, the 4-segment reader, and the 3-segment chapter-page reader
 * (flexible leaves, 020). Cached under the sitemap tag — every
 * publish/unpublish/move/rename fires it (tags.ts), so the sitemap
 * refreshes with the shells, no time net needed.
 */
async function learnRoutes(): Promise<string[]> {
  'use cache'
  cacheLife('max')
  cacheTag(SITEMAP_TAG)
  const tree = await getPublishedTree()
  const routes: string[] = ['/learn']
  for (const subject of tree) {
    routes.push(`/learn/${subject.slug}`)
    for (const chapter of subject.chapters) {
      routes.push(`/learn/${subject.slug}/${chapter.slug}`)
      for (const page of chapter.leaves) {
        routes.push(`/learn/${subject.slug}/${chapter.slug}/${page.slug}`)
      }
      for (const topic of chapter.topics) {
        routes.push(`/learn/${subject.slug}/${chapter.slug}/${topic.slug}`)
        for (const subtopic of topic.subtopics) {
          routes.push(`/learn/${subject.slug}/${chapter.slug}/${topic.slug}/${subtopic.slug}`)
        }
      }
    }
  }
  return routes
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()

  // Pre-launch reader lock (see proxy.ts): while /learn is super_admin-only,
  // its URLs stay out of the sitemap so crawlers never learn them. Flips
  // open with the same READER_PUBLIC=true launch env.
  const readerRoutes = process.env.READER_PUBLIC === 'true' ? await learnRoutes() : []

  return [
    ...ROUTES.map((route): MetadataRoute.Sitemap[number] => ({
      url: new URL(route, SITE_URL).toString(),
      lastModified,
      changeFrequency: route === '/' ? 'weekly' : 'monthly',
      priority: route === '/' ? 1 : 0.4,
    })),
    ...readerRoutes.map((route): MetadataRoute.Sitemap[number] => ({
      url: new URL(route, SITE_URL).toString(),
      lastModified,
      changeFrequency: 'weekly',
      priority: route === '/learn' ? 0.8 : 0.6,
    })),
  ]
}
