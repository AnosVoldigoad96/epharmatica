import { z } from 'zod'
import type { AnchorKind } from '@epharmatica/editor'

/**
 * The study layer's shared shapes (1.D · M1 §5.5–§5.8): the v:1 typed
 * anchor, the four highlighter colors, and the zod validation the server
 * actions run on every client-supplied anchor. Mirrors the DB CHECKs
 * (anchor v:1, snapshot ≤ 1000) and @epharmatica/editor's run-API contract
 * — offsets always index the canonical text `getTextRuns(block, path)`
 * returns; nothing here touches Slate internals (I4).
 */

export const HIGHLIGHT_COLORS = ['amber', 'mint', 'lilac', 'rose'] as const
export type StudyHighlightColor = (typeof HIGHLIGHT_COLORS)[number]

export const ANCHOR_KINDS = [
  'prose',
  'table',
  'drugcard',
  'code',
  'caption',
  'list',
] as const satisfies readonly AnchorKind[]

/** M1 §5.5: max selection 1,000 characters (DB CHECK re-verifies). */
export const MAX_SNAPSHOT_LENGTH = 1000

/** Free/attached note plain-text cap — keeps `content` jsonb bounded. */
export const MAX_NOTE_LENGTH = 5000

export const anchorSchema = z
  .object({
    v: z.literal(1),
    block_id: z.string().min(1).max(128),
    kind: z.enum(ANCHOR_KINDS),
    path: z.array(z.union([z.string().max(64), z.number().int().min(0)])).max(8),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    snapshot: z.string().min(1).max(MAX_SNAPSHOT_LENGTH),
  })
  .refine((anchor) => anchor.end > anchor.start, { message: 'end must exceed start' })
  .refine((anchor) => anchor.snapshot.length === anchor.end - anchor.start, {
    message: 'snapshot length must match offsets',
  })

export type StudyAnchor = z.infer<typeof anchorSchema>

export const colorSchema = z.enum(HIGHLIGHT_COLORS)

const uuidSchema = z.uuid()

export const createHighlightSchema = z.object({
  subtopicId: uuidSchema,
  anchor: anchorSchema,
  color: colorSchema,
  /** Plain text — the server converts to the standard block array (v1). */
  note: z.string().trim().min(1).max(MAX_NOTE_LENGTH).optional(),
})

export const updateColorSchema = z.object({
  highlightId: uuidSchema,
  color: colorSchema,
})

export const restoreOrphanSchema = z.object({
  highlightId: uuidSchema,
  anchor: anchorSchema,
})

export const createNoteSchema = z.object({
  subtopicId: uuidSchema,
  text: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
  highlightId: uuidSchema.optional(),
})

export const updateNoteSchema = z.object({
  noteId: uuidSchema,
  text: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
})

export const toggleBookmarkSchema = z.object({
  targetType: z.enum(['subtopic', 'topic']),
  targetId: uuidSchema,
})

export const setProgressSchema = z.object({
  subtopicId: uuidSchema,
  completed: z.boolean(),
})

export const idSchema = uuidSchema

/**
 * The study-state payload the reader layer fetches once on mount
 * (queries.ts) — everything below is per-owner data under RLS.
 */
export type StudyNote = {
  id: string
  /** Plain text extracted from the stored block array. */
  text: string
  highlightId: string | null
  updatedAt: string
}

export type StudyHighlight = {
  id: string
  color: StudyHighlightColor
  /** Parsed v:1 anchor — null when a stored row fails validation. */
  anchor: StudyAnchor | null
  textSnapshot: string
  moved: boolean
  orphaned: boolean
  createdAt: string
  note: StudyNote | null
}

export type StudyState = {
  highlights: StudyHighlight[]
  freeNotes: StudyNote[]
  bookmarked: boolean
  completedAt: string | null
  /** feature_flags.highlight_kinds — enabled=false hides creation entirely. */
  highlightsEnabled: boolean
  allowedKinds: AnchorKind[]
}
