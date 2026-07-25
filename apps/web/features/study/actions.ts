'use server'

import { getTranslations } from 'next-intl/server'
import type { Json } from '@epharmatica/database'
import { createClient } from '@/lib/supabase/server'
import {
  createHighlightSchema,
  createNoteSchema,
  idSchema,
  restoreOrphanSchema,
  setProgressSchema,
  toggleBookmarkSchema,
  updateColorSchema,
  updateNoteSchema,
} from './anchor-schema'
import { readHighlightKindsFlag } from './flag'
import { textToNoteDoc } from './note-doc'

/*
 * Study-layer server actions (1.D · M1 §5.5–§5.8). Account/auth
 * conventions throughout: discriminated-union results, never throw to the
 * client, copy via getTranslations, zod validation on every input. All
 * writes run on the user's OWN cookie-bound server client under the
 * owner-only RLS policies (migration 006) — zero service-role usage, and
 * NO withAudit: these are user actions, not staff mutations (I8 covers
 * admin surfaces only). Umami events fire from the CLIENT after a
 * successful result (lib/observability/events.ts).
 */

export type StudyActionResult = { ok: true } | { ok: false; error: string }

export type CreateHighlightResult =
  { ok: true; id: string; noteId: string | null } | { ok: false; error: string }

export type ToggleBookmarkResult = { ok: true; bookmarked: boolean } | { ok: false; error: string }

export type SetProgressResult =
  { ok: true; completedAt: string | null } | { ok: false; error: string }

export type CreateNoteResult = { ok: true; id: string } | { ok: false; error: string }

type Failure = { ok: false; error: string }

async function fail(key: 'notSignedIn' | 'saveFailed' | 'notFound' | 'disabled' | 'noteExists') {
  const t = await getTranslations('learn.study.errors')
  return { ok: false, error: t(key) } satisfies Failure
}

/** The signed-in user's id, or null — server-verified (auth.getUser). */
async function requireUser() {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return null
    return { supabase, userId: data.user.id }
  } catch {
    // Supabase env unset — behave as signed out.
    return null
  }
}

/**
 * Create a highlight — plain (popover → color dot) or with its note in ONE
 * transaction (popover → Note), via the SECURITY INVOKER RPC
 * `create_highlight_with_note` (M1 §5.6 atomic pair; owner RLS authorizes).
 * The `highlight_kinds` flag is re-checked server-side (R-M1).
 */
export async function createHighlight(input: unknown): Promise<CreateHighlightResult> {
  const parsed = createHighlightSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')
  const { supabase } = session

  const flag = await readHighlightKindsFlag(supabase)
  if (!flag.enabled || !flag.kinds.includes(parsed.data.anchor.kind)) {
    return fail('disabled')
  }

  const { data: highlightId, error } = await supabase.rpc('create_highlight_with_note', {
    p_subtopic_id: parsed.data.subtopicId,
    p_anchor: parsed.data.anchor as unknown as Json,
    p_color: parsed.data.color,
    ...(parsed.data.note !== undefined
      ? { p_note_content: textToNoteDoc(parsed.data.note) as unknown as Json }
      : {}),
  })
  if (error || !highlightId) return fail('saveFailed')

  let noteId: string | null = null
  if (parsed.data.note !== undefined) {
    const { data: noteRow } = await supabase
      .from('user_notes')
      .select('id')
      .eq('highlight_id', highlightId)
      .maybeSingle()
    noteId = noteRow?.id ?? null
  }
  return { ok: true, id: highlightId, noteId }
}

/**
 * Delete a highlight. Its attached note cascades server-side (FK ON DELETE
 * CASCADE, migration 006) — the UI asks ONCE ("deletes the note too") and
 * one call removes both (M1 §5.6).
 */
export async function deleteHighlight(input: unknown): Promise<StudyActionResult> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')

  const { error } = await session.supabase.from('highlights').delete().eq('id', parsed.data)
  if (error) return fail('saveFailed')
  return { ok: true }
}

export async function updateHighlightColor(input: unknown): Promise<StudyActionResult> {
  const parsed = updateColorSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')

  const { error } = await session.supabase
    .from('highlights')
    .update({ color: parsed.data.color })
    .eq('id', parsed.data.highlightId)
  if (error) return fail('saveFailed')
  return { ok: true }
}

/**
 * Restore an orphaned highlight from a FRESH selection (M1 §5.5): the
 * owner re-selects the text, the new v:1 anchor replaces the stale one,
 * orphaned/moved clear. Owner RLS scopes the update.
 */
export async function restoreOrphan(input: unknown): Promise<StudyActionResult> {
  const parsed = restoreOrphanSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')

  const { error } = await session.supabase
    .from('highlights')
    .update({
      anchor: parsed.data.anchor as unknown as Json,
      text_snapshot: parsed.data.anchor.snapshot,
      orphaned: false,
      moved: false,
    })
    .eq('id', parsed.data.highlightId)
  if (error) return fail('saveFailed')
  return { ok: true }
}

/**
 * Create a note — free (drawer → Add note) or attached to an EXISTING
 * highlight (glyph path: highlight first, note later). The atomic
 * highlight+note pair goes through createHighlight instead (M1 §5.6).
 */
export async function createNote(input: unknown): Promise<CreateNoteResult> {
  const parsed = createNoteSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')
  const { supabase, userId } = session

  if (parsed.data.highlightId) {
    // The highlight must be the caller's own (RLS-scoped read) and carry
    // no note yet — one note per highlight on this surface.
    const { data: highlight } = await supabase
      .from('highlights')
      .select('id')
      .eq('id', parsed.data.highlightId)
      .maybeSingle()
    if (!highlight) return fail('notFound')
    const { data: existing } = await supabase
      .from('user_notes')
      .select('id')
      .eq('highlight_id', parsed.data.highlightId)
      .maybeSingle()
    if (existing) return fail('noteExists')
  }

  const { data, error } = await supabase
    .from('user_notes')
    .insert({
      user_id: userId,
      subtopic_id: parsed.data.subtopicId,
      highlight_id: parsed.data.highlightId ?? null,
      content: textToNoteDoc(parsed.data.text) as unknown as Json,
    })
    .select('id')
    .single()
  if (error || !data) return fail('saveFailed')
  return { ok: true, id: data.id }
}

export async function updateNote(input: unknown): Promise<StudyActionResult> {
  const parsed = updateNoteSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')

  const { error } = await session.supabase
    .from('user_notes')
    .update({ content: textToNoteDoc(parsed.data.text) as unknown as Json })
    .eq('id', parsed.data.noteId)
  if (error) return fail('saveFailed')
  return { ok: true }
}

export async function deleteNote(input: unknown): Promise<StudyActionResult> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')

  const { error } = await session.supabase.from('user_notes').delete().eq('id', parsed.data)
  if (error) return fail('saveFailed')
  return { ok: true }
}

/**
 * Toggle a subtopic/topic bookmark (M1 §5.7). The unique constraint makes
 * concurrent taps safe: a duplicate insert reads as "already bookmarked".
 */
export async function toggleBookmark(input: unknown): Promise<ToggleBookmarkResult> {
  const parsed = toggleBookmarkSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')
  const { supabase, userId } = session

  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('target_type', parsed.data.targetType)
    .eq('target_id', parsed.data.targetId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('bookmarks').delete().eq('id', existing.id)
    if (error) return fail('saveFailed')
    return { ok: true, bookmarked: false }
  }

  const { error } = await supabase.from('bookmarks').insert({
    user_id: userId,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
  })
  if (error && error.code !== '23505') return fail('saveFailed')
  return { ok: true, bookmarked: true }
}

/**
 * Mark/unmark complete (M1 §5.8) — idempotent by construction: marking
 * upserts against the unique (user, subtopic) constraint with DO NOTHING,
 * unmarking deletes whatever exists. Concurrent taps land safely (M1 §9).
 */
export async function setProgress(input: unknown): Promise<SetProgressResult> {
  const parsed = setProgressSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')
  const { supabase, userId } = session

  if (!parsed.data.completed) {
    const { error } = await supabase
      .from('progress')
      .delete()
      .eq('subtopic_id', parsed.data.subtopicId)
    if (error) return fail('saveFailed')
    return { ok: true, completedAt: null }
  }

  const { data, error } = await supabase
    .from('progress')
    .upsert(
      { user_id: userId, subtopic_id: parsed.data.subtopicId },
      { onConflict: 'user_id,subtopic_id', ignoreDuplicates: true },
    )
    .select('completed_at')
    .maybeSingle()
  if (error) return fail('saveFailed')
  if (data?.completed_at) return { ok: true, completedAt: data.completed_at }

  // Duplicate insert (already complete) returns no row — read the stamp date.
  const { data: row } = await supabase
    .from('progress')
    .select('completed_at')
    .eq('subtopic_id', parsed.data.subtopicId)
    .maybeSingle()
  return { ok: true, completedAt: row?.completed_at ?? new Date().toISOString() }
}

/**
 * "Continue where you left off" source (M1 §5.2): one row per user, upsert
 * on reader open. Fire-and-forget from the layer — failures are silent.
 */
export async function touchLastVisited(input: unknown): Promise<StudyActionResult> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('saveFailed')

  const session = await requireUser()
  if (!session) return fail('notSignedIn')
  const { supabase, userId } = session

  const { error } = await supabase
    .from('last_visited')
    .upsert(
      { user_id: userId, subtopic_id: parsed.data, visited_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (error) return fail('saveFailed')
  return { ok: true }
}
