/**
 * Content-tree reads for the CMS (M4 §5.1 · dev-plan 1.B-2). RSC-only,
 * on the staff member's cookie-bound client — RLS is the authority
 * (subtopics_staff_read covers drafts; parents are public rows). The
 * public reader's queries (preview gate, I3) land with 1.C in this same
 * slice — keep them separate from these staff reads.
 */
import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { ContentTree } from './tree'

/**
 * The whole tree with subtopic summaries — powers the rail AND the list
 * editors (content volume is small by design; roll-ups compute at read
 * time). React-cached so layout + page share one fetch per request.
 */
export const getContentTree = cache(async (): Promise<ContentTree> => {
  const supabase = await createClient()

  const [subjects, chapters, topics, subtopics] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, name, slug, description, icon, default_semester, sort_order, updated_at')
      .order('sort_order')
      .order('name'),
    supabase
      .from('chapters')
      .select('id, subject_id, name, slug, sort_order, updated_at')
      .order('sort_order')
      .order('name'),
    supabase
      .from('topics')
      .select('id, chapter_id, name, slug, description, semester, sort_order, updated_at')
      .order('sort_order')
      .order('name'),
    supabase
      .from('subtopics')
      .select('id, topic_id, title, slug, status, sort_order, updated_at, reading_minutes')
      .order('sort_order')
      .order('title'),
  ])

  const topicNodes = (topics.data ?? []).map((topic) => ({
    ...topic,
    subtopics: (subtopics.data ?? [])
      .filter((subtopic) => subtopic.topic_id === topic.id)
      .map(({ topic_id: _topicId, ...subtopic }) => subtopic),
  }))

  const chapterNodes = (chapters.data ?? []).map((chapter) => ({
    ...chapter,
    topics: topicNodes.filter((topic) => topic.chapter_id === chapter.id),
  }))

  return (subjects.data ?? []).map((subject) => ({
    ...subject,
    chapters: chapterNodes.filter((chapter) => chapter.subject_id === subject.id),
  }))
})
