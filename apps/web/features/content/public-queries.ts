/**
 * Public reader data layer (1.C · M1 §4–§5 · D8/I3). Everything here runs
 * on the request's server client and touches ONLY the published surface —
 * migration 019 revoked the live draft columns from anon at the grant
 * level, and published pages render published_content (the publish
 * snapshot), so a mid-edit draft can never reach a reader.
 *
 * Visibility is the ONE recursive rule (M1-6): a node exists publicly iff
 * it has ≥1 published descendant — enforced by pruning here, never by
 * status flags on parents.
 */
import 'server-only'

import { cache } from 'react'
import { validateContent } from '@epharmatica/editor'
import type { Content } from '@epharmatica/editor'
import { defaultPreviewBlockCount } from '@epharmatica/editor'
import { createClient } from '@/lib/supabase/server'

export type PublishedSubtopicCell = {
  id: string
  title: string
  slug: string
  reading_minutes: number
  primary_video_url: string | null
}

export type PublishedTopic = {
  id: string
  name: string
  slug: string
  description: string | null
  semester: number | null
  subtopics: PublishedSubtopicCell[]
}

export type PublishedChapter = {
  id: string
  name: string
  slug: string
  topics: PublishedTopic[]
}

export type PublishedSubject = {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  default_semester: number | null
  chapters: PublishedChapter[]
}

export type PublishedTree = PublishedSubject[]

/**
 * The published tree, pruned by the M1-6 rule. React-cached per request —
 * every /learn level and the sitemap share one fetch.
 */
export const getPublishedTree = cache(async (): Promise<PublishedTree> => {
  const supabase = await createClient()

  const [subjects, chapters, topics, subtopics] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, name, slug, description, icon, default_semester, sort_order')
      .order('sort_order')
      .order('name'),
    supabase
      .from('chapters')
      .select('id, subject_id, name, slug, sort_order')
      .order('sort_order')
      .order('name'),
    supabase
      .from('topics')
      .select('id, chapter_id, name, slug, description, semester, sort_order')
      .order('sort_order')
      .order('name'),
    supabase
      .from('subtopics')
      .select('id, topic_id, title, slug, reading_minutes, primary_video_url, sort_order')
      .eq('status', 'published')
      .order('sort_order')
      .order('title'),
  ])

  const topicNodes: (PublishedTopic & { chapter_id: string })[] = (topics.data ?? [])
    .map((topic) => ({
      id: topic.id,
      chapter_id: topic.chapter_id,
      name: topic.name,
      slug: topic.slug,
      description: topic.description,
      semester: topic.semester,
      subtopics: (subtopics.data ?? [])
        .filter((subtopic) => subtopic.topic_id === topic.id)
        .map(({ topic_id: _t, sort_order: _s, ...cell }) => cell),
    }))
    .filter((topic) => topic.subtopics.length > 0)

  const chapterNodes: (PublishedChapter & { subject_id: string })[] = (chapters.data ?? [])
    .map((chapter) => ({
      id: chapter.id,
      subject_id: chapter.subject_id,
      name: chapter.name,
      slug: chapter.slug,
      topics: topicNodes
        .filter((topic) => topic.chapter_id === chapter.id)
        .map(({ chapter_id: _c, ...topic }) => topic),
    }))
    .filter((chapter) => chapter.topics.length > 0)

  return (subjects.data ?? [])
    .map((subject) => ({
      id: subject.id,
      name: subject.name,
      slug: subject.slug,
      description: subject.description,
      icon: subject.icon,
      default_semester: subject.default_semester,
      chapters: chapterNodes
        .filter((chapter) => chapter.subject_id === subject.id)
        .map(({ subject_id: _s, ...chapter }) => chapter),
    }))
    .filter((subject) => subject.chapters.length > 0)
})

export function findSubject(tree: PublishedTree, slug: string): PublishedSubject | null {
  return tree.find((subject) => subject.slug === slug) ?? null
}

export function findChapter(
  tree: PublishedTree,
  subjectSlug: string,
  chapterSlug: string,
): { subject: PublishedSubject; chapter: PublishedChapter } | null {
  const subject = findSubject(tree, subjectSlug)
  if (!subject) return null
  const chapter = subject.chapters.find((candidate) => candidate.slug === chapterSlug)
  return chapter ? { subject, chapter } : null
}

export function findTopic(
  tree: PublishedTree,
  subjectSlug: string,
  chapterSlug: string,
  topicSlug: string,
): { subject: PublishedSubject; chapter: PublishedChapter; topic: PublishedTopic } | null {
  const found = findChapter(tree, subjectSlug, chapterSlug)
  if (!found) return null
  const topic = found.chapter.topics.find((candidate) => candidate.slug === topicSlug)
  return topic ? { ...found, topic } : null
}

export type ReaderNeighbor = {
  title: string
  href: string
}

export type ReaderPayload = {
  subtopicId: string
  title: string
  slug: string
  readingMinutes: number
  publishedAt: string | null
  semester: number | null
  path: { subject: PublishedSubject; chapter: PublishedChapter; topic: PublishedTopic }
  /** The blocks this viewer receives — TRUNCATED for anonymous (I3). */
  blocks: Content
  gated: boolean
  totalBlocks: number
  siblings: { title: string; slug: string; href: string; current: boolean }[]
  prev: ReaderNeighbor | null
  next: ReaderNeighbor | null
}

const learnHref = (...segments: string[]) => `/learn/${segments.join('/')}`

/**
 * The reader composition (M1 §5.2): resolves the 4-segment path against
 * the published tree, loads the PUBLISH SNAPSHOT, applies the anonymous
 * preview truncation server-side (D8/I3 — gated blocks are never
 * serialized), and computes chip-nav siblings + prev/next traversal
 * (within topic → next topic's first → next chapter's first → none).
 */
export async function getReaderPayload(
  subjectSlug: string,
  chapterSlug: string,
  topicSlug: string,
  subtopicSlug: string,
  viewer: 'anon' | 'member',
): Promise<ReaderPayload | null> {
  const tree = await getPublishedTree()
  const found = findTopic(tree, subjectSlug, chapterSlug, topicSlug)
  if (!found) return null
  const { subject, chapter, topic } = found

  const cellIndex = topic.subtopics.findIndex((cell) => cell.slug === subtopicSlug)
  if (cellIndex === -1) return null
  const cell = topic.subtopics[cellIndex]
  if (!cell) return null

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('subtopics')
    .select('id, published_content, preview_block_count, published_at, reading_minutes')
    .eq('id', cell.id)
    .eq('status', 'published')
    .maybeSingle()
  if (!row) return null

  const validated = validateContent(row.published_content)
  if (!validated.ok) return null
  const full = validated.content

  const previewCount = Math.min(
    row.preview_block_count ?? defaultPreviewBlockCount(full),
    full.length,
  )
  const gated = viewer === 'anon' && full.length > previewCount
  const blocks = viewer === 'anon' ? full.slice(0, previewCount) : full

  const siblings = topic.subtopics.map((sibling) => ({
    title: sibling.title,
    slug: sibling.slug,
    href: learnHref(subject.slug, chapter.slug, topic.slug, sibling.slug),
    current: sibling.slug === subtopicSlug,
  }))

  // prev/next per M1 §5.2 — published-only by construction of the tree.
  let prev: ReaderNeighbor | null = null
  let next: ReaderNeighbor | null = null

  const prevCell = topic.subtopics[cellIndex - 1]
  if (prevCell) {
    prev = {
      title: prevCell.title,
      href: learnHref(subject.slug, chapter.slug, topic.slug, prevCell.slug),
    }
  }
  const nextCell = topic.subtopics[cellIndex + 1]
  if (nextCell) {
    next = {
      title: nextCell.title,
      href: learnHref(subject.slug, chapter.slug, topic.slug, nextCell.slug),
    }
  } else {
    // Topic end → next topic in the chapter; chapter end → next chapter's
    // first topic (both first-subtopic targets).
    const topicIndex = chapter.topics.findIndex((candidate) => candidate.id === topic.id)
    const nextTopic = chapter.topics[topicIndex + 1]
    if (nextTopic?.subtopics[0]) {
      next = {
        title: nextTopic.subtopics[0].title,
        href: learnHref(subject.slug, chapter.slug, nextTopic.slug, nextTopic.subtopics[0].slug),
      }
    } else {
      const chapterIndex = subject.chapters.findIndex((candidate) => candidate.id === chapter.id)
      const nextChapter = subject.chapters[chapterIndex + 1]
      const firstTopic = nextChapter?.topics[0]
      if (nextChapter && firstTopic?.subtopics[0]) {
        next = {
          title: firstTopic.subtopics[0].title,
          href: learnHref(
            subject.slug,
            nextChapter.slug,
            firstTopic.slug,
            firstTopic.subtopics[0].slug,
          ),
        }
      }
    }
  }
  if (!prev && cellIndex === 0) {
    // Mirror traversal backwards: previous topic's last subtopic, else
    // previous chapter's last topic's last subtopic.
    const topicIndex = chapter.topics.findIndex((candidate) => candidate.id === topic.id)
    const prevTopic = chapter.topics[topicIndex - 1]
    const prevTopicLast = prevTopic?.subtopics[prevTopic.subtopics.length - 1]
    if (prevTopic && prevTopicLast) {
      prev = {
        title: prevTopicLast.title,
        href: learnHref(subject.slug, chapter.slug, prevTopic.slug, prevTopicLast.slug),
      }
    } else {
      const chapterIndex = subject.chapters.findIndex((candidate) => candidate.id === chapter.id)
      const prevChapter = subject.chapters[chapterIndex - 1]
      const lastTopic = prevChapter?.topics[prevChapter.topics.length - 1]
      const lastCell = lastTopic?.subtopics[lastTopic.subtopics.length - 1]
      if (prevChapter && lastTopic && lastCell) {
        prev = {
          title: lastCell.title,
          href: learnHref(subject.slug, prevChapter.slug, lastTopic.slug, lastCell.slug),
        }
      }
    }
  }

  return {
    subtopicId: row.id,
    title: cell.title,
    slug: subtopicSlug,
    readingMinutes: row.reading_minutes,
    publishedAt: row.published_at,
    semester: topic.semester ?? subject.default_semester,
    path: { subject, chapter, topic },
    blocks,
    gated,
    totalBlocks: full.length,
    siblings,
    prev,
    next,
  }
}

/**
 * 301 resolution over slug_history (M1 §4): given the requested segments
 * that missed the current tree, find where that slug USED to live and
 * rebuild today's URL from the entity id. Entity-id rebuilding follows
 * rename/move chains naturally. Returns the new path or null.
 */
export async function resolveLearn301(segments: string[]): Promise<string | null> {
  if (segments.length === 0 || segments.length > 4) return null
  const level = (['subject', 'chapter', 'topic', 'subtopic'] as const)[segments.length - 1]
  if (!level) return null
  const oldSlug = segments[segments.length - 1]
  const parentPath = segments.slice(0, -1).join('/')

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('slug_history')
    .select('entity_id, created_at')
    .eq('level', level)
    .eq('old_slug', oldSlug ?? '')
    .eq('parent_path', parentPath)
    .order('created_at', { ascending: false })
    .limit(1)
  const entityId = rows?.[0]?.entity_id
  if (!entityId) return null

  const tree = await getPublishedTree()
  for (const subject of tree) {
    if (level === 'subject' && subject.id === entityId) return learnHref(subject.slug)
    for (const chapter of subject.chapters) {
      if (level === 'chapter' && chapter.id === entityId) {
        return learnHref(subject.slug, chapter.slug)
      }
      for (const topic of chapter.topics) {
        if (level === 'topic' && topic.id === entityId) {
          return learnHref(subject.slug, chapter.slug, topic.slug)
        }
        if (level === 'subtopic') {
          const cell = topic.subtopics.find((candidate) => candidate.id === entityId)
          if (cell) return learnHref(subject.slug, chapter.slug, topic.slug, cell.slug)
        }
      }
    }
  }
  return null
}
