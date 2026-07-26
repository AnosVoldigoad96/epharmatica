'use client'

import { insertDate } from '@platejs/date'
import { insertColumnGroup } from '@platejs/layout'
import { someList, toggleList, unwrapList } from '@platejs/list-classic'
import { insertInlineEquation } from '@platejs/math'
import { openNextToggles } from '@platejs/toggle/react'
import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Brain,
  CalendarDays,
  ChevronRight,
  Code2,
  Columns2,
  Columns3,
  Film,
  GraduationCap,
  Heading2,
  Heading3,
  ImageIcon,
  Lightbulb,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Pill,
  Quote,
  Radical,
  Sigma,
  Table,
  TableOfContents,
  TriangleAlert,
} from 'lucide-react'
import type { TElement } from 'platejs'
import { NodeApi, PathApi } from 'platejs'
import type { PlateEditor } from 'platejs/react'

import { CALLOUT_LABELS } from '../schema/labels'
import type { CalloutVariant } from '../schema/types'
import { CALLOUT_VARIANTS, COLUMN_CHILD_TYPES } from '../schema/types'
import type { EditorBridges } from './context'
import type { SubtopicEditorLabels } from './labels'

/**
 * The ONE insert roster: every insertable block, shared verbatim by the
 * slash command menu and the toolbar insert menu so the two can never
 * drift. Labels resolve from SubtopicEditorLabels (callout names from the
 * schema-owned CALLOUT_LABELS); icons are lucide components (chrome only,
 * never localized, never stored); actions run against the live editor.
 */

export type InsertItemGroup = 'blocks' | 'layout' | 'callouts' | 'media'

export type InsertItem = {
  key: string
  group: InsertItemGroup
  label: string
  /** Lucide icon rendered before the label (slash menu + toolbar insert menu). */
  icon: LucideIcon
  /** Extra slash-menu filter terms (aliases/shortcuts, English-only like the official kit). */
  keywords?: string[]
  /**
   * False for items that hand off to a panel/picker instead of the editor —
   * selecting them must NOT refocus the editing surface (official plate-ui
   * `focusEditor` semantics).
   */
  focusEditor?: boolean
  disabled?: boolean
  /** Tooltip explaining a disabled item (e.g. image without a picker). */
  disabledNote?: string
  run: (editor: PlateEditor) => void
}

/** Callout variant → lucide icon (chrome, mirrors CALLOUT_LABELS ownership). */
const CALLOUT_ICONS: Record<CalloutVariant, LucideIcon> = {
  definition: BookOpen,
  clinical_pearl: Lightbulb,
  mnemonic: Brain,
  exam_alert: GraduationCap,
  warning: TriangleAlert,
}

/** True for an empty paragraph — the block the insert replaces. */
const isEmptyParagraph = (block: TElement): boolean =>
  block.type === 'p' && NodeApi.string(block) === ''

/** Void block types of the insert roster — no text entry point of their own. */
const VOID_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'img',
  'video',
  'hr',
  'toc',
  'drug_card',
  'equation',
])

/** The closest `column` entry enclosing the selection, if any. */
const columnAbove = (editor: PlateEditor) =>
  editor.api.above<TElement>({ match: { type: 'column' } })

/**
 * Where the insert lands: the COLUMN CHILD under the caret when the
 * selection sits inside a column and `node` is legal there (founder
 * amendment, 2026-07-26 — every block except toggle/column_group), else
 * the highest (top-level) block. Anything not column-legal keeps the
 * top-level path, so it can never nest illegally.
 */
function insertionTarget(
  editor: PlateEditor,
  node: TElement,
): { block: TElement; path: number[]; inColumn: boolean } | null {
  if (COLUMN_CHILD_TYPES.has(node.type)) {
    const column = columnAbove(editor)
    const anchor = editor.selection?.anchor.path
    if (column && anchor && anchor.length > column[1].length) {
      const childPath = anchor.slice(0, column[1].length + 1)
      const child = editor.api.node<TElement>(childPath)
      if (child) return { block: child[0], path: child[1], inColumn: true }
    }
  }
  const entry = editor.api.block({ highest: true })
  return entry ? { block: entry[0] as TElement, path: entry[1], inColumn: false } : null
}

/**
 * Notion-style insert: replace the current block when it is an empty
 * paragraph, otherwise insert below it — at the column-child level when
 * the caret is inside a column (insertionTarget), at the top level
 * otherwise (unchanged behavior).
 */
export function insertBlockNode(editor: PlateEditor, node: TElement): void {
  const target = insertionTarget(editor, node)
  if (!target) {
    editor.tf.insertNodes(node, { select: true })
    return
  }
  const { block, path, inColumn } = target
  editor.tf.withoutNormalizing(() => {
    const replacing = isEmptyParagraph(block)
    const at = replacing ? path : PathApi.next(path)
    if (replacing) editor.tf.removeNodes({ at: path })
    editor.tf.insertNodes(node, { at, select: true })
    // A void as the LAST column child would leave the column with no text
    // entry point after it (TrailingBlockPlugin only guards the document
    // tail) — keep an empty paragraph behind it inside the column.
    if (inColumn && VOID_BLOCK_TYPES.has(node.type)) {
      const parent = editor.api.parent(at)
      const index = at[at.length - 1] as number
      if (parent && index === (parent[0] as TElement).children.length - 1) {
        editor.tf.insertNodes(emptyParagraph(), { at: PathApi.next(at) })
      }
    }
  })
}

export type TextBlockType = 'p' | 'h2' | 'h3' | 'blockquote' | 'toggle'

/** Turn the current block into `type`, unwrapping a classic list first.
 * Toggle is TOP-LEVEL-ONLY (its indent model addresses following top-level
 * blocks) — inside a column the conversion is a no-op rather than
 * producing schema-invalid nesting. */
export function setTextBlockType(editor: PlateEditor, type: TextBlockType) {
  if (type === 'toggle' && columnAbove(editor)) return
  if (someList(editor, 'ul') || someList(editor, 'ol')) {
    unwrapList(editor)
  }
  if (type === 'toggle') {
    openNextToggles(editor)
  }
  editor.tf.toggleBlock(type)
}

/** Toggle the selection into/out of a classic container list. */
export function setListType(editor: PlateEditor, type: 'ul' | 'ol') {
  toggleList(editor, { type })
}

const emptyParagraph = (): TElement => ({ type: 'p', children: [{ text: '' }] })

/**
 * Insert a 2/3-column group. Layout never recurses (schema: column_group
 * is not a legal column child): from inside an existing group the new one
 * lands AFTER it at the TOP level; anywhere else, the official
 * insertColumnGroup behavior is unchanged.
 */
export function insertColumns(editor: PlateEditor, columns: number): void {
  const group = editor.api.above<TElement>({ match: { type: 'column_group' } })
  if (!group) {
    insertColumnGroup(editor, { columns, select: true })
    return
  }
  insertColumnGroup(editor, { columns, select: true, at: PathApi.next(group[1].slice(0, 1)) })
}

const tableNode = (): TElement => ({
  type: 'table',
  children: Array.from({ length: 3 }, (_, row) => ({
    type: 'tr',
    children: Array.from({ length: 3 }, () => ({
      type: row === 0 ? 'th' : 'td',
      children: [emptyParagraph()],
    })),
  })),
})

/**
 * Build the full roster. Every entry ends focused in the editor except
 * video/image, which hand off to their app bridge (form/picker) first.
 */
export function buildInsertItems(
  labels: SubtopicEditorLabels,
  bridges: EditorBridges,
): InsertItem[] {
  const focusAfter = (run: (editor: PlateEditor) => void) => (editor: PlateEditor) => {
    run(editor)
    editor.tf.focus()
  }

  const items: InsertItem[] = [
    {
      key: 'paragraph',
      group: 'blocks',
      label: labels.blockParagraph,
      icon: Pilcrow,
      keywords: ['paragraph', 'text'],
      run: focusAfter((editor) => setTextBlockType(editor, 'p')),
    },
    {
      key: 'heading2',
      group: 'blocks',
      label: labels.blockHeading2,
      icon: Heading2,
      keywords: ['h2', 'subtitle'],
      run: focusAfter((editor) => setTextBlockType(editor, 'h2')),
    },
    {
      key: 'heading3',
      group: 'blocks',
      label: labels.blockHeading3,
      icon: Heading3,
      keywords: ['h3', 'subtitle'],
      run: focusAfter((editor) => setTextBlockType(editor, 'h3')),
    },
    {
      key: 'blockquote',
      group: 'blocks',
      label: labels.blockQuote,
      icon: Quote,
      keywords: ['citation', 'blockquote', 'quote', '>'],
      run: focusAfter((editor) => setTextBlockType(editor, 'blockquote')),
    },
    {
      key: 'bulleted-list',
      group: 'blocks',
      label: labels.listBulleted,
      icon: List,
      keywords: ['unordered', 'ul', '-'],
      run: focusAfter((editor) => setListType(editor, 'ul')),
    },
    {
      key: 'numbered-list',
      group: 'blocks',
      label: labels.listNumbered,
      icon: ListOrdered,
      keywords: ['ordered', 'ol', '1'],
      run: focusAfter((editor) => setListType(editor, 'ol')),
    },
    {
      key: 'toggle',
      group: 'blocks',
      label: labels.blockToggle,
      icon: ChevronRight,
      keywords: ['toggle', 'collapse', 'collapsible', 'details'],
      run: focusAfter((editor) => setTextBlockType(editor, 'toggle')),
    },
    {
      key: 'table',
      group: 'blocks',
      label: labels.insertTable,
      icon: Table,
      keywords: ['table'],
      run: focusAfter((editor) => insertBlockNode(editor, tableNode())),
    },
    {
      key: 'code-block',
      group: 'blocks',
      label: labels.insertCodeBlock,
      icon: Code2,
      keywords: ['```', 'code'],
      run: focusAfter((editor) =>
        insertBlockNode(editor, {
          type: 'code_block',
          children: [{ type: 'code_line', children: [{ text: '' }] }],
        }),
      ),
    },
    {
      key: 'divider',
      group: 'blocks',
      label: labels.insertDivider,
      icon: Minus,
      keywords: ['hr', 'divider', 'rule', 'separator', '---'],
      run: focusAfter((editor) =>
        insertBlockNode(editor, { type: 'hr', children: [{ text: '' }] }),
      ),
    },
    {
      key: 'date',
      group: 'blocks',
      label: labels.insertDate,
      icon: CalendarDays,
      keywords: ['date', 'time', 'calendar', 'today'],
      run: focusAfter((editor) => insertDate(editor)),
    },
    {
      key: 'equation',
      group: 'blocks',
      label: labels.insertEquation,
      icon: Radical,
      keywords: ['equation', 'math', 'katex', 'tex', 'latex', 'formula', '$$'],
      // No focusAfter: `select: true` selects the fresh void, which opens
      // its TeX popover — the textarea takes focus (official behavior).
      run: (editor) =>
        insertBlockNode(editor, { type: 'equation', texExpression: '', children: [{ text: '' }] }),
    },
    {
      key: 'inline-equation',
      group: 'blocks',
      label: labels.insertInlineEquation,
      icon: Sigma,
      keywords: ['equation', 'inline', 'math', 'katex', 'tex', 'latex', '$'],
      // Same: the selected inline void opens its popover; the textarea owns
      // focus.
      run: (editor) => insertInlineEquation(editor, '', { select: true }),
    },
    {
      key: 'toc',
      group: 'blocks',
      label: labels.insertToc,
      icon: TableOfContents,
      keywords: ['toc'],
      run: focusAfter((editor) =>
        insertBlockNode(editor, { type: 'toc', children: [{ text: '' }] }),
      ),
    },
    {
      key: 'drug-card',
      group: 'blocks',
      label: labels.insertDrugCard,
      icon: Pill,
      keywords: ['drug', 'card', 'monograph'],
      run: (editor) =>
        insertBlockNode(editor, {
          type: 'drug_card',
          fields: { generic_name: '' },
          children: [{ text: '' }],
        }),
    },
    {
      key: 'columns-2',
      group: 'layout',
      label: labels.insertColumns2,
      icon: Columns2,
      keywords: ['columns', 'layout', 'two', 'side'],
      run: focusAfter((editor) => insertColumns(editor, 2)),
    },
    {
      key: 'columns-3',
      group: 'layout',
      label: labels.insertColumns3,
      icon: Columns3,
      keywords: ['columns', 'layout', 'three'],
      run: focusAfter((editor) => insertColumns(editor, 3)),
    },
    ...CALLOUT_VARIANTS.map((variant): InsertItem => ({
      key: `callout-${variant}`,
      group: 'callouts',
      label: CALLOUT_LABELS[variant],
      icon: CALLOUT_ICONS[variant],
      keywords: ['callout', ...variant.split('_')],
      run: focusAfter((editor) =>
        insertBlockNode(editor, {
          type: 'callout',
          variant,
          children: [emptyParagraph()],
        }),
      ),
    })),
    {
      key: 'video',
      group: 'media',
      label: labels.insertVideo,
      icon: Film,
      keywords: ['youtube', 'embed'],
      focusEditor: false,
      run: () => bridges.openVideoForm(),
    },
    {
      key: 'image',
      group: 'media',
      label: labels.insertImage,
      icon: ImageIcon,
      keywords: ['photo', 'picture', 'media'],
      focusEditor: false,
      disabled: !bridges.pickImage,
      disabledNote: bridges.pickImage ? undefined : labels.imageDisabledNote,
      run: (editor) => {
        const pick = bridges.pickImage
        if (!pick) return
        void pick().then((picked) => {
          if (!picked) return
          insertBlockNode(editor, {
            type: 'img',
            url: picked.url,
            alt: picked.alt,
            asset_id: picked.asset_id,
            width: picked.width,
            height: picked.height,
            children: [{ text: '' }],
          })
          editor.tf.focus()
        })
      },
    },
  ]

  return items
}

/** Ordered group roster + labels, for menu section headings. */
export function insertItemGroups(
  labels: SubtopicEditorLabels,
): Array<{ group: InsertItemGroup; label: string }> {
  return [
    { group: 'blocks', label: labels.slashGroupBlocks },
    { group: 'layout', label: labels.slashGroupLayout },
    { group: 'callouts', label: labels.slashGroupCallouts },
    { group: 'media', label: labels.slashGroupMedia },
  ]
}
