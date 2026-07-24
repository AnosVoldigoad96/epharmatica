'use server'

import { getTranslations } from 'next-intl/server'
import { AUDIT_ACTIONS, withAudit } from '@/lib/observability/audit'
import { createClient } from '@/lib/supabase/server'
import { CONTENT_ROLES, DbActionError, failureFrom, requireRoles } from './gate'

/*
 * Review discussions (M4 §5.4/§5.5 · dev-plan 1.B-3c). Threads anchor to a
 * BLOCK (block_id + a text snapshot captured at creation) and live OUTSIDE
 * the content JSON (migration 018) — review chrome never enters published
 * documents. RLS is the authority: all five content roles read/insert/
 * resolve, inserts are creator-stamped (created_by/author_id must equal
 * auth.uid()), and there are no deletes — the thread is editorial record.
 * These actions add friendly gating, trim/length validation, and audit (I8).
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

export type DiscussionKind = 'comment' | 'suggestion'
export type DiscussionStatus = 'open' | 'resolved'

const BODY_MAX = 2000
const SNAPSHOT_MAX = 240
const SUGGESTION_MAX = 2000

export async function openDiscussion(
  subtopicId: string,
  blockId: string,
  snapshot: string,
  kind: DiscussionKind,
  body: string,
  suggestedText?: string,
): Promise<ActionResult> {
  const t = await getTranslations('admin.content.discussions.errors')
  const gate = await requireRoles(CONTENT_ROLES)
  if (!gate.ok) return gate

  const trimmedBlockId = blockId.trim()
  const trimmedBody = body.trim()
  const trimmedSuggestion = suggestedText?.trim() ?? ''
  if (
    !trimmedBlockId ||
    trimmedBlockId.length > 120 ||
    (kind !== 'comment' && kind !== 'suggestion')
  ) {
    return { ok: false, error: t('blockRequired') }
  }
  if (!trimmedBody) return { ok: false, error: t('bodyRequired') }
  if (kind === 'suggestion' && !trimmedSuggestion) {
    return { ok: false, error: t('suggestionRequired') }
  }
  if (trimmedBody.length > BODY_MAX || trimmedSuggestion.length > SUGGESTION_MAX) {
    return { ok: false, error: t('tooLong') }
  }

  const supabase = await createClient()
  try {
    await withAudit<string>(
      (discussionId) => ({
        action: AUDIT_ACTIONS.discussion_opened,
        actorId: gate.profile.id,
        entity: 'review',
        entityId: subtopicId,
        meta: { discussion_id: discussionId, kind },
      }),
      async () => {
        const { data, error } = await supabase
          .from('content_discussions')
          .insert({
            subtopic_id: subtopicId,
            block_id: trimmedBlockId,
            snapshot: snapshot.trim().slice(0, SNAPSHOT_MAX) || null,
            kind,
            suggested_text: kind === 'suggestion' ? trimmedSuggestion : null,
            created_by: gate.profile.id,
          })
          .select('id')
          .single()
        if (error || !data) throw new DbActionError(error)

        // The first message rides as an immediate reply row — two inserts,
        // deliberately non-atomic: a failed reply leaves an empty-but-valid
        // open discussion (repliable, resolvable), never an orphaned reply.
        const { error: replyError } = await supabase
          .from('content_discussion_replies')
          .insert({ discussion_id: data.id, author_id: gate.profile.id, body: trimmedBody })
        if (replyError) throw new DbActionError(replyError)
        return data.id
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}

export async function replyToDiscussion(
  discussionId: string,
  subtopicId: string,
  body: string,
): Promise<ActionResult> {
  const t = await getTranslations('admin.content.discussions.errors')
  const gate = await requireRoles(CONTENT_ROLES)
  if (!gate.ok) return gate

  const trimmedBody = body.trim()
  if (!trimmedBody) return { ok: false, error: t('bodyRequired') }
  if (trimmedBody.length > BODY_MAX) return { ok: false, error: t('tooLong') }

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.discussion_replied,
        actorId: gate.profile.id,
        entity: 'review',
        entityId: subtopicId,
        meta: { discussion_id: discussionId },
      },
      async () => {
        const { error } = await supabase
          .from('content_discussion_replies')
          .insert({ discussion_id: discussionId, author_id: gate.profile.id, body: trimmedBody })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}

/**
 * Resolve or reopen (M4 §5.5 — resolution is workflow, not ownership: any
 * content staff may flip it). Both directions audit as discussion_resolved
 * with the target status in meta.
 */
export async function setDiscussionStatus(
  discussionId: string,
  subtopicId: string,
  status: DiscussionStatus,
): Promise<ActionResult> {
  const gate = await requireRoles(CONTENT_ROLES)
  if (!gate.ok) return gate
  if (status !== 'open' && status !== 'resolved') return failureFrom(null)

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.discussion_resolved,
        actorId: gate.profile.id,
        entity: 'review',
        entityId: subtopicId,
        meta: { discussion_id: discussionId, status },
      },
      async () => {
        const { error } = await supabase
          .from('content_discussions')
          .update({ status })
          .eq('id', discussionId)
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}
