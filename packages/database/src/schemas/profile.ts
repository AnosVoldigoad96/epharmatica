import { z } from 'zod'
import { USER_TYPES } from './auth'

/**
 * Profile editing + account preferences (M2 §4.5/§4.6 · master PRD §9).
 * Field limits mirror the profiles table checks (migration 002): display name
 * 2–50, institution ≤ 120, bio ≤ 280; country is a 2-letter ISO-3166 alpha-2
 * code. profiles.prefs is stored as jsonb `{theme, text_size}` — snake_case
 * in the DB, camelCase in the app; convert at the boundary with
 * toStoredPrefs/fromStoredPrefs.
 */
export const THEMES = ['system', 'light', 'dark'] as const

export const TEXT_SIZES = [14, 16, 18] as const

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2, '2–50 characters').max(50, '2–50 characters'),
  userType: z.enum(USER_TYPES),
  country: z
    .string()
    .trim()
    .length(2, 'Use a 2-letter country code')
    .toUpperCase()
    .optional()
    .nullable(),
  institution: z
    .string()
    .trim()
    .max(120, 'At most 120 characters')
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  bio: z
    .string()
    .trim()
    .max(280, 'At most 280 characters')
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
})

export const prefsSchema = z.object({
  theme: z.enum(THEMES),
  textSize: z.union([z.literal(14), z.literal(16), z.literal(18)]),
})

export type Theme = (typeof THEMES)[number]
export type TextSize = (typeof TEXT_SIZES)[number]
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>
export type Prefs = z.infer<typeof prefsSchema>

/** Stored shape of profiles.prefs — the DB key is snake_case `text_size`. */
export type StoredPrefs = { theme: Theme; text_size: TextSize }

// Lenient reader for the jsonb column: any missing/legacy/invalid value falls
// back to the defaults (theme 'system', text size 16) instead of throwing.
const storedPrefsSchema = z
  .object({
    theme: z.enum(THEMES).catch('system'),
    text_size: z.union([z.literal(14), z.literal(16), z.literal(18)]).catch(16),
  })
  .catch({ theme: 'system', text_size: 16 })

/** App prefs → the jsonb shape written to profiles.prefs. */
export function toStoredPrefs(prefs: Prefs): StoredPrefs {
  return { theme: prefs.theme, text_size: prefs.textSize }
}

/** profiles.prefs jsonb (any shape, including legacy rows) → app prefs. */
export function fromStoredPrefs(stored: unknown): Prefs {
  const parsed = storedPrefsSchema.parse(stored)
  return { theme: parsed.theme, textSize: parsed.text_size }
}
