'use server'

import { createClient } from '@/lib/supabase/server'
import {
  anchorSchema,
  idSchema,
  type StudyHighlight,
  type StudyNote,
  type StudyState,
} from './anchor-schema'
import { readHighlightKindsFlag } from './flag'
import { noteDocToText } from './note-doc'

/*
 * Study-state reads (1.D). The /learn shells are static anonymous pages —
 * ALL personalization arrives through these server actions after mount,
 * on the user's cookie-bound client under owner-only RLS. Each action is
 * ONE client round trip; the server fans out its queries in parallel.
 */

export type StudyStateResult = { ok: true; state: StudyState } | { ok: false }

export type TreeProgressResult =
  | {
      ok: true
      /** subtopic id → completed_at ISO. */
      completed: Record<string, string>
      /** Only meaningful when a topicId was passed. */
      topicBookmarked: boolean
    }
  | { ok: false }

async function requireUser() {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return null
    return { supabase, userId: data.user.id }
  } catch {
    return null
  }
}

/**
 * Everything the reader's study layer needs, in one round trip:
 * highlights (+ attached notes), free notes, bookmark state, completion,
 * and the server-read `highlight_kinds` flag (R-M1).
 */
export async function getStudyState(input: unknown): Promise<StudyStateResult> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false }

  const session = await requireUser()
  if (!session) return { ok: false }
  const { supabase } = session
  const subtopicId = parsed.data

  const [highlightRows, noteRows, bookmarkRow, progressRow, flag] = await Promise.all([
    supabase
      .from('highlights')
      .select('id, color, anchor, text_snapshot, moved, orphaned, created_at')
      .eq('subtopic_id', subtopicId)
      .order('created_at'),
    supabase
      .from('user_notes')
      .select('id, highlight_id, content, updated_at')
      .eq('subtopic_id', subtopicId)
      .order('created_at'),
    supabase
      .from('bookmarks')
      .select('id')
      .eq('target_type', 'subtopic')
      .eq('target_id', subtopicId)
      .maybeSingle(),
    supabase.from('progress').select('completed_at').eq('subtopic_id', subtopicId).maybeSingle(),
    readHighlightKindsFlag(supabase),
  ])

  const notes: StudyNote[] = (noteRows.data ?? []).map((row) => ({
    id: row.id,
    text: noteDocToText(row.content),
    highlightId: row.highlight_id,
    updatedAt: row.updated_at,
  }))
  const notesByHighlight = new Map<string, StudyNote>()
  for (const note of notes) {
    if (note.highlightId && !notesByHighlight.has(note.highlightId)) {
      notesByHighlight.set(note.highlightId, note)
    }
  }

  const highlights: StudyHighlight[] = (highlightRows.data ?? []).map((row) => {
    const anchor = anchorSchema.safeParse(row.anchor)
    return {
      id: row.id,
      color: row.color,
      anchor: anchor.success ? anchor.data : null,
      textSnapshot: row.text_snapshot,
      moved: row.moved,
      orphaned: row.orphaned,
      createdAt: row.created_at,
      note: notesByHighlight.get(row.id) ?? null,
    }
  })

  return {
    ok: true,
    state: {
      highlights,
      freeNotes: notes.filter((note) => note.highlightId === null),
      bookmarked: Boolean(bookmarkRow.data),
      completedAt: progressRow.data?.completed_at ?? null,
      highlightsEnabled: flag.enabled,
      allowedKinds: flag.kinds,
    },
  }
}

/**
 * Per-user progress for the tree shells' glyphs + Continue target (M1
 * §5.1): every completed subtopic id for the current user (owner RLS makes
 * the unfiltered select self-scoping), plus the topic bookmark state when
 * a topic id is supplied (topic overview header toggle).
 */
export async function getTreeProgress(input?: unknown): Promise<TreeProgressResult> {
  const parsedTopic = input == null ? null : idSchema.safeParse(input)
  const topicId = parsedTopic?.success ? parsedTopic.data : null

  const session = await requireUser()
  if (!session) return { ok: false }
  const { supabase } = session

  const [progressRows, bookmarkRow] = await Promise.all([
    supabase.from('progress').select('subtopic_id, completed_at'),
    topicId
      ? supabase
          .from('bookmarks')
          .select('id')
          .eq('target_type', 'topic')
          .eq('target_id', topicId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const completed: Record<string, string> = {}
  for (const row of progressRows.data ?? []) {
    completed[row.subtopic_id] = row.completed_at
  }

  return { ok: true, completed, topicBookmarked: Boolean(bookmarkRow.data) }
}
