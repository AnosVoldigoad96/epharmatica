import { z } from 'zod'

/**
 * Content-tree metadata (M4 §5.2 · M1 §4/§6 · migrations 004/005).
 * Validation mirrors the DB checks exactly — slug format, semester range
 * 1–10, topic description ≤ 280 — and is shared by the CMS forms (client)
 * and the server actions (M4: "Validation mirrors public constraints
 * exactly (shared Zod schemas)").
 */

/** Mirrors the *_slug_format CHECKs: lowercase, hyphenated, alnum ends. */
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(80, 'At most 80 characters')
  .regex(SLUG_REGEX, 'Lowercase letters, numbers, and single hyphens only')

const nameSchema = z.string().trim().min(2, '2–120 characters').max(120, '2–120 characters')

const semesterSchema = z.number().int().min(1, 'Semesters run 1–10').max(10, 'Semesters run 1–10')

export const CONTENT_LEVELS = ['subject', 'chapter', 'topic', 'subtopic'] as const
export type ContentLevel = (typeof CONTENT_LEVELS)[number]

/**
 * Derive a slug from a name — the auto-slug the forms prefill (M4 §5.2).
 * Mirrors SLUG_REGEX: lowercase, non-alnum runs collapse to one hyphen,
 * no leading/trailing hyphens, capped at 80.
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

export const subjectMetadataSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  description: z
    .string()
    .trim()
    .max(500, 'At most 500 characters')
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  icon: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  defaultSemester: semesterSchema.optional().nullable(),
})

export const chapterMetadataSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
})

export const topicMetadataSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  // varchar(280) in the DB (M1 §5.1 — the topic-overview paragraph).
  description: z
    .string()
    .trim()
    .max(280, 'At most 280 characters')
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  semester: semesterSchema.optional().nullable(),
})

/** Creating a subtopic from the topic list editor (content comes later). */
export const subtopicCreateSchema = z.object({
  title: z.string().trim().min(2, '2–160 characters').max(160, '2–160 characters'),
  slug: slugSchema,
})

export type SubjectMetadata = z.infer<typeof subjectMetadataSchema>
export type ChapterMetadata = z.infer<typeof chapterMetadataSchema>
export type TopicMetadata = z.infer<typeof topicMetadataSchema>
export type SubtopicCreate = z.infer<typeof subtopicCreateSchema>
