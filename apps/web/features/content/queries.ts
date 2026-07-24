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

export type StaffDirectoryEntry = {
  id: string
  username: string
  display_name: string
  role: string
}

/** Staff-only directory (definer RPC, 014) for claim chips + bylines. */
export const getStaffDirectory = cache(async (): Promise<Map<string, StaffDirectoryEntry>> => {
  const supabase = await createClient()
  const { data } = await supabase.rpc('staff_directory')
  return new Map((data ?? []).map((entry) => [entry.id, entry]))
})

export type ReviewQueueEntry = {
  subtopicId: string
  title: string
  subjectName: string
  topicName: string
  /** When it entered in_review (latest such event) — the age-chip clock. */
  waitingSince: string
  /** Whole days in review, computed at read time (amber past 7, M4 §5.6). */
  waitingDays: number
  claimedBy: { id: string; username: string } | null
}

/**
 * The open review queue (M4-2 §5.6): all in_review subtopics, oldest
 * first. Age counts from the latest in_review transition event.
 */
export async function getReviewQueue(): Promise<ReviewQueueEntry[]> {
  const supabase = await createClient()
  const tree = await getContentTree()
  const staff = await getStaffDirectory()

  const inReview: Omit<ReviewQueueEntry, 'waitingSince' | 'waitingDays' | 'claimedBy'>[] = []
  for (const subject of tree) {
    for (const chapter of subject.chapters) {
      for (const topic of chapter.topics) {
        for (const subtopic of topic.subtopics) {
          if (subtopic.status === 'in_review') {
            inReview.push({
              subtopicId: subtopic.id,
              title: subtopic.title,
              subjectName: subject.name,
              topicName: topic.name,
            })
          }
        }
      }
    }
  }
  if (inReview.length === 0) return []

  const ids = inReview.map((entry) => entry.subtopicId)
  const [eventsResult, claimsResult] = await Promise.all([
    supabase
      .from('content_review_events')
      .select('subtopic_id, created_at')
      .in('subtopic_id', ids)
      .eq('to_status', 'in_review')
      .order('created_at', { ascending: false }),
    supabase
      .from('review_claims')
      .select('subtopic_id, reviewer_id')
      .in('subtopic_id', ids)
      .is('released_at', null),
  ])

  const enteredAt = new Map<string, string>()
  for (const event of eventsResult.data ?? []) {
    if (!enteredAt.has(event.subtopic_id)) enteredAt.set(event.subtopic_id, event.created_at)
  }
  const claims = new Map<string, string>()
  for (const claim of claimsResult.data ?? []) {
    claims.set(claim.subtopic_id, claim.reviewer_id)
  }

  const nowMs = Date.now()
  return inReview
    .map((entry) => {
      const reviewerId = claims.get(entry.subtopicId)
      const reviewer = reviewerId ? staff.get(reviewerId) : undefined
      const waitingSince = enteredAt.get(entry.subtopicId) ?? new Date(nowMs).toISOString()
      return {
        ...entry,
        waitingSince,
        waitingDays: Math.max(0, Math.floor((nowMs - Date.parse(waitingSince)) / 86_400_000)),
        claimedBy:
          reviewerId !== undefined ? { id: reviewerId, username: reviewer?.username ?? '—' } : null,
      }
    })
    .sort((a, b) => a.waitingSince.localeCompare(b.waitingSince))
}

export type RevisionSummary = {
  id: string
  note: string | null
  created_at: string
  editorUsername: string | null
}

export type ReviewEventSummary = {
  id: string
  from_status: string | null
  to_status: string
  comment: string | null
  created_at: string
  actorUsername: string | null
}

export type SubtopicDetail = {
  id: string
  title: string
  slug: string
  status: string
  content: unknown
  reading_minutes: number
  primary_video_url: string | null
  preview_block_count: number | null
  published_at: string | null
  updated_at: string
  path: { subjectName: string; chapterName: string; topicName: string; semester: number | null }
  revisions: RevisionSummary[]
  events: ReviewEventSummary[]
  claimedBy: { id: string; username: string } | null
}

/** Everything the subtopic workflow page needs (staff reads under RLS). */
export async function getSubtopicDetail(id: string): Promise<SubtopicDetail | null> {
  const supabase = await createClient()
  const [tree, staff] = await Promise.all([getContentTree(), getStaffDirectory()])

  const { data: row } = await supabase
    .from('subtopics')
    .select(
      'id, title, slug, status, content, reading_minutes, primary_video_url, preview_block_count, published_at, updated_at, topic_id',
    )
    .eq('id', id)
    .maybeSingle()
  if (!row) return null

  let path: SubtopicDetail['path'] | null = null
  for (const subject of tree) {
    for (const chapter of subject.chapters) {
      for (const topic of chapter.topics) {
        if (topic.id === row.topic_id) {
          path = {
            subjectName: subject.name,
            chapterName: chapter.name,
            topicName: topic.name,
            semester: topic.semester ?? subject.default_semester,
          }
        }
      }
    }
  }
  if (!path) return null

  const [revisionsResult, eventsResult, claimResult] = await Promise.all([
    supabase
      .from('content_revisions')
      .select('id, note, editor_id, created_at')
      .eq('subtopic_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('content_review_events')
      .select('id, from_status, to_status, comment, actor_id, created_at')
      .eq('subtopic_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('review_claims')
      .select('reviewer_id')
      .eq('subtopic_id', id)
      .is('released_at', null)
      .maybeSingle(),
  ])

  return {
    ...row,
    path,
    revisions: (revisionsResult.data ?? []).map((revision) => ({
      id: revision.id,
      note: revision.note,
      created_at: revision.created_at,
      editorUsername: revision.editor_id ? (staff.get(revision.editor_id)?.username ?? null) : null,
    })),
    events: (eventsResult.data ?? []).map((event) => ({
      id: event.id,
      from_status: event.from_status,
      to_status: event.to_status,
      comment: event.comment,
      created_at: event.created_at,
      actorUsername: event.actor_id ? (staff.get(event.actor_id)?.username ?? null) : null,
    })),
    claimedBy: claimResult.data
      ? {
          id: claimResult.data.reviewer_id,
          username: staff.get(claimResult.data.reviewer_id)?.username ?? '—',
        }
      : null,
  }
}

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
