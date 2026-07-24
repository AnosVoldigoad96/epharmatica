/**
 * Cache-tag invalidation for content mutations (ARCHITECTURE §6 map) and
 * the re-anchor hand-off (M1 §5.5). Tags are the source of truth; the
 * public reader (1.C-3) subscribes to them via `use cache` + cacheTag in
 * the /learn pages and the sitemap.
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

/*
 * Tag NAMES (ARCH §6 / M1 §8) — one builder per level, shared by both sides
 * of the contract: revalidateContentTags fires them, and the public reader's
 * `use cache` scopes subscribe via cacheTag (1.C-3). Never build these
 * strings anywhere else.
 */
export const subjectTag = (slug: string) => `subject:${slug}`
export const chapterTag = (id: string) => `chapter:${id}`
export const topicTag = (id: string) => `topic:${id}`
export const subtopicTag = (id: string) => `subtopic:${id}`
export const SITEMAP_TAG = 'sitemap'

// Next 16 signature: the cache-life profile is required. Content pages are
// 'max' — cached until a mutation explicitly fires their tag (ARCH §6).
export function revalidateContentTags(scope: ContentTagScope): void {
  for (const slug of scope.subjectSlugs ?? []) revalidateTag(subjectTag(slug), 'max')
  for (const id of scope.chapterIds ?? []) revalidateTag(chapterTag(id), 'max')
  for (const id of scope.topicIds ?? []) revalidateTag(topicTag(id), 'max')
  for (const id of scope.subtopicIds ?? []) revalidateTag(subtopicTag(id), 'max')
  if (scope.sitemap) revalidateTag(SITEMAP_TAG, 'max')
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
