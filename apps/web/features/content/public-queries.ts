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
// Cookie-less anon client throughout: this module renders inside static
// shells and `use cache` scopes (1.C-3), where `cookies()` is forbidden —
// and everything here is the anonymous published surface anyway.
import { createAnonClient } from '@/lib/supabase/server'

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
  /** Published pages attached DIRECTLY to the chapter (flexible leaves, 020). */
  leaves: PublishedSubtopicCell[]
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
  const supabase = createAnonClient()

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
      .select(
        'id, topic_id, chapter_id, title, slug, reading_minutes, primary_video_url, sort_order',
      )
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
        .map(({ topic_id: _t, chapter_id: _c, sort_order: _s, ...cell }) => cell),
    }))
    .filter((topic) => topic.subtopics.length > 0)

  // A chapter is visible with published topics OR published direct leaves
  // (flexible leaves, 020) — still the one M1-6 rule, pruned at read time.
  const chapterNodes: (PublishedChapter & { subject_id: string })[] = (chapters.data ?? [])
    .map((chapter) => ({
      id: chapter.id,
      subject_id: chapter.subject_id,
      name: chapter.name,
      slug: chapter.slug,
      topics: topicNodes
        .filter((topic) => topic.chapter_id === chapter.id)
        .map(({ chapter_id: _c, ...topic }) => topic),
      leaves: (subtopics.data ?? [])
        .filter((subtopic) => subtopic.chapter_id === chapter.id)
        .map(({ topic_id: _t, chapter_id: _c, sort_order: _s, ...cell }) => cell),
    }))
    .filter((chapter) => chapter.topics.length > 0 || chapter.leaves.length > 0)

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

/** A chapter-attached page (flexible leaves, 020) — the 3-segment reader. */
export function findChapterPage(
  tree: PublishedTree,
  subjectSlug: string,
  chapterSlug: string,
  pageSlug: string,
): { subject: PublishedSubject; chapter: PublishedChapter; page: PublishedSubtopicCell } | null {
  const found = findChapter(tree, subjectSlug, chapterSlug)
  if (!found) return null
  const page = found.chapter.leaves.find((candidate) => candidate.slug === pageSlug)
  return page ? { ...found, page } : null
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
  /** topic is null for chapter-attached pages (flexible leaves, 020). */
  path: { subject: PublishedSubject; chapter: PublishedChapter; topic: PublishedTopic | null }
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
 * The publish-snapshot load both readers share: published row only, schema
 * validation, and the server-side anonymous truncation (D8/I3 — gated
 * blocks are never serialized).
 */
async function loadPublishedSnapshot(cellId: string, viewer: 'anon' | 'member') {
  const supabase = createAnonClient()
  const { data: row } = await supabase
    .from('subtopics')
    .select('id, published_content, preview_block_count, published_at, reading_minutes')
    .eq('id', cellId)
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
  return { row, blocks, gated, totalBlocks: full.length }
}

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

  const snapshot = await loadPublishedSnapshot(cell.id, viewer)
  if (!snapshot) return null

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
    subtopicId: snapshot.row.id,
    title: cell.title,
    slug: subtopicSlug,
    readingMinutes: snapshot.row.reading_minutes,
    publishedAt: snapshot.row.published_at,
    semester: topic.semester ?? subject.default_semester,
    path: { subject, chapter, topic },
    blocks: snapshot.blocks,
    gated: snapshot.gated,
    totalBlocks: snapshot.totalBlocks,
    siblings,
    prev,
    next,
  }
}

/**
 * The chapter-page reader (flexible leaves, 020): resolves the 3-segment
 * path /learn/[subject]/[chapter]/[page] against the chapter's direct
 * leaves. Siblings are the chapter's OTHER pages; prev/next traverse the
 * chapter's pages sequence only (founder memo — never interleaved with the
 * chapter's topics). Same snapshot + anonymous truncation as the 4-segment
 * reader.
 */
export async function getChapterPageReaderPayload(
  subjectSlug: string,
  chapterSlug: string,
  pageSlug: string,
  viewer: 'anon' | 'member',
): Promise<ReaderPayload | null> {
  const tree = await getPublishedTree()
  const found = findChapterPage(tree, subjectSlug, chapterSlug, pageSlug)
  if (!found) return null
  const { subject, chapter, page } = found

  const snapshot = await loadPublishedSnapshot(page.id, viewer)
  if (!snapshot) return null

  const cellIndex = chapter.leaves.findIndex((cell) => cell.id === page.id)
  const siblings = chapter.leaves.map((sibling) => ({
    title: sibling.title,
    slug: sibling.slug,
    href: learnHref(subject.slug, chapter.slug, sibling.slug),
    current: sibling.slug === pageSlug,
  }))

  const prevCell = chapter.leaves[cellIndex - 1]
  const nextCell = chapter.leaves[cellIndex + 1]

  return {
    subtopicId: snapshot.row.id,
    title: page.title,
    slug: pageSlug,
    readingMinutes: snapshot.row.reading_minutes,
    publishedAt: snapshot.row.published_at,
    semester: subject.default_semester,
    path: { subject, chapter, topic: null },
    blocks: snapshot.blocks,
    gated: snapshot.gated,
    totalBlocks: snapshot.totalBlocks,
    siblings,
    prev: prevCell
      ? { title: prevCell.title, href: learnHref(subject.slug, chapter.slug, prevCell.slug) }
      : null,
    next: nextCell
      ? { title: nextCell.title, href: learnHref(subject.slug, chapter.slug, nextCell.slug) }
      : null,
  }
}

type SlugHistoryLevel = 'subject' | 'chapter' | 'topic' | 'subtopic'

/** Latest slug_history hit for (level, old slug, parent path) — or null. */
async function slugHistoryEntityId(
  level: SlugHistoryLevel,
  oldSlug: string,
  parentPath: string,
): Promise<string | null> {
  const supabase = createAnonClient()
  const { data: rows } = await supabase
    .from('slug_history')
    .select('entity_id, created_at')
    .eq('level', level)
    .eq('old_slug', oldSlug)
    .eq('parent_path', parentPath)
    .order('created_at', { ascending: false })
    .limit(1)
  return rows?.[0]?.entity_id ?? null
}

/**
 * Today's URL for an entity id — the rebuild half of the 301. Subtopics may
 * live under a topic (4 segments) or directly under a chapter (3 segments,
 * flexible leaves 020) — the walk covers both.
 */
async function currentLearnHref(level: SlugHistoryLevel, entityId: string): Promise<string | null> {
  const tree = await getPublishedTree()
  for (const subject of tree) {
    if (level === 'subject' && subject.id === entityId) return learnHref(subject.slug)
    for (const chapter of subject.chapters) {
      if (level === 'chapter' && chapter.id === entityId) {
        return learnHref(subject.slug, chapter.slug)
      }
      if (level === 'subtopic') {
        const leaf = chapter.leaves.find((candidate) => candidate.id === entityId)
        if (leaf) return learnHref(subject.slug, chapter.slug, leaf.slug)
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

/**
 * 301 resolution over slug_history (M1 §4): given the requested segments
 * that missed the current tree, find where that slug USED to live and
 * rebuild today's URL from the entity id. Entity-id rebuilding follows
 * rename/move chains naturally. Returns the new path or null.
 *
 * A 3-segment miss is ambiguous under flexible leaves (020): the tail was
 * either a chapter-attached page OR a topic sharing the same 2-segment
 * parent path — the page is tried first, then the topic.
 */
export async function resolveLearn301(segments: string[]): Promise<string | null> {
  if (segments.length === 0 || segments.length > 4) return null
  const oldSlug = segments[segments.length - 1] ?? ''
  const parentPath = segments.slice(0, -1).join('/')

  const levels: SlugHistoryLevel[] =
    segments.length === 3
      ? ['subtopic', 'topic']
      : [(['subject', 'chapter', 'topic', 'subtopic'] as const)[segments.length - 1] ?? 'subject']

  for (const level of levels) {
    const entityId = await slugHistoryEntityId(level, oldSlug, parentPath)
    if (!entityId) continue
    const href = await currentLearnHref(level, entityId)
    if (href) return href
  }
  return null
}
