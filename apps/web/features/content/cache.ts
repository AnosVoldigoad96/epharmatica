/**
 * Cache-tag invalidation for content mutations (ARCHITECTURE §6 map) and
 * the re-anchor hand-off (M1 §5.5). Tags are the source of truth; the
 * public reader (1.C) subscribes to them — firing them before it exists is
 * a correct no-op.
 */
import 'server-only'

import { revalidateTag } from 'next/cache'

export type ContentTagScope = {
  subjectSlugs?: string[]
  chapterIds?: string[]
  topicIds?: string[]
  subtopicIds?: string[]
  sitemap?: boolean
}

// Next 16 signature: the cache-life profile is required. Content pages are
// 'max' — cached until a mutation explicitly fires their tag (ARCH §6).
export function revalidateContentTags(scope: ContentTagScope): void {
  for (const slug of scope.subjectSlugs ?? []) revalidateTag(`subject:${slug}`, 'max')
  for (const id of scope.chapterIds ?? []) revalidateTag(`chapter:${id}`, 'max')
  for (const id of scope.topicIds ?? []) revalidateTag(`topic:${id}`, 'max')
  for (const id of scope.subtopicIds ?? []) revalidateTag(`subtopic:${id}`, 'max')
  if (scope.sitemap) revalidateTag('sitemap', 'max')
}

/**
 * Re-anchor hand-off for moved published subtopics (M4 §5.3 → M1 §5.5).
 * The job itself is 1.D's post-publish machinery (exact-keep → re-path →
 * move → orphan, per-block-kind fixtures); until it lands this records
 * nothing — highlights cannot exist before the public reader (1.C) ships.
 * TODO(1.D): replace with the real enqueue when the re-anchor job lands.
 */
export function enqueueReanchor(_subtopicIds: string[]): void {
  // Intentionally empty — see TODO above.
}
