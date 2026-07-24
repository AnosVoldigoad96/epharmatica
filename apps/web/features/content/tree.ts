import type { Database } from '@epharmatica/database'

/**
 * Content-tree shapes + pure roll-up/path helpers (M4 §5.1 · M1-6).
 * Client-safe: the tree rail and list editors receive this data as props
 * and derive dots/chips with these helpers — roll-ups are computed at read
 * time, never stored (rules.md §5.8).
 */

export type ContentStatus = Database['public']['Enums']['content_status']

export type SubtopicSummary = {
  id: string
  title: string
  slug: string
  status: ContentStatus
  sort_order: number
  updated_at: string
  reading_minutes: number
}

export type TopicNode = {
  id: string
  chapter_id: string
  name: string
  slug: string
  description: string | null
  semester: number | null
  sort_order: number
  updated_at: string
  subtopics: SubtopicSummary[]
}

export type ChapterNode = {
  id: string
  subject_id: string
  name: string
  slug: string
  sort_order: number
  updated_at: string
  topics: TopicNode[]
}

export type SubjectNode = {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  default_semester: number | null
  sort_order: number
  updated_at: string
  chapters: ChapterNode[]
}

export type ContentTree = SubjectNode[]

export type Rollup = { published: number; total: number }

export function topicRollup(topic: TopicNode): Rollup {
  return {
    published: topic.subtopics.filter((subtopic) => subtopic.status === 'published').length,
    total: topic.subtopics.length,
  }
}

export function chapterRollup(chapter: ChapterNode): Rollup {
  return chapter.topics.reduce(
    (acc, topic) => {
      const rollup = topicRollup(topic)
      return { published: acc.published + rollup.published, total: acc.total + rollup.total }
    },
    { published: 0, total: 0 },
  )
}

export function subjectRollup(subject: SubjectNode): Rollup {
  return subject.chapters.reduce(
    (acc, chapter) => {
      const rollup = chapterRollup(chapter)
      return { published: acc.published + rollup.published, total: acc.total + rollup.total }
    },
    { published: 0, total: 0 },
  )
}

/** Tree-rail dot state (M4-1): teal all-published · amber drafts inside · hollow empty. */
export type DotState = 'published' | 'drafts' | 'empty'

export function dotState(rollup: Rollup): DotState {
  if (rollup.total === 0) return 'empty'
  return rollup.published === rollup.total ? 'published' : 'drafts'
}

export function findSubject(tree: ContentTree, id: string): SubjectNode | null {
  return tree.find((subject) => subject.id === id) ?? null
}

export function findChapter(
  tree: ContentTree,
  id: string,
): { subject: SubjectNode; chapter: ChapterNode } | null {
  for (const subject of tree) {
    const chapter = subject.chapters.find((candidate) => candidate.id === id)
    if (chapter) return { subject, chapter }
  }
  return null
}

export function findTopic(
  tree: ContentTree,
  id: string,
): { subject: SubjectNode; chapter: ChapterNode; topic: TopicNode } | null {
  for (const subject of tree) {
    for (const chapter of subject.chapters) {
      const topic = chapter.topics.find((candidate) => candidate.id === id)
      if (topic) return { subject, chapter, topic }
    }
  }
  return null
}

/** Public /learn path for a node — the consequence sheets' URL lines. */
export function learnPath(segments: string[]): string {
  return `/learn/${segments.join('/')}`
}

/** Published subtopic ids under a node — what a move/rename affects. */
export function publishedSubtopicIds(node: SubjectNode | ChapterNode | TopicNode): string[] {
  if ('subtopics' in node) {
    return node.subtopics
      .filter((subtopic) => subtopic.status === 'published')
      .map((subtopic) => subtopic.id)
  }
  if ('topics' in node) {
    return node.topics.flatMap((topic) => publishedSubtopicIds(topic))
  }
  return node.chapters.flatMap((chapter) => publishedSubtopicIds(chapter))
}
