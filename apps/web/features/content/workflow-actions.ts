'use server'

import { getTranslations } from 'next-intl/server'
import {
  deriveReadingMinutes,
  derivePrimaryVideoUrl,
  getHeadingsText,
  getPlainText,
  validateContent,
} from '@epharmatica/editor'
import type { Content } from '@epharmatica/editor'
import { AUDIT_ACTIONS, withAudit } from '@/lib/observability/audit'
import { createClient } from '@/lib/supabase/server'
import { enqueueReanchor } from './cache'
import {
  AUTHORING_ROLES,
  DbActionError,
  MANAGER_ROLES,
  REVIEWING_ROLES,
  failureFrom,
  requireRoles,
} from './gate'
import { getContentTree } from './queries'
import { fireTagsForSubtopic } from './tags'

/*
 * Editorial workflow server actions (M4 §5.5–§5.6 · dev-plan 1.B-3).
 * Transitions run through the SECURITY DEFINER RPCs from migration 014 —
 * the role/state matrix, revision snapshots, review events, claim
 * auto-release, and preview-link auto-revoke are all DB-atomic. These
 * actions add: friendly gating, Zod/schema validation of content (I9 —
 * a document that fails validation never reaches publish), serializer
 * derivations, the tag cascade, the re-anchor hand-off, and audit (I8).
 *
 * Draft autosaves are deliberately NOT audited: submit and publish
 * snapshot revisions (the record); an audit row every 30 seconds would
 * drown the log the M4 dashboard reviews weekly.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

/** Asset ids referenced by img blocks — the media usage scan (M4 §6). */
function imageAssetIds(content: Content): string[] {
  return [
    ...new Set(
      content
        .filter((block) => block.type === 'img')
        .map((block) => (block.type === 'img' ? block.asset_id : ''))
        .filter(Boolean),
    ),
  ]
}

// ---------------------------------------------------------------------------
// Draft saves (author+) — content + serializer-derived FTS columns.
// ---------------------------------------------------------------------------

export async function saveDraftContent(
  subtopicId: string,
  content: unknown,
): Promise<ActionResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const validated = validateContent(content)
  if (!validated.ok) {
    return { ok: false, error: validated.errors[0] ?? 'Invalid document' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('subtopics')
    .update({
      content: validated.content,
      plain_text: getPlainText(validated.content),
      headings_text: getHeadingsText(validated.content),
    })
    .eq('id', subtopicId)

  if (error) return failureFrom(new DbActionError(error))

  // Draft usage scan (M4 §6, R-M4b: draft uses also block deletion).
  // Best-effort — a failed scan must not fail the save.
  await supabase.rpc('refresh_media_refs', {
    p_subtopic_id: subtopicId,
    p_asset_ids: imageAssetIds(validated.content),
    p_source: 'draft',
  })

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Transitions (RPC + audit); publish carries derivations + tags + re-anchor.
// ---------------------------------------------------------------------------

type TransitionSpec = {
  action: 'submit' | 'approve' | 'request_changes' | 'unpublish' | 'archive'
  roles: readonly string[]
  audit: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]
}

const TRANSITIONS: Record<TransitionSpec['action'], TransitionSpec> = {
  submit: { action: 'submit', roles: AUTHORING_ROLES, audit: AUDIT_ACTIONS.workflow_submitted },
  approve: { action: 'approve', roles: REVIEWING_ROLES, audit: AUDIT_ACTIONS.workflow_approved },
  request_changes: {
    action: 'request_changes',
    roles: REVIEWING_ROLES,
    audit: AUDIT_ACTIONS.workflow_changes_requested,
  },
  unpublish: {
    action: 'unpublish',
    roles: MANAGER_ROLES,
    audit: AUDIT_ACTIONS.workflow_unpublished,
  },
  archive: { action: 'archive', roles: MANAGER_ROLES, audit: AUDIT_ACTIONS.workflow_archived },
}

async function runTransition(
  spec: TransitionSpec,
  subtopicId: string,
  comment: string | null,
): Promise<ActionResult> {
  const gate = await requireRoles(spec.roles)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: spec.audit,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: subtopicId,
        meta: comment ? { comment_length: comment.length } : {},
      },
      async () => {
        const { error } = await supabase.rpc('transition_subtopic', {
          p_subtopic_id: subtopicId,
          p_action: spec.action,
          p_comment: comment ?? undefined,
        })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }

  if (spec.action === 'unpublish') {
    // The page 302s to its topic overview from now on (M1 §5.10).
    const tree = await getContentTree()
    fireTagsForSubtopic(tree, subtopicId)
  }
  return { ok: true }
}

export async function submitForReview(subtopicId: string): Promise<ActionResult> {
  return runTransition(TRANSITIONS.submit, subtopicId, null)
}

export async function approveSubtopic(subtopicId: string, comment?: string): Promise<ActionResult> {
  return runTransition(TRANSITIONS.approve, subtopicId, comment?.trim() || null)
}

export async function requestChanges(subtopicId: string, comment: string): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  if (!comment.trim()) return { ok: false, error: t('commentRequired') }
  return runTransition(TRANSITIONS.request_changes, subtopicId, comment.trim())
}

export async function unpublishSubtopic(subtopicId: string): Promise<ActionResult> {
  return runTransition(TRANSITIONS.unpublish, subtopicId, null)
}

export async function archiveSubtopic(subtopicId: string): Promise<ActionResult> {
  return runTransition(TRANSITIONS.archive, subtopicId, null)
}

export async function publishSubtopic(subtopicId: string): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(MANAGER_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  const { data: row, error: readError } = await supabase
    .from('subtopics')
    .select('content')
    .eq('id', subtopicId)
    .maybeSingle()
  if (readError || !row) return { ok: false, error: t('notFound') }

  // The publish gate is also the schema gate (rules §6.5): a document that
  // fails validation never goes live.
  const validated = validateContent(row.content)
  if (!validated.ok) {
    return { ok: false, error: t('invalidContent', { detail: validated.errors[0] ?? '' }) }
  }

  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.workflow_published,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: subtopicId,
        meta: { reading_minutes: deriveReadingMinutes(validated.content) },
      },
      async () => {
        const { error } = await supabase.rpc('publish_subtopic', {
          p_subtopic_id: subtopicId,
          p_primary_video_url: derivePrimaryVideoUrl(validated.content) as unknown as string,
          p_reading_minutes: deriveReadingMinutes(validated.content),
        })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }

  // Publish usage scan — authoritative for published refs (M4 §6).
  await supabase.rpc('refresh_media_refs', {
    p_subtopic_id: subtopicId,
    p_asset_ids: imageAssetIds(validated.content),
    p_source: 'published',
  })

  const tree = await getContentTree()
  fireTagsForSubtopic(tree, subtopicId)
  enqueueReanchor([subtopicId])
  return { ok: true }
}

export async function restoreRevision(revisionId: string): Promise<ActionResult> {
  const gate = await requireRoles(MANAGER_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    const subtopicId = await withAudit<string>(
      (restoredId) => ({
        action: AUDIT_ACTIONS.revision_restored,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: restoredId,
        meta: { revision_id: revisionId },
      }),
      async () => {
        const { data, error } = await supabase.rpc('restore_revision', {
          p_revision_id: revisionId,
        })
        if (error || !data) throw new DbActionError(error)
        return data
      },
    )

    // Refresh the serializer-derived FTS columns from the restored content.
    const { data: row } = await supabase
      .from('subtopics')
      .select('content')
      .eq('id', subtopicId)
      .maybeSingle()
    if (row) {
      const validated = validateContent(row.content)
      if (validated.ok) {
        await supabase
          .from('subtopics')
          .update({
            plain_text: getPlainText(validated.content),
            headings_text: getHeadingsText(validated.content),
          })
          .eq('id', subtopicId)
      }
    }
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Preview gate override (M1 §5.4: author override, minimum 1; null = default
// rule). preview_block_count is not workflow-guarded — author+ territory.
// ---------------------------------------------------------------------------

export async function updatePreviewBlockCount(
  subtopicId: string,
  count: number | null,
): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 50)) {
    return { ok: false, error: t('saveFailed') }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('subtopics')
    .update({ preview_block_count: count })
    .eq('id', subtopicId)
  if (error) return failureFrom(new DbActionError(error))
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Revision content for the side-by-side diff sheet (staff read, no limit).
// ---------------------------------------------------------------------------

export type RevisionContentResult = { ok: true; content: unknown } | { ok: false; error: string }

export async function getRevisionContent(revisionId: string): Promise<RevisionContentResult> {
  const t = await getTranslations('admin.content.errors')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('content_revisions')
    .select('content')
    .eq('id', revisionId)
    .maybeSingle()
  if (error || !data) return { ok: false, error: t('notFound') }
  return { ok: true, content: data.content }
}

// ---------------------------------------------------------------------------
// Claims (M4 §5.6): coordination, not permission — plain RLS table ops.
// ---------------------------------------------------------------------------

export async function claimReview(subtopicId: string): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(REVIEWING_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.review_claimed,
        actorId: gate.profile.id,
        entity: 'review',
        entityId: subtopicId,
      },
      async () => {
        const { error } = await supabase
          .from('review_claims')
          .insert({ subtopic_id: subtopicId, reviewer_id: gate.profile.id })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    const failure = await failureFrom(err)
    if (err instanceof DbActionError && err.dbError?.code === '23505') {
      return { ok: false, error: t('alreadyClaimed') }
    }
    return failure
  }
  return { ok: true }
}

export async function releaseReview(subtopicId: string): Promise<ActionResult> {
  const gate = await requireRoles(REVIEWING_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.review_released,
        actorId: gate.profile.id,
        entity: 'review',
        entityId: subtopicId,
      },
      async () => {
        const { error } = await supabase
          .from('review_claims')
          .update({ released_at: new Date().toISOString() })
          .eq('subtopic_id', subtopicId)
          .is('released_at', null)
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}
