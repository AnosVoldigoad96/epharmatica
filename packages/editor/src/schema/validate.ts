import { z } from 'zod'

import { CALLOUT_VARIANTS } from './types'
import type { Content } from './types'
import { parseYouTubeUrl } from './youtube'

/**
 * Zod validation for the block schema (rules.md §6.5): a document that
 * fails validation never reaches the database. Schemas are STRICT — unknown
 * block types, unknown props, and editor-internal leftovers are rejected,
 * which is what keeps the stored format stable across Plate upgrades (I4).
 */

const markProps = {
  bold: z.literal(true).optional(),
  italic: z.literal(true).optional(),
  underline: z.literal(true).optional(),
  strikethrough: z.literal(true).optional(),
  code: z.literal(true).optional(),
  sub: z.literal(true).optional(),
  sup: z.literal(true).optional(),
}

const textNodeSchema = z.strictObject({
  text: z.string(),
  ...markProps,
})

const linkNodeSchema = z.strictObject({
  type: z.literal('a'),
  url: z.url(),
  children: z.array(textNodeSchema).min(1),
})

const inlineNodeSchema = z.union([textNodeSchema, linkNodeSchema])

const inlineChildren = z.array(inlineNodeSchema).min(1)

const nestedParagraphSchema = z.strictObject({
  type: z.literal('p'),
  children: inlineChildren,
})

/** Slate-compatible void children: exactly one empty text node. */
const voidChildren = z.tuple([z.strictObject({ text: z.literal('') })])

const blockId = z.string().min(1)

const paragraphBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('p'),
  children: inlineChildren,
  listStyleType: z.enum(['disc', 'decimal']).optional(),
  indent: z.number().int().min(1).optional(),
})

const headingBlockSchema = (level: 'h2' | 'h3') =>
  z.strictObject({
    id: blockId,
    type: z.literal(level),
    children: inlineChildren,
  })

const blockquoteBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('blockquote'),
  children: inlineChildren,
})

const calloutBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('callout'),
  variant: z.enum(CALLOUT_VARIANTS),
  children: z.array(nestedParagraphSchema).min(1),
})

const tableCellSchema = z.strictObject({
  type: z.enum(['td', 'th']),
  children: z.array(nestedParagraphSchema).min(1),
})

const tableRowSchema = z.strictObject({
  type: z.literal('tr'),
  children: z.array(tableCellSchema).min(1),
})

const tableBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('table'),
  children: z.array(tableRowSchema).min(1),
})

const imageBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('img'),
  url: z.url(),
  // Alt is the a11y floor (rules.md §8.2) — enforced here AND at upload.
  alt: z.string().trim().min(1),
  asset_id: z.uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.array(textNodeSchema).optional(),
  children: voidChildren,
})

const videoBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('video'),
  // Unparseable YouTube URLs fail at save (M1 §9 — CMS contract).
  url: z.string().refine((value) => parseYouTubeUrl(value) !== null, {
    message: 'Not a recognizable YouTube URL',
  }),
  // Mandatory caption line (M1 §5.3 — a legal obligation).
  caption: z
    .array(textNodeSchema)
    .min(1)
    .refine((nodes) => nodes.some((node) => node.text.trim().length > 0), {
      message: 'Video caption is required',
    }),
  children: voidChildren,
})

const codeLineSchema = z.strictObject({
  type: z.literal('code_line'),
  children: z.array(textNodeSchema).min(1),
})

const codeBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('code_block'),
  lang: z.string().optional(),
  children: z.array(codeLineSchema).min(1),
})

const tocBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('toc'),
  children: voidChildren,
})

// Explicit roster — keep in lockstep with DRUG_CARD_FIELD_KEYS (types.ts).
const drugCardFieldsSchema = z.strictObject({
  generic_name: z.string().trim().min(1),
  brand_names: z.string().optional(),
  drug_class: z.string().optional(),
  mechanism: z.string().optional(),
  indications: z.string().optional(),
  contraindications: z.string().optional(),
  adverse_effects: z.string().optional(),
  interactions: z.string().optional(),
  dosing: z.string().optional(),
  monitoring: z.string().optional(),
  pregnancy_lactation: z.string().optional(),
  notes: z.string().optional(),
})

const drugCardBlockSchema = z.strictObject({
  id: blockId,
  type: z.literal('drug_card'),
  fields: drugCardFieldsSchema,
  children: voidChildren,
})

export const blockSchema = z.discriminatedUnion('type', [
  paragraphBlockSchema,
  headingBlockSchema('h2'),
  headingBlockSchema('h3'),
  blockquoteBlockSchema,
  calloutBlockSchema,
  tableBlockSchema,
  imageBlockSchema,
  videoBlockSchema,
  codeBlockSchema,
  tocBlockSchema,
  drugCardBlockSchema,
])

export const contentSchema = z.array(blockSchema)

export type ValidateContentResult = { ok: true; content: Content } | { ok: false; errors: string[] }

/** Validate an untrusted jsonb payload into a typed document. */
export function validateContent(value: unknown): ValidateContentResult {
  const result = contentSchema.safeParse(value)
  if (result.success) {
    return { ok: true, content: result.data as Content }
  }
  return {
    ok: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`,
    ),
  }
}
