import { z } from 'zod'

import { DATE_VALUE_PATTERN } from './date'
import { CALLOUT_VARIANTS } from './types'
import type { Content } from './types'
import { parseYouTubeUrl } from './youtube'

/**
 * Zod validation for the block schema (rules.md §6.5): a document that
 * fails validation never reaches the database. Schemas are STRICT — unknown
 * block types, unknown props, and editor-internal leftovers are rejected,
 * which is what keeps the stored format stable across Plate upgrades (I4).
 *
 * Schema v2 additions: container lists (ul/ol/li/lic), toggle, hr,
 * column_group, inline date, align/lineHeight/indent block styling,
 * color/background/size text marks, table cell spans, KaTeX equations
 * (block `equation` + inline `inline_equation`, both carrying a bounded
 * `texExpression`). The v1 flat-list spelling (p + listStyleType) still
 * VALIDATES — stored rows must load — but the serializer never writes it
 * again.
 */

/** Bounded CSS color: hex, bare named color, or rgb()/rgba(). No urls,
 * functions, or expressions — the renderer inlines these as styles. */
const CSS_COLOR_PATTERN =
  /^(#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?|[a-zA-Z]{2,25}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d{1,4})\s*)?\))$/

/** Bounded CSS length for font sizes. */
const CSS_FONT_SIZE_PATTERN = /^\d{1,3}(\.\d{1,3})?(px|em|rem|%)$/

/** Column width: percentage only (Plate layout convention). */
const COLUMN_WIDTH_PATTERN = /^\d{1,3}(\.\d{1,3})?%$/

export const cssColorSchema = z.string().max(40).regex(CSS_COLOR_PATTERN)

const markProps = {
  bold: z.literal(true).optional(),
  italic: z.literal(true).optional(),
  underline: z.literal(true).optional(),
  strikethrough: z.literal(true).optional(),
  code: z.literal(true).optional(),
  sub: z.literal(true).optional(),
  sup: z.literal(true).optional(),
  highlight: z.literal(true).optional(),
  kbd: z.literal(true).optional(),
  color: cssColorSchema.optional(),
  backgroundColor: cssColorSchema.optional(),
  fontSize: z.string().max(16).regex(CSS_FONT_SIZE_PATTERN).optional(),
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

/** Slate-compatible void children: exactly one empty text node. */
const voidChildren = z.tuple([z.strictObject({ text: z.literal('') })])

const dateNodeSchema = z.strictObject({
  type: z.literal('date'),
  date: z.string().regex(DATE_VALUE_PATTERN),
  children: voidChildren,
})

/** TeX source bound: generous for real formulas, a ceiling for hostile
 * payloads (KaTeX renders with throwOnError:false + trust:false). */
const texExpressionSchema = z.string().max(2000)

const inlineEquationNodeSchema = z.strictObject({
  type: z.literal('inline_equation'),
  texExpression: texExpressionSchema,
  children: voidChildren,
})

const inlineNodeSchema = z.union([
  textNodeSchema,
  linkNodeSchema,
  dateNodeSchema,
  inlineEquationNodeSchema,
])

const inlineChildren = z.array(inlineNodeSchema).min(1)

/** Block-level styling (schema v2). `start` alignment is never stored. */
const alignProp = z.enum(['left', 'center', 'right', 'justify']).optional()
const lineHeightProp = z.number().min(0.8).max(3).optional()
// Max 20 keeps headroom for deep v1 flat-list nesting already in storage.
const indentProp = z.number().int().min(1).max(20).optional()

const nestedParagraphSchema = z.strictObject({
  type: z.literal('p'),
  children: inlineChildren,
  align: alignProp,
  lineHeight: lineHeightProp,
})

const blockId = z.string().min(1)

/* -------------------------------------------------------------- factories
 * Column children are the same shapes without `id` — every block schema is
 * a factory over `withId` so the two stay in lockstep automatically. */

type IdMode = { withId: boolean }

/** id + indent live at the top level only (columns nest neither). */
const topLevelProps = ({ withId }: IdMode) => (withId ? { id: blockId, indent: indentProp } : {})

const paragraphBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('p'),
    children: inlineChildren,
    align: alignProp,
    lineHeight: lineHeightProp,
    // v1 LEGACY flat-list spelling — still validates so stored rows load.
    listStyleType: z.enum(['disc', 'decimal']).optional(),
  })

const headingBlockSchema = (level: 'h2' | 'h3', mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal(level),
    children: inlineChildren,
    align: alignProp,
    lineHeight: lineHeightProp,
  })

const blockquoteBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('blockquote'),
    children: inlineChildren,
    align: alignProp,
    lineHeight: lineHeightProp,
  })

const calloutBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('callout'),
    variant: z.enum(CALLOUT_VARIANTS),
    children: z.array(nestedParagraphSchema).min(1),
  })

const cellSpan = z.number().int().min(1).max(50).optional()

const tableCellSchema = z.strictObject({
  type: z.enum(['td', 'th']),
  children: z.array(nestedParagraphSchema).min(1),
  colSpan: cellSpan,
  rowSpan: cellSpan,
})

const tableRowSchema = z.strictObject({
  type: z.literal('tr'),
  children: z.array(tableCellSchema).min(1),
})

const tableBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('table'),
    children: z.array(tableRowSchema).min(1),
  })

const imageBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
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

const videoBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
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

const codeBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('code_block'),
    lang: z.string().optional(),
    children: z.array(codeLineSchema).min(1),
  })

const tocBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('toc'),
    children: voidChildren,
  })

const hrBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('hr'),
    children: voidChildren,
  })

/** Block equation (display math) — also legal as an id-less column child. */
const equationBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('equation'),
    texExpression: texExpressionSchema,
    children: voidChildren,
  })

/* ------------------------------------------------------------------ lists */

const listItemContentSchema = z.strictObject({
  type: z.literal('lic'),
  children: inlineChildren,
})

type ListItemShape = {
  type: 'li'
  children: unknown[]
}

// li = [lic] or [lic, nested ul/ol]. z.lazy breaks the type cycle.
const listItemSchema: z.ZodType<ListItemShape> = z.lazy(() =>
  z.strictObject({
    type: z.literal('li'),
    children: z
      .array(z.union([listItemContentSchema, nestedListSchema]))
      .min(1)
      .max(2)
      .refine(
        (children) =>
          (children[0] as { type: string }).type === 'lic' &&
          (children.length === 1 || (children[1] as { type: string }).type !== 'lic'),
        { message: 'List item must be one lic followed by at most one nested list' },
      ),
  }),
) as unknown as z.ZodType<ListItemShape>

const nestedListSchema = z.strictObject({
  type: z.enum(['ul', 'ol']),
  children: z.array(listItemSchema).min(1),
})

const listBlockSchema = (mode: IdMode) =>
  z.strictObject({
    ...topLevelProps(mode),
    type: z.enum(['ul', 'ol']),
    children: z.array(listItemSchema).min(1),
  })

/* ----------------------------------------------------------------- toggle */

const toggleBlockSchema = z.strictObject({
  id: blockId,
  indent: indentProp,
  type: z.literal('toggle'),
  children: inlineChildren,
})

/* -------------------------------------------------------------- drug card */

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

function drugCardBlockSchemaOf(mode: IdMode) {
  return z.strictObject({
    ...topLevelProps(mode),
    type: z.literal('drug_card'),
    fields: drugCardFieldsSchema,
    children: voidChildren,
  })
}

/* ---------------------------------------------------------------- columns */

/**
 * Column children (founder amendment, 2026-07-26): every block type EXCEPT
 * toggle (top-level indent containment) and column_group (no recursion) —
 * keep in lockstep with COLUMN_CHILD_TYPES (types.ts). All id-less: the
 * group is the one anchor unit, so column-hosted headings/toc/equations
 * never join the outline/TOC/anchor machinery.
 */
const columnChildSchema = z.union([
  paragraphBlockSchema({ withId: false }),
  headingBlockSchema('h2', { withId: false }),
  headingBlockSchema('h3', { withId: false }),
  blockquoteBlockSchema({ withId: false }),
  calloutBlockSchema({ withId: false }),
  tableBlockSchema({ withId: false }),
  imageBlockSchema({ withId: false }),
  videoBlockSchema({ withId: false }),
  codeBlockSchema({ withId: false }),
  tocBlockSchema({ withId: false }),
  drugCardBlockSchemaOf({ withId: false }),
  listBlockSchema({ withId: false }),
  hrBlockSchema({ withId: false }),
  equationBlockSchema({ withId: false }),
])

const columnSchema = z.strictObject({
  type: z.literal('column'),
  width: z.string().regex(COLUMN_WIDTH_PATTERN).optional(),
  children: z.array(columnChildSchema).min(1),
})

const columnGroupBlockSchema = z.strictObject({
  id: blockId,
  indent: indentProp,
  type: z.literal('column_group'),
  children: z.array(columnSchema).min(2).max(4),
})

/* -------------------------------------------------------------- documents */

export const blockSchema = z.discriminatedUnion('type', [
  paragraphBlockSchema({ withId: true }),
  headingBlockSchema('h2', { withId: true }),
  headingBlockSchema('h3', { withId: true }),
  blockquoteBlockSchema({ withId: true }),
  calloutBlockSchema({ withId: true }),
  tableBlockSchema({ withId: true }),
  imageBlockSchema({ withId: true }),
  videoBlockSchema({ withId: true }),
  codeBlockSchema({ withId: true }),
  tocBlockSchema({ withId: true }),
  drugCardBlockSchemaOf({ withId: true }),
  listBlockSchema({ withId: true }),
  toggleBlockSchema,
  hrBlockSchema({ withId: true }),
  equationBlockSchema({ withId: true }),
  columnGroupBlockSchema,
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
