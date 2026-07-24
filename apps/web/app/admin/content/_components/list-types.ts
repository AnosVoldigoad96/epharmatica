import type { ContentLevel } from '@epharmatica/database'
import type { ContentStatus } from '@/features/content/tree'

/**
 * Serializable contract between the RSC pages (which slice the tree) and
 * the client list editor (M4 §5.1). Everything the sheets need — slug-lock
 * state, public path segments for URL previews, legal move targets — rides
 * in as plain data.
 */

export type RowStatus =
  { kind: 'rollup'; published: number; total: number } | { kind: 'own'; status: ContentStatus }

export type NodeFormValues = {
  name: string
  slug: string
  description?: string | null
  icon?: string | null
  defaultSemester?: number | null
  semester?: number | null
}

export type MoveTarget = {
  id: string
  label: string
  group: string
  current: boolean
  /** Public path segments of the destination parent (for the new-URL line). */
  pathSegments: string[]
  /**
   * Subtopic destinations only: 'chapter' attaches the page directly to the
   * chapter (flexible leaves, 020). Omitted/'topic' = the classic reparent.
   */
  parentLevel?: 'topic' | 'chapter'
}

export type ListRow = {
  id: string
  name: string
  slug: string
  status: RowStatus
  semester: number | null
  updatedAt: string
  /** "Open ›" target — null when the level has no child list yet. */
  openHref: string | null
  /** Published subtopics beneath (self for subtopics): locks the slug. */
  publishedBeneath: number
  /** Full public path segments including this node's own slug. */
  pathSegments: string[]
  form: NodeFormValues
}

export type ListEditorData = {
  level: ContentLevel
  parentId: string | null
  rows: ListRow[]
  moveTargets: MoveTarget[]
  /** Role is content_manager+ — shows Move… and the rename ceremony. */
  canManage: boolean
  /**
   * Chapter list only (flexible leaves, 020): content pages attached
   * directly to the chapter, rendered as a second group AFTER the topics —
   * separate sort space, own move targets, KIND chips distinguish rows.
   */
  pages?: { rows: ListRow[]; moveTargets: MoveTarget[] }
}
