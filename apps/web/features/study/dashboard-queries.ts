import 'server-only'

import type { StateGlyphState } from '@epharmatica/ui'
import { getPublishedTree } from '@/features/content/public-queries'
import type { PublishedTree } from '@/features/content/public-queries'
import { createClient } from '@/lib/supabase/server'
import type { StudyHighlightColor } from './anchor-schema'
import { noteDocToText } from './note-doc'

/*
 * Dashboard + My Highlights reads (1.D-3 · dev-plan §1.D · M1 §5.5/§5.7/
 * §5.8). Unlike queries.ts (server actions the static /learn shells call
 * from the client), these run INSIDE the dynamic (account) pages — plain
 * server-only functions, one per page, each fanning out its reads in
 * parallel: the cached published tree (anon client) ⨯ the owner tables
 * (cookie-bound client under owner-only RLS). Roll-ups are computed here
 * at read time (M1 §5.8 — no denormalized counters); rows pointing at
 * unpublished/deleted content simply miss the tree and render as "No
 * longer available" (M1 §5.10 — retained untouched, resurface on
 * republish).
 */

const RECENT_LIMIT = 6
const NOTE_EXCERPT_LENGTH = 160

/** A published unit resolved against the tree — title, URL, breadcrumb. */
type UnitNode = {
  id: string
  title: string
  href: string
  /** [subject, chapter] or [subject, chapter, topic] — topic can be null
   * for chapter-attached pages (flexible leaves, 020). */
  breadcrumb: string[]
  subjectId: string
  /** The sibling sequence (topic units / chapter pages) — Continue strip. */
  siblingIds: string[]
}

type TopicNode = { id: string; name: string; href: string; subjectId: string; unitIds: string[] }

type SubjectNode = { id: string; name: string; href: string; unitIds: string[] }

type TreeIndex = {
  units: Map<string, UnitNode>
  topics: Map<string, TopicNode>
  /** Tree order — drives every subject grouping below. */
  subjects: SubjectNode[]
}

/**
 * One walk over the published tree → lookup maps. Hidden drafts are
 * excluded by construction: getPublishedTree only ever contains published
 * units (M1-6), so anything absent here is unpublished or deleted.
 */
function indexTree(tree: PublishedTree): TreeIndex {
  const units = new Map<string, UnitNode>()
  const topics = new Map<string, TopicNode>()
  const subjects: SubjectNode[] = []

  for (const subject of tree) {
    const subjectUnitIds: string[] = []
    for (const chapter of subject.chapters) {
      for (const topic of chapter.topics) {
        const siblingIds = topic.subtopics.map((cell) => cell.id)
        topics.set(topic.id, {
          id: topic.id,
          name: topic.name,
          href: `/learn/${subject.slug}/${chapter.slug}/${topic.slug}`,
          subjectId: subject.id,
          unitIds: siblingIds,
        })
        for (const cell of topic.subtopics) {
          subjectUnitIds.push(cell.id)
          units.set(cell.id, {
            id: cell.id,
            title: cell.title,
            href: `/learn/${subject.slug}/${chapter.slug}/${topic.slug}/${cell.slug}`,
            breadcrumb: [subject.name, chapter.name, topic.name],
            subjectId: subject.id,
            siblingIds,
          })
        }
      }
      // Chapter-attached pages (020): 3-segment URLs, siblings = the
      // chapter's page sequence, breadcrumb stops at the chapter.
      const leafIds = chapter.leaves.map((cell) => cell.id)
      for (const cell of chapter.leaves) {
        subjectUnitIds.push(cell.id)
        units.set(cell.id, {
          id: cell.id,
          title: cell.title,
          href: `/learn/${subject.slug}/${chapter.slug}/${cell.slug}`,
          breadcrumb: [subject.name, chapter.name],
          subjectId: subject.id,
          siblingIds: leafIds,
        })
      }
    }
    subjects.push({
      id: subject.id,
      name: subject.name,
      href: `/learn/${subject.slug}`,
      unitIds: subjectUnitIds,
    })
  }

  return { units, topics, subjects }
}

async function requireUser() {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return null
    return { supabase }
  } catch {
    return null
  }
}

/** Whole days since `iso`, computed server-side (no Date.now() in render). */
function daysSince(iso: string, nowMs: number): number {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((nowMs - then) / 86_400_000))
}

/** Aggregate glyph over a unit set (mirrors the tree shells' CellGlyph). */
function aggregateState(unitIds: string[], completed: Set<string>): StateGlyphState {
  if (unitIds.length === 0) return 'not-started'
  const done = unitIds.filter((id) => completed.has(id)).length
  return done === unitIds.length ? 'complete' : done > 0 ? 'in-progress' : 'not-started'
}

/* ------------------------------------------------------------ shapes */

/** null → the row points at unpublished/deleted content ("No longer
 * available" — M1 §5.10: retained untouched, resurfaces on republish). */
export type StudyTarget = { title: string; href: string } | null

export type DashboardHighlight = {
  id: string
  color: StudyHighlightColor
  snapshot: string
  orphaned: boolean
  daysAgo: number
  target: StudyTarget
}

export type DashboardNote = {
  id: string
  excerpt: string
  /** true = attached to a highlight, false = free unit note. */
  attached: boolean
  daysAgo: number
  target: StudyTarget
}

export type DashboardBookmark = {
  id: string
  targetType: 'subtopic' | 'topic'
  targetId: string
  /** null title/href → target no longer published. */
  title: string | null
  href: string | null
  state: StateGlyphState
}

export type DashboardBookmarkGroup = {
  /** null → the trailing "No longer available" group. */
  subjectId: string | null
  subjectName: string | null
  items: DashboardBookmark[]
}

export type DashboardSubjectProgress = {
  id: string
  name: string
  href: string
  completed: number
  published: number
  /** One glyph per published unit, tree order — the blister strip. */
  units: StateGlyphState[]
}

export type DashboardContinue = {
  title: string
  href: string
  breadcrumb: string[]
  /** The containing sequence's strip (topic units / chapter pages);
   * the visited-but-incomplete unit itself reads in-progress. */
  strip: StateGlyphState[]
}

export type DashboardData = {
  continueStudying: DashboardContinue | null
  subjects: DashboardSubjectProgress[]
  recentHighlights: DashboardHighlight[]
  recentNotes: DashboardNote[]
  bookmarkGroups: DashboardBookmarkGroup[]
}

/**
 * Everything /dashboard renders, in ONE server fan-out: the cached
 * published tree + last_visited, progress, latest highlights/notes and
 * bookmarks (owner RLS self-scopes every read). Returns null signed-out —
 * the (account) layout has already redirected by then.
 */
export async function getDashboard(): Promise<DashboardData | null> {
  const session = await requireUser()
  if (!session) return null
  const { supabase } = session

  const [tree, lastVisited, progressRows, highlightRows, noteRows, bookmarkRows] =
    await Promise.all([
      getPublishedTree(),
      supabase.from('last_visited').select('subtopic_id, visited_at').maybeSingle(),
      supabase.from('progress').select('subtopic_id'),
      supabase
        .from('highlights')
        .select('id, subtopic_id, color, text_snapshot, orphaned, created_at')
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from('user_notes')
        .select('id, subtopic_id, highlight_id, content, created_at')
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from('bookmarks')
        .select('id, target_type, target_id')
        .order('created_at', { ascending: false }),
    ])

  const index = indexTree(tree)
  const completed = new Set((progressRows.data ?? []).map((row) => row.subtopic_id))
  const nowMs = Date.now()

  const targetFor = (subtopicId: string): StudyTarget => {
    const unit = index.units.get(subtopicId)
    return unit ? { title: unit.title, href: unit.href } : null
  }

  // CONTINUE — last_visited joined to the tree. A visited unit that got
  // unpublished falls back to the empty state (there is nowhere to go).
  let continueStudying: DashboardContinue | null = null
  const visitedUnit = lastVisited.data ? index.units.get(lastVisited.data.subtopic_id) : undefined
  if (visitedUnit) {
    continueStudying = {
      title: visitedUnit.title,
      href: visitedUnit.href,
      breadcrumb: visitedUnit.breadcrumb,
      strip: visitedUnit.siblingIds.map((id) =>
        completed.has(id) ? 'complete' : id === visitedUnit.id ? 'in-progress' : 'not-started',
      ),
    }
  }

  // PROGRESS BY SUBJECT — roll-ups at read time (M1 §5.8): completed ∩
  // published per subject; drafts never appear (absent from the tree).
  const subjects: DashboardSubjectProgress[] = index.subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    href: subject.href,
    completed: subject.unitIds.filter((id) => completed.has(id)).length,
    published: subject.unitIds.length,
    units: subject.unitIds.map((id) => (completed.has(id) ? 'complete' : 'not-started')),
  }))

  const recentHighlights: DashboardHighlight[] = (highlightRows.data ?? []).map((row) => ({
    id: row.id,
    color: row.color,
    snapshot: row.text_snapshot,
    orphaned: row.orphaned,
    daysAgo: daysSince(row.created_at, nowMs),
    target: targetFor(row.subtopic_id),
  }))

  const recentNotes: DashboardNote[] = (noteRows.data ?? []).map((row) => {
    const text = noteDocToText(row.content)
    return {
      id: row.id,
      excerpt:
        text.length > NOTE_EXCERPT_LENGTH ? `${text.slice(0, NOTE_EXCERPT_LENGTH - 1)}…` : text,
      attached: row.highlight_id !== null,
      daysAgo: daysSince(row.created_at, nowMs),
      target: targetFor(row.subtopic_id),
    }
  })

  // BOOKMARKS — grouped by subject in tree order, with state glyphs (M1
  // §5.7): units read complete/not-started, topics aggregate their units.
  // Targets missing from the tree collect in a trailing group.
  const grouped = new Map<string, DashboardBookmark[]>()
  const unavailable: DashboardBookmark[] = []
  for (const row of bookmarkRows.data ?? []) {
    if (row.target_type === 'topic') {
      const topic = index.topics.get(row.target_id)
      const item: DashboardBookmark = {
        id: row.id,
        targetType: 'topic',
        targetId: row.target_id,
        title: topic?.name ?? null,
        href: topic?.href ?? null,
        state: topic ? aggregateState(topic.unitIds, completed) : 'not-started',
      }
      if (topic) grouped.set(topic.subjectId, [...(grouped.get(topic.subjectId) ?? []), item])
      else unavailable.push(item)
    } else {
      const unit = index.units.get(row.target_id)
      const item: DashboardBookmark = {
        id: row.id,
        targetType: 'subtopic',
        targetId: row.target_id,
        title: unit?.title ?? null,
        href: unit?.href ?? null,
        state: completed.has(row.target_id) ? 'complete' : 'not-started',
      }
      if (unit) grouped.set(unit.subjectId, [...(grouped.get(unit.subjectId) ?? []), item])
      else unavailable.push(item)
    }
  }
  const bookmarkGroups: DashboardBookmarkGroup[] = index.subjects
    .filter((subject) => grouped.has(subject.id))
    .map((subject) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      items: grouped.get(subject.id) ?? [],
    }))
  if (unavailable.length > 0) {
    bookmarkGroups.push({ subjectId: null, subjectName: null, items: unavailable })
  }

  return { continueStudying, subjects, recentHighlights, recentNotes, bookmarkGroups }
}

/* ---------------------------------------------------- My Highlights */

export type MyHighlightRow = {
  id: string
  color: StudyHighlightColor
  snapshot: string
  moved: boolean
  orphaned: boolean
  daysAgo: number
  /** The attached note's text — drives the delete-asks-once copy too. */
  noteText: string | null
  target: StudyTarget
}

export type MyHighlightSubtopicGroup = {
  /** null title/href → unit no longer published. */
  id: string
  title: string | null
  href: string | null
  rows: MyHighlightRow[]
}

export type MyHighlightSubjectGroup = {
  /** null → the trailing "No longer available" group. */
  subjectId: string | null
  subjectName: string | null
  subtopics: MyHighlightSubtopicGroup[]
}

export type MyHighlightsData = {
  /** Pinned first when any exist (M1 §5.5 — orphans never vanish). */
  orphaned: MyHighlightRow[]
  groups: MyHighlightSubjectGroup[]
  total: number
}

/**
 * The full highlight library for /dashboard/highlights, ONE fan-out: the
 * cached tree + every highlight + attached notes. Non-orphans group by
 * subject › subtopic in tree order (newest first within a unit); orphans
 * pin to their own section with note text for the in-reader restore hint.
 */
export async function getMyHighlights(): Promise<MyHighlightsData | null> {
  const session = await requireUser()
  if (!session) return null
  const { supabase } = session

  const [tree, highlightRows, noteRows] = await Promise.all([
    getPublishedTree(),
    supabase
      .from('highlights')
      .select('id, subtopic_id, color, text_snapshot, moved, orphaned, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('user_notes').select('highlight_id, content').not('highlight_id', 'is', null),
  ])

  const index = indexTree(tree)
  const nowMs = Date.now()

  const noteByHighlight = new Map<string, string>()
  for (const row of noteRows.data ?? []) {
    if (row.highlight_id && !noteByHighlight.has(row.highlight_id)) {
      noteByHighlight.set(row.highlight_id, noteDocToText(row.content))
    }
  }

  const orphaned: MyHighlightRow[] = []
  // subtopic id → rows, insertion in created_at desc order.
  const bySubtopic = new Map<string, MyHighlightRow[]>()
  const unavailableRows: MyHighlightRow[] = []

  for (const row of highlightRows.data ?? []) {
    const unit = index.units.get(row.subtopic_id)
    const item: MyHighlightRow = {
      id: row.id,
      color: row.color,
      snapshot: row.text_snapshot,
      moved: row.moved,
      orphaned: row.orphaned,
      daysAgo: daysSince(row.created_at, nowMs),
      noteText: noteByHighlight.get(row.id) ?? null,
      target: unit ? { title: unit.title, href: unit.href } : null,
    }
    if (row.orphaned) {
      orphaned.push(item)
    } else if (unit) {
      bySubtopic.set(row.subtopic_id, [...(bySubtopic.get(row.subtopic_id) ?? []), item])
    } else {
      unavailableRows.push(item)
    }
  }

  // Subject › subtopic groups in tree order — only subjects/units that
  // actually hold highlights.
  const groups: MyHighlightSubjectGroup[] = []
  for (const subject of index.subjects) {
    const subtopics: MyHighlightSubtopicGroup[] = []
    for (const unitId of subject.unitIds) {
      const rows = bySubtopic.get(unitId)
      if (!rows) continue
      const unit = index.units.get(unitId)
      subtopics.push({
        id: unitId,
        title: unit?.title ?? null,
        href: unit?.href ?? null,
        rows,
      })
    }
    if (subtopics.length > 0) {
      groups.push({ subjectId: subject.id, subjectName: subject.name, subtopics })
    }
  }
  if (unavailableRows.length > 0) {
    groups.push({
      subjectId: null,
      subjectName: null,
      subtopics: [{ id: 'unavailable', title: null, href: null, rows: unavailableRows }],
    })
  }

  return { orphaned, groups, total: highlightRows.data?.length ?? 0 }
}
