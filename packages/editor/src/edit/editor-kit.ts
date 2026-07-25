import emojiMartDataRaw from '@emoji-mart/data'
import type { EmojiMartData } from '@emoji-mart/data'
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H2Plugin,
  H3Plugin,
  HighlightPlugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  KbdPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react'
import {
  FontBackgroundColorPlugin,
  FontColorPlugin,
  FontSizePlugin,
  LineHeightPlugin,
  TextAlignPlugin,
} from '@platejs/basic-styles/react'
import { CodeBlockPlugin } from '@platejs/code-block/react'
import { DatePlugin } from '@platejs/date/react'
import { DndPlugin } from '@platejs/dnd'
import { EmojiPlugin } from '@platejs/emoji/react'
import { IndentPlugin } from '@platejs/indent/react'
import { ColumnItemPlugin, ColumnPlugin } from '@platejs/layout/react'
import { LinkPlugin } from '@platejs/link/react'
import { BulletedListRules, OrderedListRules } from '@platejs/list-classic'
import { ListPlugin } from '@platejs/list-classic/react'
import { MathRules } from '@platejs/math'
import { EquationPlugin, InlineEquationPlugin } from '@platejs/math/react'
import { SlashPlugin } from '@platejs/slash-command/react'
import { TablePlugin } from '@platejs/table/react'
import { TogglePlugin } from '@platejs/toggle/react'
import type { AnyPluginConfig, SlateEditor } from 'platejs'
import {
  createBlockFenceInputRule,
  createBlockStartInputRule,
  createMarkInputRule,
  NodeIdPlugin,
  TrailingBlockPlugin,
} from 'platejs'
import { createPlatePlugin } from 'platejs/react'

import { BlockDraggable } from './draggable'

/**
 * The Plate v53 plugin kit, configured to OUR block schema (schema/types.ts)
 * — every node type and prop the kit produces is one the strict Zod
 * validator accepts, so the serializer's whitelist stays a formality:
 *
 *  - Headings h2/h3 only (h1 is the page title — M1 §5.2), blockquote, marks
 *    (+ highlight/kbd), inline link ('a' + url).
 *  - Subscript/superscript are RENAMED to `sub`/`sup` via node.type: both
 *    the toggle transform (editor.getType) and the leaf render lookup
 *    (leaf[plugin.node.type]) key off node.type, so the text-node prop is
 *    exactly the schema's `sub: true` / `sup: true`.
 *  - LISTS are CLASSIC containers (@platejs/list-classic, schema v2):
 *    whole ul/ol blocks with li → lic children. Enter adds an li, Enter on
 *    an empty li outdents/exits, Tab/Shift+Tab nest/unnest (the plugin
 *    overrides editor.tf.tab; the core editable dispatches Tab to it).
 *    Task lists are NOT registered — the schema has no checkbox state.
 *  - TextAlign/LineHeight inject `align`/`lineHeight` on p/h2/h3/blockquote
 *    (align default 'start' unsets); Indent injects `indent` on every
 *    top-level block type — Plate's toggle containment model reads it.
 *  - Font color/background/size are leaf props with bounded CSS values
 *    (the serializer + Zod validate them).
 *  - Toggle uses the official indent model: contents are following blocks
 *    with deeper indent; open state lives in plugin options, never on nodes.
 *  - Columns: column_group/column containers (no headings/toc/toggles
 *    inside — the serializer rejects them; the insert roster and turn-into
 *    UI never offer them there).
 *  - Table → table/tr/td/th with paragraph cell children; cell merging is
 *    ENABLED (schema v2): colSpan/rowSpan ≥ 2 persist, editor-only sizing
 *    props (colSizes/marginLeft) are stripped at save.
 *  - Code block → code_block/code_line with `lang`; lowlight is null — no
 *    syntax-token decorations (the schema stores plain code lines).
 *  - Emoji: ':' opens an inline combobox (editor-time `emoji_input`
 *    element, flattened at save); the chosen emoji inserts as PLAIN TEXT —
 *    no storage impact at all.
 *  - Date: inline void `date` element with canonical YYYY-MM-DD payload.
 *  - EQUATIONS (official @platejs/math): block `equation` + inline
 *    `inline_equation` voids carrying `texExpression` — exactly the schema
 *    shapes. Official markdown rules: `$tex$` → inline, `$$` + Enter →
 *    block (both self-gate out of code blocks and existing equations).
 *  - NodeIdPlugin stamps `id` on blocks (replacing the core instance, so it
 *    stays enabled under NODE_ENV=test too). Nested elements (li/lic/tr/td/
 *    column/nested p/code_line) may still receive ids — the serializer
 *    strips ids at any depth below the top level.
 */

/** Callout: non-void element, children are plain paragraphs, `variant` prop. */
export const CalloutPlugin = createPlatePlugin({
  key: 'callout',
  node: { isElement: true },
  rules: {
    // Enter on an empty trailing paragraph exits the callout.
    break: { empty: 'exit' },
    delete: { start: 'lift' },
  },
})

/** Image void — url/alt/asset_id/width/height snapshot + optional caption. */
export const ImagePlugin = createPlatePlugin({
  key: 'img',
  node: { isElement: true, isVoid: true },
})

/** YouTube video void — url + mandatory caption. */
export const VideoPlugin = createPlatePlugin({
  key: 'video',
  node: { isElement: true, isVoid: true },
})

/** TOC void — renders from document headings, carries no payload. */
export const TocPlugin = createPlatePlugin({
  key: 'toc',
  node: { isElement: true, isVoid: true },
})

/** Drug Card void — payload lives in the `fields` object. */
export const DrugCardPlugin = createPlatePlugin({
  key: 'drug_card',
  node: { isElement: true, isVoid: true },
})

/* --------------------------------------------------- markdown input rules */

/**
 * Markdown autoformat, v53-style: explicit `inputRules` on one plugin (the
 * former AutoformatPlugin is an inert compatibility shim in v53 and throws
 * when combined with input rules). ONLY rules that land inside OUR schema:
 *
 *  - `#`/`##` + space → h2/h3 (h1 stays reserved for the page title),
 *    `>` + space → flat blockquote (set, not wrap — the schema has no
 *    nested paragraphs under blockquote);
 *  - `-`/`*`/`1.`/`1)` + space → CLASSIC container lists (official
 *    list-classic rules, configured on ListPlugin below);
 *  - `---` → horizontal rule;
 *  - ` ``` ` fence → code_block; backtick pair → inline `code` mark;
 *  - `**bold**` / `*italic*` marks.
 *
 * Block conversions are gated to TOP-LEVEL paragraphs so callout bodies,
 * table cells, column contents, and code lines never morph into
 * schema-invalid nesting.
 */

const inTopLevelParagraph = ({ editor }: { editor: SlateEditor }): boolean => {
  const entry = editor.api.block()
  return entry !== undefined && entry[0].type === 'p' && entry[1].length === 1
}

const blockConversionRule = (match: string, type: 'h2' | 'h3' | 'blockquote') =>
  createBlockStartInputRule({
    match,
    trigger: ' ',
    enabled: inTopLevelParagraph,
    apply: ({ editor }, ruleMatch) => {
      editor.tf.delete({ at: ruleMatch.range })
      editor.tf.setNodes({ type }, { match: (node) => editor.api.isBlock(node) })
      return true
    },
  })

export const MarkdownRulesPlugin = createPlatePlugin({
  key: 'epharm_markdown',
  inputRules: [
    blockConversionRule('#', 'h2'),
    blockConversionRule('##', 'h3'),
    blockConversionRule('>', 'blockquote'),
    // `---` on an otherwise-empty paragraph → horizontal rule.
    createBlockStartInputRule({
      match: '--',
      trigger: '-',
      enabled: inTopLevelParagraph,
      apply: ({ editor }, ruleMatch) => {
        editor.tf.delete({ at: ruleMatch.range })
        const entry = editor.api.block()
        if (!entry) return false
        const at = entry[1]
        editor.tf.withoutNormalizing(() => {
          editor.tf.removeNodes({ at })
          editor.tf.insertNodes(
            [
              { type: 'hr', children: [{ text: '' }] },
              { type: 'p', children: [{ text: '' }] },
            ],
            { at },
          )
        })
        editor.tf.select({ path: [(at[0] as number) + 1, 0], offset: 0 })
        return true
      },
    }),
    // ``` on an otherwise-empty paragraph → code block.
    createBlockFenceInputRule({
      fence: '```',
      block: 'p',
      on: 'match',
      priority: 100,
      enabled: inTopLevelParagraph,
      apply: ({ editor }, match) => {
        editor.tf.withoutNormalizing(() => {
          editor.tf.removeNodes({ at: match.path })
          editor.tf.insertNodes(
            { type: 'code_block', children: [{ type: 'code_line', children: [{ text: '' }] }] },
            { at: match.path, select: true },
          )
        })
        return true
      },
    }),
    // Marks — bold before italic so `**` wins the shared `*` trigger.
    createMarkInputRule({ start: '**', end: '*', trigger: '*', mark: 'bold' }),
    createMarkInputRule({ start: '*', trigger: '*', mark: 'italic' }),
    createMarkInputRule({ start: '`', trigger: '`', mark: 'code' }),
  ],
})

/** Every top-level block type — Indent targets (toggle containment). */
const INDENT_TARGETS = [
  'p',
  'h2',
  'h3',
  'blockquote',
  'callout',
  'table',
  'img',
  'video',
  'code_block',
  'toc',
  'drug_card',
  'ul',
  'ol',
  'toggle',
  'hr',
  'equation',
  'column_group',
]

// Widened to AnyPluginConfig[]: the inferred tuple of 30+ plugin generics
// blows TypeScript's instantiation depth at the <Plate/> boundary.
export const editorKit: AnyPluginConfig[] = [
  // Blocks (paragraph comes from the core BaseParagraphPlugin, type 'p').
  H2Plugin,
  H3Plugin,
  BlockquotePlugin,
  HorizontalRulePlugin,
  // Marks — sub/sup renamed to the schema props.
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,
  HighlightPlugin,
  KbdPlugin,
  SubscriptPlugin.configure({ node: { type: 'sub' } }),
  SuperscriptPlugin.configure({ node: { type: 'sup' } }),
  // Font styling — leaf props color/backgroundColor/fontSize.
  FontColorPlugin,
  FontBackgroundColorPlugin,
  FontSizePlugin,
  // Inline link — type 'a', prop `url`.
  LinkPlugin,
  // Block styling injections. Indent FIRST: list/table plugins override
  // editor.tf.tab later in the array, so their Tab behavior wins inside
  // lists/tables and generic block indent is the fallback.
  IndentPlugin.configure({
    inject: { targetPlugins: INDENT_TARGETS },
  }),
  TextAlignPlugin.configure({
    inject: { targetPlugins: ['p', 'h2', 'h3', 'blockquote'] },
  }),
  LineHeightPlugin.configure({
    inject: { targetPlugins: ['p', 'h2', 'h3', 'blockquote'] },
  }),
  // CLASSIC container lists + official markdown shorthands.
  ListPlugin.configure({
    inputRules: [
      BulletedListRules.markdown({ variant: '-', enabled: inTopLevelParagraph }),
      BulletedListRules.markdown({ variant: '*', enabled: inTopLevelParagraph }),
      OrderedListRules.markdown({ variant: '.', enabled: inTopLevelParagraph }),
      OrderedListRules.markdown({ variant: ')', enabled: inTopLevelParagraph }),
    ],
  }),
  // Collapsible toggles (indent containment model).
  TogglePlugin,
  // 2–4 column layouts.
  ColumnPlugin,
  ColumnItemPlugin,
  // Inline date chip.
  DatePlugin,
  // KaTeX equations (official math plugin) — block + inline voids with the
  // official `$…$` / `$$⏎` markdown input rules.
  EquationPlugin.configure({
    inputRules: [MathRules.markdown({ on: 'break', variant: '$$' })],
  }),
  InlineEquationPlugin.configure({
    inputRules: [MathRules.markdown({ variant: '$' })],
  }),
  // ':' emoji combobox — inserts plain unicode text. (@emoji-mart/data's
  // main IS the JSON dataset; its d.ts declares no default export, hence
  // the cast.)
  EmojiPlugin.configure({
    options: { data: emojiMartDataRaw as unknown as EmojiMartData },
  }),
  // Tables — cell merging ENABLED (schema v2 stores colSpan/rowSpan).
  TablePlugin,
  // Code blocks — plain lines, no highlighter.
  CodeBlockPlugin.configure({ options: { defaultLanguage: null, lowlight: null } }),
  // Schema voids + callout.
  CalloutPlugin,
  ImagePlugin,
  VideoPlugin,
  TocPlugin,
  DrugCardPlugin,
  // "/" slash commands — inserts an inline-void `slash_input` combobox at
  // the caret (rendered by SlashInputElement); never triggers inside code
  // blocks. The input element is editor-time only: the serializer flattens
  // unknown inline wrappers, so it can never reach storage.
  SlashPlugin.configure({
    options: {
      triggerQuery: (editor) => !editor.api.some({ match: { type: ['code_block'] } }),
    },
  }),
  // Drag & reorder for top-level blocks (official plate-ui BlockDraggable:
  // GripVertical gutter handle, cloned-DOM drag preview, drop line).
  // enableScroller matches the official DndKit: the viewport auto-scrolls
  // while dragging near its edges.
  DndPlugin.configure({
    options: { enableScroller: true },
    render: { aboveNodes: BlockDraggable },
  }),
  // Markdown autoformat (input rules — see MarkdownRulesPlugin above).
  MarkdownRulesPlugin,
  // A trailing empty paragraph is always available at the document end.
  TrailingBlockPlugin,
  // Stable block ids for highlight anchors (M1 §5.5).
  NodeIdPlugin.configure({
    options: {
      idKey: 'id',
      filterInline: true,
      filterText: true,
      initialValueIds: 'always',
    },
  }),
]
