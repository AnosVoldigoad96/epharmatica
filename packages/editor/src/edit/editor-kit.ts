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
import { LinkPlugin } from '@platejs/link/react'
import { ListPlugin } from '@platejs/list/react'
import { TablePlugin } from '@platejs/table/react'
import { NodeIdPlugin } from 'platejs'
import { createPlatePlugin } from 'platejs/react'

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
