import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react'
import { CodeBlockPlugin } from '@platejs/code-block/react'
import { DndPlugin } from '@platejs/dnd'
import { LinkPlugin } from '@platejs/link/react'
import { toggleList } from '@platejs/list'
import { ListPlugin } from '@platejs/list/react'
import { SlashPlugin } from '@platejs/slash-command/react'
import { TablePlugin } from '@platejs/table/react'
import type { SlateEditor } from 'platejs'
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
 *  - Headings h2/h3 only (h1 is the page title — M1 §5.2), blockquote, marks.
 *  - Subscript/superscript are RENAMED to `sub`/`sup` via node.type: both
 *    the toggle transform (editor.getType) and the leaf render lookup
 *    (leaf[plugin.node.type]) key off node.type, so the text-node prop is
 *    exactly the schema's `sub: true` / `sup: true`.
 *  - Link → element type 'a' with `url` (Plate default).
 *  - ListPlugin is the FLAT indent-based list: `listStyleType` + `indent`
 *    props on paragraph blocks — the schema shape. NOTE: Plate normalizes
 *    `listStyleType` away when `indent` is missing, so stored content
 *    (where indent 1 is omitted) passes through toEditorValue (serialize.ts)
 *    which seeds `indent: 1` before mounting.
 *  - Table → table/tr/td/th with paragraph cell children; merging is
 *    disabled so colSpan/rowSpan never appear (the serializer strips
 *    editor-only extras like colSizes/listStart anyway).
 *  - Code block → code_block/code_line with `lang`; lowlight is null — no
 *    syntax-token decorations (the schema stores plain code lines).
 *  - NodeIdPlugin stamps `id` on blocks (replacing the core instance, so it
 *    stays enabled under NODE_ENV=test too). Nested elements (tr/td/nested
 *    p/code_line) may still receive ids — the serializer strips ids at any
 *    depth below the top level.
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
 *  - `-`/`*` + space → bulleted, `1.` + space → numbered (flat list props);
 *  - ` ``` ` fence → code_block; backtick pair → inline `code` mark;
 *  - `**bold**` / `*italic*` marks.
 *
 * Block conversions are gated to TOP-LEVEL paragraphs so callout bodies,
 * table cells, and code lines never morph into schema-invalid nesting.
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
      const entry = editor.api.block({ highest: true })
      if (entry && (entry[0].listStyleType !== undefined || entry[0].indent !== undefined)) {
        editor.tf.unsetNodes(['listStyleType', 'indent', 'listStart'], { at: entry[1] })
      }
      editor.tf.setNodes({ type }, { match: (node) => editor.api.isBlock(node) })
      return true
    },
  })

const listConversionRule = (match: RegExp, listStyleType: 'disc' | 'decimal') =>
  createBlockStartInputRule({
    match,
    trigger: ' ',
    enabled: inTopLevelParagraph,
    apply: ({ editor }, ruleMatch) => {
      editor.tf.delete({ at: ruleMatch.range })
      toggleList(editor, { listStyleType })
      return true
    },
  })

export const MarkdownRulesPlugin = createPlatePlugin({
  key: 'epharm_markdown',
  inputRules: [
    blockConversionRule('#', 'h2'),
    blockConversionRule('##', 'h3'),
    blockConversionRule('>', 'blockquote'),
    listConversionRule(/^[-*]$/, 'disc'),
    listConversionRule(/^\d{1,3}\.$/, 'decimal'),
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

export const editorKit = [
  // Blocks (paragraph comes from the core BaseParagraphPlugin, type 'p').
  H2Plugin,
  H3Plugin,
  BlockquotePlugin,
  // Marks — sub/sup renamed to the schema props.
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin,
  CodePlugin,
  SubscriptPlugin.configure({ node: { type: 'sub' } }),
  SuperscriptPlugin.configure({ node: { type: 'sup' } }),
  // Inline link — type 'a', prop `url`.
  LinkPlugin,
  // Flat lists: listStyleType + indent on paragraphs.
  ListPlugin,
  // Tables — no merge, so no colSpan/rowSpan props.
  TablePlugin.configure({ options: { disableMerge: true } }),
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
  // Drag & reorder for top-level blocks (six-dot gutter handle, drop line).
  DndPlugin.configure({
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
