'use server'

import { getTranslations } from 'next-intl/server'
import {
  chapterMetadataSchema,
  slugSchema,
  subjectMetadataSchema,
  subtopicCreateSchema,
  topicMetadataSchema,
} from '@epharmatica/database'
import type { ContentLevel } from '@epharmatica/database'
import { getAdminProfile } from '@/features/admin/queries'
import type { AdminProfile } from '@/features/admin/queries'
import { AUDIT_ACTIONS, withAudit } from '@/lib/observability/audit'
import { createClient } from '@/lib/supabase/server'
import {
  AUTHORING_ROLES,
  DELETING_ROLES,
  DbActionError,
  MANAGER_ROLES,
  failureFrom,
  requireRoles,
} from './gate'
import type { DbErrorShape } from './gate'
import { enqueueReanchor, revalidateContentTags } from './cache'
import { fireTagsForNode, fireTagsForParent } from './tags'
import { getContentTree } from './queries'
import {
  chapterRollup,
  findChapter,
  findSubject,
  findSubtopic,
  findTopic,
  publishedSubtopicIds,
  subjectRollup,
  topicRollup,
} from './tree'
import type { ContentTree } from './tree'

/*
 * Content-tree server actions (M4 §5.1–§5.3 · dev-plan 1.B-2). Account
 * conventions throughout: discriminated-union results, never throw to the
 * client, copy via getTranslations, shared Zod schemas.
 *
 * Three-layer posture: every action re-checks the staff role (friendly
 * errors), RLS staff_write remains the authority underneath, and the
 * ceremonial paths (Move…, published renames) run through the
 * content_manager+ SECURITY DEFINER RPCs from migration 013 — atomic
 * reparent/rename + slug_history in one transaction. Every mutation is
 * rate-limited (admin_mutation bucket, M4 §4) and runs INSIDE withAudit()
 * (I8) — a failed mutation throws and writes no audit row.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }
export type CreateResult = { ok: true; id: string } | { ok: false; error: string }

async function nextSortOrder(
  table: 'subjects' | 'chapters' | 'topics' | 'subtopics',
  parentColumn: 'subject_id' | 'chapter_id' | 'topic_id' | null,
  parentId: string | null,
): Promise<number> {
  const supabase = await createClient()
  let query = supabase.from(table).select('sort_order').order('sort_order', { ascending: false })
  // .filter: the parent column varies by table, which defeats .eq's typing.
  if (parentColumn && parentId) query = query.filter(parentColumn, 'eq', parentId)
  const { data } = await query.limit(1).maybeSingle()
  return (data?.sort_order ?? 0) + 1
}

type CreateSpec = {
  level: ContentLevel
  parentId: string | null
  slug: string
  insert: () => Promise<{ data: { id: string } | null; error: DbErrorShape }>
}

/** Shared create path: insert inside withAudit; creates fire no tags (M1-6). */
async function createNode(profile: AdminProfile, spec: CreateSpec): Promise<CreateResult> {
  try {
    const id = await withAudit<string>(
      (createdId) => ({
        action: AUDIT_ACTIONS.node_created,
        actorId: profile.id,
        entity: 'content',
        entityId: createdId,
        meta: { level: spec.level, parent_id: spec.parentId, slug: spec.slug },
      }),
      async () => {
        const { data, error } = await spec.insert()
        if (error || !data) throw new DbActionError(error)
        return data.id
      },
    )
    return { ok: true, id }
  } catch (err) {
    return failureFrom(err)
  }
}

export async function createSubject(values: unknown): Promise<CreateResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const parsed = subjectMetadataSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = await createClient()
  const sortOrder = await nextSortOrder('subjects', null, null)
  return createNode(gate.profile, {
    level: 'subject',
    parentId: null,
    slug: parsed.data.slug,
    insert: async () =>
      supabase
        .from('subjects')
        .insert({
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description,
          icon: parsed.data.icon,
          default_semester: parsed.data.defaultSemester ?? null,
          sort_order: sortOrder,
        })
        .select('id')
        .single(),
  })
}

export async function createChapter(subjectId: string, values: unknown): Promise<CreateResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const parsed = chapterMetadataSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = await createClient()
  const sortOrder = await nextSortOrder('chapters', 'subject_id', subjectId)
  return createNode(gate.profile, {
    level: 'chapter',
    parentId: subjectId,
    slug: parsed.data.slug,
    insert: async () =>
      supabase
        .from('chapters')
        .insert({
          subject_id: subjectId,
          name: parsed.data.name,
          slug: parsed.data.slug,
          sort_order: sortOrder,
        })
        .select('id')
        .single(),
  })
}

export async function createTopic(chapterId: string, values: unknown): Promise<CreateResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const parsed = topicMetadataSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = await createClient()
  const sortOrder = await nextSortOrder('topics', 'chapter_id', chapterId)
  return createNode(gate.profile, {
    level: 'topic',
    parentId: chapterId,
    slug: parsed.data.slug,
    insert: async () =>
      supabase
        .from('topics')
        .insert({
          chapter_id: chapterId,
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description,
          semester: parsed.data.semester ?? null,
          sort_order: sortOrder,
        })
        .select('id')
        .single(),
  })
}

export async function createSubtopic(topicId: string, values: unknown): Promise<CreateResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const parsed = subtopicCreateSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = await createClient()
  const sortOrder = await nextSortOrder('subtopics', 'topic_id', topicId)
  return createNode(gate.profile, {
    level: 'subtopic',
    parentId: topicId,
    slug: parsed.data.slug,
    insert: async () =>
      supabase
        .from('subtopics')
        .insert({
          topic_id: topicId,
          title: parsed.data.title,
          slug: parsed.data.slug,
          sort_order: sortOrder,
        })
        .select('id')
        .single(),
  })
}

/**
 * Create a content page attached DIRECTLY to a chapter (flexible leaves,
 * migration 020): same subtopicCreateSchema, insert with chapter_id. The DB
 * triggers enforce the chapter-wide shared slug namespace (page slugs and
 * topic slugs collide as 23505 → the slugTaken copy).
 */
export async function createChapterPage(chapterId: string, values: unknown): Promise<CreateResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const parsed = subtopicCreateSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = await createClient()
  const sortOrder = await nextSortOrder('subtopics', 'chapter_id', chapterId)
  return createNode(gate.profile, {
    level: 'subtopic',
    parentId: chapterId,
    slug: parsed.data.slug,
    insert: async () =>
      supabase
        .from('subtopics')
        .insert({
          chapter_id: chapterId,
          title: parsed.data.title,
          slug: parsed.data.slug,
          sort_order: sortOrder,
        })
        .select('id')
        .single(),
  })
}

// ---------------------------------------------------------------------------
// Metadata updates (author+) — name/description/semester/icon, NEVER slug
// (renames have their own ceremony below). Visible nodes revalidate tags.
// ---------------------------------------------------------------------------

export async function updateNodeMetadata(
  level: ContentLevel,
  id: string,
  values: unknown,
): Promise<ActionResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  const tree = await getContentTree()

  let update: () => Promise<{ error: DbErrorShape }>
  let fireTags: () => void = () => {}

  if (level === 'subject') {
    const parsed = subjectMetadataSchema.omit({ slug: true }).safeParse(values)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }
    update = async () =>
      supabase
        .from('subjects')
        .update({
          name: parsed.data.name,
          description: parsed.data.description,
          icon: parsed.data.icon,
          default_semester: parsed.data.defaultSemester ?? null,
        })
        .eq('id', id)
    const subject = findSubject(tree, id)
    if (subject && publishedSubtopicIds(subject).length > 0) {
      fireTags = () => revalidateContentTags({ subjectSlugs: [subject.slug] })
    }
  } else if (level === 'chapter') {
    const parsed = chapterMetadataSchema.omit({ slug: true }).safeParse(values)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }
    update = async () => supabase.from('chapters').update({ name: parsed.data.name }).eq('id', id)
    const found = findChapter(tree, id)
    if (found && publishedSubtopicIds(found.chapter).length > 0) {
      fireTags = () =>
        revalidateContentTags({ chapterIds: [id], subjectSlugs: [found.subject.slug] })
    }
  } else if (level === 'topic') {
    const parsed = topicMetadataSchema.omit({ slug: true }).safeParse(values)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }
    update = async () =>
      supabase
        .from('topics')
        .update({
          name: parsed.data.name,
          description: parsed.data.description,
          semester: parsed.data.semester ?? null,
        })
        .eq('id', id)
    const found = findTopic(tree, id)
    if (found && publishedSubtopicIds(found.topic).length > 0) {
      fireTags = () =>
        revalidateContentTags({
          topicIds: [id],
          chapterIds: [found.chapter.id],
          subjectSlugs: [found.subject.slug],
        })
    }
  } else {
    const parsed = subtopicCreateSchema.omit({ slug: true }).safeParse(values)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    }
    update = async () =>
      supabase.from('subtopics').update({ title: parsed.data.title }).eq('id', id)
  }

  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.node_updated,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: id,
        meta: { level },
      },
      async () => {
        const { error } = await update()
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }

  fireTags()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Slug rename — plain while nothing beneath is published (author+); the
// ceremony (consequence sheet → content_manager+ RPC → 301 history) after.
// ---------------------------------------------------------------------------

export async function renameNodeSlug(
  level: ContentLevel,
  id: string,
  newSlug: unknown,
  confirmed: boolean,
): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')

  const parsedSlug = slugSchema.safeParse(newSlug)
  if (!parsedSlug.success) {
    return { ok: false, error: parsedSlug.error.issues[0]?.message ?? 'Invalid slug' }
  }
  const slug = parsedSlug.data

  const tree = await getContentTree()
  const affected = affectedPublishedIds(tree, level, id)
  if (affected === null) return { ok: false, error: t('notFound') }

  if (affected.length === 0) {
    // Free rename: nothing published beneath — plain update, author+.
    const gate = await requireRoles(AUTHORING_ROLES)
    if (!gate.ok) return gate

    const supabase = await createClient()
    try {
      await withAudit(
        {
          action: AUDIT_ACTIONS.node_renamed,
          actorId: gate.profile.id,
          entity: 'content',
          entityId: id,
          meta: { level, new_slug: slug, ceremony: false },
        },
        async () => {
          const { error } = await supabase.from(tableFor(level)).update({ slug }).eq('id', id)
          if (error) throw new DbActionError(error)
        },
      )
    } catch (err) {
      return failureFrom(err)
    }
    return { ok: true }
  }

  // Ceremony: published beneath — the consequence sheet must be confirmed.
  if (!confirmed) return { ok: false, error: t('confirmationRequired') }
  const gate = await requireRoles(MANAGER_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    const affectedIds = await withAudit<string[]>(
      (result) => ({
        action: AUDIT_ACTIONS.node_renamed,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: id,
        meta: { level, new_slug: slug, ceremony: true, affected: result.length },
      }),
      async () => {
        const { data, error } = await supabase.rpc('rename_content_node', {
          p_level: level,
          p_entity_id: id,
          p_new_slug: slug,
        })
        if (error) throw new DbActionError(error)
        return data ?? []
      },
    )
    fireTagsForNode(tree, level, id, affectedIds)
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Move… (content_manager+, M4 §5.3) — typed confirmation for published
// nodes; atomic RPC; tags + re-anchor hand-off after.
// ---------------------------------------------------------------------------

export async function moveNode(
  level: ContentLevel,
  id: string,
  newParentId: string,
  typedConfirmation: string,
  /** Subtopic moves only: 'chapter' reparents the page as a direct leaf (020). */
  newParentLevel: 'topic' | 'chapter' = 'topic',
): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(MANAGER_ROLES)
  if (!gate.ok) return gate

  const tree = await getContentTree()
  const affected = affectedPublishedIds(tree, level, id)
  if (affected === null) return { ok: false, error: t('notFound') }

  // Typed `move` confirmation for published nodes (M4 §5.3, exact word).
  if (affected.length > 0 && typedConfirmation.trim() !== 'move') {
    return { ok: false, error: t('typeMoveToConfirm') }
  }

  const supabase = await createClient()
  try {
    const affectedIds = await withAudit<string[]>(
      (result) => ({
        action: AUDIT_ACTIONS.node_moved,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: id,
        meta: {
          level,
          to_parent: newParentId,
          affected: result.length,
          ...(level === 'subtopic' ? { to_parent_level: newParentLevel } : {}),
        },
      }),
      async () => {
        const { data, error } = await supabase.rpc('move_content_node', {
          p_level: level,
          p_entity_id: id,
          p_new_parent_id: newParentId,
          // The parent-level disambiguation exists for subtopics only (020).
          ...(level === 'subtopic' ? { p_new_parent_level: newParentLevel } : {}),
        })
        if (error) throw new DbActionError(error)
        return data ?? []
      },
    )
    fireTagsForNode(tree, level, id, affectedIds)
    // The destination's ancestors change too (blister lists, counts).
    fireTagsForParent(tree, level, newParentId)
    enqueueReanchor(affectedIds)
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Delete… (admin+, migration 023 → SOFT delete 024) — typed-name
// confirmation; the SECURITY DEFINER RPC stamps deleted_at over the whole
// subtree (dependents — revisions, review events, study data, discussions,
// preview links, media refs — ride along, hidden by RLS) and records a
// content_trash event with a 14-day purge_after. Slugs stay reserved while
// trashed. Direct table deletes are RLS-blocked for every role — the RPC is
// the single path. Restore/purge below settle the event.
// ---------------------------------------------------------------------------

export async function deleteNode(
  level: ContentLevel,
  id: string,
  typedName: string,
): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(DELETING_ROLES)
  if (!gate.ok) return gate

  // PRE-delete tree lookup (the moveNode old-location precedent): the
  // typed-name check, the audit meta, and the cache tags all need the node
  // while it still exists.
  const tree = await getContentTree()
  const target = deleteTarget(tree, level, id)
  if (!target) return { ok: false, error: t('notFound') }

  // Exact name, trimmed, case-sensitive — the dialog mirrors this client-side.
  if (typedName.trim() !== target.name) {
    return { ok: false, error: t('typeNameToConfirm') }
  }

  const supabase = await createClient()
  try {
    // The RPC returns the content_trash event id — captured into the audit
    // meta so the node_deleted row links to its restore/purge lifecycle.
    await withAudit<string>(
      (trashId) => ({
        action: AUDIT_ACTIONS.node_deleted,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: id,
        meta: {
          level,
          name: target.name,
          slug: target.slug,
          ...target.counts,
          published: target.affectedIds.length,
          trash_id: trashId,
        },
      }),
      async () => {
        const { data, error } = await supabase.rpc('delete_content_node', {
          p_level: level,
          p_entity_id: id,
        })
        if (error || !data) throw new DbActionError(error)
        return data
      },
    )
    // OLD-location tags off the pre-delete tree: the node's own tag, every
    // ancestor list, and the sitemap (fireTagsForNode covers all three) —
    // trashed content vanishes from every public surface instantly.
    fireTagsForNode(tree, level, id, target.affectedIds)
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Trash lifecycle (admin+, migration 024): restore un-trashes exactly one
// event's rows; purge hard-deletes them ahead of the 14-day cron. Both read
// the open event first (admin-read RLS) for friendly notFound + audit meta.
// ---------------------------------------------------------------------------

/** One OPEN content_trash event (restored_at/purged_at null), or null. */
async function openTrashEvent(trashId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('content_trash')
    .select('level, entity_id, name, slug, pages, published')
    .eq('id', trashId)
    .is('restored_at', null)
    .is('purged_at', null)
    .maybeSingle()
  return data
}

export async function restoreNode(trashId: string): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(DELETING_ROLES)
  if (!gate.ok) return gate

  const event = await openTrashEvent(trashId)
  if (!event) return { ok: false, error: t('notFound') }

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.node_restored,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: event.entity_id,
        meta: {
          level: event.level,
          name: event.name,
          slug: event.slug,
          pages: event.pages,
          published: event.published,
          trash_id: trashId,
        },
      },
      async () => {
        const { error } = await supabase.rpc('restore_content_node', { p_trash_id: trashId })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    // The RPC refuses a restore under a still-trashed parent — distinct copy
    // (the DB message is the contract: "the parent is deleted — restore it
    // first"; anything else falls through to the standard failure map).
    if (err instanceof DbActionError && err.dbError?.message?.includes('restore it first')) {
      return { ok: false, error: t('restoreParentFirst') }
    }
    return failureFrom(err)
  }

  // POST-restore tree (getContentTree first touches the cache HERE, after
  // the RPC): the subtree is publicly visible again, so fire the same tag
  // set deleteNode fires — own tag, every ancestor list, sitemap.
  const tree = await getContentTree()
  fireTagsForNode(
    tree,
    event.level,
    event.entity_id,
    affectedPublishedIds(tree, event.level, event.entity_id) ?? [],
  )
  return { ok: true }
}

export async function purgeNode(trashId: string, typedName: string): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(DELETING_ROLES)
  if (!gate.ok) return gate

  const event = await openTrashEvent(trashId)
  if (!event) return { ok: false, error: t('notFound') }

  // Exact name, trimmed, case-sensitive — the deleteNode contract; the
  // purge dialog mirrors it client-side.
  if (typedName.trim() !== event.name) {
    return { ok: false, error: t('typeNameToConfirm') }
  }

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.node_purged,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: event.entity_id,
        meta: {
          level: event.level,
          name: event.name,
          slug: event.slug,
          pages: event.pages,
          published: event.published,
          trash_id: trashId,
        },
      },
      async () => {
        const { error } = await supabase.rpc('purge_content_trash', { p_trash_id: trashId })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  // No tag firing: trashed content is already invisible on every public
  // surface — the purge only frees the reserved name/slug.
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Reorder (author+): full ordered id list for one parent (up/down + drag).
// ---------------------------------------------------------------------------

export async function reorderNodes(
  level: ContentLevel,
  parentId: string | null,
  orderedIds: string[],
): Promise<ActionResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const tree = await getContentTree()
  const current = siblingIds(tree, level, parentId)
  if (
    current === null ||
    current.length !== orderedIds.length ||
    !current.every((memberId) => orderedIds.includes(memberId))
  ) {
    return { ok: false, error: t('reorderStale') }
  }

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.nodes_reordered,
        actorId: gate.profile.id,
        entity: 'content',
        entityId: parentId,
        meta: { level, count: orderedIds.length },
      },
      async () => {
        for (const [index, nodeId] of orderedIds.entries()) {
          const { error } = await supabase
            .from(tableFor(level))
            .update({ sort_order: index + 1 })
            .eq('id', nodeId)
          if (error) throw new DbActionError(error)
        }
      },
    )
  } catch (err) {
    return failureFrom(err)
  }

  if (parentId) fireTagsForParent(tree, level, parentId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Consequence-sheet data (staff): highlight count over affected subtopics.
// ---------------------------------------------------------------------------

export type ConsequencesResult =
  { ok: true; affectedSubtopics: number; highlightCount: number } | { ok: false; error: string }

export async function getNodeConsequences(
  level: ContentLevel,
  id: string,
): Promise<ConsequencesResult> {
  const t = await getTranslations('admin.content.errors')
  const profile = await getAdminProfile()
  if (!profile) return { ok: false, error: t('forbidden') }

  const tree = await getContentTree()
  const affected = affectedPublishedIds(tree, level, id)
  if (affected === null) return { ok: false, error: t('notFound') }
  if (affected.length === 0) {
    return { ok: true, affectedSubtopics: 0, highlightCount: 0 }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('count_affected_highlights', {
    p_subtopic_ids: affected,
  })
  if (error) return { ok: false, error: t('saveFailed') }

  return { ok: true, affectedSubtopics: affected.length, highlightCount: data ?? 0 }
}

// ---------------------------------------------------------------------------
// Local helpers (pure, over the fetched tree)
// ---------------------------------------------------------------------------

function tableFor(level: ContentLevel): 'subjects' | 'chapters' | 'topics' | 'subtopics' {
  if (level === 'subject') return 'subjects'
  if (level === 'chapter') return 'chapters'
  if (level === 'topic') return 'topics'
  return 'subtopics'
}

function affectedPublishedIds(tree: ContentTree, level: ContentLevel, id: string): string[] | null {
  if (level === 'subject') {
    const subject = findSubject(tree, id)
    return subject ? publishedSubtopicIds(subject) : null
  }
  if (level === 'chapter') {
    const found = findChapter(tree, id)
    return found ? publishedSubtopicIds(found.chapter) : null
  }
  if (level === 'topic') {
    const found = findTopic(tree, id)
    return found ? publishedSubtopicIds(found.topic) : null
  }
  // Subtopic: under a topic OR attached directly to a chapter (020).
  const found = findSubtopic(tree, id)
  if (!found) return null
  return found.subtopic.status === 'published' ? [found.subtopic.id] : []
}

type DeleteTarget = {
  /** Exact display name (subjects/chapters/topics) or title (subtopics). */
  name: string
  slug: string
  /** Published subtopic ids beneath (self for subtopics) — the tag payload. */
  affectedIds: string[]
  /** Descendant counts for the audit row (pages = content pages, self incl.). */
  counts: { chapters?: number; topics?: number; pages: number }
}

function deleteTarget(tree: ContentTree, level: ContentLevel, id: string): DeleteTarget | null {
  if (level === 'subject') {
    const subject = findSubject(tree, id)
    if (!subject) return null
    return {
      name: subject.name,
      slug: subject.slug,
      affectedIds: publishedSubtopicIds(subject),
      counts: {
        chapters: subject.chapters.length,
        topics: subject.chapters.reduce((acc, chapter) => acc + chapter.topics.length, 0),
        pages: subjectRollup(subject).total,
      },
    }
  }
  if (level === 'chapter') {
    const found = findChapter(tree, id)
    if (!found) return null
    return {
      name: found.chapter.name,
      slug: found.chapter.slug,
      affectedIds: publishedSubtopicIds(found.chapter),
      counts: { topics: found.chapter.topics.length, pages: chapterRollup(found.chapter).total },
    }
  }
  if (level === 'topic') {
    const found = findTopic(tree, id)
    if (!found) return null
    return {
      name: found.topic.name,
      slug: found.topic.slug,
      affectedIds: publishedSubtopicIds(found.topic),
      counts: { pages: topicRollup(found.topic).total },
    }
  }
  const found = findSubtopic(tree, id)
  if (!found) return null
  return {
    name: found.subtopic.title,
    slug: found.subtopic.slug,
    affectedIds: found.subtopic.status === 'published' ? [found.subtopic.id] : [],
    counts: { pages: 1 },
  }
}

function siblingIds(
  tree: ContentTree,
  level: ContentLevel,
  parentId: string | null,
): string[] | null {
  if (level === 'subject') return tree.map((subject) => subject.id)
  if (level === 'chapter') {
    const subject = parentId ? findSubject(tree, parentId) : null
    return subject ? subject.chapters.map((chapter) => chapter.id) : null
  }
  if (level === 'topic') {
    const found = parentId ? findChapter(tree, parentId) : null
    return found ? found.chapter.topics.map((topic) => topic.id) : null
  }
  // Subtopic siblings: the parent is a topic OR a chapter (its direct
  // leaves form their own sort space — flexible leaves, 020).
  const found = parentId ? findTopic(tree, parentId) : null
  if (found) return found.topic.subtopics.map((subtopic) => subtopic.id)
  const chapterHit = parentId ? findChapter(tree, parentId) : null
  return chapterHit ? chapterHit.chapter.leaves.map((leaf) => leaf.id) : null
}
